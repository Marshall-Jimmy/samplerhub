# 修复 UCS 表错误与模式切换沉浸化重构计划

## Summary

当前项目存在三个核心问题需要修复：
1. **运行时错误 `no such table: ucs_categories`** — 数据库迁移文件路径在打包后无法正确解析，导致 UCS 表未创建
2. **`Object has been destroyed` 异常** — 窗口关闭或重建时，某些 IPC 调用或协议处理引用了已销毁的窗口对象
3. **模式切换 UI 位置不当** — 当前模式切换器（音乐/游戏/影视）位于 Toolbar 下方单独一行，破坏沉浸感；用户要求将其移入设置面板

此外，游戏模式侧边栏 `GameCategoryTree` 当前为静态占位组件，需要接入真实 UCS 数据。

## Current State Analysis

### 数据库初始化流程
- `database.ts` 的 `initDatabase()` 在 `setImmediate` 中延迟执行
- 迁移文件路径使用 `process.env.APP_ROOT || path.join(path.dirname(new URL(import.meta.url).pathname), '../..')`
- `electron-builder.json` 已将 `"drizzle/migrations"` 加入 `files` 数组
- `seedUcsTaxonomy(getSqlite())` 在 `index.ts` 的 `setImmediate` 回调中调用

### 潜在问题点
1. **打包后 `import.meta.url` 在 ESM 中的行为**：`new URL(import.meta.url).pathname` 在 Windows 上可能以 `/C:/` 开头，导致路径拼接异常
2. **`migrations` 表未创建**：迁移 SQL 文件中的 `CREATE TABLE IF NOT EXISTS migrations` 在 `0001_add_ucs_and_game_meta.sql` 中定义，但 `database.ts` 的迁移执行逻辑先检查 `migrations` 表，如果该表不存在于旧数据库中，首次执行时 `SELECT 1 FROM migrations WHERE name = ?` 会报错
3. **`Object has been destroyed`**：可能发生在 `win?.webContents.send()` 调用时窗口已关闭，或 splash 窗口操作后主窗口已被销毁

### 模式切换现状
- `Layout.tsx` 第 144-202 行：内联样式渲染模式切换按钮组
- `profileStore.ts`：Zustand + persist 管理 `appMode`
- `Sidebar.tsx`：根据 `appMode` 条件渲染不同侧边栏组件
- `SettingsModal.tsx`：已有 general/rules/performance/mods 四个 Tab，无模式切换选项

### GameCategoryTree 现状
- 静态硬编码 8 个 UCS 分类，无子分类展开
- 注释标注 `TODO: Round 4 添加 IPC 通道后切换为 IPC 调用`
- 无选中状态、无过滤联动

## Proposed Changes

### 1. 修复 `no such table: ucs_categories`

**文件**: `electron/main/services/database.ts`

**问题根因**：
- `initDatabase()` 中的迁移执行依赖 `migrations` 表，但旧数据库没有此表
- 迁移文件路径在 Windows 打包后可能因 `new URL(import.meta.url).pathname` 返回带前导斜杠的路径而失效
- `seedUcsTaxonomy` 在 `setImmediate` 中调用，如果数据库初始化失败（如路径问题），seed 也会失败

**修复方案**：
1. 在迁移执行前，先确保 `migrations` 表存在（幂等创建）
2. 修复路径解析，使用 `fileURLToPath` 替代直接取 `.pathname`
3. 添加更详细的错误日志和回退机制
4. 在 `initDatabase()` 的 SQL 初始化块中直接创建 UCS 相关表（作为兜底，不依赖迁移文件）

```typescript
// 在 initDatabase() 的 s.exec() 大 SQL 块末尾追加：
// 兜底创建 UCS 表（如果迁移文件未执行）
CREATE TABLE IF NOT EXISTS ucs_categories (...);
CREATE TABLE IF NOT EXISTS ucs_subcategories (...);
CREATE TABLE IF NOT EXISTS sample_ucs_tags (...);
CREATE TABLE IF NOT EXISTS game_metadata (...);
CREATE TABLE IF NOT EXISTS migrations (...);
```

### 2. 修复 `Object has been destroyed`

**文件**: `electron/main/index.ts`

**问题根因**：
- `win?.webContents.send('window:close-requested')` 在窗口关闭事件中被调用，但此时 `win` 可能还未被设为 null
- `splash.webContents.executeJavaScript` 在 splash 已关闭后仍被调用
- `setImmediate` 中的异步初始化代码引用了可能已销毁的窗口

**修复方案**：
1. 所有 `win?.webContents` 调用前增加 `!win.isDestroyed()` 检查
2. `splash` 操作前增加 `splash && !splash.isDestroyed()` 检查（已有部分检查，需全面审查）
3. 将 `win` 引用改为弱引用模式，或使用 `BrowserWindow.getAllWindows()` 动态获取
4. 在 `window:minimize-to-tray` 和 `window:force-quit` IPC 处理器中检查窗口状态

### 3. 模式切换移入设置面板

**文件**: 
- `src/components/layout/Layout.tsx` — 移除模式切换器
- `src/components/settings/GeneralTab.tsx` — 添加模式切换区域
- `src/components/settings/SettingsModal.tsx` — 确保 Tab 声明完整

**具体修改**：

**Layout.tsx**：
- 删除第 144-202 行的模式切换器 `<div>` 整个块
- 保留 `useProfileStore` 的导入（Sidebar 仍需使用）

**GeneralTab.tsx**：
- 在"播放设置"和"主题"之间新增"工作模式"区域
- 使用与 Layout 中相同的 `PROFILE_CONFIGS` 渲染三个模式按钮
- 模式切换后提示用户"重启应用后生效"或即时刷新（当前实现是即时切换，因为 Sidebar 读取 `appMode`）
- 由于 `profileStore` 使用 Zustand persist，`appMode` 变更会立即持久化

**SettingsModal.tsx**：
- `TABS` 数组缺少 `shortcuts` Tab 声明，但 JSX 中有 `activeTab === 'shortcuts'` 的处理
- 补全 `TABS` 数组：添加 `{ id: 'shortcuts', icon: <...>, labelKey: 'settings.shortcuts' }`

### 4. GameCategoryTree 接入真实数据

**文件**: 
- `src/components/GameCategoryTree.tsx` — 重写为动态数据组件
- `electron/main/services/ipcSamples.ts` — 添加 `GET_UCS_CATEGORIES` IPC 处理器
- `shared/types/ipc.types.ts` — 添加新 IPC 通道
- `src/services/ipcClient.ts` — 添加前端调用方法

**具体修改**：

**ipc.types.ts**：
```typescript
GET_UCS_CATEGORIES: 'ucs:getCategories',
GET_UCS_SUBCATEGORIES: 'ucs:getSubcategories',
```

**ipcSamples.ts**（或新建 `ipcUcs.ts`）：
```typescript
ipcMain.handle('ucs:getCategories', async () => {
  const s = getSqlite();
  const cats = s.prepare('SELECT * FROM ucs_categories ORDER BY sort_order').all();
  return { success: true, data: cats };
});

ipcMain.handle('ucs:getSubcategories', async (_, { catId }) => {
  const s = getSqlite();
  const subs = s.prepare('SELECT * FROM ucs_subcategories WHERE cat_id = ?').all(catId);
  return { success: true, data: subs };
});
```

**GameCategoryTree.tsx**：
- 使用 `useEffect` + `ipcClient.getUcsCategories()` 加载数据
- 实现展开/折叠交互（点击主分类展开子分类）
- 添加选中状态，选中后通过 `useLibraryStore` 设置过滤条件
- 子分类为空时显示提示

### 5. 数据库初始化防御性增强

**文件**: `electron/main/services/database.ts`

在 `initDatabase()` 函数中：
1. 将迁移执行逻辑包裹在更详细的 try-catch 中
2. 如果迁移目录不存在或读取失败，记录错误但不中断初始化
3. 确保 `migrations` 表在检查迁移记录前已创建

```typescript
// 在迁移执行前确保 migrations 表存在
try {
  s.exec(`CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
} catch {}
```

## Assumptions & Decisions

1. **模式切换即时生效**：当前架构下 `appMode` 变更后 Sidebar 会立即重新渲染，无需重启应用。如果未来有模式专属的数据缓存需要清理，再考虑添加重启提示。

2. **UCS 数据通过 IPC 获取**：不将 UCS 分类数据缓存到前端 store，每次打开游戏模式侧边栏时从主进程获取，保持数据一致性。

3. **GameCategoryTree 选中过滤**：选中 UCS 分类后，通过设置 `libraryStore` 的过滤条件来筛选样本列表。当前 `libraryStore` 已有 `setActiveCategory` 等方法，需要扩展支持 UCS 分类过滤。

4. **不引入新的测试框架**：虽然用户指定了 `test-driven-development` skill，但当前项目没有测试基础设施。本次修复以功能修复为主，测试覆盖作为后续迭代。TDD skill 的指导原则将用于确保每个修复都有明确的验证步骤。

## Verification Steps

### 修复 1 验证（UCS 表）
1. 删除现有数据库文件（`%APPDATA%/samplerhub/samplerhub.db`）
2. 重新启动应用
3. 检查控制台输出：`[UCS] Seeded X categories, Y subcategories`
4. 使用 SQLite 浏览器打开数据库，确认 `ucs_categories` 和 `ucs_subcategories` 表存在且有数据
5. 打包测试：`npm run build` 后运行 release 版本，确认无 `no such table` 错误

### 修复 2 验证（Object destroyed）
1. 正常启动应用
2. 点击窗口关闭按钮，确认弹出"缩小到托盘/直接退出"对话框
3. 选择"直接退出"，确认无异常弹窗
4. 重复 10 次以上，确认稳定性
5. 在应用启动过程中快速关闭窗口，确认无崩溃

### 修复 3 验证（模式切换移入设置）
1. 确认 Toolbar 下方不再显示模式切换条
2. 打开设置（齿轮图标），在 General Tab 中找到"工作模式"区域
3. 切换模式，确认 Sidebar 内容相应变化（音乐→分类树，游戏→UCS 树，影视→场景编辑器）
4. 关闭并重新打开应用，确认上次选择的模式被记住

### 修复 4 验证（GameCategoryTree）
1. 切换到游戏模式
2. 确认侧边栏显示 UCS 分类列表（从数据库动态加载）
3. 点击主分类，确认子分类展开
4. 点击子分类，确认样本列表按 UCS 分类过滤
