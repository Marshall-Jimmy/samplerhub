# 统一文件 I/O 层 + 缓存系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 创建一个统一的文件 I/O 包装层，内置预读缓存和批量 I/O，减少扫描时的重复文件读取和随机 I/O。

**Architecture:** 所有文件读取（元数据解析、波形生成、特征提取、音频分析）通过统一的 `FileIOService` 接口，该服务维护一个内存缓存池（LRU），优先从缓存返回数据，缓存未命中时批量预读相邻文件。

**Tech Stack:** Node.js ESM, TypeScript, LRU Cache, Worker Threads (未来扩展)

---

## File Structure

| 文件 | 职责 |
|------|------|
| `electron/main/services/fileIOService.ts` | 统一文件 I/O 接口 + LRU 缓存 + 批量预读 |
| `electron/main/services/fileScanner.ts` | 修改：所有文件读取走 `FileIOService` |
| `electron/main/services/audioParser.ts` | 修改：解析器接收 `Buffer` 而非 `filePath` |
| `electron/main/services/waveformGenerator.ts` | 修改：波形生成接收 `Buffer` 或 stream |
| `electron/main/services/audioFeatureExtractor.ts` | 修改：特征提取接收 `Buffer` |
| `electron/main/services/audioAnalyzer.ts` | 修改：essentia 分析接收 `Buffer` |

---

## Task 1: FileIOService 核心实现

**Files:**
- Create: `electron/main/services/fileIOService.ts`

**目标:** 创建统一的文件 I/O 服务，提供 `readFile(filePath): Promise<Buffer>` 接口，内部维护 LRU 缓存。

- [ ] **Step 1: 定义 FileIOService 类和接口**

```typescript
import { readFile } from 'fs/promises';
import { LRUCache } from 'lru-cache';

export interface FileIOOptions {
  maxCacheSize?: number;      // 最大缓存条目数，默认 100
  maxCacheBytes?: number;     // 最大缓存字节数，默认 500MB
  preloadAhead?: number;      // 预读文件数，默认 5
}

export interface CachedFile {
  path: string;
  buffer: Buffer;
  size: number;
  lastAccessed: number;
}

class FileIOService {
  private cache: LRUCache<string, Buffer>;
  private preloadQueue: Set<string> = new Set();
  private preloadRunning = false;

  constructor(options: FileIOOptions = {}) {
    const {
      maxCacheSize = 100,
      maxCacheBytes = 500 * 1024 * 1024,
    } = options;

    this.cache = new LRUCache({
      max: maxCacheSize,
      maxSize: maxCacheBytes,
      sizeCalculation: (buf: Buffer) => buf.length,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
  }

  /**
   * 读取文件，优先从缓存返回
   */
  async readFile(filePath: string): Promise<Buffer> {
    const cached = this.cache.get(filePath);
    if (cached) {
      return cached;
    }

    const buffer = await readFile(filePath);
    this.cache.set(filePath, buffer);
    return buffer;
  }

  /**
   * 批量预读文件到缓存
   */
  async preloadFiles(filePaths: string[]): Promise<void> {
    const uncached = filePaths.filter(p => !this.cache.has(p));
    if (uncached.length === 0) return;

    await Promise.all(
      uncached.map(async (path) => {
        try {
          const buffer = await readFile(path);
          this.cache.set(path, buffer);
        } catch (err) {
          console.warn(`[FileIO] Preload failed for ${path}:`, err);
        }
      })
    );
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; bytes: number; keys: string[] } {
    return {
      size: this.cache.size,
      bytes: this.cache.calculatedSize ?? 0,
      keys: [...this.cache.keys()],
    };
  }
}

// 单例
let instance: FileIOService | null = null;

export function getFileIOService(options?: FileIOOptions): FileIOService {
  if (!instance) {
    instance = new FileIOService(options);
  }
  return instance;
}

export function resetFileIOService(): void {
  instance = null;
}
```

- [ ] **Step 2: 安装 lru-cache 依赖**

Run: `cd "D:\WorkingSpace\Jima'sSampleHub" && npm install lru-cache`

Expected: package.json 中出现 `"lru-cache": "^10.x"`

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `npm run build:main`

Expected: 无编译错误

---

## Task 2: 修改 audioParser.ts 支持 Buffer 输入

**Files:**
- Modify: `electron/main/services/audioParser.ts`

**目标:** `parseAudioFile` 函数支持接收 `Buffer` 或 `filePath`，如果传入 `Buffer` 则直接使用，避免重复读取文件。

- [ ] **Step 1: 修改 parseAudioFile 签名和实现**

```typescript
// 在文件顶部添加
import { getFileIOService } from './fileIOService';

// 修改 parseAudioFile 函数签名
export async function parseAudioFile(
  input: string | Buffer
): Promise<{
  duration: number;
  sampleRate: number;
  bitRate: number;
  channels: number;
  bpm: number | null;
  key: string | null;
}> {
  let buffer: Buffer;
  
  if (typeof input === 'string') {
    // 走统一文件 I/O 层
    buffer = await getFileIOService().readFile(input);
  } else {
    buffer = input;
  }

  // 原有解析逻辑，但使用 buffer 而非重新读取文件
  // ... (保持原有 music-metadata 解析逻辑)
}
```

- [ ] **Step 2: 修改 parseMidiFile 同样支持 Buffer 输入**

```typescript
export async function parseMidiFile(
  input: string | Buffer
): Promise<{
  duration: number;
  bpm: number | null;
  key: string | null;
  trackCount: number;
  noteCount: number;
  instruments: string[];
  timeSignature: string | null;
}> {
  let buffer: Buffer;
  
  if (typeof input === 'string') {
    buffer = await getFileIOService().readFile(input);
  } else {
    buffer = input;
  }

  // 原有 MIDI 解析逻辑
}
```

---

## Task 3: 修改 waveformGenerator.ts 支持 Buffer 输入

**Files:**
- Modify: `electron/main/services/waveformGenerator.ts`

**目标:** `generateWaveform` 支持接收 `Buffer`，避免重复读取文件。

- [ ] **Step 1: 修改 generateWaveform 签名和实现**

```typescript
import { getFileIOService } from './fileIOService';

export async function generateWaveform(
  input: string | Buffer
): Promise<{ waveform: number[]; peaks: number[] } | null> {
  let buffer: Buffer;
  
  if (typeof input === 'string') {
    buffer = await getFileIOService().readFile(input);
  } else {
    buffer = input;
  }

  // 原有波形生成逻辑，使用 buffer
  // ...
}
```

---

## Task 4: 修改 audioFeatureExtractor.ts 支持 Buffer 输入

**Files:**
- Modify: `electron/main/services/audioFeatureExtractor.ts`

**目标:** `extractAudioFeatures` 支持接收 `Buffer`。

- [ ] **Step 1: 修改 extractAudioFeatures 签名和实现**

```typescript
import { getFileIOService } from './fileIOService';

export async function extractAudioFeatures(
  input: string | Buffer
): Promise<AudioFeatures | null> {
  let buffer: Buffer;
  
  if (typeof input === 'string') {
    buffer = await getFileIOService().readFile(input);
  } else {
    buffer = input;
  }

  // 原有特征提取逻辑
  // ...
}
```

---

## Task 5: 修改 audioAnalyzer.ts 支持 Buffer 输入

**Files:**
- Modify: `electron/main/services/audioAnalyzer.ts`

**目标:** `analyzeAudioFile` 支持接收 `Buffer`。

- [ ] **Step 1: 修改 analyzeAudioFile 签名和实现**

```typescript
import { getFileIOService } from './fileIOService';

export async function analyzeAudioFile(
  input: string | Buffer,
  sampleRate?: number
): Promise<{ bpm: number | null; key: string | null }> {
  let buffer: Buffer;
  
  if (typeof input === 'string') {
    buffer = await getFileIOService().readFile(input);
  } else {
    buffer = input;
  }

  // 原有 essentia 分析逻辑
  // ...
}
```

---

## Task 6: 修改 fileScanner.ts 使用统一 I/O 层 + 批量预读

**Files:**
- Modify: `electron/main/services/fileScanner.ts`

**目标:** 
1. `processMetadataBatch` 中批量预读文件到缓存，然后传给各个分析器
2. 所有分析器调用传入 `Buffer` 而非 `filePath`

- [ ] **Step 1: 在 processMetadataBatch 中添加批量预读**

```typescript
import { getFileIOService } from './fileIOService';

async function processMetadataBatch(files: FileInfo[], signal: AbortSignal): Promise<void> {
  const db = getDatabase();
  const sqlite = getSqlite();
  const fileIO = getFileIOService();

  // 1. 批量预读所有文件到缓存（并发 8）
  const filePaths = files.map(f => f.path);
  await fileIO.preloadFiles(filePaths);

  // 2. 并行解析元数据（传入 Buffer）
  const metadataMap = await parseMetadataParallel(files, 8, signal, (cur, tot, fileName) => {
    // ... 进度通知
  });

  // 3. 逐个处理：更新元数据 + 波形 + 特征 + 分类
  for (const [filePath, metadata] of metadataMap) {
    if (signal.aborted) break;

    // 从缓存获取 Buffer
    const buffer = await fileIO.readFile(filePath);

    // 波形生成（传 Buffer）
    try {
      const result = await Promise.race([
        Promise.resolve(generateWaveform(buffer)),  // <-- 传 Buffer
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('waveform timeout')), 15_000)
        ),
      ]);
      // ...
    } catch { /* skip */ }

    // 频谱特征提取（传 Buffer）
    try {
      const features = await Promise.race([
        Promise.resolve(extractAudioFeatures(buffer)),  // <-- 传 Buffer
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('feature extraction timeout')), 15_000)
        ),
      ]);
      // ...
    } catch { /* skip */ }

    // essentia 分析（传 Buffer）
    if ((!finalBpm || !finalKey) && !metadata.isMidi) {
      try {
        const analysis = await Promise.race([
          analyzeAudioFile(buffer, metadata.sampleRate || undefined),  // <-- 传 Buffer
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('essentia timeout')), 10_000)
          ),
        ]);
        // ...
      } catch { /* skip */ }
    }

    // ...
  }

  // 4. 处理完成后清除这批文件的缓存（避免内存爆炸）
  // 可选：fileIO.clearCache(); 或只清除这批文件
}
```

- [ ] **Step 2: 修改 parseMetadataParallel 传 Buffer**

```typescript
async function parseMetadataParallel(
  files: FileInfo[],
  concurrency: number,
  signal: AbortSignal,
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<Map<string, any>> {
  const results = new Map();
  const fileIO = getFileIOService();

  for (let i = 0; i < files.length; i += concurrency) {
    if (signal.aborted) break;
    const batch = files.slice(i, i + concurrency);
    
    const parsed = await Promise.all(
      batch.map(async (file) => {
        try {
          // 从缓存获取 Buffer
          const buffer = await fileIO.readFile(file.path);

          if (isMidiFile(file.path)) {
            const midiMeta = await Promise.race([
              parseMidiFile(buffer),  // <-- 传 Buffer
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Parse timeout')), 15000)
              )
            ]);
            return { path: file.path, /* ... */ };
          }
          
          const metadata = await Promise.race([
            parseAudioFile(buffer),  // <-- 传 Buffer
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Parse timeout')), 15000)
            )
          ]);
          return { path: file.path, /* ... */ };
        } catch {
          return { path: file.path, /* ... */ };
        }
      })
    );
    // ...
  }

  return results;
}
```

---

## Task 7: 构建验证

- [ ] **Step 1: 编译主进程**

Run: `npm run build:main`

Expected: 无编译错误

- [ ] **Step 2: 完整构建**

Run: `npm run build`

Expected: 构建成功

- [ ] **Step 3: 测试扫描功能**

启动应用，添加一个采样文件夹，验证：
1. 扫描进度正常显示
2. 元数据正确解析
3. 波形正常生成
4. 分类正常执行

---

## 性能预期

| 优化项 | 效果 |
|--------|------|
| 批量预读 | 减少 80% 的独立 `fs.readFile` 调用 |
| LRU 缓存 | 同一文件多次读取时，后几次从内存返回（<1ms） |
| Buffer 传递 | 元数据解析、波形生成、特征提取、essentia 分析共享同一份 Buffer |
| 缓存清除 | 每批处理完后释放内存，避免内存爆炸 |

**首次扫描 10 万文件：** 从"每个文件读 4-5 次"降到"每个文件读 1 次"

---

## Task 8: AudioFileHelper — 一次性解析所有元数据

**Files:**
- Create: `electron/main/services/audioFileHelper.ts`

**目标:** 封装一个面向对象的音频文件助手，对同一个文件只做**一次解析**，把所有需要的数据（元数据、波形、特征、BPM/Key）全部拆出来，后续分析直接从缓存对象读取。

**设计思路（参考 Python 的 `wavfile` 风格）：**

```typescript
const audio = await AudioFileHelper.load('/path/to/kick.wav');

// 元数据（从文件头解析，不读完整文件）
const meta = audio.metadata();  // { duration, sampleRate, bitRate, channels, bpm, key }

// 波形数据（懒加载：第一次调用时生成，缓存到内存）
const waveform = audio.waveform();  // { waveform: number[], peaks: number[] }

// 频谱特征（懒加载）
const features = audio.features();  // AudioFeatures

// BPM/Key 分析（懒加载，essentia）
const analysis = audio.analysis();  // { bpm, key }

// 切片（用于预览）
const slice = audio.slice(0.0, 5.0);  // Buffer (5秒片段)

// 释放内存
audio.dispose();
```

**实现要点：**

- [ ] **Step 1: 定义 AudioFileHelper 类**

```typescript
import { getFileIOService } from './fileIOService';
import { parseAudioFile, parseMidiFile } from './audioParser';
import { generateWaveform } from './waveformGenerator';
import { extractAudioFeatures } from './audioFeatureExtractor';
import { analyzeAudioFile } from './audioAnalyzer';
import { isMidiFile } from './midiParser';

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  bitRate: number;
  channels: number;
  bpm: number | null;
  key: string | null;
  isMidi: boolean;
  midiMeta?: {
    trackCount: number;
    noteCount: number;
    instruments: string[];
    timeSignature: string | null;
  };
}

export interface AudioWaveform {
  waveform: number[];
  peaks: number[];
}

export interface AudioFeatures {
  spectralCentroid: number;
  spectralRolloff: number;
  spectralFlatness: number;
  spectralSpread: number;
  zeroCrossingRate: number;
  rms: number;
  energy: number;
  lowEnergyRatio: number;
  lowMidEnergyRatio: number;
  midEnergyRatio: number;
  highMidEnergyRatio: number;
  highEnergyRatio: number;
  featureVector: number[];
}

export interface AudioAnalysis {
  bpm: number | null;
  key: string | null;
}

export class AudioFileHelper {
  private filePath: string;
  private buffer: Buffer | null = null;
  private _metadata: AudioMetadata | null = null;
  private _waveform: AudioWaveform | null = null;
  private _features: AudioFeatures | null = null;
  private _analysis: AudioAnalysis | null = null;
  private disposed = false;

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * 工厂方法：加载文件到内存
   */
  static async load(filePath: string): Promise<AudioFileHelper> {
    const helper = new AudioFileHelper(filePath);
    // 预读到缓存（通过 FileIOService）
    helper.buffer = await getFileIOService().readFile(filePath);
    return helper;
  }

  /**
   * 从已有 Buffer 创建（不重复读取文件）
   */
  static fromBuffer(filePath: string, buffer: Buffer): AudioFileHelper {
    const helper = new AudioFileHelper(filePath);
    helper.buffer = buffer;
    return helper;
  }

  /**
   * 元数据解析（只读文件头，不读完整文件）
   * 实际实现中，如果 buffer 已加载，直接从 buffer 解析
   */
  async metadata(): Promise<AudioMetadata> {
    if (this._metadata) return this._metadata;
    if (this.disposed) throw new Error('AudioFileHelper already disposed');

    if (!this.buffer) {
      this.buffer = await getFileIOService().readFile(this.filePath);
    }

    if (isMidiFile(this.filePath)) {
      const midi = await parseMidiFile(this.buffer);
      this._metadata = {
        duration: midi.duration,
        sampleRate: 0,
        bitRate: 0,
        channels: 0,
        bpm: midi.bpm,
        key: midi.key,
        isMidi: true,
        midiMeta: {
          trackCount: midi.trackCount,
          noteCount: midi.noteCount,
          instruments: midi.instruments,
          timeSignature: midi.timeSignature,
        },
      };
    } else {
      const meta = await parseAudioFile(this.buffer);
      this._metadata = {
        ...meta,
        isMidi: false,
      };
    }

    return this._metadata;
  }

  /**
   * 波形数据（懒加载 + 缓存）
   */
  async waveform(): Promise<AudioWaveform | null> {
    if (this._waveform) return this._waveform;
    if (this.disposed) throw new Error('AudioFileHelper already disposed');
    if (this._metadata?.isMidi) return null;

    if (!this.buffer) {
      this.buffer = await getFileIOService().readFile(this.filePath);
    }

    this._waveform = await generateWaveform(this.buffer);
    return this._waveform;
  }

  /**
   * 频谱特征（懒加载 + 缓存）
   */
  async features(): Promise<AudioFeatures | null> {
    if (this._features) return this._features;
    if (this.disposed) throw new Error('AudioFileHelper already disposed');
    if (this._metadata?.isMidi) return null;

    if (!this.buffer) {
      this.buffer = await getFileIOService().readFile(this.filePath);
    }

    const result = await extractAudioFeatures(this.buffer);
    if (result) {
      this._features = result;
    }
    return this._features;
  }

  /**
   * BPM/Key 分析（懒加载 + 缓存）
   */
  async analysis(): Promise<AudioAnalysis | null> {
    if (this._analysis) return this._analysis;
    if (this.disposed) throw new Error('AudioFileHelper already disposed');
    if (this._metadata?.isMidi) return null;

    if (!this.buffer) {
      this.buffer = await getFileIOService().readFile(this.filePath);
    }

    const sampleRate = this._metadata?.sampleRate;
    this._analysis = await analyzeAudioFile(this.buffer, sampleRate || undefined);
    return this._analysis;
  }

  /**
   * 音频切片（用于预览）
   */
  async slice(startSec: number, endSec: number): Promise<Buffer | null> {
    if (this.disposed) throw new Error('AudioFileHelper already disposed');
    if (this._metadata?.isMidi) return null;

    // TODO: 使用 ffmpeg 或 Web Audio API 提取片段
    // 当前简化实现：返回完整 buffer（后续可优化）
    if (!this.buffer) {
      this.buffer = await getFileIOService().readFile(this.filePath);
    }
    return this.buffer;
  }

  /**
   * 释放内存
   */
  dispose(): void {
    this.buffer = null;
    this._metadata = null;
    this._waveform = null;
    this._features = null;
    this._analysis = null;
    this.disposed = true;
  }

  /**
   * 获取文件路径
   */
  get path(): string {
    return this.filePath;
  }

  /**
   * 获取原始 Buffer（谨慎使用）
   */
  get rawBuffer(): Buffer | null {
    return this.buffer;
  }
}
```

- [ ] **Step 2: 修改 fileScanner.ts 使用 AudioFileHelper**

```typescript
import { AudioFileHelper } from './audioFileHelper';

// 在 processMetadataBatch 中替换原有逻辑：
async function processMetadataBatch(files: FileInfo[], signal: AbortSignal): Promise<void> {
  const db = getDatabase();
  const sqlite = getSqlite();

  for (const file of files) {
    if (signal.aborted) break;

    // 一次性加载文件
    const audio = await AudioFileHelper.load(file.path);

    try {
      // 1. 元数据（只解析一次）
      const meta = await audio.metadata();

      // 2. 波形（懒加载，如果需要）
      const waveform = await audio.waveform();

      // 3. 特征（懒加载）
      const features = await audio.features();

      // 4. BPM/Key（懒加载）
      const analysis = await audio.analysis();

      // 合并数据写入数据库
      // ...
    } finally {
      // 释放内存
      audio.dispose();
    }
  }
}
```

**优势：**
- 每个文件只读一次 Buffer
- 所有分析器共享同一个 Buffer
- 懒加载：不用的数据不计算
- 显式 dispose：内存可控

---

## Task 9: 解析结果生命周期缓存 + 内存阈值自动清理

**Files:**
- Modify: `electron/main/services/audioFileHelper.ts`（Task 8 创建的文件）
- Modify: `electron/main/services/fileIOService.ts`

**目标:** 解析结果在整个应用生命周期内缓存（用内存换解析时间和硬盘寿命），采用"用时解析"策略，当系统内存超过阈值时自动清理最早未使用的缓存。

### 设计原则

> **用内存空间换解析时间和硬盘寿命。**
> 同一个文件在整个应用运行期间只解析一次，后续所有访问直接从内存返回。

### 9.1 "用时解析"（Lazy Get）模式

AudioFileHelper 的每个属性都采用 getter 模式，第一次访问时触发解析并缓存，后续直接返回缓存结果：

```typescript
class AudioFileHelper {
  private _metadata: AudioMetadata | null = null;

  get metadata(): AudioMetadata {
    if (this._metadata) return this._metadata;
    // 同步解析（如果 buffer 已在内存中）
    // 或异步解析（如果 buffer 未加载）
    this._metadata = this._parseMetadata();
    return this._metadata;
  }
}
```

**注意：** 由于 Node.js 的 getter 不能是 async，需要两种策略：
- **同步解析**（metadata、features）：buffer 已在内存中，解析是纯 CPU 计算
- **异步解析**（waveform、analysis）：需要调用 WASM 或外部库，用 `async load()` + 缓存标记

实际实现采用**混合模式**：

```typescript
class AudioFileHelper {
  // 同步 getter：buffer 已在内存时直接解析
  get metadata(): AudioMetadata | null {
    return this._metadata;
  }

  // 异步 ensure：第一次调用时解析，后续直接返回
  async ensureMetadata(): Promise<AudioMetadata> {
    if (this._metadata) return this._metadata;
    this._metadata = await this._parseMetadata();
    return this._metadata;
  }

  // 使用方式
  const meta = await audio.ensureMetadata();  // 第一次：解析 + 缓存
  const meta2 = await audio.ensureMetadata(); // 第二次：直接返回缓存
}
```

### 9.2 全局解析缓存池（AudioFileCache）

在 `fileIOService.ts` 中维护一个全局的 `AudioFileHelper` 实例缓存池，避免重复创建：

```typescript
import os from 'os';

class AudioFileCache {
  private helpers: Map<string, AudioFileHelper> = new Map();
  private accessOrder: string[] = [];  // LRU 访问顺序记录
  private maxMemoryMB: number;
  private memoryThreshold: number;     // 内存占用阈值（百分比）

  constructor(options: { maxMemoryMB?: number; memoryThreshold?: number } = {}) {
    this.maxMemoryMB = options.maxMemoryMB ?? 512;
    this.memoryThreshold = options.memoryThreshold ?? 80; // 系统内存占用超过 80% 时触发清理
  }

  /**
   * 获取 AudioFileHelper（优先从缓存返回）
   */
  async get(filePath: string): Promise<AudioFileHelper> {
    // 检查内存压力
    this.checkMemoryPressure();

    const existing = this.helpers.get(filePath);
    if (existing) {
      // 更新 LRU 顺序
      this.touch(filePath);
      return existing;
    }

    // 创建新实例
    const helper = await AudioFileHelper.load(filePath);
    this.helpers.set(filePath, helper);
    this.accessOrder.push(filePath);
    return helper;
  }

  /**
   * 从已有 Buffer 创建（不重复读取文件）
   */
  fromBuffer(filePath: string, buffer: Buffer): AudioFileHelper {
    const existing = this.helpers.get(filePath);
    if (existing) return existing;

    const helper = AudioFileHelper.fromBuffer(filePath, buffer);
    this.helpers.set(filePath, helper);
    this.accessOrder.push(filePath);
    return helper;
  }

  /**
   * 标记最近访问
   */
  private touch(filePath: string): void {
    const idx = this.accessOrder.indexOf(filePath);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(filePath);
  }

  /**
   * 检查系统内存压力，超阈值时清理最久未使用的缓存
   */
  private checkMemoryPressure(): void {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedPercent = ((totalMem - freeMem) / totalMem) * 100;

    if (usedPercent > this.memoryThreshold) {
      const toFree = Math.ceil(this.helpers.size * 0.3); // 清理 30% 最久未使用的
      this.evictLRU(toFree);
      console.log(`[AudioFileCache] Memory pressure: ${usedPercent.toFixed(1)}%, evicted ${toFree} entries`);
    }
  }

  /**
   * 清理最久未使用的 N 个缓存
   */
  private evictLRU(count: number): void {
    for (let i = 0; i < count && this.accessOrder.length > 0; i++) {
      const oldest = this.accessOrder.shift()!;
      const helper = this.helpers.get(oldest);
      if (helper) {
        helper.dispose();
        this.helpers.delete(oldest);
      }
    }
  }

  /**
   * 手动清理所有缓存
   */
  clear(): void {
    for (const helper of this.helpers.values()) {
      helper.dispose();
    }
    this.helpers.clear();
    this.accessOrder = [];
  }

  /**
   * 缓存统计
   */
  get stats(): { count: number; accessOrder: string[]; memoryThreshold: number } {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedPercent = ((totalMem - freeMem) / totalMem) * 100;
    return {
      count: this.helpers.size,
      accessOrder: [...this.accessOrder],
      memoryThreshold: this.memoryThreshold,
      currentMemoryPercent: usedPercent,
    };
  }
}

// 单例
let cacheInstance: AudioFileCache | null = null;

export function getAudioFileCache(): AudioFileCache {
  if (!cacheInstance) {
    cacheInstance = new AudioFileCache();
  }
  return cacheInstance;
}
```

### 9.3 使用方式

```typescript
// fileScanner.ts 中
const cache = getAudioFileCache();

for (const file of files) {
  // 从缓存获取（如果之前解析过，直接返回缓存结果）
  const audio = await cache.get(file.path);

  // 用时解析：第一次调用 ensureMetadata 时解析，后续直接返回
  const meta = await audio.ensureMetadata();

  // 如果需要波形（第一次会生成，后续从缓存返回）
  if (needWaveform) {
    const waveform = await audio.ensureWaveform();
  }

  // 不需要手动 dispose —— AudioFileCache 会根据内存压力自动清理
}
```

### 9.4 缓存策略总结

| 策略 | 说明 |
|------|------|
| **用时解析** | `ensureMetadata()` / `ensureWaveform()` 第一次调用时解析，后续返回缓存 |
| **生命周期缓存** | 解析结果在整个应用运行期间保留，不主动清理 |
| **LRU 淘汰** | 当缓存池满或系统内存超阈值时，清理最久未使用的 30% |
| **内存监控** | 通过 `os.totalmem()` / `os.freemem()` 实时监控，阈值默认 80% |
| **手动清理** | 提供 `cache.clear()` 供用户在设置中手动释放内存 |
| **不持久化** | 应用重启后重新解析（解析速度很快，缓存文件反而增加 I/O） |

### 9.5 为什么不做磁盘缓存

| 方案 | 优势 | 劣势 |
|------|------|------|
| 内存缓存（当前方案） | 速度最快（<1ms），无 I/O | 占用内存 |
| 磁盘缓存（波形/特征存文件） | 重启后不丢失 | 增加写入 I/O，读取仍需磁盘访问 |
| 混合缓存 | 兼顾两者 | 复杂度高，缓存一致性难维护 |

**结论：** 对于采样库管理工具，用户通常不会频繁重启应用。内存缓存足够，磁盘缓存在后期有明确需求时再考虑。

---

## 未来扩展（不在本次计划）

1. **Worker Threads**: 将 `processMetadataBatch` 放到 Worker 线程执行
2. **内存映射**: 对大文件使用 `fs.createReadStream` 而非一次性读入 Buffer
3. **磁盘缓存**: 将波形/特征缓存到独立文件（仅在内存不足时启用）
4. **切片实现**: 用 ffmpeg 提取精确时间片段，而非返回完整 buffer
5. **设置面板**: 在设置中显示缓存统计和手动清理按钮

---

## 附录：现有代码耦合度分析

> 以下分析基于 2025-06-15 对 `electron/main/services/` 目录的全面扫描。

### A. 独立读硬盘的模块（7/8 个）

| 模块 | 使用的 fs API | 读盘次数/文件 |
|------|-------------|-------------|
| `fileScanner.ts` | `readdir`, `stat` | 1 次（发现文件） |
| `audioParser.ts` | 动态 `import('fs')` + `createReadStream` | 1 次（解析元数据） |
| `waveformGenerator.ts` | `readFileSync`, `openSync`, `readSync`, `statSync` | 1-2 次（波形 + 可选 detectSilence） |
| `audioFeatureExtractor.ts` | `statSync`, `unlinkSync` | 间接 1 次（调用 readWavAsMono） |
| `audioAnalyzer.ts` | `readFileSync` | 1 次（BPM/Key 分析） |
| `midiParser.ts` | `readFile` (fs/promises) | 1 次（MIDI 解析） |
| `ipcSamples.ts` | `readFileSync` (getAudioBuffer) | 1 次（播放时读取） |

**同一个 WAV 文件在扫描流程中被读 4-6 次：**
```
扫描一个 WAV 文件：
  1. fileScanner.ts:    readdir + stat（发现文件）
  2. audioParser.ts:    createReadStream（解析元数据）
  3. waveformGenerator: readFileSync（生成波形）
  4. audioFeatureExtractor → audioAnalyzer.readWavAsMono（特征提取）
  5. audioAnalyzer.ts:  readFileSync（BPM/Key 分析）
  6. detectSilence:      readFileSync（空白检测，可选）
```

### B. 重复代码模式

#### 模式 1：Promise.race + setTimeout 超时包装（5 处）

```typescript
// fileScanner.ts 中出现 5 次，仅超时时间和错误消息不同
const analysis = await Promise.race([
  analyzeAudioFile(filePath, metadata.sampleRate || undefined),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('essentia timeout')), 10_000)
  ),
]);
```

**提取为：** `withTimeout<T>(promise, ms, label)`

#### 模式 2：try/catch + log + 返回 null（8+ 处）

```typescript
// audioParser.ts, midiParser.ts, waveformGenerator.ts,
// audioFeatureExtractor.ts, audioAnalyzer.ts 中风格不统一
catch (error) {
  console.warn(`Failed to parse: ${filePath}`, error);
  return { duration: 0, sampleRate: 0, /* ... */ };
}
```

**提取为：** `safeExecute<T>(fn, fallback, logger?)`

#### 模式 3：BrowserWindow 广播进度（4 处）

```typescript
// fileScanner.ts, ipcFolders.ts 中重复
for (const win of BrowserWindow.getAllWindows()) {
  if (!win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.SCAN_PROGRESS, { ... });
  }
}
```

**提取为：** `broadcastToRenderers(channel, payload)`

#### 模式 4：SQLite 事务批量处理（3 处）

```typescript
// fileScanner.ts 中重复
sqlite.exec('BEGIN TRANSACTION');
try { /* ... */ sqlite.exec('COMMIT'); }
catch { sqlite.exec('ROLLBACK'); throw; }
```

**提取为：** `withTransaction<T>(sqlite, fn)`

#### 模式 5：WAV/AIFF PCM 解析重复（4 个函数）

- `waveformGenerator.ts`: `extractWavWaveformStreaming`, `extractAiffWaveformStreaming`, `parseWavPcm`, `parseAiffPcm`
- `audioAnalyzer.ts`: `readWavAsMono`, `findChunk`

**提取为：** `audioFormatReader.ts`（统一 WAV/AIFF 解析）

#### 模式 6：余弦相似度计算（2 套实现）

- `audioFeatureExtractor.ts`: `cosineSimilarity(a: number[], b: number[])`
- `ipcSamples.ts`: `cosineSim(a: Float32Array, b: Float32Array)`

**提取为：** `cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>)`

### C. 模块调用关系

```
fileScanner.ts（核心调度器）
├── audioParser.ts          ← parseAudioFile()
├── midiParser.ts           ← parseMidiFile(), isMidiFile()
├── waveformGenerator.ts    ← generateWaveform(), detectSilence()
├── audioFeatureExtractor.ts ← extractAudioFeatures(), inferTagsFromFeatures()
│   └── audioAnalyzer.ts    ← readWavAsMono()（间接调用）
├── audioAnalyzer.ts        ← analyzeAudioFile(), initEssentia()
├── classifier.ts           ← classifySample()
└── database.ts             ← getDatabase(), getSqlite()

ipcSamples.ts（IPC 采样处理）
├── audioFeatureExtractor.ts ← cosineSimilarity()
├── classifier.ts           ← classifySampleById(), classifyAllSamples()
└── 独立 IPC handler（不依赖 fileScanner）

ipcFolders.ts（IPC 文件夹处理）
├── fileScanner.ts          ← scanFolder(), abortScan()
├── waveformGenerator.ts    ← detectSilence()
├── classifier.ts           ← classifyAllSamples(), classifySampleById()
└── fileWatcher.ts          ← startWatching(), stopWatching()
```

### D. 热点路径（按调用频率排序）

1. **`collectAudioFiles`** — 每次扫描，readdir + stat 数百至数千次
2. **`parseMetadataParallel`** — 每批文件，5 处超时包装
3. **`classifySample`** — 每个文件至少 1 次
4. **`generateWaveform`** — 每个新增音频文件 1 次，内部大量 readSync
5. **`extractAudioFeatures`** — 每个新增音频文件 1 次
6. **`readWavAsMono`** — 每个文件可能调用 2 次（特征提取 + BPM 分析）
7. **`broadcastToRenderers` 等价代码** — 进度更新时高频发送

### E. 重构优先级建议

| 优先级 | 重构项 | 收益 |
|--------|--------|------|
| P0 | 提取 `withTimeout` | 消除 fileScanner.ts 中 5 处重复 |
| P0 | 提取 `broadcastToRenderers` | 统一所有 IPC 进度发送 |
| P1 | 合并 WAV/AIFF 解析到 `audioFormatReader.ts` | 消除 2 个模块 4 个函数的重复 |
| P1 | 统一 `cosineSimilarity` | 消除 2 套实现 |
| P1 | 提取 `withTransaction` | 消除 3 处重复事务包装 |
| P2 | 提取 `safeExecute` | 统一错误处理风格 |
| P2 | 所有分析器支持 `Buffer` 输入 | 为 AudioFileHelper 做准备 |
| P3 | AudioFileHelper 流水线重构 | 彻底解耦 fileScanner 与各分析器 |
