/**
 * 文本 Embedding 搜索引擎（方案 B）
 *
 * 使用 @huggingface/transformers 的 all-MiniLM-L6-v2 模型，
 * 将文件名+标签+分类名编码为 384 维向量，搜索时计算余弦相似度。
 *
 * 模型信息：
 * - 模型：Xenova/all-MiniLM-L6-v2（Sentence Transformers 的 ONNX 版本）
 * - 维度：384
 * - 大小：~50MB（首次下载后缓存）
 * - 速度：单条 ~10ms，批量 ~5ms/条
 *
 * 使用方式：
 * 1. 初始化：await textEmbeddingSearcher.initialize()
 * 2. 生成 embedding：const vec = await textEmbeddingSearcher.embed("Dark Ambient Pad")
 * 3. 搜索：const results = await textEmbeddingSearcher.search("氛围感铺底", topK=20)
 */

import { pipeline, type PipelineType } from '@huggingface/transformers';
import { getDatabase, getSqlite } from './database';
import { samples, categories } from '../../../drizzle/schema';
import { eq, sql } from 'drizzle-orm';
import { buildEmbeddingText } from './semanticSearch';

// ── 单例实例 ──────────────────────────────────────────────────────────

let instance: TextEmbeddingSearcherImpl | null = null;

export function getTextEmbeddingSearcher(): TextEmbeddingSearcherImpl {
  if (!instance) {
    instance = new TextEmbeddingSearcherImpl();
  }
  return instance;
}

// ── 实现 ──────────────────────────────────────────────────────────────

class TextEmbeddingSearcherImpl {
  private generator: any = null;
  private isInitialized = false;
  private isInitializing = false;

  /** 模型是否已就绪 */
  get ready(): boolean {
    return this.isInitialized;
  }

  /**
   * 初始化模型（异步，首次加载 ~2-5s，后续缓存）
   * 模型文件缓存在用户数据目录下，避免重复下载
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.isInitializing) {
      // 等待其他调用完成初始化
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return;
    }

    this.isInitializing = true;
    try {
      // 使用 feature-extraction pipeline
      this.generator = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        {
          // 模型缓存到用户数据目录
          // quantized: true 使用量化版本，更小更快
        }
      );
      this.isInitialized = true;
      console.log('[TextEmbedding] 模型加载完成');
    } catch (err) {
      console.error('[TextEmbedding] 模型加载失败:', err);
      throw err;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * 为单个文本生成 embedding 向量
   * @returns 384 维浮点数数组
   */
  async embed(text: string): Promise<number[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const result = await this.generator(text, {
      pooling: 'mean',
      normalize: true,
    });

    // 提取 embedding 数据
    const data = Array.from(result.data as Float32Array);
    return data;
  }

  /**
   * 批量生成 embedding（内部使用，比逐个调用快 3-5x）
   * @returns 384 维浮点数数组的数组
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const results: number[][] = [];
    const BATCH_SIZE = 32;

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      // 批量调用 pipeline
      const output = await this.generator(batch, {
        pooling: 'mean',
        normalize: true,
      });

      // output 是一个 Tensor，维度为 [batchSize, 384]
      const batchSize = batch.length;
      const dim = output.dims[1];

      for (let j = 0; j < batchSize; j++) {
        const vec = new Array<number>(dim);
        for (let k = 0; k < dim; k++) {
          vec[k] = output.data[j * dim + k] as number;
        }
        results.push(vec);
      }
    }

    return results;
  }

  /**
   * 计算两个向量的余弦相似度
   * 输入向量应已归一化，此时余弦相似度 = 点积
   */
  cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  /**
   * 语义搜索：给定查询文本，返回最相似的采样 ID 列表
   *
   * @param query 查询文本（支持中英文）
   * @param topK 返回前 K 个结果
   * @param categoryFilter 可选的分类 ID 过滤
   * @returns 按相似度排序的 { sampleId, score } 数组
   */
  async search(
    query: string,
    topK: number = 50,
    categoryFilter?: number,
  ): Promise<Array<{ sampleId: number; score: number }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = getDatabase();
    const sqlite = getSqlite();

    // 1. 生成查询 embedding
    const queryVec = await this.embed(query);

    // 2. 从数据库读取所有有 embedding 的采样
    let rows: Array<{ id: number; text_embedding: Buffer | null }>;

    if (categoryFilter !== undefined) {
      rows = sqlite.prepare(
        'SELECT id, text_embedding FROM samples WHERE text_embedding IS NOT NULL AND category_id = ?'
      ).all(categoryFilter) as typeof rows;
    } else {
      rows = sqlite.prepare(
        'SELECT id, text_embedding FROM samples WHERE text_embedding IS NOT NULL'
      ).all() as typeof rows;
    }

    if (rows.length === 0) return [];

    // 3. 计算余弦相似度（暴力搜索，万级以下够快）
    const scored: Array<{ sampleId: number; score: number }> = [];
    for (const row of rows) {
      if (!row.text_embedding) continue;
      const vec = new Float32Array(row.text_embedding.buffer, row.text_embedding.byteOffset, row.text_embedding.byteLength / 4);
      const score = this.cosineSimilarity(queryVec, Array.from(vec));
      scored.push({ sampleId: row.id, score });
    }

    // 4. 排序并返回 top-K
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * 为所有没有 embedding 的采样批量生成 embedding
   * 通常在扫描完成后调用
   *
   * @param onProgress 进度回调
   */
  async generateForAllSamples(onProgress?: (current: number, total: number) => void): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = getDatabase();
    const sqlite = getSqlite();

    // 查找所有没有 embedding 的采样
    const rows = sqlite.prepare(
      'SELECT s.id, s.file_name, s.tags, c.name as category_name FROM samples s LEFT JOIN categories c ON s.category_id = c.id WHERE s.text_embedding IS NULL'
    ).all() as Array<{ id: number; file_name: string; tags: string | null; category_name: string | null }>;

    if (rows.length === 0) return 0;

    // 批量生成 embedding
    const BATCH_SIZE = 32;
    let processed = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const texts = batch.map(r => buildEmbeddingText(r.file_name, r.tags, r.category_name));
      const embeddings = await this.embedBatch(texts);

      // 写入数据库
      const stmt = sqlite.prepare('UPDATE samples SET text_embedding = ? WHERE id = ?');
      sqlite.exec('BEGIN TRANSACTION');
      for (let j = 0; j < batch.length; j++) {
        const buf = Buffer.from(new Float32Array(embeddings[j]).buffer);
        stmt.run(buf, batch[j].id);
      }
      sqlite.exec('COMMIT');

      processed += batch.length;
      onProgress?.(processed, rows.length);
    }

    return processed;
  }

  /**
   * 释放模型资源
   */
  dispose(): void {
    this.generator = null;
    this.isInitialized = false;
    instance = null;
  }
}

// ── 方案 C 预留：CLAP ONNX 音频语义搜索 ────────────────────────────────

/**
 * CLAP ONNX 音频语义搜索（预留实现区域）
 *
 * TODO: 实现 CLAP ONNX 推理
 * 1. 转换 CLAP 模型为 ONNX 格式
 *    - clap_audio_encoder.onnx (~150MB)
 *    - clap_text_encoder.onnx (~50MB)
 * 2. 安装 onnxruntime-node
 * 3. 实现 ClapAudioSearcher 类
 *
 * 接口定义见 semanticSearch.ts 中的 ClapAudioSearcher
 * 数据库字段：samples.clap_embedding (BLOB, 512维 float32)
 *
 * 集成点：
 * - analysisQueue.ts 的 processFile() 中调用
 * - ipcSamples.ts 的搜索 handler 中作为混合搜索的一部分
 */
