/**
 * 波形数据缓存 - 避免重复解析 Float32Array
 * 支持两种键：sampleId (number) 和 filePath (string)
 */

import { ipcClient } from '../services/ipcClient';

// 按 sampleId 缓存（用于 SampleDetailPanel 等）
const sampleIdCache = new Map<number, number[]>();

// 按 filePath 缓存（LRU，用于 PlayerBar）
const filePathCache = new Map<string, number[]>();
const MAX_FILE_PATH_CACHE = 50;

// 伪随机波形自动升级：跟踪正在升级的 sampleId，避免重复
const upgradingSampleIds = new Set<number>();
// 并发升级队列控制（最多 3 个同时进行）
const MAX_CONCURRENT_UPGRADES = 3;
let currentUpgradeCount = 0;
const upgradeQueue: Array<{ sampleId: number; filePath: string }> = [];

// 波形升级完成回调（发布-订阅）
const waveformUpgradeCallbacks = new Map<number, Set<() => void>>();

/** 注册波形升级完成回调，返回取消注册函数 */
export function onWaveformUpgraded(sampleId: number, callback: () => void): () => void {
  if (!waveformUpgradeCallbacks.has(sampleId)) {
    waveformUpgradeCallbacks.set(sampleId, new Set());
  }
  waveformUpgradeCallbacks.get(sampleId)!.add(callback);
  return () => {
    const callbacks = waveformUpgradeCallbacks.get(sampleId);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        waveformUpgradeCallbacks.delete(sampleId);
      }
    }
  };
}

/** 触发指定 sampleId 的所有升级回调 */
function notifyWaveformUpgraded(sampleId: number): void {
  const callbacks = waveformUpgradeCallbacks.get(sampleId);
  if (!callbacks) return;
  callbacks.forEach(cb => cb());
  // 回调触发后清理，避免内存泄漏
  waveformUpgradeCallbacks.delete(sampleId);
}

export function getCachedWaveform(sampleId: number, rawData: unknown): number[] | null {
  const cached = sampleIdCache.get(sampleId);
  if (cached) return cached;

  if (!rawData) return null;
  try {
    const float32 = new Float32Array(rawData as ArrayBufferLike);
    const arr = Array.from(float32);
    sampleIdCache.set(sampleId, arr);
    return arr;
  } catch {
    return null;
  }
}

/** 根据 sampleId 生成伪随机波形数据（无真实波形时的 fallback） */
export function generatePseudoWaveform(sampleId: number, barCount: number = 200): number[] {
  const cached = sampleIdCache.get(sampleId);
  if (cached) return cached;

  const seed = String(sampleId).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const random = (i: number) => {
    const x = Math.sin(seed * 9301 + i * 49297 + 233280) * 49297;
    return x - Math.floor(x);
  };
  const arr: number[] = [];
  for (let i = 0; i < barCount; i++) {
    arr.push(random(i) * 0.6 + 0.2);
  }
  sampleIdCache.set(sampleId, arr);
  return arr;
}

/** 获取波形数据：优先真实数据，fallback 到伪随机并触发后台升级 */
export function getWaveformOrFallback(sampleId: number, rawData: unknown, filePath?: string): number[] {
  const cached = getCachedWaveform(sampleId, rawData);
  if (cached) return cached;

  // rawData 为空，说明是伪随机波形，触发后台升级
  if (!rawData && filePath) {
    scheduleWaveformUpgrade(sampleId, filePath);
  }

  return generatePseudoWaveform(sampleId);
}

/** 使用 Web Audio API 解码真实波形（参考 PlayerBar 的 decodeWithWebAudio） */
async function decodeWithWebAudio(filePath: string): Promise<number[] | null> {
  let audioCtx: AudioContext | null = null;
  try {
    const result = await window.electronAPI.invoke('audio:getBuffer', { filePath }) as { success: boolean; data?: string };
    if (!result?.success || !result.data) return null;

    const binaryString = atob(result.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);

    const rawData = audioBuffer.getChannelData(0);
    const SAMPLES = 200;
    const blockSize = Math.floor(rawData.length / SAMPLES);
    const waveform: number[] = [];

    for (let i = 0; i < SAMPLES; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[i * blockSize + j]);
      }
      waveform.push(sum / blockSize);
    }

    const max = Math.max(...waveform);
    if (max > 0) {
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = waveform[i] / max;
      }
    }

    return waveform;
  } catch {
    return null;
  } finally {
    audioCtx?.close();
  }
}

/** 将波形升级任务加入队列，受并发限制 */
function scheduleWaveformUpgrade(sampleId: number, filePath: string): void {
  if (upgradingSampleIds.has(sampleId)) return;
  upgradingSampleIds.add(sampleId);
  upgradeQueue.push({ sampleId, filePath });
  processUpgradeQueue();
}

/** 处理升级队列 */
function processUpgradeQueue(): void {
  while (currentUpgradeCount < MAX_CONCURRENT_UPGRADES && upgradeQueue.length > 0) {
    const task = upgradeQueue.shift();
    if (!task) break;
    currentUpgradeCount++;
    upgradeWaveform(task.sampleId, task.filePath).finally(() => {
      currentUpgradeCount--;
      processUpgradeQueue();
    });
  }
}

/** 执行单个波形的后台升级 */
async function upgradeWaveform(sampleId: number, filePath: string): Promise<void> {
  try {
    const waveform = await decodeWithWebAudio(filePath);
    if (!waveform) return;

    // 通过 IPC 将真实波形写回 .wf 文件
    await ipcClient.saveWaveform(sampleId, waveform);

    // 更新缓存，下次渲染使用真实波形
    sampleIdCache.set(sampleId, waveform);

    // 通知所有注册的组件重新绘制
    notifyWaveformUpgraded(sampleId);
  } catch {
    // 升级失败时静默降级，不影响用户体验
  } finally {
    upgradingSampleIds.delete(sampleId);
  }
}

/** 按 filePath 缓存波形数据（LRU 策略） */
export function getCachedWaveformByPath(filePath: string): number[] | null {
  const data = filePathCache.get(filePath);
  if (data) {
    // LRU: 移到末尾
    filePathCache.delete(filePath);
    filePathCache.set(filePath, data);
    return data;
  }
  return null;
}

/** 按 filePath 存入波形数据（LRU 策略） */
export function setCachedWaveformByPath(filePath: string, data: number[]): void {
  if (filePathCache.size >= MAX_FILE_PATH_CACHE) {
    const firstKey = filePathCache.keys().next().value;
    if (firstKey) filePathCache.delete(firstKey);
  }
  filePathCache.set(filePath, data);
}

export function clearWaveformCache() {
  sampleIdCache.clear();
  filePathCache.clear();
  offscreenCache.clear();
}

// 离屏 Canvas 缓存：静态波形（无播放进度）缓存到离屏 Canvas
const offscreenCache = new Map<number, { canvas: OffscreenCanvas; w: number; h: number; key: string }>();
const MAX_OFFSCREEN_CACHE = 100;

/**
 * 绘制波形到 canvas - 统一绘制逻辑
 * 支持渐变填充 + 镜像反射 + 离屏缓存
 */
export function drawWaveformToCanvas(
  canvas: HTMLCanvasElement,
  waveform: number[],
  options: {
    accentColor?: string;
    isPlaying?: boolean;
    progressX?: number;
    hoverX?: number | null;
    barGap?: number;
    sampleId?: number;
  } = {}
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { accentColor = '#6366F1', isPlaying = false, progressX = 0, hoverX = null, barGap = 0.55, sampleId } = options;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const w = rect.width;
  const h = rect.height;

  // 静态模式（无播放、无 hover）：使用离屏 Canvas 缓存
  const isStatic = !isPlaying && progressX === 0 && hoverX === null;
  const cacheKey = `${sampleId}:${accentColor}:${w}:${h}:${dpr}:${waveform.length}`;

  if (isStatic && sampleId != null) {
    const cached = offscreenCache.get(sampleId);
    if (cached && cached.key === cacheKey) {
      // 缓存命中，直接绘制离屏 Canvas
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      ctx.drawImage(cached.canvas, 0, 0, w, h);
      return;
    }

    // 缓存未命中，绘制到离屏 Canvas
    const offscreen = new OffscreenCanvas(w * dpr, h * dpr);
    const offCtx = offscreen.getContext('2d')!;
    offCtx.scale(dpr, dpr);
    drawWaveformInternal(offCtx, waveform, w, h, accentColor, isPlaying, progressX, hoverX, barGap);

    // 存入缓存
    if (offscreenCache.size >= MAX_OFFSCREEN_CACHE) {
      const firstKey = offscreenCache.keys().next().value;
      if (firstKey != null) offscreenCache.delete(firstKey);
    }
    offscreenCache.set(sampleId, { canvas: offscreen, w, h, key: cacheKey });

    // 绘制到目标 canvas
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.drawImage(offscreen, 0, 0, w, h);
    return;
  }

  // 动态模式：直接绘制
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  drawWaveformInternal(ctx, waveform, w, h, accentColor, isPlaying, progressX, hoverX, barGap);
}

/** 内部绘制函数 */
function drawWaveformInternal(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  waveform: number[],
  w: number,
  h: number,
  accentColor: string,
  isPlaying: boolean,
  progressX: number,
  hoverX: number | null,
  barGap: number
) {
  ctx.clearRect(0, 0, w, h);

  // Determine if we have enough height for reflection (need at least 40px)
  const hasReflection = h >= 40;
  const mainH = hasReflection ? h * 0.75 : h;
  const reflectH = hasReflection ? h * 0.25 : 0;
  const midY = mainH;

  if (waveform.length > 0) {
    const barCount = waveform.length;
    const totalBarWidth = w / barCount;
    const barWidth = Math.max(1, totalBarWidth * barGap);

    // Create gradient for played region
    const playedGradient = ctx.createLinearGradient(0, 0, 0, mainH);
    playedGradient.addColorStop(0, accentColor);
    playedGradient.addColorStop(1, accentColor + '60');

    // Create gradient for unplayed region
    const unplayedColor = isPlaying ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)';
    const unplayedGradient = ctx.createLinearGradient(0, 0, 0, mainH);
    unplayedGradient.addColorStop(0, unplayedColor);
    unplayedGradient.addColorStop(1, isPlaying ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)');

    // Draw main waveform bars
    for (let i = 0; i < barCount; i++) {
      const x = i * totalBarWidth;
      const amplitude = waveform[i];
      const barH = Math.max(2, amplitude * (mainH - 4));
      const y = (mainH - barH) / 2;

      ctx.fillStyle = x + barWidth / 2 < progressX ? playedGradient : unplayedGradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 1);
      ctx.fill();
    }

    // Draw reflection (mirrored, faded)
    if (hasReflection) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < barCount; i++) {
        const x = i * totalBarWidth;
        const amplitude = waveform[i];
        const barH = Math.max(1, amplitude * (reflectH - 2));
        const y = midY + 2;

        ctx.fillStyle = x + barWidth / 2 < progressX ? accentColor : 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 1);
        ctx.fill();
      }
      ctx.restore();
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(0, (mainH - 4) / 2, w, 4, 2);
    ctx.fill();
  }

  // 播放头
  if (isPlaying && progressX > 0 && progressX < w) {
    // Glow effect on playhead
    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 6;
    ctx.fillStyle = accentColor;
    ctx.fillRect(progressX - 1, 2, 2, mainH - 4);
    ctx.restore();
  }

  // Hover 指示线
  if (hoverX !== null) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(hoverX, 0, 1, h);
  }
}
