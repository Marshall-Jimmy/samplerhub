/**
 * UCS CLAP Zero-shot 分类器
 *
 * 使用 CLAP text embedding + cosine similarity 实现 UCS 分类
 * 核心流程：
 * 1. 读取音频的 clap_embedding (base64)
 * 2. 对每个 UCS 子类的 clap_description 调用 Python sidecar 获取 text embedding
 * 3. 计算 cosine similarity，排序取 Top-5
 * 4. 写入 sample_ucs_tags 表
 */

import { getSqlite } from './database';
import { analyzerSidecar } from './analyzerSidecar';

export interface UcsMatch {
  catCode: string;
  subCode: string;
  nameZh: string;
  confidence: number;
}

// 文本 embedding 缓存 (subCode -> Float32Array)
const textEmbedCache = new Map<string, Float32Array>();

/**
 * Base64 编码的 float32 数组 → Float32Array
 * Node.js 端使用 Buffer
 */
function base64ToFloat32Array(base64: string): Float32Array {
  const binary = Buffer.from(base64, 'base64');
  const bytes = new Uint8Array(binary.buffer, binary.byteOffset, binary.length);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
}

/** Cosine similarity between two Float32Arrays */
function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 获取或缓存指定 UCS 子类的文本 embedding
 */
async function getOrCacheTextEmbedding(code: string, description: string): Promise<Float32Array | null> {
  if (textEmbedCache.has(code)) return textEmbedCache.get(code)!;

  try {
    const result = await analyzerSidecar.analyzeText(description);
    if (!result?.embedding_b64) return null;

    const vec = base64ToFloat32Array(result.embedding_b64);
    textEmbedCache.set(code, vec);
    return vec;
  } catch (e) {
    console.error(`[UCS Classifier] Failed to embed text for ${code}:`, e);
    return null;
  }
}

/**
 * CLAP Zero-shot UCS 分类
 * @param sampleId 音频样本 ID
 * @returns Top-5 UCS 匹配结果 (按 confidence 降序)
 */
export async function classifyUcsZeroShot(sampleId: number): Promise<UcsMatch[]> {
  const sqlite = getSqlite();

  // 获取音频的 CLAP embedding
  const row = sqlite.prepare(
    'SELECT clap_embedding FROM samples WHERE id = ?'
  ).get(sampleId) as { clap_embedding: string | null } | undefined;

  if (!row?.clap_embedding) return [];
  const audioEmb = base64ToFloat32Array(row.clap_embedding);

  // 获取所有 UCS 子类及其主类信息
  const subRows = sqlite.prepare(`
    SELECT us.code, us.name_zh, uc.cat_code, us.clap_description
    FROM ucs_subcategories us
    JOIN ucs_categories uc ON us.cat_id = uc.id
    ORDER BY uc.sort_order, us.code
  `).all() as Array<{ code: string; name_zh: string; cat_code: string; clap_description: string }>;

  // 批量计算相似度
  const matches: UcsMatch[] = [];
  for (const sub of subRows) {
    const textEmb = await getOrCacheTextEmbedding(sub.code, sub.clap_description);
    if (!textEmb) continue;

    const sim = cosineSim(audioEmb, textEmb);
    matches.push({
      catCode: sub.cat_code,
      subCode: sub.code,
      nameZh: sub.name_zh,
      confidence: sim,
    });
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches.slice(0, 5);
}

/**
 * 将 UCS 分类结果写入数据库
 * @param sampleId 音频样本 ID
 * @param matches 分类匹配结果
 */
export function saveUcsClassification(sampleId: number, matches: UcsMatch[]): void {
  const sqlite = getSqlite();

  const insertTag = sqlite.prepare(`
    INSERT OR REPLACE INTO sample_ucs_tags (sample_id, ucs_cat_id, ucs_sub_id, confidence, is_confirmed)
    VALUES (?, (SELECT id FROM ucs_categories WHERE cat_code = ?), (SELECT id FROM ucs_subcategories WHERE code = ?), ?, 0)
  `);

  const saveAll = sqlite.transaction(() => {
    // 先清除旧的自动分类结果
    sqlite.prepare('DELETE FROM sample_ucs_tags WHERE sample_id = ? AND is_confirmed = 0').run(sampleId);

    for (const m of matches) {
      if (m.confidence < 0.25) continue;
      insertTag.run(sampleId, m.catCode, m.subCode, m.confidence);
    }
  });

  saveAll();
}
