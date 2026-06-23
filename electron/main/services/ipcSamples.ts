import { ipcMain } from 'electron';
import fs from 'node:fs';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import type { IpcContext } from './ipcTypes';
import { samples, categories, sampleTags, audioSegments } from '../../../drizzle/schema';
import { eq, and, sql, count, desc, asc, like, gte, lte, inArray } from 'drizzle-orm';
import type { SearchFilters } from '../../../shared/types/sample.types';
import { validatePath, validateString, validatePositiveInt, validateArray, validateNumber, sanitizeFtsQuery } from './ipcValidation';
import { extractBPMAndKey } from './bpmKeyParser';
import { cosineSimilarity } from './audioFeatureExtractor';
import { getFileIOService } from './fileIOService';

// ── CLAP Embedding 辅助函数（方案 C）─────────────────────────────────

/**
 * 将 base64 编码的 CLAP embedding 解码为 Float32Array
 */
function base64ToFloat32Array(base64: string): Float32Array {
  const buf = Buffer.from(base64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/**
 * 计算两个 Float32Array 的余弦相似度
 */
function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

import { resetDatabase, getSqlite } from './database';
import { handleFileAdd } from './fileWatcher';

export function registerSamplesHandlers(ctx: IpcContext): void {
  const { db, sqlite, sampleListFields } = ctx;

  // 获取采样列表
  ipcMain.handle(IPC_CHANNELS.GET_SAMPLES, async () => {
    try {
      const result = await db.select(sampleListFields).from(samples);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 分页获取采样列表
  ipcMain.handle(IPC_CHANNELS.GET_SAMPLES_PAGINATED, async (_event, data: { offset?: number; limit?: number }) => {
    try {
      const offset = data?.offset || 0;
      const limit = data?.limit || 200;

      const result = await db.select(sampleListFields).from(samples)
        .orderBy(desc(samples.playCount), samples.fileName)
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(samples);

      return { success: true, data: { items: result, total, offset, limit } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 搜索采样（FTS5 获取 ID + Drizzle ORM 查询，保证 camelCase 字段）
  ipcMain.handle(IPC_CHANNELS.SEARCH_SAMPLES, async (_event, filters: SearchFilters) => {
    try {
      const conditions = [];

      // FTS5 全文搜索 + 同义词扩展
      if (filters.query) {
        const terms = sanitizeFtsQuery(filters.query).split(/\s+/).filter(Boolean);
        if (terms.length === 0) {
          return { success: true, data: { items: [], total: 0, page: 1, pageSize: 0 } };
        }

        // ── 方案 A：同义词扩展搜索 ──
        const { buildSynonymFtsQuery } = await import('./semanticSearch');
        const synonymFtsQuery = buildSynonymFtsQuery(filters.query);
        const originalFtsQuery = terms.map(t => `"${t}" *`).join(' AND ');

        // 优先用同义词扩展查询
        const ftsRows = sqlite.prepare(
          `SELECT rowid as id FROM samples_fts WHERE samples_fts MATCH ?`
        ).all(synonymFtsQuery) as { id: number }[];
        const matchedIds = ftsRows.map(r => r.id);

        if (matchedIds.length > 0) {
          // 同义词扩展有结果 → 使用
          conditions.push(inArray(samples.id, matchedIds));
        } else {
          // 回退到原始精确查询
          const exactRows = sqlite.prepare(
            `SELECT rowid as id FROM samples_fts WHERE samples_fts MATCH ?`
          ).all(originalFtsQuery) as { id: number }[];
          const exactIds = exactRows.map(r => r.id);

          if (exactIds.length > 0) {
            conditions.push(inArray(samples.id, exactIds));
          } else {
            // ── 方案 B：文本 Embedding 语义搜索（fallback）──
            let foundByEmbedding = false;
            try {
              const { getTextEmbeddingSearcher } = await import('./textEmbeddingSearch');
              const searcher = getTextEmbeddingSearcher();
              if (searcher.ready) {
                const embedResults = await searcher.search(
                  filters.query,
                  200,
                  filters.categoryId
                );
                if (embedResults.length > 0) {
                  conditions.push(inArray(samples.id, embedResults.map(r => r.sampleId)));
                  foundByEmbedding = true;
                }
              }
            } catch { /* skip */ }

            if (!foundByEmbedding) {
              // ── 方案 C：CLAP 音频语义搜索（最终 fallback）──
              // 通过 Python sidecar 生成文本 embedding，与音频 CLAP embedding 比较相似度
              let foundByClap = false;
              try {
                const { analyzerSidecar } = await import('./analyzerSidecar');
                if (analyzerSidecar.isReady || await analyzerSidecar.start()) {
                  const textResult = await analyzerSidecar.analyzeText(filters.query);
                  if (textResult.success && textResult.embedding_b64) {
                    const textVec = base64ToFloat32Array(textResult.embedding_b64);

                    // 读取所有有 CLAP embedding 的采样
                    const clapRows = sqlite.prepare(
                      'SELECT id, clap_embedding FROM samples WHERE clap_embedding IS NOT NULL'
                    ).all() as Array<{ id: number; clap_embedding: string }>;

                    if (clapRows.length > 0) {
                      // 计算余弦相似度
                      const scored = clapRows
                        .map(row => {
                          const audioVec = base64ToFloat32Array(row.clap_embedding);
                          return { sampleId: row.id, score: cosineSim(textVec, audioVec) };
                        })
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 200);

                      if (scored[0].score > 0.1) { // 相似度阈值，避免返回完全不相关的结果
                        conditions.push(inArray(samples.id, scored.map(r => r.sampleId)));
                        foundByClap = true;
                      }
                    }
                  }
                }
              } catch { /* skip */ }

              if (!foundByClap) {
                return { success: true, data: { items: [], total: 0, page: 1, pageSize: 0 } };
              }
            }
          }
        }
      }

      // 文件类型筛选（audio / midi）
      if (filters.fileType) {
        conditions.push(eq(samples.fileType, filters.fileType));
      }

      // 分类筛选（支持父分类 + 多标签：同时查主分类和关联表）
      if (filters.categoryId) {
        // 查询该分类及其所有子分类的 ID
        const catIds: number[] = [filters.categoryId];
        const childCats = sqlite.prepare(
          'SELECT id FROM categories WHERE parent_id = ?'
        ).all(filters.categoryId) as Array<{ id: number }>;
        childCats.forEach(c => catIds.push(c.id));
        
        // 同时匹配主分类 (samples.category_id) 和多标签 (sample_categories)
        // 使用整数内联（安全：catIds 全部来自数据库整数 ID）
        const idList = catIds.join(',');
        conditions.push(
          sql.raw(`(
            samples.category_id IN (${idList})
            OR samples.id IN (SELECT sample_id FROM sample_categories WHERE category_id IN (${idList}))
          )`)
        );
      }

      // 时长范围
      if (filters.durationMin !== undefined) {
        conditions.push(gte(samples.duration, filters.durationMin));
      }
      if (filters.durationMax !== undefined) {
        conditions.push(lte(samples.duration, filters.durationMax));
      }

      // 采样率
      if (filters.sampleRate) {
        conditions.push(eq(samples.sampleRate, filters.sampleRate));
      }

      // 声道数
      if (filters.channels) {
        conditions.push(eq(samples.channels, filters.channels));
      }

      // BPM 范围
      if (filters.bpmMin !== undefined) {
        conditions.push(gte(samples.bpm, filters.bpmMin));
      }
      if (filters.bpmMax !== undefined) {
        conditions.push(lte(samples.bpm, filters.bpmMax));
      }

      // 调性
      if (filters.key) {
        conditions.push(like(samples.key, `${filters.key}%`));
      }

      // 收藏
      if (filters.isFavorite !== undefined) {
        conditions.push(eq(samples.isFavorite, filters.isFavorite));
      }

      // 文件夹路径筛选（统一分隔符以兼容 Windows 反斜杠）
      if (filters.folderPath) {
        const normalizedPath = filters.folderPath.replace(/\\/g, '/');
        // 使用原生 SQL 确保 REPLACE 和 LIKE 正确工作
        const folderRows = sqlite.prepare(
          `SELECT id FROM samples WHERE REPLACE(file_path, '\\', '/') LIKE ?`
        ).all(`${normalizedPath}/%`) as { id: number }[];
        if (folderRows.length === 0) {
          return { success: true, data: { items: [], total: 0, page: 1, pageSize: 0 } };
        }
        conditions.push(inArray(samples.id, folderRows.map(r => r.id)));
      }

      // 标签筛选
      if (filters.tagIds && filters.tagIds.length > 0) {
        const tagRows = sqlite.prepare(
          `SELECT DISTINCT sample_id FROM sample_tags WHERE tag_id IN (${filters.tagIds.map(() => '?').join(',')})`
        ).all(...filters.tagIds) as { sample_id: number }[];
        const sampleIds = tagRows.map(r => r.sample_id);
        if (sampleIds.length === 0) {
          return { success: true, data: { items: [], total: 0, page: 1, pageSize: 0 } };
        }
        conditions.push(inArray(samples.id, sampleIds));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // 查总数
      const [{ total }] = await db.select({ total: count() }).from(samples).where(whereClause);

      // 排序
      const sortableFields: Record<string, any> = {
        fileName: samples.fileName,
        duration: samples.duration,
        bpm: samples.bpm,
        key: samples.key,
        sampleRate: samples.sampleRate,
        fileSize: samples.fileSize,
        playCount: samples.playCount,
        isFavorite: samples.isFavorite,
        createdAt: samples.createdAt,
      };
      const sortKey = filters.sortField || 'playCount';
      const sortDir = filters.sortDirection || 'desc';
      const sortCol = sortableFields[sortKey] ?? samples.playCount;
      const orderByClause = sortDir === 'asc'
        ? [asc(sortCol), samples.fileName]
        : [desc(sortCol), samples.fileName];

      // 分页
      const offset = filters.offset ?? 0;
      const limit = filters.limit ?? 200;

      // 查数据
      const result = await db.select(sampleListFields).from(samples).where(whereClause)
        .orderBy(...orderByClause)
        .limit(limit)
        .offset(offset);

      return { success: true, data: { items: result, total, page: Math.floor(offset / limit) + 1, pageSize: limit } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取分类
  ipcMain.handle(IPC_CHANNELS.GET_CATEGORIES, async () => {
    try {
      const result = await db.select().from(categories);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 智能推荐：基于 CLAP embedding 的全库 cosine similarity 搜索
  ipcMain.handle(IPC_CHANNELS.GET_SIMILAR_SAMPLES, async (_event, data: { sampleId: number; limit?: number }) => {
    try {
      const limit = data.limit ?? 20;

      // 1. 取目标采样的 clap_embedding
      const target = sqlite.prepare(
        'SELECT id, file_name, clap_embedding FROM samples WHERE id = ?'
      ).get(data.sampleId) as any;

      // 若目标无 CLAP embedding，回退到 BPM/Key/分类 匹配
      if (!target?.clap_embedding) {
        const sample = await db.select().from(samples).where(eq(samples.id, data.sampleId)).get();
        if (!sample) return { success: true, data: { sourceSample: null, similar: [] } };

        let result: any[] = [];

        if (sample.categoryId && sample.bpm && sample.key) {
          result = await db.select(sampleListFields).from(samples)
            .where(and(
              eq(samples.categoryId, sample.categoryId),
              gte(samples.bpm, sample.bpm - 5),
              lte(samples.bpm, sample.bpm + 5),
              eq(samples.key, sample.key),
              sql`${samples.id} != ${data.sampleId}`
            ))
            .limit(limit)
            .execute();
        }

        if (result.length < limit && sample.categoryId && sample.bpm) {
          const existingIds = result.length > 0 ? result.map((r: any) => r.id).join(',') : '0';
          const more = await db.select(sampleListFields).from(samples)
            .where(and(
              eq(samples.categoryId, sample.categoryId),
              gte(samples.bpm, sample.bpm - 5),
              lte(samples.bpm, sample.bpm + 5),
              sql`${samples.id} != ${data.sampleId}`,
              sql`${samples.id} NOT IN (${existingIds})`
            ))
            .limit(limit - result.length)
            .execute();
          result = [...result, ...more];
        }

        if (result.length < limit && sample.categoryId) {
          const existingIds = result.length > 0 ? result.map((r: any) => r.id).join(',') : '0';
          const more = await db.select(sampleListFields).from(samples)
            .where(and(
              eq(samples.categoryId, sample.categoryId),
              sql`${samples.id} != ${data.sampleId}`,
              sql`${samples.id} NOT IN (${existingIds})`
            ))
            .limit(limit - result.length)
            .execute();
          result = [...result, ...more];
        }

        return {
          success: true,
          data: {
            sourceSample: { id: sample.id, fileName: sample.fileName },
            similar: result,
          },
        };
      }

      const targetEmb = base64ToFloat32Array(target.clap_embedding);

      // 2. 从数据库中获取所有有 clap_embedding 的采样（排除自身），计算余弦相似度
      const rows = sqlite.prepare(`
        SELECT id, clap_embedding FROM samples
        WHERE clap_embedding IS NOT NULL AND id != ?
      `).all(data.sampleId) as Array<{ id: number; clap_embedding: string }>;

      // 3. 计算 cosine similarity 并排序取 Top-K
      const scored = rows
        .map(row => ({
          id: row.id,
          score: cosineSim(targetEmb, base64ToFloat32Array(row.clap_embedding)),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // 4. 用 Drizzle ORM 获取完整采样数据（camelCase 字段，保持相似度排序）
      const topKIds = scored.map(s => s.id);
      const fullSamples = topKIds.length > 0
        ? await db.select(sampleListFields).from(samples).where(inArray(samples.id, topKIds))
        : [];

      const scoreMap = new Map(scored.map(s => [s.id, s.score]));
      const similar = fullSamples
        .map((s: any) => ({ ...s, score: scoreMap.get(s.id) ?? 0 }))
        .sort((a: any, b: any) => b.score - a.score);

      return {
        success: true,
        data: {
          sourceSample: { id: target.id, fileName: target.file_name },
          similar,
        },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 文本语义搜索：通过 CLAP text embedding 搜索相似音频采样
  ipcMain.handle(IPC_CHANNELS.TEXT_SIMILARITY_SEARCH, async (_event, data: { query: string; limit?: number }) => {
    try {
      const limit = data.limit ?? 20;

      // 通过 Python sidecar 获取文本的 CLAP embedding
      const { analyzerSidecar } = await import('./analyzerSidecar');

      if (!analyzerSidecar.isReady) {
        await analyzerSidecar.start();
      }

      if (!analyzerSidecar.isReady) {
        return { success: false, error: 'CLAP Sidecar 不可用' };
      }

      const textResult = await analyzerSidecar.analyzeText(data.query);
      if (!textResult.success || !textResult.embedding_b64) {
        return { success: false, error: `文本嵌入失败: ${textResult.error || '未知错误'}` };
      }

      const textEmb = base64ToFloat32Array(textResult.embedding_b64);

      // 读取所有有 CLAP embedding 的采样
      const rows = sqlite.prepare(`
        SELECT id, clap_embedding FROM samples
        WHERE clap_embedding IS NOT NULL
      `).all() as Array<{ id: number; clap_embedding: string }>;

      // 计算余弦相似度并排序
      const scored = rows
        .map(row => ({
          id: row.id,
          score: cosineSim(textEmb, base64ToFloat32Array(row.clap_embedding)),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // 用 Drizzle ORM 获取完整采样数据（camelCase 字段）
      const topKIds = scored.map(s => s.id);
      const fullSamples = topKIds.length > 0
        ? await db.select(sampleListFields).from(samples).where(inArray(samples.id, topKIds))
        : [];

      const scoreMap = new Map(scored.map(s => [s.id, s.score]));
      const result = fullSamples
        .map((s: any) => ({ ...s, score: scoreMap.get(s.id) ?? 0 }))
        .sort((a: any, b: any) => b.score - a.score);

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 重复检测：基于 fileHash 查找重复文件
  ipcMain.handle(IPC_CHANNELS.GET_DUPLICATES, async () => {
    try {
      const result = await db.select({
        hash: samples.fileHash,
        count: sql<number>`count(*)`.as('count'),
        ids: sql<string>`group_concat(${samples.id})`.as('ids'),
        names: sql<string>`group_concat(${samples.fileName})`.as('names'),
      })
        .from(samples)
        .where(sql`${samples.fileHash} != ''`)
        .groupBy(samples.fileHash)
        .having(sql`count(*) > 1`);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 清理损坏文件记录
  ipcMain.handle(IPC_CHANNELS.CLEAN_CORRUPTED, async () => {
    try {
      const result = await db.delete(samples).where(eq(samples.isCorrupted, true));
      return { success: true, data: result.changes };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 批量删除采样记录（返回被删除的数据用于撤销）
  ipcMain.handle(IPC_CHANNELS.DELETE_SAMPLES, async (_event, data: { ids: number[] }) => {
    try {
      const ids = validateArray<number>(data?.ids, 'ids', (item) => validatePositiveInt(item));
      if (ids.length === 0) return { success: false, error: 'No sample IDs provided' };

      // 先备份被删除的数据
      const deletedSamples = await db.select().from(samples).where(inArray(samples.id, ids));
      const deletedTags = await db.select().from(sampleTags).where(inArray(sampleTags.sampleId, ids));

      // 清理 junction 表
      const placeholders = ids.map(() => '?').join(',');
      sqlite.prepare(`DELETE FROM sample_categories WHERE sample_id IN (${placeholders})`).run(...ids);

      await db.delete(samples).where(inArray(samples.id, ids));
      return { success: true, data: { deletedSamples, deletedTags } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 批量恢复采样（撤销删除）
  ipcMain.handle('samples:restoreSamples', async (_event, data: { samples: any[]; tags: any[] }) => {
    try {
      const { samples: sampleData, tags } = data;
      if (!sampleData || sampleData.length === 0) return { success: false, error: 'No sample data provided' };

      // 重新插入采样数据
      for (const s of sampleData) {
        await db.insert(samples).values(s).onConflictDoNothing();
      }

      // 恢复标签关联
      if (tags && tags.length > 0) {
        for (const t of tags) {
          await db.insert(sampleTags).values(t).onConflictDoNothing();
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 批量更新分类
  ipcMain.handle(IPC_CHANNELS.UPDATE_SAMPLES_CATEGORY, async (_event, data: { ids: number[]; categoryId: number }) => {
    try {
      await db.update(samples).set({ categoryId: data.categoryId }).where(inArray(samples.id, data.ids));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 批量添加标签（优化：使用 INSERT OR IGNORE 批量处理）
  ipcMain.handle(IPC_CHANNELS.BATCH_ADD_TAG, async (_event, data: { sampleIds: number[]; tagId: number }) => {
    try {
      const values = data.sampleIds.map(sampleId => ({
        sampleId,
        tagId: data.tagId,
      }));

      // 使用 SQLite 的 INSERT OR IGNORE 批量插入，避免 N+1 查询
      if (values.length > 0) {
        const placeholders = values.map(() => '(?, ?)').join(', ');
        const flatValues = values.flatMap(v => [v.sampleId, v.tagId]);
        sqlite.prepare(`INSERT OR IGNORE INTO sample_tags (sample_id, tag_id) VALUES ${placeholders}`).run(...flatValues);
      }

      return { success: true, count: values.length };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 批量从文件名补充 BPM/Key（对已有采样中缺少 BPM/Key 的进行补充）
  ipcMain.handle('samples:enrichBpmKey', async () => {
    try {
      // 查找缺少 BPM 和 Key 的采样
      const missing = await db.select({
        id: samples.id,
        fileName: samples.fileName,
      }).from(samples);

      let enriched = 0;
      for (const sample of missing) {
        const parsed = extractBPMAndKey(sample.fileName);
        if (parsed.bpm !== null || parsed.key !== null) {
          const updates: Record<string, any> = {};
          if (parsed.bpm !== null) updates.bpm = parsed.bpm;
          if (parsed.key !== null) updates.key = parsed.key;

          // 只更新当前为空的字段
          await db.update(samples)
            .set(updates)
            .where(eq(samples.id, sample.id));
          enriched++;
        }
      }

      return { success: true, data: { enriched } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 基于频谱特征的相似度搜索
  ipcMain.handle('samples:findSimilarByFeatures', async (_event, data: { sampleId: number; limit?: number }) => {
    try {
      // 获取源采样的特征向量
      const source = await db.select({
        id: samples.id,
        featureVector: samples.featureVector,
      }).from(samples).where(eq(samples.id, data.sampleId)).get();

      if (!source || !source.featureVector) {
        return { success: false, error: 'Source sample has no feature vector' };
      }

      const sourceVector = JSON.parse(source.featureVector) as number[];
      const limit = data.limit ?? 20;

      // 获取所有有特征向量的采样（限制查询范围以提高性能）
      // 优先查询同分类的采样
      const candidates = await db.select({
        id: samples.id,
        fileName: samples.fileName,
        filePath: samples.filePath,
        duration: samples.duration,
        categoryId: samples.categoryId,
        featureVector: samples.featureVector,
      }).from(samples)
        .where(sql`${samples.id} != ${data.sampleId} AND ${samples.featureVector} IS NOT NULL`)
        .limit(5000); // 限制候选集大小

      // 计算相似度并排序
      const scored = candidates
        .map((c: typeof candidates[0]) => {
          try {
            const vec = JSON.parse(c.featureVector!) as number[];
            const similarity = cosineSimilarity(sourceVector, vec);
            return { ...c, similarity };
          } catch {
            return { ...c, similarity: 0 };
          }
        })
        .filter((c: typeof candidates[0] & { similarity: number }) => c.similarity > 0.5)
        .sort((a: typeof candidates[0] & { similarity: number }, b: typeof candidates[0] & { similarity: number }) => b.similarity - a.similarity)
        .slice(0, limit);

      return { success: true, data: scored };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 语义搜索：基于 CLAP embedding 的向量相似度搜索
  ipcMain.handle('samples:semanticSearch', async (_event, data: { keywords: string[]; limit?: number }) => {
    try {
      const text = data.keywords.join(' ');
      const limit = data.limit ?? 50;

      // 1. 通过 sidecar 获取文本的 CLAP embedding
      const { analyzerSidecar } = await import('./analyzerSidecar');

      if (!analyzerSidecar.isReady) {
        await analyzerSidecar.start();
      }

      if (!analyzerSidecar.isReady) {
        // Sidecar 不可用，降级为标签关键词搜索
        console.warn('[SemanticSearch] Sidecar 不可用，降级为关键词搜索');
        const keywords = data.keywords.map(k => k.toLowerCase());
        const conditions = keywords.map(k => sql`LOWER(${samples.tags}) LIKE ${`%${k}%`}`);
        const whereClause = conditions.length > 1 ? sql.join(conditions, sql` OR `) : conditions[0];
        const results = await db.select({
          id: samples.id,
          fileName: samples.fileName,
          filePath: samples.filePath,
          duration: samples.duration,
          tags: samples.tags,
        }).from(samples)
          .where(and(sql`${samples.tags} IS NOT NULL`, whereClause))
          .limit(limit);
        return { success: true, data: results };
      }

      const textResult = await analyzerSidecar.analyzeText(text);
      if (!textResult.success || !textResult.embedding_b64) {
        return { success: false, error: `文本 embedding 失败: ${textResult.error}` };
      }

      // 2. 解码文本 embedding
      const textEmbedding = Buffer.from(textResult.embedding_b64, 'base64');
      const textVector = Array.from(new Float32Array(textEmbedding.buffer, textEmbedding.byteOffset, textEmbedding.byteLength / 4));

      // 3. 查询所有有 CLAP embedding 的采样
      const candidates = await db.select({
        id: samples.id,
        fileName: samples.fileName,
        filePath: samples.filePath,
        duration: samples.duration,
        tags: samples.tags,
        clapEmbedding: samples.clapEmbedding,
      }).from(samples)
        .where(sql`${samples.clapEmbedding} IS NOT NULL`)
        .limit(5000);

      if (candidates.length === 0) {
        return { success: true, data: [] };
      }

      // 4. 计算 cosine similarity
      const scored = candidates.map((c: typeof candidates[0]) => {
        if (!c.clapEmbedding) return { ...c, similarity: 0 };
        const emb = Buffer.from(c.clapEmbedding, 'base64');
        const vec = Array.from(new Float32Array(emb.buffer, emb.byteOffset, emb.byteLength / 4));
        const sim = cosineSimilarity(textVector, vec);
        return { ...c, similarity: sim };
      });

      // 5. 排序并取 top K
      scored.sort((a: typeof scored[0], b: typeof scored[0]) => b.similarity - a.similarity);
      const topResults = scored.slice(0, limit).map(({ similarity, clapEmbedding, ...rest }: typeof scored[0]) => rest);

      return { success: true, data: topResults };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 重置数据库（初始化）
  ipcMain.handle('database:reset', async () => {
    try {
      resetDatabase();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 拖放导入：接收文件路径列表，逐个导入到数据库
  ipcMain.handle('samples:importFiles', async (_event, data: { filePaths: string[] }) => {
    try {
      const filePaths = validateArray<string>(data?.filePaths, 'filePaths', (item) => validatePath(item));
      if (filePaths.length === 0) return { success: false, error: 'No file paths provided' };

      let imported = 0;
      let skipped = 0;

      for (const filePath of filePaths) {
        try {
          await handleFileAdd(filePath);
          imported++;
        } catch {
          skipped++;
        }
      }

      return { success: true, data: { imported, skipped } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 更新采样评分和备注
  ipcMain.handle('samples:updateRatingNotes', async (_event, data: { sampleId: number; rating?: number; notes?: string }) => {
    try {
      const sampleId = validatePositiveInt(data?.sampleId, 'sampleId');
      const updates: Record<string, any> = {};
      if (data.rating !== undefined) updates.rating = data.rating;
      if (data.notes !== undefined) updates.notes = data.notes;

      await db.update(samples).set(updates).where(eq(samples.id, sampleId));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取采样的 PANNs 音频事件段
  ipcMain.handle('samples:getAudioSegments', async (_event, data: { sampleId: number }) => {
    try {
      const sampleId = validatePositiveInt(data?.sampleId, 'sampleId');
      const segments = await db
        .select()
        .from(audioSegments)
        .where(eq(audioSegments.sampleId, sampleId))
        .orderBy(audioSegments.startTime);
      return { success: true, data: segments };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 读取音频文件并返回 ArrayBuffer（绕过 file:// URL 特殊字符问题）
  ipcMain.handle('samples:getAudioBuffer', async (_event, data: { filePath: string }) => {
    try {
      const filePath = validateString(data?.filePath, 'filePath');
      const buffer = await getFileIOService().readFile(filePath);
      return { success: true, data: buffer };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}

// ── UCS 分类查询 ──────────────────────────────────────────────
ipcMain.handle('ucs:getCategories', async () => {
  try {
    const s = getSqlite();
    const cats = s.prepare('SELECT * FROM ucs_categories ORDER BY sort_order').all() as Array<{
      id: number; cat_code: string; cat_name_zh: string; cat_name_en: string;
      clap_description: string; sort_order: number;
    }>;
    // 为每个分类获取子分类数量
    const countSubs = s.prepare('SELECT COUNT(*) as cnt FROM ucs_subcategories WHERE cat_id = ?');
    const result = cats.map(cat => ({
      ...cat,
      subCount: (countSubs.get(cat.id) as { cnt: number }).cnt,
    }));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('ucs:getSubcategories', async (_event, data: { catId: number }) => {
  try {
    const catId = data?.catId;
    if (!catId || typeof catId !== 'number') {
      return { success: false, error: 'catId is required' };
    }
    const s = getSqlite();
    const subs = s.prepare('SELECT * FROM ucs_subcategories WHERE cat_id = ? ORDER BY id').all(catId) as Array<{
      id: number; cat_id: number; code: string; name_zh: string; name_en: string; clap_description: string;
    }>;
    return { success: true, data: subs };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});
