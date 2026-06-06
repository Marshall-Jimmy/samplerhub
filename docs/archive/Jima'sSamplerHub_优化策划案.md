# Jima'sSamplerHub - 音乐制作人智能采样管理工作站

## 优化版开发策划案

> 基于原策划案的全面优化，整合用户技术选型决策

---

## 一、项目概述

| 项目 | 内容 |
|------|------|
| 项目名称 | Jima'sSamplerHub - 音乐制作人智能采样管理工作站 |
| 开发平台 | Trae Solo 桌面版 |
| 目标用户 | 音乐制作人、编曲师、声音设计师 |
| 核心价值 | 解决采样文件杂乱无章、查找困难、无法快速导入DAW的痛点，通过智能解析和分类技术，实现采样资源的高效管理与一键调用 |
| 语言规范 | 全程使用 TypeScript 5.4+，零 `.js`/`.jsx` 文件 |

---

## 二、核心功能需求

### 2.1 采样库管理

- [x] 支持添加/移除多个采样文件夹地址作为索引源
- [x] 自动扫描指定目录下的所有音频文件（WAV、MP3、FLAC、AIFF、OGG、M4A、WMA）
- [x] **增量更新机制**：仅扫描新增/修改/删除的文件，避免全量扫描
- [x] **实时监控**：使用 chokidar 监听文件夹变化，自动同步数据库
- [x] 采样文件元数据提取：文件名、文件路径、文件大小、创建时间、修改时间、文件哈希

### 2.2 智能解析与分类

- [x] 基于文件夹结构的分类：自动识别 "Kick"、"Snare"、"HiHat"、"Bass"、"Loop" 等标准采样文件夹名
- [x] 基于文件名的智能解析：提取关键词（如 "808"、"Trap"、"House"、"Acoustic"、"Vocal"）
- [x] 音频属性提取：时长、采样率、比特率、声道数、**BPM（自动检测）**、**调性（自动检测）**
- [x] 用户自定义分类规则：支持创建正则表达式规则或关键词匹配规则
- [x] 手动修正功能：分类错误时可拖拽采样到正确分类，或批量修改分类

### 2.3 高级查询与搜索

- [x] **全文搜索**（SQLite FTS5）：文件名、标签、分类
- [x] 按分类筛选查询
- [x] 按时长范围查询（如 "0-1秒"、"1-4秒"、"4秒以上"）
- [x] 按音频属性筛选（采样率、比特率、声道数、BPM、调性）
- [x] 搜索结果实时预览和播放
- [x] 搜索防抖与分页加载

### 2.4 DAW 集成与拖拽

- [x] 支持直接从应用界面拖拽采样文件到 FL Studio、Studio One、Ableton Live、Logic Pro 等主流 DAW
- [x] 拖拽时自动传递文件绝对路径，确保 DAW 能正确识别和导入
- [x] 支持批量拖拽多个采样文件
- [x] 可选：生成 MIDI 拖放功能（针对鼓组采样）

### 2.5 辅助功能

- [x] 采样文件在线播放（Howler.js 音频播放器）
- [x] **波形可视化预览**（wavesurfer.js）
- [x] 采样标签管理：添加/删除自定义标签
- [x] 收藏夹功能：快速访问常用采样
- [x] 最近使用历史记录
- [x] 采样库导出/导入（备份与共享）

---

## 三、技术栈选择（优化版）

| 技术领域 | 技术选型 | 版本 | 说明 |
|---------|---------|------|------|
| 桌面应用框架 | Electron | 31.x | 跨平台支持（Windows/macOS），原生文件系统访问 |
| 构建工具 | electron-vite | 2.3 | 原生支持 TypeScript，快速构建，热更新 |
| 前端框架 | React | 18.3 | 强类型安全，组件化开发 |
| UI 组件库 | Ant Design | 5.x | 企业级组件，完整 TypeScript 类型支持 |
| 状态管理（客户端） | Zustand | 4.5 | 轻量级，性能优秀，原生 TypeScript 支持 |
| 状态管理（服务端） | TanStack Query | 5.x | 服务端状态缓存、同步、乐观更新 |
| 数据库 | SQLite | 3.x | 高性能本地存储 |
| ORM | Drizzle ORM | 0.x | TypeScript 原生 ORM，类型安全，自动迁移 |
| 数据库驱动 | better-sqlite3 | 11.0 | 同步高性能 SQLite 驱动 |
| 音频元数据解析 | music-metadata | 8.3 | 纯 TS 实现，无需外部依赖 |
| 音频播放 | Howler.js | 2.2 | 成熟的音频库，自动处理格式兼容性 |
| 波形可视化 | wavesurfer.js | 7.x | 专业的波形渲染与交互 |
| 文件监控 | chokidar | 3.x | 高性能文件系统监控 |
| 虚拟滚动 | react-window | 1.8 | 大数据量列表流畅渲染 |
| 拖拽功能 | HTML5 Drag and Drop API | - | 原生支持，与 DAW 兼容性最好 |
| 类型定义 | @types/node, @types/react, @types/react-dom | 最新 | 完整类型支持 |
| 代码规范 | ESLint 9 + Prettier 3 + TypeScript ESLint | - | 统一代码风格 |

---

## 四、系统架构设计

### 4.1 项目文件结构

```
SamplerHub/
├── main/                          # Electron 主进程
│   ├── index.ts                   # 主进程入口
│   ├── fileScanner.ts             # 文件扫描与索引服务
│   ├── fileWatcher.ts             # 文件系统监控（chokidar）
│   ├── audioParser.ts             # 音频元数据解析服务
│   ├── database.ts                # Drizzle ORM 数据库初始化
│   ├── ipcHandlers.ts             # IPC 通信处理器
│   ├── worker/                    # Worker 线程
│   │   └── audioParse.worker.ts   # 音频解析 Worker
│   └── types/
│       ├── sample.ts
│       ├── category.ts
│       └── ipc.ts
├── renderer/                      # Electron 渲染进程
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── stores/
│   │   │   ├── sampleStore.ts     # Zustand - 客户端状态
│   │   │   ├── categoryStore.ts
│   │   │   └── uiStore.ts
│   │   ├── hooks/
│   │   │   ├── useSamples.ts      # TanStack Query - 服务端状态
│   │   │   ├── useCategories.ts
│   │   │   └── useSearch.ts
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── SampleList.tsx     # 虚拟滚动列表
│   │   │   ├── SampleCard.tsx
│   │   │   ├── AudioPlayer.tsx    # Howler.js 播放器
│   │   │   ├── WaveformViewer.tsx # wavesurfer.js 波形
│   │   │   ├── RuleEditor.tsx
│   │   │   └── SearchBar.tsx
│   │   ├── pages/
│   │   │   ├── LibraryPage.tsx
│   │   │   ├── SearchPage.tsx
│   │   │   ├── FavoritesPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── utils/
│   │   │   ├── classification.ts
│   │   │   ├── dragAndDrop.ts
│   │   │   └── search.ts
│   │   └── types/
│   │       ├── sample.ts
│   │       └── ui.ts
│   └── index.html
├── shared/                        # 共享类型与常量
│   ├── types/
│   │   ├── sample.types.ts
│   │   ├── category.types.ts
│   │   └── ipc.types.ts
│   └── constants/
│       └── audioFormats.ts
├── drizzle/                       # Drizzle ORM 配置
│   ├── schema.ts                  # 数据库表定义
│   ├── migrations/                # 迁移文件
│   └── config.ts
├── .trae/                         # Trae Solo 项目配置
│   └── rules
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.renderer.json
├── vite.main.config.ts
├── vite.renderer.config.ts
├── drizzle.config.ts
├── package.json
└── README.md
```

### 4.2 数据库 Schema（Drizzle ORM）

```typescript
// drizzle/schema.ts

import { sqliteTable, integer, text, real, blob } from 'drizzle-orm/sqlite-core';

export const watchedFolders = sqliteTable('watched_folders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  lastScanAt: integer('last_scan_at', { mode: 'timestamp' }),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  parentId: integer('parent_id').references(() => categories.id),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const samples = sqliteTable('samples', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filePath: text('file_path').notNull().unique(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  fileHash: text('file_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  modifiedAt: integer('modified_at', { mode: 'timestamp' }).notNull(),
  duration: real('duration').notNull(),
  sampleRate: integer('sample_rate').notNull(),
  bitRate: integer('bit_rate').notNull(),
  channels: integer('channels').notNull(),
  bpm: real('bpm'),
  key: text('key'),
  categoryId: integer('category_id').references(() => categories.id),
  waveformData: blob('waveform_data'),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  playCount: integer('play_count').notNull().default(0),
  lastPlayedAt: integer('last_played_at', { mode: 'timestamp' }),
  indexedAt: integer('indexed_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color').default('#1890ff'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const sampleTags = sqliteTable('sample_tags', {
  sampleId: integer('sample_id').notNull().references(() => samples.id),
  tagId: integer('tag_id').notNull().references(() => tags.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.sampleId, table.tagId] }),
}));

export const classificationRules = sqliteTable('classification_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  pattern: text('pattern').notNull(),
  ruleType: text('rule_type', { enum: ['regex', 'keyword', 'folder'] }).notNull(),
  targetCategoryId: integer('target_category_id').notNull().references(() => categories.id),
  priority: integer('priority').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const recentSamples = sqliteTable('recent_samples', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sampleId: integer('sample_id').notNull().references(() => samples.id),
  playedAt: integer('played_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
```

### 4.3 TypeScript 类型定义（shared/types/）

```typescript
// shared/types/sample.types.ts

export interface Sample {
  id: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  createdAt: Date;
  modifiedAt: Date;
  duration: number;
  sampleRate: number;
  bitRate: number;
  channels: number;
  bpm: number | null;
  key: string | null;
  categoryId: number | null;
  waveformData: Uint8Array | null;
  isFavorite: boolean;
  playCount: number;
  lastPlayedAt: Date | null;
  indexedAt: Date;
  tags: Tag[];
  category: Category | null;
}

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  isSystem: boolean;
  sortOrder: number;
  children?: Category[];
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface ClassificationRule {
  id: number;
  name: string;
  pattern: string;
  ruleType: 'regex' | 'keyword' | 'folder';
  targetCategoryId: number;
  priority: number;
  isActive: boolean;
}

export interface WatchedFolder {
  id: number;
  path: string;
  lastScanAt: Date | null;
  isActive: boolean;
}

export interface SearchFilters {
  query?: string;
  categoryId?: number;
  tagIds?: number[];
  durationMin?: number;
  durationMax?: number;
  sampleRate?: number;
  bitRate?: number;
  channels?: number;
  bpmMin?: number;
  bpmMax?: number;
  key?: string;
  isFavorite?: boolean;
}

export interface ScanProgress {
  current: number;
  total: number;
  currentFile: string;
  phase: 'scanning' | 'parsing' | 'classifying' | 'complete';
}
```

---

## 五、关键技术实现方案

### 5.1 文件扫描与索引（增量更新）

```typescript
// main/fileScanner.ts

import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { createHash } from 'crypto';
import { db } from './database';
import { samples, watchedFolders } from '../drizzle/schema';
import { eq, inArray } from 'drizzle-orm';

const AUDIO_EXTENSIONS = new Set([
  '.wav', '.mp3', '.flac', '.aiff', '.ogg', 
  '.m4a', '.wma', '.aac', '.opus'
]);

interface FileInfo {
  path: string;
  name: string;
  size: number;
  modifiedAt: Date;
  hash: string;
}

export async function scanFolder(folderPath: string, onProgress?: (progress: ScanProgress) => void): Promise<void> {
  // 1. 收集所有音频文件
  const files = await collectAudioFiles(folderPath);
  
  // 2. 获取数据库中已有记录
  const existingSamples = await db.select().from(samples);
  const existingMap = new Map(existingSamples.map(s => [s.filePath, s]));
  
  // 3. 计算差异
  const toAdd: FileInfo[] = [];
  const toUpdate: FileInfo[] = [];
  const toDelete: number[] = [];
  
  for (const file of files) {
    const existing = existingMap.get(file.path);
    if (!existing) {
      toAdd.push(file);
    } else if (existing.fileHash !== file.hash) {
      toUpdate.push(file);
    }
    existingMap.delete(file.path);
  }
  
  // 剩余的就是已删除的文件
  for (const [path, sample] of existingMap) {
    toDelete.push(sample.id);
  }
  
  // 4. 批量处理
  await processBatch(toAdd, toUpdate, toDelete, onProgress);
  
  // 5. 更新扫描时间
  await db.update(watchedFolders)
    .set({ lastScanAt: new Date() })
    .where(eq(watchedFolders.path, folderPath));
}

async function collectAudioFiles(dir: string): Promise<FileInfo[]> {
  const files: FileInfo[] = [];
  
  async function traverse(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        const stats = await stat(fullPath);
        const hash = await computeFileHash(fullPath);
        
        files.push({
          path: fullPath,
          name: entry.name,
          size: stats.size,
          modifiedAt: stats.mtime,
          hash,
        });
      }
    }
  }
  
  await traverse(dir);
  return files;
}

async function computeFileHash(filePath: string): Promise<string> {
  // 使用文件头+大小+修改时间的组合哈希，快速检测变化
  const stats = await stat(filePath);
  const hash = createHash('md5');
  hash.update(`${filePath}:${stats.size}:${stats.mtime.getTime()}`);
  return hash.digest('hex');
}
```

### 5.2 音频元数据解析（Worker 线程）

```typescript
// main/worker/audioParse.worker.ts

import { parentPort } from 'worker_threads';
import { parseFile } from 'music-metadata';
import { readFile } from 'fs/promises';

interface ParseTask {
  filePath: string;
  sampleId: number;
}

interface ParseResult {
  sampleId: number;
  duration: number;
  sampleRate: number;
  bitRate: number;
  channels: number;
  bpm: number | null;
  key: string | null;
  waveformData: number[] | null;
  error?: string;
}

parentPort?.on('message', async (task: ParseTask) => {
  try {
    const metadata = await parseFile(task.filePath, {
      duration: true,
      skipPostHeaders: true,
    });
    
    const format = metadata.format;
    const common = metadata.common;
    
    // 生成波形数据（简化版，取100个点）
    const waveformData = await generateWaveform(task.filePath, format.duration || 0);
    
    const result: ParseResult = {
      sampleId: task.sampleId,
      duration: format.duration || 0,
      sampleRate: format.sampleRate || 0,
      bitRate: format.bitrate || 0,
      channels: format.numberOfChannels || 0,
      bpm: common.bpm || null,
      key: common.key || null,
      waveformData,
    };
    
    parentPort?.postMessage(result);
  } catch (error) {
    parentPort?.postMessage({
      sampleId: task.sampleId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function generateWaveform(filePath: string, duration: number): Promise<number[]> {
  // 使用 Web Audio API 或简化方案生成波形数据
  // 实际实现中可以使用 audio-decode 库
  const POINTS = 100;
  // 简化实现：返回随机数据占位
  return Array.from({ length: POINTS }, () => Math.random());
}
```

### 5.3 智能分类算法

```typescript
// main/classification.ts

import { ClassificationRule, Sample } from '../shared/types/sample.types';

interface ClassificationResult {
  categoryId: number | null;
  matchedRules: ClassificationRule[];
}

const SYSTEM_RULES: Omit<ClassificationRule, 'id'>[] = [
  { name: 'Kick Drum', pattern: 'kick|bd|bass drum', ruleType: 'keyword', targetCategoryId: 1, priority: 100 },
  { name: 'Snare Drum', pattern: 'snare|sd|rim', ruleType: 'keyword', targetCategoryId: 2, priority: 100 },
  { name: 'Hi-Hat', pattern: 'hat|hh|hihat|open|closed', ruleType: 'keyword', targetCategoryId: 3, priority: 100 },
  { name: 'Clap', pattern: 'clap', ruleType: 'keyword', targetCategoryId: 4, priority: 100 },
  { name: '808 Bass', pattern: '808|sub|subbass', ruleType: 'keyword', targetCategoryId: 5, priority: 90 },
  { name: 'Percussion', pattern: 'perc|percussion|shaker|tamb', ruleType: 'keyword', targetCategoryId: 6, priority: 80 },
  { name: 'Vocal', pattern: 'vocal|vox|voice|chant', ruleType: 'keyword', targetCategoryId: 7, priority: 80 },
  { name: 'FX', pattern: 'fx|effect|impact|riser|downlifter|sweep', ruleType: 'keyword', targetCategoryId: 8, priority: 80 },
  { name: 'Loop', pattern: 'loop|full|construction', ruleType: 'keyword', targetCategoryId: 9, priority: 70 },
  { name: 'One Shot', pattern: '.*', ruleType: 'regex', targetCategoryId: 10, priority: 0 },
];

export function classifySample(sample: Sample, rules: ClassificationRule[]): ClassificationResult {
  const matches: ClassificationRule[] = [];
  
  for (const rule of rules) {
    if (!rule.isActive) continue;
    
    const isMatch = matchRule(sample, rule);
    if (isMatch) {
      matches.push(rule);
    }
  }
  
  if (matches.length === 0) {
    return { categoryId: null, matchedRules: [] };
  }
  
  // 按优先级排序，取最高优先级的规则
  matches.sort((a, b) => b.priority - a.priority);
  
  return {
    categoryId: matches[0].targetCategoryId,
    matchedRules: matches,
  };
}

function matchRule(sample: Sample, rule: ClassificationRule): boolean {
  const searchText = `${sample.fileName} ${sample.filePath}`.toLowerCase();
  
  switch (rule.ruleType) {
    case 'regex':
      try {
        const regex = new RegExp(rule.pattern, 'i');
        return regex.test(searchText);
      } catch {
        return false;
      }
    
    case 'keyword':
      const keywords = rule.pattern.split('|').map(k => k.trim().toLowerCase());
      return keywords.some(keyword => searchText.includes(keyword));
    
    case 'folder':
      const folderPattern = rule.pattern.toLowerCase();
      return sample.filePath.toLowerCase().includes(folderPattern);
    
    default:
      return false;
  }
}
```

### 5.4 DAW 拖拽集成

```typescript
// renderer/src/utils/dragAndDrop.ts

import { Sample } from '../../../shared/types/sample.types';

export function setupDragAndDrop(element: HTMLElement, sample: Sample): void {
  element.draggable = true;
  
  element.addEventListener('dragstart', (e: DragEvent) => {
    if (!e.dataTransfer) return;
    
    // 设置拖拽数据
    e.dataTransfer.effectAllowed = 'copy';
    
    // 对于 macOS，需要使用特定的文件协议
    const fileUrl = `file://${sample.filePath}`;
    
    e.dataTransfer.setData('text/uri-list', fileUrl);
    e.dataTransfer.setData('text/plain', sample.filePath);
    
    // 设置拖拽图像
    const dragImage = createDragImage(sample);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
  });
}

export function setupMultiDrag(
  container: HTMLElement, 
  getSelectedSamples: () => Sample[]
): void {
  container.addEventListener('dragstart', (e: DragEvent) => {
    if (!e.dataTransfer) return;
    
    const selectedSamples = getSelectedSamples();
    
    if (selectedSamples.length === 1) {
      const sample = selectedSamples[0];
      e.dataTransfer.setData('text/uri-list', `file://${sample.filePath}`);
      e.dataTransfer.setData('text/plain', sample.filePath);
    } else {
      // 多个文件：使用换行分隔的路径列表
      const paths = selectedSamples.map(s => s.filePath).join('\n');
      e.dataTransfer.setData('text/plain', paths);
    }
    
    e.dataTransfer.effectAllowed = 'copy';
  });
}

function createDragImage(sample: Sample): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText = `
    background: #1890ff;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    pointer-events: none;
  `;
  div.textContent = sample.fileName;
  document.body.appendChild(div);
  
  // 延迟移除
  requestAnimationFrame(() => {
    document.body.removeChild(div);
  });
  
  return div;
}
```

### 5.5 全文搜索（SQLite FTS5）

```typescript
// main/search.ts

import { db } from './database';
import { sql } from 'drizzle-orm';
import { SearchFilters } from '../shared/types/sample.types';

export async function searchSamples(filters: SearchFilters, page: number = 1, pageSize: number = 50) {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  
  // 全文搜索
  if (filters.query) {
    conditions.push(`samples_fts MATCH ?`);
    params.push(filters.query);
  }
  
  // 分类筛选
  if (filters.categoryId) {
    conditions.push(`category_id = ?`);
    params.push(filters.categoryId);
  }
  
  // 时长范围
  if (filters.durationMin !== undefined) {
    conditions.push(`duration >= ?`);
    params.push(filters.durationMin);
  }
  if (filters.durationMax !== undefined) {
    conditions.push(`duration <= ?`);
    params.push(filters.durationMax);
  }
  
  // BPM 范围
  if (filters.bpmMin !== undefined) {
    conditions.push(`bpm >= ?`);
    params.push(filters.bpmMin);
  }
  if (filters.bpmMax !== undefined) {
    conditions.push(`bpm <= ?`);
    params.push(filters.bpmMax);
  }
  
  // 调性
  if (filters.key) {
    conditions.push(`key = ?`);
    params.push(filters.key);
  }
  
  // 收藏
  if (filters.isFavorite !== undefined) {
    conditions.push(`is_favorite = ?`);
    params.push(filters.isFavorite ? 1 : 0);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;
  
  // 查询结果
  const results = await db.all(sql`
    SELECT s.*, c.name as category_name
    FROM samples s
    LEFT JOIN categories c ON s.category_id = c.id
    ${sql.raw(whereClause)}
    ORDER BY s.play_count DESC, s.file_name ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `, ...params);
  
  // 查询总数
  const countResult = await db.get(sql`
    SELECT COUNT(*) as total FROM samples s
    ${sql.raw(whereClause)}
  `, ...params);
  
  return {
    items: results,
    total: countResult?.total || 0,
    page,
    pageSize,
  };
}
```

---

## 六、TypeScript 配置规范

### 6.1 根目录 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["shared/**/*", "drizzle/**/*"]
}
```

### 6.2 主进程 tsconfig.main.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "outDir": "./dist/main",
    "rootDir": ".",
    "noEmit": false,
    "types": ["node"]
  },
  "include": ["main/**/*", "shared/**/*", "drizzle/**/*"]
}
```

### 6.3 渲染进程 tsconfig.renderer.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "./dist/renderer",
    "rootDir": ".",
    "noEmit": false,
    "types": ["node", "react", "react-dom"]
  },
  "include": ["renderer/src/**/*", "shared/**/*"]
}
```

---

## 七、开发计划与里程碑（优化版）

### 阶段一：基础框架搭建（预计 3 天）

- [ ] 使用 electron-vite 初始化 Electron + React + TypeScript 项目
- [ ] 配置三个 tsconfig 文件和构建环境
- [ ] 集成 Ant Design 5、Zustand、TanStack Query
- [ ] 配置 Drizzle ORM + better-sqlite3，创建数据库 Schema
- [ ] 生成 TypeScript 类型定义
- [ ] 实现类型化的 IPC 通信框架
- [ ] 配置 ESLint + Prettier 代码规范

### 阶段二：核心功能开发（预计 7 天）

- [ ] 实现采样文件夹添加与管理（类型化表单）
- [ ] 开发文件扫描与索引服务（异步，带进度反馈）
- [ ] 集成 chokidar 文件监控
- [ ] 集成音频元数据解析（music-metadata + Worker 线程）
- [ ] 实现智能分类算法与用户自定义规则
- [ ] 开发采样列表展示（react-window 虚拟滚动）
- [ ] 集成 Howler.js 音频播放器
- [ ] 集成 wavesurfer.js 波形可视化

### 阶段三：高级功能开发（预计 5 天）

- [ ] 实现 SQLite FTS5 全文搜索与高级筛选
- [ ] 开发搜索界面（防抖、分页、实时预览）
- [ ] 实现 DAW 拖拽集成（批量拖拽支持）
- [ ] 添加收藏夹与最近使用功能
- [ ] 开发标签管理功能（批量添加/删除）
- [ ] 实现采样库导出/导入

### 阶段四：优化与测试（预计 3 天）

- [ ] 性能优化：文件扫描速度、搜索速度、列表渲染
- [ ] UI/UX 优化：响应式设计、交互体验
- [ ] 兼容性测试：Windows/macOS 平台，主流 DAW
- [ ] TypeScript 类型检查：确保零类型错误
- [ ] Bug 修复与稳定性提升

### 阶段五：打包与交付（预计 2 天）

- [ ] 使用 electron-builder 打包应用（Windows/macOS）
- [ ] 生成类型声明文件（.d.ts）
- [ ] 编写项目技术文档与用户使用手册
- [ ] 交付最终产品

**总计：约 20 天**

---

## 八、可能的挑战与解决方案

| 挑战 | 解决方案 |
|------|----------|
| 大量采样文件扫描速度慢 | Worker 线程池并行解析，增量更新，数据库批量操作，chokidar 实时监控 |
| 音频文件解析失败 | music-metadata 主方案，降级处理，错误隔离不影响整体流程 |
| 智能分类准确率不高 | 丰富预设规则 + 用户自定义规则 + 手动修正 + 机器学习（后续版本） |
| DAW 拖拽兼容性问题 | 测试主流 DAW，确保传递正确的文件路径格式（file:// 协议） |
| 应用内存占用过高 | 虚拟滚动 + 分页加载 + 音频资源及时释放 + 波形数据懒加载 |
| TypeScript 类型复杂 | Drizzle ORM 自动生成类型，联合类型和交叉类型，避免 any |
| 波形数据存储过大 | 简化波形数据（100-200 个点），或使用 Blob 存储 |

---

## 九、交付物与验收标准

### 交付物

1. 完整的纯 TypeScript 源代码（零 `.js`/`.jsx` 文件）
2. Windows 和 macOS 平台的可执行安装包
3. 项目技术文档与用户使用手册
4. 完整的 TypeScript 类型声明文件
5. 数据库结构说明与 API 文档

### 验收标准

1. [x] 能够正确添加和扫描采样文件夹，提取所有音频文件
2. [x] 能够准确解析音频文件的元数据（时长、采样率、BPM、调性等）
3. [x] 智能分类准确率达到 85% 以上
4. [x] 支持用户创建和管理自定义分类规则
5. [x] 能够通过关键词、分类、时长、BPM 等条件快速搜索采样
6. [x] 能够直接拖拽采样文件到 FL Studio 和 Studio One 中使用
7. [x] 内置音频播放器能够正常播放所有支持的音频格式
8. [x] 波形可视化能够正确显示所有支持的音频格式
9. [x] 文件监控能够实时同步文件夹变化
10. [x] 应用运行稳定，无崩溃和严重 Bug
11. [x] TypeScript 编译零错误，严格模式通过

---

## 十、Trae Solo 技能调用说明

在开发过程中，将充分利用 Trae Solo 的以下能力：

1. **全流程 TypeScript 代码生成**：从项目初始化到功能实现的完整 TS 代码编写
2. **自动类型推导与补全**：智能生成接口、类型别名和泛型
3. **类型安全的 IPC 通信**：自动生成主进程与渲染进程之间的类型化事件
4. **实时预览与调试**：在对话界面内直接预览应用运行效果
5. **依赖管理**：自动安装和配置所需的 npm 包及对应的 @types 类型定义
6. **代码优化**：提供 TypeScript 性能优化和代码重构建议
7. **Drizzle ORM 集成**：自动生成数据库 Schema 和类型定义
8. **文档生成**：自动生成基于 TypeScript 类型的 API 文档
