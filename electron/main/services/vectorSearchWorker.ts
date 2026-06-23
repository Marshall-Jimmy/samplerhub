/**
 * 向量搜索 Worker - 在独立线程中执行 CLAP embedding 余弦相似度计算
 * 避免在主进程事件循环中做 O(n) 向量运算导致 UI 卡顿
 */

import { parentPort, workerData } from 'node:worker_threads'
import { getSqlite } from './database'

interface SearchRequest {
  id: number
  type: 'searchByText' | 'searchSimilar'
  queryVectorB64?: string  // 文本 embedding（base64）
  targetSampleId?: number  // 相似度搜索的目标采样 ID
  limit: number
  excludeId?: number
}

interface ScoredResult {
  sampleId: number
  score: number
}

interface SearchResponse {
  id: number
  results?: ScoredResult[]
  error?: string
}

/** base64 → Float32Array */
function base64ToFloat32(base64: string): Float32Array {
  const buf = Buffer.from(base64, 'base64')
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}

/** 余弦相似度 */
function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/** 从数据库加载所有 CLAP embedding（在 worker 线程中，不阻塞主进程） */
function loadAllClapEmbeddings(excludeId?: number): Array<{ id: number; embedding: Float32Array }> {
  const sqlite = getSqlite()
  const rows = sqlite.prepare(`
    SELECT id, clap_embedding FROM samples
    WHERE clap_embedding IS NOT NULL ${excludeId ? 'AND id != ?' : ''}
  `).all(...(excludeId ? [excludeId] : [])) as Array<{ id: number; clap_embedding: string }>

  return rows.map(row => ({
    id: row.id,
    embedding: base64ToFloat32(row.clap_embedding),
  }))
}

if (!parentPort) {
  throw new Error('vectorSearchWorker must be run as a Worker')
}

parentPort.on('message', (req: SearchRequest) => {
  try {
    let queryVector: Float32Array

    if (req.type === 'searchByText' && req.queryVectorB64) {
      queryVector = base64ToFloat32(req.queryVectorB64)
    } else if (req.type === 'searchSimilar' && req.targetSampleId != null) {
      // 加载目标采样的 embedding
      const sqlite = getSqlite()
      const target = sqlite.prepare(
        'SELECT clap_embedding FROM samples WHERE id = ?'
      ).get(req.targetSampleId) as { clap_embedding: string } | undefined

      if (!target?.clap_embedding) {
        const response: SearchResponse = { id: req.id, results: [] }
        parentPort!.postMessage(response)
        return
      }
      queryVector = base64ToFloat32(target.clap_embedding)
    } else {
      const response: SearchResponse = { id: req.id, error: 'Invalid request' }
      parentPort!.postMessage(response)
      return
    }

    // 在 worker 线程中加载全部 embedding 并计算相似度
    const candidates = loadAllClapEmbeddings(req.excludeId)

    const scored: ScoredResult[] = candidates
      .map(c => ({ sampleId: c.id, score: cosineSim(queryVector, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, req.limit)

    const response: SearchResponse = { id: req.id, results: scored }
    parentPort!.postMessage(response)
  } catch (err) {
    const response: SearchResponse = {
      id: req.id,
      error: (err as Error).message,
    }
    parentPort!.postMessage(response)
  }
})
