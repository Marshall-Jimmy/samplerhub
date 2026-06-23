# 阶段二：核心功能开发 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现文件扫描、音频解析、智能分类、列表展示、音频播放、波形可视化六大核心功能，使应用从 UI 壳变为可用的采样管理工具。

**Architecture:** 主进程负责文件系统操作（扫描、监控、解析、分类），通过 IPC 通道与渲染进程通信。渲染进程使用 Zustand 管理全局状态（播放器、选择、搜索），通过 react-query 缓存服务端数据。音频播放使用 Howler.js 在渲染进程执行。所有服务模块解耦，通过 IPC 通道松耦合。

**Tech Stack:** Electron (main/preload/renderer), Drizzle ORM + better-sqlite3, music-metadata, chokidar, Howler.js, Zustand, react-query, react-window

---

## 文件结构总览

### 新建文件
| 文件 | 职责 |
|------|------|
| `electron/main/services/fileScanner.ts` | 文件扫描服务：递归收集、增量对比、哈希计算 |
| `electron/main/services/audioParser.ts` | 音频元数据解析：music-metadata 封装 |
| `electron/main/services/classifier.ts` | 智能分类：规则匹配、关键词匹配、批量分类 |
| `electron/main/services/fileWatcher.ts` | 文件监控：chokidar 封装，自动同步数据库 |
| `src/stores/playerStore.ts` | 播放器状态：Zustand store，管理 Howl 实例和播放状态 |
| `src/stores/libraryStore.ts` | 库状态：当前分类、选择、搜索筛选 |
| `src/hooks/useAudioPlayer.ts` | 播放器 Hook：封装 playerStore，提供 play/pause/seek |
| `src/services/ipcClient.ts` | IPC 客户端：统一封装 window.electronAPI 调用 |
| `src/type/electron.d.ts` | Window.electronAPI 类型声明 |

### 修改文件
| 文件 | 变更 |
|------|------|
| `electron/main/index.ts` | 注册 IPC handlers，启动文件监控 |
| `electron/main/services/ipcHandlers.ts` | 注册新 IPC 通道（扫描、分类、对话框） |
| `electron/main/services/database.ts` | 修复 db 单例，添加分类规则种子数据 |
| `electron/preload/index.ts` | 暴露 electronAPI 类型安全接口 |
| `shared/types/ipc.types.ts` | 新增扫描/分类/播放 IPC 通道 |
| `src/pages/LibraryPage.tsx` | 接入真实数据，连接 playerStore |
| `src/components/player/PlayerBar.tsx` | 接入 playerStore，显示真实播放信息 |
| `src/components/samples/SampleCard.tsx` | 接入播放器，双击播放 |
| `src/components/CategoryTree.tsx` | 从数据库加载分类 |
| `src/components/Sidebar.tsx` | 接入真实分类数据 |

---

## Task 1: IPC 客户端与类型安全

**目标：** 建立渲染进程与主进程之间的类型安全通信层

**Files:**
- Modify: `shared/types/ipc.types.ts`
- Create: `src/services/ipcClient.ts`
- Modify: `electron/preload/index.ts`
- Create: `src/type/electron.d.ts`

- [ ] **Step 1: 扩展 IPC 通道定义**

在 `shared/types/ipc.types.ts` 的 `IPC_CHANNELS` 中追加：

```typescript
  // 扫描
  START_SCAN: 'scan:start',
  STOP_SCAN: 'scan:stop',

  // 分类
  CLASSIFY_SAMPLE: 'classify:sample',
  CLASSIFY_ALL: 'classify:all',
  GET_CLASSIFICATION_RULES: 'classify:rules',

  // 对话框
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
```

- [ ] **Step 2: 创建 IPC 客户端**

创建 `src/services/ipcClient.ts`，统一封装所有 IPC 调用，提供类型安全接口。

- [ ] **Step 3: 更新 preload 暴露 electronAPI**

修改 `electron/preload/index.ts`，暴露 `electronAPI` 对象替代通用 `ipcRenderer`。

- [ ] **Step 4: 创建 Window 类型声明**

创建 `src/type/electron.d.ts`，声明 `Window.electronAPI` 类型。

- [ ] **Step 5: 验证构建** — `npx tsc --noEmit`

---

## Task 2: 文件扫描服务

**目标：** 实现递归扫描音频文件、增量对比、哈希计算

**Files:**
- Modify: `electron/main/services/database.ts`
- Create: `electron/main/services/fileScanner.ts`
- Modify: `electron/main/services/ipcHandlers.ts`

- [ ] **Step 1: 修复数据库单例**

修改 `database.ts`：db 路径改用 `app.getPath('userData')`，启用 WAL 模式和外键，添加分类规则种子数据。

- [ ] **Step 2: 创建文件扫描服务**

创建 `fileScanner.ts`：`collectAudioFiles()` 递归收集，`scanFolder()` 增量扫描（对比 hash，计算 toAdd/toUpdate/toDelete），批量写入数据库。

- [ ] **Step 3: 注册扫描 IPC 通道**

在 `ipcHandlers.ts` 中注册 `SCAN_FOLDER`、`START_SCAN`、`DIALOG_OPEN_FOLDER` 处理器。

- [ ] **Step 4: 验证构建** — `npx tsc --noEmit`

---

## Task 3: 音频元数据解析

**目标：** 使用 music-metadata 解析音频文件元数据

**Files:**
- Create: `electron/main/services/audioParser.ts`
- Modify: `electron/main/services/fileScanner.ts`

- [ ] **Step 1: 创建音频解析服务**

创建 `audioParser.ts`：`parseAudioFile()` 解析单个文件，`parseUnresolvedSamples()` 批量解析未解析的采样。

- [ ] **Step 2: 在扫描流程中集成解析**

在 `fileScanner.ts` 的 `scanFolder()` 末尾，对 `toAdd` 的文件调用 `parseAudioFile()` 并更新数据库。

- [ ] **Step 3: 验证构建** — `npx tsc --noEmit`

---

## Task 4: 智能分类服务

**目标：** 实现基于规则和关键词的自动分类

**Files:**
- Create: `electron/main/services/classifier.ts`
- Modify: `electron/main/services/ipcHandlers.ts`
- Modify: `electron/main/services/fileScanner.ts`

- [ ] **Step 1: 创建分类服务**

创建 `classifier.ts`：`classifySample()` 单文件分类（keyword/regex/folder 三种规则），`classifyAllSamples()` 批量分类。

- [ ] **Step 2: 注册分类 IPC 通道**

在 `ipcHandlers.ts` 中注册 `CLASSIFY_SAMPLE`、`CLASSIFY_ALL`、`GET_CLASSIFICATION_RULES`。

- [ ] **Step 3: 在扫描流程中集成分类**

在 `fileScanner.ts` 的解析步骤之后，对新文件调用 `classifySample()` 自动分类。

- [ ] **Step 4: 验证构建** — `npx tsc --noEmit`

---

## Task 5: 文件监控服务

**目标：** 使用 chokidar 实时监控文件夹变化，自动同步数据库

**Files:**
- Create: `electron/main/services/fileWatcher.ts`
- Modify: `electron/main/index.ts`

- [ ] **Step 1: 创建文件监控服务**

创建 `fileWatcher.ts`：`startWatching()` 启动 chokidar 监控，`handleFileAdd/Change/Remove` 自动解析+分类+通知渲染进程，`startWatchingAllFolders()` 启动所有已注册文件夹监控。

- [ ] **Step 2: 在主进程启动时初始化**

修改 `electron/main/index.ts`：`app.whenReady()` 中调用 `initDatabase()`、`registerIpcHandlers()`、`startWatchingAllFolders()`，`window-all-closed` 时调用 `stopAllWatchers()`。

- [ ] **Step 3: 验证构建** — `npx tsc --noEmit`

---

## Task 6: Zustand 状态管理

**目标：** 创建播放器和库的全局状态管理

**Files:**
- Create: `src/stores/playerStore.ts`
- Create: `src/stores/libraryStore.ts`

- [ ] **Step 1: 创建播放器 Store**

创建 `playerStore.ts`：管理 Howl 实例、播放状态、进度、音量、循环。Actions: play/pause/resume/stop/seek/setVolume/toggleLoop/tick。

- [ ] **Step 2: 创建库状态 Store**

创建 `libraryStore.ts`：管理 activeCategory、selectedSampleId、searchQuery、viewMode、isSearchPanelOpen、isScanning、scanProgress。

- [ ] **Step 3: 验证构建** — `npx tsc --noEmit`

---

## Task 7: 音频播放器 Hook

**目标：** 封装播放器 Store 为 React Hook，提供定时更新和格式化工具

**Files:**
- Create: `src/hooks/useAudioPlayer.ts`

- [ ] **Step 1: 创建播放器 Hook**

创建 `useAudioPlayer.ts`：使用 `requestAnimationFrame` 循环调用 `tick()` 更新进度，提供 `formatTime` 工具函数，暴露所有播放器状态和操作。

- [ ] **Step 2: 验证构建** — `npx tsc --noEmit`

---

## Task 8: 连接 UI — LibraryPage + PlayerBar + SampleCard

**目标：** 将真实数据流和播放器状态接入现有 UI 组件

**Files:**
- Modify: `src/pages/LibraryPage.tsx`
- Modify: `src/components/player/PlayerBar.tsx`
- Modify: `src/components/samples/SampleCard.tsx`

- [ ] **Step 1: 重写 LibraryPage**

使用 `ipcClient` 替代直接 `window.electronAPI` 调用，使用 `libraryStore` 管理搜索/视图/扫描状态，使用 `playerStore` 获取当前播放 ID，监听 `SCAN_PROGRESS` 和 `library:changed` 事件。

- [ ] **Step 2: 重写 PlayerBar**

使用 `useAudioPlayer` hook 获取播放状态，显示真实文件名/时间/进度，音量滑块双向绑定，循环按钮状态高亮。

- [ ] **Step 3: 更新 SampleCard**

添加 `filePath` prop，双击卡片触发播放。

- [ ] **Step 4: 验证构建** — `npx tsc --noEmit`

---

## Task 9: CategoryTree 接入真实数据

**目标：** 从数据库加载分类，替换硬编码数据

**Files:**
- Modify: `src/components/CategoryTree.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: 重写 CategoryTree**

使用 `useQuery` 从 IPC 获取分类数据，将数据库 Category 映射为 CategoryNode，保留特殊节点（收藏夹、最近使用）。

- [ ] **Step 2: 更新 Sidebar**

传递 `activeSection` 和 `onSectionChange` 到 CategoryTree，连接 libraryStore。

- [ ] **Step 3: 验证构建** — `npx tsc --noEmit`

---

## Task 10: 集成测试与构建

**目标：** 端到端验证所有功能，修复集成问题

**Files:**
- All modified files

- [ ] **Step 1: 全量类型检查** — `npx tsc --noEmit`

- [ ] **Step 2: Vite 构建** — `npx vite build`

- [ ] **Step 3: Electron 构建** — `npx electron-builder`

- [ ] **Step 4: 手动测试流程**
  1. 启动应用，点击"添加文件夹"选择采样目录
  2. 验证文件扫描进度显示
  3. 验证采样列表加载和分类
  4. 点击采样卡片播放，验证 PlayerBar 更新
  5. 验证搜索功能
  6. 验证收藏切换
