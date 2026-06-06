# Jima's SampleHub — 改进路线图

> 基于代码库全面审查，按优先级分为三期实施

---

## 第一期：关键修复与架构清理

> 目标：消除功能性 Bug、消除重复代码、修正架构隐患，为后续扩展打下坚实基础

### 1.1 TagManager 标签数据为空（P0 Bug）

**问题**：`SampleCard.tsx` 传入 `<TagManager sampleTags={[]} />`，标签勾选状态永远为空，用户无法看到已有标签

**修复方案**：
- 从 `Sample` 类型中提取 `sample.tags` 并传入 `sampleTags={sample.tags.map(t => t.id)}`
- 同步检查 `GridSampleCard` 和 `WaveformSampleRow` 是否存在相同问题

**涉及文件**：
- `src/components/samples/SampleCard.tsx`
- `src/components/samples/GridSampleCard.tsx`
- `src/components/samples/WaveformSampleRow.tsx`
- `src/components/tags/TagManager.tsx`（确认 props 类型与实际数据对齐）

---

### 1.2 categoryColors 映射重复定义（P0 重复）

**问题**：`SampleCard`、`GridSampleCard`、`WaveformSampleRow` 各自独立定义了 `categoryColors` 对象，新增分类时需同步修改三处，极易遗漏

**修复方案**：
- 抽取为 `src/utils/categoryColors.ts` 共享模块
- 导出 `getCategoryColor(category: string): string` 函数，含 fallback 逻辑
- 三个组件统一从此模块导入

**涉及文件**：
- 新建 `src/utils/categoryColors.ts`
- `src/components/samples/SampleCard.tsx`
- `src/components/samples/GridSampleCard.tsx`
- `src/components/samples/WaveformSampleRow.tsx`

---

### 1.3 formatDuration / formatTime 重复实现（P1 重复）

**问题**：PlayerBar、SampleDetailPanel、GridSampleCard、WaveformSampleRow 各自定义了时长格式化函数，逻辑略有差异

**修复方案**：
- 抽取为 `src/utils/format.ts`，导出：
  - `formatDuration(seconds: number): string` — 格式化为 `mm:ss`
  - `formatDurationFull(seconds: number): string` — 格式化为 `hh:mm:ss`（超过1小时时）
- 统一所有组件使用

**涉及文件**：
- 新建 `src/utils/format.ts`
- `src/components/player/PlayerBar.tsx`
- `src/components/samples/SampleDetailPanel.tsx`
- `src/components/samples/GridSampleCard.tsx`
- `src/components/samples/WaveformSampleRow.tsx`

---

### 1.4 Howl 实例存入 Zustand state（P1 架构隐患）

**问题**：`playerStore.ts` 将 `Howl.Howl` 实例存入 Zustand state，违反 state 可序列化原则，导致：
- Zustand devtools 无法正确展示状态快照
- persist 中间件序列化时可能出错
- 状态对比调试困难

**修复方案**：
- 将 Howl 实例存入模块级 `let currentHowl: Howl | null = null` 变量
- Zustand state 只保存播放状态（`isPlaying`、`currentTime`、`duration` 等）
- 播放控制函数通过闭包访问 Howl 实例

**涉及文件**：
- `src/stores/playerStore.ts`

---

### 1.5 i18n 硬编码中文（P1 国际化）

**问题**：多处 UI 文案硬编码中文，未使用 `t()` 函数

**已知遗漏**：
- `Toolbar.tsx` — "采样库"
- `SampleDetailPanel.tsx` — "采样详情"、"基本信息"、"文件信息"、"相似采样"
- `SettingsModal.tsx` — "主题"、"自定义"等新增文案
- `CustomThemeEditor` — "我的主题"、"基础背景"等

**修复方案**：
- 全面审查所有组件，提取硬编码文案到 `public/locales/zh-CN.json` 和 `public/locales/en.json`
- 统一使用 `const { t } = useTranslation()` 的 `t()` 调用

**涉及文件**：
- `public/locales/zh-CN.json`
- `public/locales/en.json`
- 所有含硬编码中文的组件

---

### 1.6 IPC 错误处理不统一（P1 代码质量）

**问题**：各组件对 IPC 调用失败的处理方式不一致 — 有的 `console.error`，有的 `toast.error`，有的静默忽略

**修复方案**：
- 建立 `src/utils/errorHandler.ts`，定义统一策略：
  - 用户操作触发的错误 → `toast.error(t('error.xxx'))`
  - 后台数据加载错误 → `console.error` + 降级 UI（EmptyState）
  - 非关键操作失败 → 静默 + `console.warn`
- 在 `ipcClient.invoke` 层增加可选的 `errorLevel` 参数

**涉及文件**：
- 新建 `src/utils/errorHandler.ts`
- `src/services/ipcClient.ts`
- 所有调用 ipcClient 的组件

---

## 第二期：性能优化与用户体验提升

> 目标：解决大数据集性能瓶颈、优化渲染效率、增强交互体验

### 2.1 分页/虚拟滚动加载（P1 性能）

**问题**：`LibraryPage` 使用 `ipcClient.getSamples()` 一次性加载全部采样，万级采样时内存和渲染压力大

**修复方案**：
- 前端切换为 `ipcClient.getSamplesPaginated(page, pageSize, filters)` 调用
- 引入虚拟滚动（`@tanstack/react-virtual` 或 `react-window`），只渲染可见行
- 保留搜索/筛选时的全量查询能力（后端已有支持）
- 添加加载状态骨架屏

**涉及文件**：
- `src/pages/LibraryPage.tsx`
- `src/services/ipcClient.ts`
- `electron/main/services/database.ts`（确认分页查询已实现）

---

### 2.2 前端排序改为后端排序（P2 性能）

**问题**：`LibraryPage` 的 `useMemo` 排序在前端执行，大数据集下卡顿

**修复方案**：
- 将 `sortField`/`sortDirection` 作为参数传入搜索 API
- 后端 SQL 使用 `ORDER BY` 完成排序
- 前端移除 `useMemo` 排序逻辑

**涉及文件**：
- `src/pages/LibraryPage.tsx`
- `src/services/ipcClient.ts`
- `electron/main/services/ipcHandlers.ts`
- `electron/main/services/database.ts`

---

### 2.3 SampleCard 伪波形缓存（P2 性能）

**问题**：`SampleCard` 的 `useEffect` 在 `isCurrentlyPlaying` 变化时重绘整个 canvas，但伪随机波形数据不变

**修复方案**：
- 将 `random()` 生成的波形数据缓存到 `useRef<Float32Array>`
- 只在 `id` 变化时重新生成数据
- `isCurrentlyPlaying` 变化时仅重绘颜色，不重新计算波形

**涉及文件**：
- `src/components/samples/SampleCard.tsx`

---

### 2.4 PlayerBar 波形缓存统一（P2 代码卫生）

**问题**：`PlayerBar` 内部维护了独立的 LRU 波形缓存，与 `waveformCache.ts` 功能重叠

**修复方案**：
- PlayerBar 统一使用 `waveformCache.ts` 的 `getCachedWaveform` / `setCachedWaveform`
- 移除 PlayerBar 内部的 `waveformCacheRef` 和 `MAX_CACHE_SIZE`

**涉及文件**：
- `src/components/player/PlayerBar.tsx`
- `src/utils/waveformCache.ts`

---

### 2.5 键盘快捷键系统（P2 用户体验）

**问题**：当前只有零散的键盘处理（方向键、Ctrl+A），缺少统一的快捷键管理

**修复方案**：
- 建立 `src/hooks/useKeyboardShortcuts.ts`，使用 `useEffect` + `keydown` 全局监听
- 默认快捷键映射：

| 快捷键 | 功能 |
|--------|------|
| `Space` | 播放/暂停 |
| `J` / `↑` | 上移选中 |
| `K` / `↓` | 下移选中 |
| `Enter` | 播放选中 |
| `L` | 切换收藏 |
| `Ctrl/Cmd+F` | 聚焦搜索 |
| `Ctrl/Cmd+Shift+F` | 切换筛选面板 |
| `Esc` | 取消选中/关闭面板 |

- 在 SettingsModal 中添加快捷键展示与自定义入口

**涉及文件**：
- 新建 `src/hooks/useKeyboardShortcuts.ts`
- `src/pages/LibraryPage.tsx`
- `src/components/layout/Toolbar.tsx`
- `src/components/settings/SettingsModal.tsx`

---

### 2.6 批量操作增强（P2 功能完善）

**问题**：当前多选后只有导出 JSON，缺少实用操作

**修复方案**：
- 在 LibraryPage 添加批量操作工具栏（选中时浮出）：
  - 批量添加标签
  - 批量添加到播放列表
  - 批量修改分类
  - 批量导出 WAV 文件到指定目录
  - 批量删除
- 后端新增对应 IPC 接口

**涉及文件**：
- `src/pages/LibraryPage.tsx`
- `src/components/samples/BatchActionBar.tsx`（新建）
- `electron/main/services/ipcHandlers.ts`
- `electron/main/services/database.ts`

---

### 2.7 rAF 可见性检测（P2 省电）

**问题**：`useAudioPlayer` 的 `tick()` 使用 rAF 循环，页面不可见时仍在运行

**修复方案**：
- 在 `tick()` 中加入 `document.visibilityState` 检测
- 页面不可见时暂停 rAF，可见时恢复
- 使用 `visibilitychange` 事件监听

**涉及文件**：
- `src/hooks/useAudioPlayer.ts`

---

## 第三期：功能扩展与工程质量

> 目标：增值功能、工程健壮性、长期可维护性

### 3.1 智能推荐与相似采样可视化

**现状**：`SampleDetailPanel` 已有 `getSimilarSamples`，但只展示简单列表

**扩展方案**：
- 添加 BPM/Key 相似度雷达图（使用 Chart.js 或 D3）
- 音色特征对比面板
- "一键试听相似采样"连续播放模式
- 基于标签共现的协同过滤推荐

**涉及文件**：
- `src/components/samples/SampleDetailPanel.tsx`
- 新建 `src/components/samples/SimilarityRadar.tsx`
- `electron/main/services/classifier.ts`（扩展特征提取）

---

### 3.2 波形编辑与裁剪导出

**现状**：A-B 循环只在播放器层面，无法导出裁剪后的片段

**扩展方案**：
- 在 PlayerBar 波形视图上支持可视化选区（拖拽选择起止点）
- 实时预览选区播放
- "导出选区"按钮 — 后端使用 ffmpeg 裁剪并保存为新文件
- 自动入库裁剪后的采样

**涉及文件**：
- `src/components/player/PlayerBar.tsx`
- 新建 `src/components/player/WaveformSelector.tsx`
- `electron/main/services/ipcHandlers.ts`（新增 `exportSelection` IPC）
- `electron/main/services/audioExporter.ts`（新建）

---

### 3.3 采样预加载与无缝切换

**现状**：每次点击播放都创建新 Howl 实例，频繁切换时加载延迟明显

**扩展方案**：
- 实现预读策略：播放当前采样时，预加载列表中相邻的 2-3 个采样
- 使用 Howl 的 `preload` 选项 + 对象池管理
- 播放切换时复用已加载的 Howl 实例

**涉及文件**：
- `src/stores/playerStore.ts`
- 新建 `src/services/audioPreloader.ts`

---

### 3.4 拖拽到 DAW 增强

**现状**：`startDrag` 只发送文件路径，部分 DAW 需要特定格式

**扩展方案**：
- 支持拖拽为 WAV/MP3 临时副本（避免 DAW 锁定原文件）
- 支持同时拖拽多个采样
- 添加 `file://` 协议 URI 支持
- 可选：生成 `.wav` 预览片段用于拖拽

**涉及文件**：
- `src/components/samples/SampleCard.tsx`
- `src/components/samples/GridSampleCard.tsx`
- `src/components/samples/WaveformSampleRow.tsx`
- `electron/main/services/ipcHandlers.ts`

---

### 3.5 SearchPanel 状态同步修正

**问题**：`SearchPanel` 用 `useState` 管理 `activeDurationIdx`/`activeBpmIdx`，但筛选条件来自 props，两者可能不同步

**修复方案**：
- 从 `filters` props 反推 active index，确保单一数据源
- 移除独立的 `activeDurationIdx`/`activeBpmIdx` state

**涉及文件**：
- `src/components/search/SearchPanel.tsx`

---

### 3.6 单元测试覆盖

**现状**：`test/` 目录下只有 `index.test.ts` 和一个 e2e spec，核心逻辑无测试

**扩展方案**：
- 优先为以下模块添加单元测试：

| 模块 | 测试重点 |
|------|----------|
| `classifier.ts` | 分类规则匹配、正则边界 |
| `bpmKeyParser.ts` | BPM/Key 解析、异常输入 |
| `waveformCache.ts` | LRU 淘汰、缓存命中 |
| `database.ts` | CRUD、分页、搜索 |
| `format.ts`（新建后）| 时长格式化边界 |

- 使用 Vitest + Electron mock

**涉及文件**：
- 新建 `tests/unit/classifier.test.ts`
- 新建 `tests/unit/bpmKeyParser.test.ts`
- 新建 `tests/unit/waveformCache.test.ts`
- 新建 `tests/unit/database.test.ts`
- 新建 `tests/unit/format.test.ts`

---

### 3.7 自定义主题导入/导出

**现状**：自定义主题只能在本机创建和保存

**扩展方案**：
- 支持导出自定义主题为 JSON 文件
- 支持从 JSON 文件导入主题
- 社区主题分享（可选）

**涉及文件**：
- `src/components/settings/SettingsModal.tsx`
- `src/stores/settingsStore.ts`
- `electron/main/services/ipcHandlers.ts`

---

## 实施时间线概览

```
第一期 ─── 关键修复与架构清理
  ├── 1.1 TagManager 标签数据修复
  ├── 1.2 categoryColors 去重
  ├── 1.3 formatDuration 去重
  ├── 1.4 Howl 实例移出 state
  ├── 1.5 i18n 硬编码修正
  └── 1.6 错误处理统一

第二期 ─── 性能优化与体验提升
  ├── 2.1 分页/虚拟滚动
  ├── 2.2 后端排序
  ├── 2.3 SampleCard 波形缓存
  ├── 2.4 PlayerBar 缓存统一
  ├── 2.5 键盘快捷键系统
  ├── 2.6 批量操作增强
  └── 2.7 rAF 可见性检测

第三期 ─── 功能扩展与工程质量
  ├── 3.1 智能推荐可视化
  ├── 3.2 波形编辑与裁剪
  ├── 3.3 采样预加载
  ├── 3.4 拖拽到 DAW 增强
  ├── 3.5 SearchPanel 状态同步
  ├── 3.6 单元测试覆盖
  └── 3.7 主题导入/导出
```
