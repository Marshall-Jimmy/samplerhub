/**
 * 向量搜索服务 - 管理 worker_thread 生命周期，提供异步搜索接口
 * 将 CLAP embedding 余弦相似度计算从主进程移到 worker 线程
 */

import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import log from 'electron-log'

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

interface ScoredResult {
  sampleId: number
  score: number
}

let worker: Worker | null = null
let requestIdCounter = 0
const pendingRequests = new Map<number, {
  resolve: (results: ScoredResult[]) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}>()

/** 懒加载启动 worker */
function ensureWorker(): Worker {
  if (worker) return worker

  worker = new Worker(path.join(_dirname, 'vectorSearchWorker.js'), {
    resourceLimits: { maxOldGenerationSizeMb: 512 },
  })

  worker.on('message', (msg: { id: number; results?: ScoredResult[]; error?: string }) => {
    const pending = pendingRequests.get(msg.id)
    if (!pending) return
    clearTimeout(pending.timer)
    pendingRequests.delete(msg.id)

    if (msg.error) {
      pending.reject(new Error(msg.error))
    } else {
      pending.resolve(msg.results || [])
    }
  })

  worker.on('error', (err) => {
    log.error('[VectorSearchWorker] Worker error:', err)
    // 拒绝所有 pending 请求
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(err)
      pendingRequests.delete(id)
    }
    worker = null
  })

  worker.on('exit', (code) => {
    if (code !== 0) {
      log.warn(`[VectorSearchWorker] Worker exited with code ${code}`)
    }
    worker = null
  })

  return worker
}

/** 通过 worker 执行文本→音频语义搜索 */
export async function searchTextByClap(
  queryVectorB64: string,
  limit: number = 20
): Promise<ScoredResult[]> {
  return submitRequest({
    type: 'searchByText',
    queryVectorB64,
    limit,
  })
}

/** 通过 worker 执行音频→音频相似度搜索 */
export async function searchSimilarByClap(
  targetSampleId: number,
  limit: number = 20
): Promise<ScoredResult[]> {
  return submitRequest({
    type: 'searchSimilar',
    targetSampleId,
    limit,
    excludeId: targetSampleId,
  })
}

/** 提交请求到 worker */
function submitRequest(req: { type: string; limit: number; [key: string]: unknown }): Promise<ScoredResult[]> {
  return new Promise((resolve, reject) => {
    const w = ensureWorker()
    const id = ++requestIdCounter

    const timer = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error('Vector search timeout (30s)'))
    }, 30_000)

    pendingRequests.set(id, { resolve, reject, timer })

    w.postMessage({ id, ...req })
  })
}

/** 关闭 worker（应用退出时调用） */
export function shutdownVectorSearchWorker(): void {
  if (worker) {
    try { worker.terminate() } catch {}
    worker = null
  }
  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timer)
    pending.reject(new Error('Worker shutting down'))
  }
  pendingRequests.clear()
}
