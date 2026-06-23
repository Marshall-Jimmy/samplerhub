# Jima's SamplerHub — UI 五期改进计划

> 基于项目 v1.0.0 现有 UI 代码的深度审查，聚焦视觉、交互、动效、一致性与可访问性
> 创建日期：2026-06-04

---

## 项目 UI 现状诊断

### 架构概览
- **技术栈**：Electron + React 18 + TypeScript + Ant Design 5 + Tailwind CSS 4 + Framer Motion
- **主题系统**：6 套主题（Obsidian/Midnight/Rose/Forest/Ink/Light），通过 CSS 变量 + Ant Design ConfigProvider 双轨实现
- **布局**：Toolbar(52px) + Sidebar(256px) + Content + PlayerBar(72px)

### 已识别的 UI 问题

| # | 问题 | 严重度 | 影响范围 |
|---|------|--------|---------|
| 1 | **内联样式泛滥**：90%+ 组件使用 `style={{}}` 内联样式，无法复用、无法伪类、无法媒体查询 | 高 | 全局 |
| 2 | **主题双轨不一致**：CSS 变量与 Ant Design token 两套体系并存，Tailwind config 硬编码 Obsidian 色值 | 高 | 全局 |
| 3 | **hover 交互靠 JS**：所有 hover 效果通过 `onMouseEnter/onMouseLeave` 内联 JS 实现，性能差且无法处理焦点状态 | 高 | 全局 |
| 4 | **无响应式适配**：窗口缩小时布局错乱，Sidebar 固定 256px 无断点 | 中 | Layout |
| 5 | **动效缺乏规范**：framer-motion 已引入但动效零散，无统一过渡曲线/时长 | 中 | 全局 |
| 6 | **空状态体验差**：无数据时仅显示 Ant Design 默认 Empty 组件，无引导 | 中 | LibraryPage |
| 7 | **Toolbar 信息密度低**：52px 高度仅放 4 个按钮 + 标题，中间区域浪费 | 中 | Toolbar |
| 8 | **播放栏布局拥挤**：72px 内塞入波形+控件+音量，小窗口时溢出 | 中 | PlayerBar |
| 9 | **网格视图粗糙**：GridSampleCard 信息展示不足，卡片间距/比例不协调 | 中 | GridSampleCard |
| 10 | **搜索面板层级混乱**：SearchPanel 浮在内容区上方，遮挡列表且无遮罩 | 中 | SearchPanel |
| 11 | **详情面板固定宽度**：SampleDetailPanel 硬编码 320px，无法调整 | 低 | SampleDetailPanel |
| 12 | **无键盘焦点指示器**：Tab 导航无可见焦点环，可访问性差 | 高 | 全局 |
| 13 | **分类树无搜索**：分类多时难以定位 | 低 | CategoryTree |
| 14 | **右键菜单无键盘导航**：ContextMenu 不支持方向键选择 | 中 | ContextMenu |
| 15 | **加载状态单一**：仅 Spin 组件，无骨架屏 | 中 | LibraryPage |

---

## 第一期：样式体系重构 — 从内联到系统化

**目标**：消除内联样式，建立可维护的样式架构，统一主题系统

### 1.1 样式迁移策略

将所有内联样式迁移至 CSS Modules + Tailwind 工具类组合方案：

```
src/styles/
  themes/          # 主题变量（已有 index.css 中的 CSS 变量）
  base/            # 重置、全局样式
  components/      # 组件级样式模块
    toolbar.module.css
    sidebar.module.css
    player-bar.module.css
    sample-card.module.css
    ...
  animations/      # 统一动效定义
```

**迁移原则**：
- 简单布局/间距 → Tailwind 工具类（`className`）
- 组件特有样式 → CSS Modules（`:hover`、`:focus`、伪元素）
- 主题相关 → CSS 变量引用
- 动效 → `@keyframes` + CSS transition 优先，framer-motion 仅用于复杂动画

### 1.2 统一主题系统

**问题**：当前 CSS 变量（`--bg-base` 等）与 Ant Design token（`colorBgContainer` 等）两套体系并存，Tailwind config 硬编码 Obsidian 色值。

**方案**：
- 以 CSS 变量为唯一真相源（Single Source of Truth）
- Ant Design ConfigProvider 的 token 从 CSS 变量读取
- Tailwind config 改为引用 CSS 变量而非硬编码色值

```css
/* tailwind.config.js 改造 */
colors: {
  bg: {
    base: 'var(--bg-base)',
    surface: 'var(--bg-surface)',
    elevated: 'var(--bg-elevated)',
    hover: 'var(--bg-hover)',
  },
  /* ... */
}
```

```typescript
// App.tsx ConfigProvider 改造
token: {
  colorPrimary: `var(--brand-primary)`,  // 从 CSS 变量读取
  colorBgContainer: `var(--bg-elevated)`,
  // ...
}
```

### 1.3 Hover/Focus 状态 CSS 化

**问题**：所有 hover 效果通过 JS `onMouseEnter/onMouseLeave` 实现，约 50+ 处。

**方案**：迁移至 CSS `:hover` / `:focus-visible` 伪类：

```css
/* Before: JS hover */
// onMouseEnter={e => el.style.background = 'var(--bg-hover)'}
// onMouseLeave={e => el.style.background = 'transparent'}

/* After: CSS hover */
.sidebar-item:hover {
  background: var(--bg-hover);
}
.sidebar-item:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: -2px;
}
```

### 1.4 焦点指示器系统

```css
/* 全局焦点环 */
:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* 按钮焦点 */
button:focus-visible {
  box-shadow: 0 0 0 2px var(--bg-base), 0 0 0 4px var(--brand-primary);
}
```

### 1.5 涉及文件与优先级

| 组件 | 内联样式数 | 优先级 |
|------|-----------|--------|
| Sidebar.tsx | ~25 | P0 |
| SampleCard.tsx | ~20 | P0 |
| PlayerBar.tsx | ~18 | P0 |
| LibraryPage.tsx | ~35 | P0 |
| SampleDetailPanel.tsx | ~15 | P1 |
| CategoryTree.tsx | ~12 | P1 |
| Toolbar.tsx | ~8 | P1 |
| SearchPanel.tsx | ~10 | P2 |
| ContextMenu.tsx | ~6 | P2 |
| TagManager.tsx | ~10 | P2 |
| GridSampleCard.tsx | ~8 | P2 |
| WaveformSampleRow.tsx | ~8 | P2 |

---

## 第二期：布局与响应式 — 适配多尺寸窗口

**目标**：让应用在不同窗口尺寸下均有良好表现，优化空间利用

### 2.1 响应式断点系统

```css
:root {
  --breakpoint-sm: 768px;
  --breakpoint-md: 1024px;
  --breakpoint-lg: 1280px;
  --breakpoint-xl: 1536px;
}
```

| 断点 | Sidebar | PlayerBar | 内容区 |
|------|---------|-----------|--------|
| < 768px | 隐藏（覆盖层模式） | 迷你模式（仅控件） | 单列 |
| 768-1024px | 折叠（图标模式 56px） | 完整 | 双列 |
| 1024-1280px | 展开 220px | 完整 | 允许详情面板 |
| > 1280px | 展开 256px | 完整 | 三栏布局 |

### 2.2 Sidebar 改造

**当前问题**：固定 256px，折叠后完全消失。

**方案**：
- **折叠模式**：显示图标 + tooltip，宽度 56px
- **覆盖模式**（小屏）：从左侧滑出，带半透明遮罩
- 分类树增加搜索框（顶部固定）
- 播放列表区域可拖拽调整高度

```tsx
// Sidebar 折叠图标模式
<div className="sidebar-collapsed">
  {categories.map(cat => (
    <Tooltip title={cat.name} placement="right">
      <button className="sidebar-icon-btn">
        {cat.icon}
      </button>
    </Tooltip>
  ))}
</div>
```

### 2.3 PlayerBar 自适应布局

**当前问题**：72px 固定高度，小窗口时控件溢出。

**方案**：
- **完整模式**（> 1024px）：波形 + 完整控件
- **紧凑模式**（768-1024px）：隐藏 A-B 循环/变速，波形缩短
- **迷你模式**（< 768px）：仅 播放/暂停 + 进度条 + 音量

```css
/* 紧凑模式 */
@media (max-width: 1024px) {
  .player-ab-loop,
  .player-playback-rate {
    display: none;
  }
  .player-waveform {
    max-width: 300px;
  }
}

/* 迷你模式 */
@media (max-width: 768px) {
  .player-bar {
    height: 48px;
  }
  .player-waveform,
  .player-volume {
    display: none;
  }
}
```

### 2.4 详情面板可拖拽调整宽度

**当前问题**：硬编码 320px。

**方案**：
- 添加拖拽手柄，允许用户调整宽度（240px - 480px）
- 宽度偏好持久化到 settingsStore
- 小屏时改为覆盖层/底部抽屉模式

### 2.5 内容区网格自适应

**当前问题**：网格视图列数固定。

**方案**：
- 使用 CSS Grid `auto-fill` + `minmax()` 自适应列数
- 列表视图行高可配置（紧凑 40px / 标准 50px / 宽松 64px）

```css
.sample-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 16px;
}
```

---

## 第三期：视觉打磨与动效体系 — 专业级质感

**目标**：建立统一动效语言，提升视觉精致度，达到 DAW 级工具的视觉标准

### 3.1 动效设计规范

| 场景 | 时长 | 曲线 | 说明 |
|------|------|------|------|
| 按钮 hover | 120ms | ease-out | 快速反馈 |
| 面板展开/收起 | 250ms | cubic-bezier(0.4, 0, 0.2, 1) | Material 标准 |
| 页面切换 | 300ms | ease-in-out | 平滑过渡 |
| 列表项进入 | 200ms | ease-out | 交错延迟 30ms |
| 模态弹窗 | 200ms | cubic-bezier(0.4, 0, 0.2, 1) | 从中心缩放 |
| 工具提示 | 100ms | ease-out | 即时响应 |
| 播放状态切换 | 150ms | ease-in-out | 图标旋转/缩放 |

### 3.2 列表项动效

**当前问题**：列表项无进入动画，播放状态切换生硬。

**方案**：
- 列表项首次渲染时 `fadeIn` 交错动画
- 播放状态切换：播放图标 → 暂停图标 使用 `framer-motion` 旋转过渡
- 当前播放项添加呼吸光效（subtle glow pulse）

```tsx
// SampleCard 播放状态动效
<motion.button
  onClick={handlePlay}
  whileTap={{ scale: 0.92 }}
  className="sample-play-btn"
>
  <AnimatePresence mode="wait">
    {isPlaying ? (
      <motion.span key="pause" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
        <PauseOutlined />
      </motion.span>
    ) : (
      <motion.span key="play" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.5, opacity: 0 }}>
        <CaretRightOutlined />
      </motion.span>
    )}
  </AnimatePresence>
</motion.button>
```

### 3.3 波形视觉升级

**当前问题**：
- SampleCard 使用伪随机波形（基于 id 的种子随机），视觉上不真实
- PlayerBar 波形无渐变背景，视觉层次单薄
- 波形颜色与主题不联动

**方案**：
- 波形绘制添加渐变填充 + 镜像反射效果
- 已播放区域使用品牌色渐变，未播放区域使用低对比度色
- 波形底部添加微弱反射（opacity 0.15 的倒影）
- 播放时波形添加微弱脉动效果

```typescript
// 波形绘制增强
const gradient = ctx.createLinearGradient(0, 0, 0, h);
gradient.addColorStop(0, accentColor);
gradient.addColorStop(1, accentColor + '40'); // 底部渐隐

// 反射效果
ctx.save();
ctx.globalAlpha = 0.12;
ctx.scale(1, -1);
ctx.translate(0, -2 * h);
// 重绘波形...
ctx.restore();
```

### 3.4 空状态设计

**当前问题**：仅显示 Ant Design 默认 Empty 组件。

**方案**：根据场景设计专属空状态：

| 场景 | 插图 | 标题 | 操作引导 |
|------|------|------|---------|
| 无采样 | 音符文件夹 | "你的采样库还是空的" | "添加文件夹" 按钮 |
| 搜索无结果 | 放大镜 | "没有找到匹配的采样" | "清除筛选" 按钮 |
| 收藏夹为空 | 星星 | "还没有收藏任何采样" | "浏览采样库" 链接 |
| 播放列表为空 | 列表图标 | "这个列表还是空的" | "从采样库添加" 提示 |

### 3.5 加载状态升级

**当前问题**：仅 Spin 组件。

**方案**：
- 采样列表加载时显示骨架屏（Skeleton），保持布局稳定
- 波形加载时显示脉动占位条
- 扫描进度条改为带动画的进度指示器

```tsx
// 骨架屏
<div className="sample-skeleton">
  <Skeleton active paragraph={{ rows: 8 }} />
</div>

// 波形占位
<div className="waveform-placeholder">
  <div className="waveform-bar" style={{ height: '60%' }} />
  <div className="waveform-bar" style={{ height: '40%' }} />
  {/* ... */}
</div>
```

### 3.6 微交互增强

| 交互 | 当前 | 改进 |
|------|------|------|
| 收藏按钮 | 无动画 | 点击时心形缩放弹跳 + 粒子扩散 |
| 拖拽开始 | 无视觉反馈 | 采样卡片缩小 + 阴影加深 + 半透明 |
| 视图切换 | 即时切换 | 内容区 crossfade 过渡 |
| 分类选中 | 背景色变化 | 左侧指示条滑入动画 |
| 搜索聚焦 | 边框变色 | 搜索框微放大 + 发光效果 |
| 音量滑块 | 原生 range | 自定义滑块 + 数值气泡 |

---

## 第四期：交互体验升级 — 效率与流畅

**目标**：提升操作效率，减少交互步骤，增强专业感

### 4.1 搜索体验重构

**当前问题**：
- 搜索面板浮在内容上方，遮挡列表
- 无搜索建议/自动补全
- 筛选条件不可保存

**方案**：
- 搜索栏改为内联展开模式：聚焦时搜索栏下方展开筛选区域，不遮挡列表
- 添加搜索建议下拉：最近搜索 + 热门标签 + 分类建议
- 筛选条件标签化展示在搜索栏下方（可单独移除）
- 支持保存筛选预设

```tsx
// 筛选条件标签展示
<div className="filter-tags">
  {activeFilters.map(filter => (
    <Tag closable onClose={() => removeFilter(filter.key)}>
      {filter.label}: {filter.value}
    </Tag>
  ))}
</div>
```

### 4.2 键盘导航增强

**当前问题**：仅全局快捷键（Ctrl+F/Space 等），列表内无键盘导航。

**方案**：
- **上下方向键**：在采样列表中移动选中项
- **Enter**：播放选中采样
- **Delete/Backspace**：从库中移除（带确认）
- **Ctrl+Shift+C**：复制文件路径
- **Ctrl+Shift+F**：切换收藏
- **Tab**：在主要区域间跳转（搜索 → 列表 → 侧边栏 → 播放栏）
- 右键菜单支持方向键选择 + Enter 确认

```tsx
// 列表键盘导航
const handleListKeyDown = (e: React.KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, samples.length - 1));
      break;
    case 'ArrowUp':
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      break;
    case 'Enter':
      handlePlay(samples[selectedIndex].id);
      break;
  }
};
```

### 4.3 右键菜单增强

**当前问题**：
- 不支持键盘导航
- 无子菜单
- 无快捷键提示

**方案**：
- 方向键上下选择，Enter 确认，Esc 关闭
- 「移动到分类」添加子菜单
- 「添加到播放列表」添加子菜单
- 菜单项右侧显示快捷键提示（如 `Ctrl+C`）
- 危险操作（删除）使用红色高亮 + 确认步骤

### 4.4 拖拽体验优化

**当前问题**：拖拽图标为应用默认图标，无视觉反馈。

**方案**：
- 生成波形缩略图作为拖拽预览图（`customDragImage`）
- 拖拽时源卡片添加 `opacity: 0.5` + 虚线边框
- 拖入播放列表区域时高亮目标区域
- 支持拖拽到系统文件管理器（复制文件）

```tsx
const handleDragStart = (e: React.DragEvent) => {
  // 生成波形缩略图
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 120;
  thumbCanvas.height = 40;
  drawWaveformThumbnail(thumbCanvas, waveform);
  e.dataTransfer.setDragImage(thumbCanvas, 60, 20);
  // ...
};
```

### 4.5 批量操作浮动栏

**当前问题**：多选后无视觉反馈，操作入口不明确。

**方案**：
- 多选时底部弹出浮动操作栏（类似 Google Drive）
- 显示选中数量 + 操作按钮：删除、移动分类、添加标签、导出、取消选择
- 浮动栏使用 `framer-motion` 从底部滑入
- 点击外部区域或 Esc 关闭

```tsx
<AnimatePresence>
  {selectedIds.length > 0 && (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      className="batch-action-bar"
    >
      <span>已选择 {selectedIds.length} 个采样</span>
      <Button icon={<DeleteOutlined />} danger>删除</Button>
      <Button icon={<FolderOutlined />}>移动分类</Button>
      <Button icon={<TagOutlined />}>添加标签</Button>
      <Button icon={<ExportOutlined />}>导出</Button>
    </motion.div>
  )}
</AnimatePresence>
```

### 4.6 排序列头交互优化

**当前问题**：排序列头仅文字 + 箭头，视觉弱，不易发现可点击。

**方案**：
- 列头 hover 时显示排序箭头图标
- 激活排序列使用品牌色 + 下划线
- 支持三态循环：升序 → 降序 → 取消排序
- 添加排序方向动画（箭头旋转）

---

## 第五期：可访问性与国际化 — 通用可用

**目标**：达到 WCAG 2.1 AA 标准，完善国际化 UI 适配

### 5.1 可访问性（A11y）审计与修复

**当前问题**：
- 无 ARIA 标签
- 无键盘焦点指示器
- 颜色对比度未验证
- 屏幕阅读器无法使用

**方案**：

#### 5.1.1 ARIA 标签系统

```tsx
// 采样列表
<div role="list" aria-label="采样列表">
  <div role="listitem" aria-label={`采样: ${sample.fileName}, BPM: ${sample.bpm}, 分类: ${sample.category}`}>
    {/* ... */}
  </div>
</div>

// 播放按钮
<button aria-label={isPlaying ? '暂停' : '播放'} aria-pressed={isPlaying}>
  {isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
</button>

// 音量滑块
<input
  type="range"
  role="slider"
  aria-label="音量"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={Math.round(volume * 100)}
/>

// 侧边栏分类树
<div role="tree" aria-label="分类导航">
  <div role="treeitem" aria-expanded={isExpanded} aria-selected={isActive}>
    {/* ... */}
  </div>
</div>
```

#### 5.1.2 颜色对比度

验证所有主题下文字与背景的对比度：

| 组合 | 当前对比度 | WCAG AA 要求 | 是否达标 |
|------|-----------|-------------|---------|
| text-primary on bg-base (Obsidian) | ~15:1 | 4.5:1 | 达标 |
| text-secondary on bg-base (Obsidian) | ~5.8:1 | 4.5:1 | 达标 |
| text-tertiary on bg-base (Obsidian) | ~3.2:1 | 4.5:1 | **不达标** |
| text-disabled on bg-base (Obsidian) | ~1.8:1 | 3:1 (大文本) | **不达标** |
| brand-primary on bg-base (Obsidian) | ~4.6:1 | 4.5:1 | 勉强达标 |

**修复**：
- `--text-tertiary` 从 `#5E5E6A` 调整为 `#7A7A88`（对比度 ~4.5:1）
- `--text-disabled` 仅用于装饰性元素，重要信息使用 `--text-tertiary`
- 所有主题均需验证并调整

#### 5.1.3 减少动画偏好

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 5.2 国际化 UI 适配

**当前问题**：
- i18next 已引入但 UI 文本大量硬编码中文
- 中文与英文文本长度差异导致布局问题
- 日期/数字格式未本地化

**方案**：

#### 5.2.1 文本提取

将所有硬编码中文提取为 i18n key：

```json
// zh-CN.json
{
  "sidebar": {
    "library": "采样库",
    "playlists": "播放列表",
    "favorites": "收藏夹",
    "recent": "最近使用"
  },
  "library": {
    "title": "采样库",
    "sampleCount": "{{count}} 个采样",
    "addFolder": "添加文件夹",
    "scanning": "扫描中...",
    "searchPlaceholder": "搜索采样名称、标签..."
  }
}

// en.json
{
  "sidebar": {
    "library": "Library",
    "playlists": "Playlists",
    "favorites": "Favorites",
    "recent": "Recent"
  },
  "library": {
    "title": "Library",
    "sampleCount": "{{count}} samples",
    "addFolder": "Add Folder",
    "scanning": "Scanning...",
    "searchPlaceholder": "Search samples, tags..."
  }
}
```

#### 5.2.2 布局弹性适配

英文文本通常比中文长 30-50%，需要：

- 按钮宽度使用 `min-width` + `padding` 而非固定宽度
- 侧边栏分类名使用 `text-overflow: ellipsis` 溢出处理
- 搜索栏 placeholder 使用 `max-width` 限制
- 右键菜单宽度自适应内容

#### 5.2.3 数字/日期格式

```typescript
// 使用 Intl API 本地化
const formatNumber = (n: number) => n.toLocaleString(i18n.language);
const formatDate = (d: Date) => d.toLocaleDateString(i18n.language);
const formatDuration = (seconds: number) => {
  // 统一使用 mm:ss 格式
};
```

### 5.3 高对比度主题

**方案**：新增 High Contrast 主题，满足视觉障碍用户需求：

```css
[data-theme="high-contrast"] {
  --bg-base: #000000;
  --bg-surface: #0A0A0A;
  --bg-elevated: #1A1A1A;
  --text-primary: #FFFFFF;
  --text-secondary: #E0E0E0;
  --text-tertiary: #C0C0C0;
  --border-default: #666666;
  --brand-primary: #FFD700;
  --brand-accent: #00FFFF;
}
```

### 5.4 字体系统优化

**当前问题**：仅 Inter 一种字体，中文显示依赖系统回退。

**方案**：
- 中文环境：Inter + 思源黑体（Noto Sans SC）
- 英文环境：Inter
- 等宽场景（BPM/Key 数值）：JetBrains Mono / SF Mono

```css
:root {
  --font-sans: 'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace;
}

/* 数值等宽对齐 */
.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}
```

### 5.5 Toast 通知系统

**当前问题**：操作反馈使用 `Modal.info()`，打断用户流程。

**方案**：
- 引入轻量 Toast 通知（右上角/右下角弹出）
- 操作成功：绿色图标 + 消息，3 秒自动消失
- 操作失败：红色图标 + 消息，需手动关闭
- 操作进行中：加载图标 + 消息

```tsx
// 替代 Modal.info()
toast.success('已添加到收藏夹');
toast.error('文件解析失败');
toast.loading('正在扫描文件...', { id: 'scan-progress' });
```

---

## 实施路线图

```
第一期（样式体系重构）
├── 1.1 CSS Modules + Tailwind 迁移
├── 1.2 统一主题系统（CSS 变量 → Ant Design + Tailwind）
├── 1.3 Hover/Focus CSS 化
└── 1.4 焦点指示器系统

第二期（布局与响应式）
├── 2.1 响应式断点系统
├── 2.2 Sidebar 折叠/覆盖模式
├── 2.3 PlayerBar 自适应布局
├── 2.4 详情面板可拖拽宽度
└── 2.5 内容区网格自适应

第三期（视觉打磨与动效）
├── 3.1 动效设计规范
├── 3.2 列表项动效
├── 3.3 波形视觉升级
├── 3.4 空状态设计
├── 3.5 加载状态升级（骨架屏）
└── 3.6 微交互增强

第四期（交互体验升级）
├── 4.1 搜索体验重构
├── 4.2 键盘导航增强
├── 4.3 右键菜单增强
├── 4.4 拖拽体验优化
├── 4.5 批量操作浮动栏
└── 4.6 排序列头交互优化

第五期（可访问性与国际化）
├── 5.1 A11y 审计与修复
├── 5.2 国际化 UI 适配
├── 5.3 高对比度主题
├── 5.4 字体系统优化
└── 5.5 Toast 通知系统
```

---

## 依赖关系

```
第一期 ──→ 第二期 ──→ 第三期 ──→ 第四期 ──→ 第五期
(基础)     (布局)     (视觉)     (交互)     (通用)
  │          │          │          │          │
  └─ 样式体系必须先建立，否则后续改动无法落地
```

- **第一期是前置依赖**：不解决内联样式问题，后续所有 UI 改进都在重复劳动
- **第二期依赖第一期**：响应式需要 CSS 媒体查询，内联样式无法实现
- **第三期可与第二期并行**：动效和布局改造相对独立
- **第四期依赖前三期**：交互升级需要稳定的样式和布局基础
- **第五期可穿插进行**：A11y 修复和 i18n 提取可随其他期同步推进

---

*本文档将随项目迭代持续更新*
