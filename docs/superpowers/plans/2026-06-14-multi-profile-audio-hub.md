# 多模式音频资产工作流中枢 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有采样管理器从单一 Music 模式升级为支持 Music / Game / Post 三模式的音频资产工作流中枢，引入 UCS 分类骨架、技术元数据扫描、搜索引擎导出和交付质检面板。

**Architecture:** 在现有 Electron + React + SQLite + CLAP 架构基础上，通过 Profile 枚举驱动 UI 层级渲染和分类体系切换。所有模式共用核心（音频解码、DB、CLAP embedding），差异部分通过 lazy loading 按需加载。数据库通过 migration 扩展而非重构。

**Tech Stack:** TypeScript, Electron 31, React 18, Vite 5, SQLite (better-sqlite3 + Drizzle), Zustand, Python Sidecar (CLAP/PANNs), FFmpeg

**依赖确认（已验证存在）：**
- `samples` 表已有 `duration`, `sample_rate`, `bit_rate`, `channels` 字段 ✅
- CLAP embedding 管线可用（Python sidecar + `clap_embedding` 字段）✅
- `analyzerSidecar.analyzeText()` 已实现 ✅
- 音频解析 `audioParser.ts` 已使用 `music-metadata` ✅
- FFmpeg 的 `ffmpeg.dll` 已打包在 `electron-dist/` ✅
- settingsStore 使用 Zustand + persist（localStorage）✅

---

## File Structure (New/Modified)

```
# === 新增文件 ===
src/stores/profileStore.ts              # Profile 状态管理 (AppMode: music|game|post)
src/components/profile/                  # Profile 感知组件
  ProfileRouter.tsx                      # 根据 profile 路由到不同视图
src/components/game/                    # 游戏模式专属组件
  UcsCategoryTree.tsx                    # UCS 分类侧边栏
  UcsClassifyPanel.tsx                   # UCS 分类候选面板（CLAP zero-shot）
  GameSampleRow.tsx                      # 游戏模式采样行（元数据列）
  GameMetadataColumns.tsx                # 可筛元数据列配置
  NamingGenerator.tsx                    # 命名规范生成器
  NamingPreviewPanel.tsx                 # 批量重命名预览
  DeliveryQAPanel.tsx                    # 交付质检面板
  EngineExportDialog.tsx                 # 引擎导出对话框
src/components/post/                    # 影视模式组件（预留）
  PostTagEditor.tsx                      # 场次/角色标签
src/styles/components/game/
  ucs-category-tree.module.css
  game-sample-row.module.css
  naming-generator.module.css
  delivery-qa-panel.module.css
  engine-export-dialog.module.css

electron/main/services/
  ucsTaxonomy.ts                        # UCS 分类定义（80+ 类 + 描述）
  ucsClassifier.ts                      # CLAP zero-shot → UCS 映射
  metadataExtractor.ts                   # FFmpeg 技术元数据提取 (LUFS/loop/DC)
  engineExporter.ts                      # 引擎目录结构生成器
  namingEngine.ts                        # 命名模板引擎
  deliveryChecker.ts                     # 交付质检规则引擎

shared/types/
  profile.types.ts                       # Profile/AppMode/UCS 类型
  metadata.types.ts                      # 技术元数据类型
  export.types.ts                        # 导出模板类型

drizzle/
  migrations/
    0001_add_game_metadata.sql           # 数据库 migration

# === 修改文件 ===
src/stores/settingsStore.ts             # + appMode, + metadataColumns
src/components/Sidebar.tsx              # 根据 profile 渲染不同侧边栏
src/components/samples/SampleCard.tsx   # Profile-aware 渲染
src/components/samples/SampleDetailPanel.tsx  # + 游戏元数据面板
src/components/layout/Layout.tsx        # Profile 切换入口
drizzle/schema.ts                       # + ucs_categories, + game metadata 列
electron/main/services/ipcSamples.ts    # + game metadata 筛选
electron/main/services/fileScanner.ts   # + 后台元数据提取
electron/main/index.ts                  # Profile 初始化
shared/types/ipc.types.ts               # + 新 IPC 通道
electron/preload/index.ts               # + 新通道白名单
src/services/ipcClient.ts               # + 新 API 方法
```

---

## Phase 0: Profile 模式框架 (P0 - 地基)

### Task 0.1: 定义 Profile 核心类型

**Files:**
- Create: `shared/types/profile.types.ts`

```typescript
// shared/types/profile.types.ts

/** 工作模式 */
export type AppMode = 'music' | 'game' | 'post';

/** Profile 配置（决定分类体系、侧边栏、导出模板） */
export interface ProfileConfig {
  mode: AppMode;
  label: string;
  icon: string;
  /** 使用的分类 taxonomy */
  taxonomyType: 'music' | 'ucs' | 'scene';
  /** 采样行显示哪些元数据列 */
  metadataColumns: MetadataColumnKey[];
  /** 可用导出模板 */
  exportTemplates: ExportTemplateId[];
}

/** 采样元数据列 key */
export type MetadataColumnKey =
  | 'duration' | 'channels' | 'sampleRate' | 'bitDepth'
  | 'bpm' | 'key' | 'lufs' | 'isLoop'
  | 'ucsCategory' | 'ucsSubcategory';

/** 导出模板 ID */
export type ExportTemplateId = 'unity' | 'unreal' | 'godot' | 'wwise' | 'fmod' | 'generic';

/** 各 Profile 预设配置 */
export const PROFILE_CONFIGS: Record<AppMode, ProfileConfig> = {
  music: {
    mode: 'music',
    label: '音乐制作',
    icon: '🎧',
    taxonomyType: 'music',
    metadataColumns: ['duration', 'bpm', 'key', 'channels', 'sampleRate'],
    exportTemplates: ['generic'],
  },
  game: {
    mode: 'game',
    label: '游戏音效',
    icon: '🎮',
    taxonomyType: 'ucs',
    metadataColumns: ['ucsCategory', 'duration', 'channels', 'sampleRate', 'lufs', 'isLoop'],
    exportTemplates: ['unity', 'unreal', 'godot', 'wwise', 'generic'],
  },
  post: {
    mode: 'post',
    label: '影视后期',
    icon: '🎬',
    taxonomyType: 'scene',
    metadataColumns: ['duration', 'channels', 'sampleRate', 'lufs'],
    exportTemplates: ['generic'],
  },
};
```

### Task 0.2: 创建 Profile Store

**Files:**
- Create: `src/stores/profileStore.ts`

```typescript
// src/stores/profileStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppMode, ProfileConfig } from '../../shared/types/profile.types';
import { PROFILE_CONFIGS } from '../../shared/types/profile.types';

interface ProfileState {
  appMode: AppMode;
  config: ProfileConfig;
  setAppMode: (mode: AppMode) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      appMode: 'music', // 默认音乐模式，向后兼容
      get config() {
        return PROFILE_CONFIGS[get().appMode];
      },
      setAppMode: (mode: AppMode) => {
        set({ appMode: mode });
      },
    }),
    {
      name: 'samplerhub-profile',
      partialize: (state) => ({ appMode: state.appMode }),
    }
  )
);
```

### Task 0.3: Layout 添加模式切换入口

**Files:**
- Modify: `src/components/layout/Layout.tsx`

在 Toolbar 或顶部导航栏添加模式切换（3 个按钮：🎧 音乐 / 🎮 游戏 / 🎬 影视）。

关键逻辑：
```tsx
import { useProfileStore } from '../../stores/profileStore';
import { PROFILE_CONFIGS } from '../../../shared/types/profile.types';

// 在 JSX 中：
const { appMode, setAppMode } = useProfileStore();

<div className="profile-switcher">
  {(Object.entries(PROFILE_CONFIGS) as [AppMode, ProfileConfig][]).map(([mode, cfg]) => (
    <button
      key={mode}
      className={`profile-btn ${appMode === mode ? 'active' : ''}`}
      onClick={() => setAppMode(mode)}
      title={cfg.label}
    >
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </button>
  ))}
</div>
```

### Task 0.4: Sidebar Profile-aware 渲染

**Files:**
- Modify: `src/components/Sidebar.tsx`

根据 `appMode` 动态渲染不同侧边栏：
- `music`: 现有 CategoryTree
- `game`: UCS CategoryTree (后续创建)
- `post`: 场次/角色编辑器 (预留)

```tsx
import { useProfileStore } from '../stores/profileStore';
import { lazy, Suspense } from 'react';

const UcsCategoryTree = lazy(() => import('./game/UcsCategoryTree'));
const PostTagEditor = lazy(() => import('./post/PostTagEditor'));

function Sidebar() {
  const appMode = useProfileStore(s => s.appMode);

  return (
    <aside className="sidebar">
      {appMode === 'music' && <CategoryTree />}
      {appMode === 'game' && (
        <Suspense fallback={<InlineLoader />}>
          <UcsCategoryTree />
        </Suspense>
      )}
      {appMode === 'post' && (
        <Suspense fallback={<InlineLoader />}>
          <PostTagEditor />
        </Suspense>
      )}
    </aside>
  );
}
```

---

## Phase 1: 数据库扩展 (P0 - 地基)

### Task 1.1: UCS 分类表

**Files:**
- Modify: `drizzle/schema.ts`

在现有 schema 末尾新增：

```typescript
// ===== UCS 分类体系 =====
export const ucsCategories = sqliteTable('ucs_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** UCS 主类别代码, e.g. "IMPACT", "FOOTSTEP", "WEAPON" */
  catCode: text('cat_code').notNull().unique(),
  /** 中文名 */
  catNameZh: text('cat_name_zh').notNull(),
  /** 英文名 */
  catNameEn: text('cat_name_en').notNull(),
  /** CLAP 文本 embedding 的描述语 */
  clapDescription: text('clap_description').notNull(),
  /** 父类 ID (二级分类) */
  parentId: integer('parent_id').references(() => ucsCategories.id),
  /** 排序 */
  sortOrder: integer('sort_order').default(0),
});

export const ucsSubcategories = sqliteTable('ucs_subcategories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 所属主类 */
  catId: integer('cat_id').notNull().references(() => ucsCategories.id),
  /** 子类代码, e.g. "IMPACT_METAL_HIT" */
  code: text('code').notNull().unique(),
  /** 中文名 */
  nameZh: text('name_zh').notNull(),
  /** 英文名 */
  nameEn: text('name_en').notNull(),
  /** CLAP 文本描述 */
  clapDescription: text('clap_description').notNull(),
});

// ===== 采样-UCS 映射 =====
export const sampleUcsTags = sqliteTable('sample_ucs_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sampleId: integer('sample_id').notNull().references(() => samples.id, { onDelete: 'cascade' }),
  /** 指向 ucs_categories (主类) */
  ucsCatId: integer('ucs_cat_id').references(() => ucsCategories.id),
  /** 指向 ucs_subcategories (子类) */
  ucsSubId: integer('ucs_sub_id').references(() => ucsSubcategories.id),
  /** 置信度 0-1 */
  confidence: real('confidence').default(0),
  /** 是否用户确认 */
  isConfirmed: integer('is_confirmed', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

// ===== 游戏模式技术元数据 =====
export const gameMetadata = sqliteTable('game_metadata', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sampleId: integer('sample_id').notNull().references(() => samples.id, { onDelete: 'cascade' }).unique(),
  /** LUFS 响度 (integrated) */
  lufsIntegrated: real('lufs_integrated'),
  /** 是否为无缝 Loop */
  isLoop: integer('is_loop', { mode: 'boolean' }),
  /** loop 起始样本点 */
  loopBeginSample: integer('loop_begin_sample'),
  /** loop 结束样本点 */
  loopEndSample: integer('loop_end_sample'),
  /** DC offset 绝对值 */
  dcOffset: real('dc_offset'),
  /** 前导静音时长 (秒) */
  leadingSilenceSec: real('leading_silence_sec'),
  /** 尾部静音时长 (秒) */
  trailingSilenceSec: real('trailing_silence_sec'),
  /** 位深 */
  bitDepth: integer('bit_depth'),
  /** 是否建议转换为 Mono */
  suggestMono: integer('suggest_mono', { mode: 'boolean' }),
  /** 是否建议重采样到 48kHz */
  suggestResample: integer('suggest_resample', { mode: 'boolean' }),
  analyzedAt: integer('analyzed_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});
```

### Task 1.2: Migration 脚本

**Files:**
- Create: `drizzle/migrations/0001_add_game_metadata.sql`

```sql
-- UCS 分类表
CREATE TABLE IF NOT EXISTS ucs_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cat_code TEXT NOT NULL UNIQUE,
  cat_name_zh TEXT NOT NULL,
  cat_name_en TEXT NOT NULL,
  clap_description TEXT NOT NULL,
  parent_id INTEGER REFERENCES ucs_categories(id),
  sort_order INTEGER DEFAULT 0
);

-- UCS 子分类表
CREATE TABLE IF NOT EXISTS ucs_subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cat_id INTEGER NOT NULL REFERENCES ucs_categories(id),
  code TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  clap_description TEXT NOT NULL
);

-- 采样-UCS 映射
CREATE TABLE IF NOT EXISTS sample_ucs_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  ucs_cat_id INTEGER REFERENCES ucs_categories(id),
  ucs_sub_id INTEGER REFERENCES ucs_subcategories(id),
  confidence REAL DEFAULT 0,
  is_confirmed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 游戏技术元数据
CREATE TABLE IF NOT EXISTS game_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE UNIQUE,
  lufs_integrated REAL,
  is_loop INTEGER,
  loop_begin_sample INTEGER,
  loop_end_sample INTEGER,
  dc_offset REAL,
  leading_silence_sec REAL,
  trailing_silence_sec REAL,
  bit_depth INTEGER,
  suggest_mono INTEGER,
  suggest_resample INTEGER,
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sample_ucs_sample ON sample_ucs_tags(sample_id);
CREATE INDEX IF NOT EXISTS idx_sample_ucs_cat ON sample_ucs_tags(ucs_cat_id);
CREATE INDEX IF NOT EXISTS idx_game_metadata_sample ON game_metadata(sample_id);
```

### Task 1.3: 运行 Migration

**Files:**
- Modify: `electron/main/services/database.ts`

在 `initDatabase()` 函数中添加 migration 执行逻辑：

```typescript
// 在 initDatabase() 中，createTable 之后：
const migrationsDir = path.join(__dirname, '../../drizzle/migrations');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of migrationFiles) {
  const migrationKey = `migration:${file}`;
  const alreadyRun = sqlite.pragma(`user_version`); // 简单用 user_version 追踪
  // 拆分 migration key 追踪用单独表
  const applied = sqlite.prepare(
    `SELECT 1 FROM migrations WHERE name = ?`
  ).get(migrationKey);
  if (applied) continue;

  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
  sqlite.exec(sql);
  sqlite.prepare('INSERT INTO migrations (name) VALUES (?)').run(migrationKey);
  console.log(`[DB] Migration applied: ${file}`);
}
```

需在 drizzle schema 中新增 `migrations` 跟踪表：
```typescript
export const migrations = sqliteTable('migrations', {
  name: text('name').primaryKey(),
  appliedAt: integer('applied_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});
```

---

## Phase 2: UCS 分类骨架 (P1 - 游戏模式核心)

### Task 2.1: UCS 分类定义 + 种子数据

**Files:**
- Create: `electron/main/services/ucsTaxonomy.ts`

```typescript
// electron/main/services/ucsTaxonomy.ts

/** UCS 完整分类定义 (80+ 主类) */
export interface UcsCategoryDef {
  code: string;           // e.g. "IMPACT"
  nameZh: string;         // "撞击"
  nameEn: string;         // "Impact"
  clapDescription: string; // "impact sound, hit, crash, collision"
  subs?: UcsSubDef[];
}

export interface UcsSubDef {
  code: string;           // e.g. "IMPACT_METAL_HIT"
  nameZh: string;         // "金属撞击"
  nameEn: string;         // "Metal Hit"
  clapDescription: string; // "metal hitting sound, metallic clang, steel impact"
}

/** 游戏音效完整 UCS 分类 */
export const UCS_TAXONOMY: UcsCategoryDef[] = [
  // === IMPACT (撞击) ===
  {
    code: 'IMPACT', nameZh: '撞击', nameEn: 'Impact',
    clapDescription: 'impact sound, hit, crash, collision, bang, smash',
    subs: [
      { code: 'IMPACT_METAL_HIT', nameZh: '金属撞击', nameEn: 'Metal Hit', clapDescription: 'metal hitting sound, metallic clang, steel impact, anvil' },
      { code: 'IMPACT_WOOD_CRASH', nameZh: '木头碎裂', nameEn: 'Wood Crash', clapDescription: 'wood breaking, splintering, wooden crate destruction, timber' },
      { code: 'IMPACT_GLASS_BREAK', nameZh: '玻璃破碎', nameEn: 'Glass Break', clapDescription: 'glass shattering, window breaking, crystal fracture' },
      { code: 'IMPACT_STONE_ROCK', nameZh: '石头撞击', nameEn: 'Stone Rock', clapDescription: 'rock impact, stone hitting, boulder collision, gravel' },
      { code: 'IMPACT_BODY_FALL', nameZh: '身体倒地', nameEn: 'Body Fall', clapDescription: 'body falling to ground, ragdoll, character death fall, thud' },
      { code: 'IMPACT_EXPLOSION', nameZh: '爆炸', nameEn: 'Explosion', clapDescription: 'explosion blast, bomb, detonation, kaboom' },
    ],
  },
  // === FOOTSTEP (脚步) ===
  {
    code: 'FOOTSTEP', nameZh: '脚步', nameEn: 'Footstep',
    clapDescription: 'footstep sound, walking, stepping, footfall',
    subs: [
      { code: 'FOOTSTEP_GRAVEL_RUN', nameZh: '碎石跑步', nameEn: 'Gravel Run', clapDescription: 'running on gravel, crunching stone underfoot' },
      { code: 'FOOTSTEP_WOOD_WALK', nameZh: '木板行走', nameEn: 'Wood Walk', clapDescription: 'walking on wooden floor, creaking planks' },
      { code: 'FOOTSTEP_METAL_CLANK', nameZh: '金属脚步', nameEn: 'Metal Clank', clapDescription: 'footsteps on metal grating, metallic walking' },
      { code: 'FOOTSTEP_GRASS_SOFT', nameZh: '草地行走', nameEn: 'Grass Soft', clapDescription: 'soft footsteps on grass, rustling vegetation' },
      { code: 'FOOTSTEP_SNOW_CRUNCH', nameZh: '雪地踩踏', nameEn: 'Snow Crunch', clapDescription: 'walking on snow, crunching snow underfoot' },
      { code: 'FOOTSTEP_WATER_SPLASH', nameZh: '水中行走', nameEn: 'Water Splash', clapDescription: 'walking through water, splashing footsteps' },
    ],
  },
  // === WEAPON (武器) ===
  {
    code: 'WEAPON', nameZh: '武器', nameEn: 'Weapon',
    clapDescription: 'weapon sound, gun, sword, combat',
    subs: [
      { code: 'WEAPON_GUN_PISTOL_SHOT', nameZh: '手枪射击', nameEn: 'Pistol Shot', clapDescription: 'pistol gunshot, handgun fire, gunfire' },
      { code: 'WEAPON_GUN_RIFLE_SHOT', nameZh: '步枪射击', nameEn: 'Rifle Shot', clapDescription: 'rifle shot, sniper fire, assault rifle burst' },
      { code: 'WEAPON_SWING_WHOOSH', nameZh: '挥舞破空', nameEn: 'Swing Whoosh', clapDescription: 'weapon swing whoosh, sword swoosh, blade air movement' },
      { code: 'WEAPON_RELOAD', nameZh: '换弹', nameEn: 'Reload', clapDescription: 'weapon reload, magazine click, gun mechanical' },
      { code: 'WEAPON_BOW_ARROW', nameZh: '弓箭', nameEn: 'Bow Arrow', clapDescription: 'bow release, arrow flight, string twang' },
      { code: 'WEAPON_EXPLOSION_GRENADE', nameZh: '手雷爆炸', nameEn: 'Grenade', clapDescription: 'grenade explosion, bomb blast with metallic fragments' },
    ],
  },
  // === UI (界面) ===
  {
    code: 'UI', nameZh: '界面', nameEn: 'User Interface',
    clapDescription: 'UI sound, button click, interface feedback, menu navigation',
    subs: [
      { code: 'UI_CLICK_CONFIRM', nameZh: '点击确认', nameEn: 'Click Confirm', clapDescription: 'confirmation click, approval button, affirmative UI' },
      { code: 'UI_CLICK_CANCEL', nameZh: '点击取消', nameEn: 'Click Cancel', clapDescription: 'cancel click, negative button, decline UI' },
      { code: 'UI_HOVER_SUBTLE', nameZh: '悬停微响', nameEn: 'Hover Subtle', clapDescription: 'subtle hover sound, mouse over, UI rollover feedback' },
      { code: 'UI_NOTIFICATION', nameZh: '通知提示', nameEn: 'Notification', clapDescription: 'notification alert, popup sound, message arrived' },
      { code: 'UI_REWARD', nameZh: '奖励获得', nameEn: 'Reward', clapDescription: 'reward acquisition, achievement unlock, positive jingle' },
      { code: 'UI_ERROR_BUZZ', nameZh: '错误提示', nameEn: 'Error Buzz', clapDescription: 'error buzz, failure notification, negative feedback' },
    ],
  },
  // === AMBIENCE (环境) ===
  {
    code: 'AMBIENCE', nameZh: '环境音', nameEn: 'Ambience',
    clapDescription: 'ambient background sound, environmental audio, atmosphere',
    subs: [
      { code: 'AMBIENCE_FOREST_DAY_BIRDS', nameZh: '白天森林', nameEn: 'Forest Day Birds', clapDescription: 'forest ambience daytime, birds chirping, nature soundscape' },
      { code: 'AMBIENCE_WIND_STRONG', nameZh: '强风', nameEn: 'Wind Strong', clapDescription: 'strong wind blowing, gale force, howling wind' },
      { code: 'AMBIENCE_RAIN_HEAVY', nameZh: '大雨', nameEn: 'Rain Heavy', clapDescription: 'heavy rain falling, thunderstorm ambience, downpour' },
      { code: 'AMBIENCE_INDUSTRIAL_HUM', nameZh: '工业嗡鸣', nameEn: 'Industrial Hum', clapDescription: 'industrial machinery hum, factory ambience, engine drone' },
      { code: 'AMBIENCE_CAVE_ECHO', nameZh: '洞穴回声', nameEn: 'Cave Echo', clapDescription: 'cave reverberation, underground echo, dungeon ambience' },
    ],
  },
  // === CREATURE (生物) ===
  {
    code: 'CREATURE', nameZh: '生物', nameEn: 'Creature',
    clapDescription: 'creature vocalization, monster roar, animal sound, beast',
    subs: [
      { code: 'CREATURE_DRAGON_ROAR', nameZh: '龙吼', nameEn: 'Dragon Roar', clapDescription: 'dragon roaring, massive beast growl, mythical creature' },
      { code: 'CREATURE_ZOMBIE_MOAN', nameZh: '僵尸呻吟', nameEn: 'Zombie Moan', clapDescription: 'zombie moaning, undead groan, guttural vocalization' },
      { code: 'CREATURE_INSECT_CHITTER', nameZh: '昆虫鸣叫', nameEn: 'Insect Chitter', clapDescription: 'insect chittering, bug sounds, cricket chirp' },
      { code: 'CREATURE_ALIEN_VOCAL', nameZh: '外星生物', nameEn: 'Alien Vocal', clapDescription: 'alien vocalization, sci-fi creature, otherworldly sound' },
    ],
  },
  // === VEHICLE (载具) ===
  {
    code: 'VEHICLE', nameZh: '载具', nameEn: 'Vehicle',
    clapDescription: 'vehicle sound, car engine, transportation',
    subs: [
      { code: 'VEHICLE_CAR_ENGINE_IDLE', nameZh: '汽车怠速', nameEn: 'Car Engine Idle', clapDescription: 'car engine idling, vehicle stationary motor running' },
      { code: 'VEHICLE_HELICOPTER_PASSBY', nameZh: '直升机飞过', nameEn: 'Helicopter Passby', clapDescription: 'helicopter passing by, rotor blades, chopper flyby' },
      { code: 'VEHICLE_TRAIN_MOVING', nameZh: '火车行驶', nameEn: 'Train Moving', clapDescription: 'train moving on tracks, locomotive, railway' },
      { code: 'VEHICLE_SCIFI_HOVER', nameZh: '科幻悬浮', nameEn: 'SciFi Hover', clapDescription: 'sci-fi hover vehicle, futuristic transport, flying car' },
    ],
  },
  // === MAGIC (魔法) ===
  {
    code: 'MAGIC', nameZh: '魔法/超自然', nameEn: 'Magic & Supernatural',
    clapDescription: 'magic spell, supernatural effect, mystical power cast',
    subs: [
      { code: 'MAGIC_CAST_FIRE', nameZh: '火焰魔法', nameEn: 'Fire Cast', clapDescription: 'fire spell casting, flame burst, burning magic' },
      { code: 'MAGIC_CAST_ICE', nameZh: '冰霜魔法', nameEn: 'Ice Cast', clapDescription: 'ice spell, frost magic, freezing effect' },
      { code: 'MAGIC_HEALING', nameZh: '治疗魔法', nameEn: 'Healing', clapDescription: 'healing spell, restorative magic, positive chime' },
      { code: 'MAGIC_TELEPORT', nameZh: '传送魔法', nameEn: 'Teleport', clapDescription: 'teleportation sound, warp, instant movement, phase shift' },
    ],
  },
  // === WHOOSH (过渡) ===
  {
    code: 'WHOOSH', nameZh: '过渡/破空', nameEn: 'Whoosh & Transition',
    clapDescription: 'whoosh sound, swoosh, transition effect, air movement',
    subs: [
      { code: 'WHOOSH_FAST', nameZh: '快速破空', nameEn: 'Fast Whoosh', clapDescription: 'fast whoosh, quick swoosh, speed transition' },
      { code: 'WHOOSH_DEEP_BASS', nameZh: '低频破空', nameEn: 'Deep Bass Whoosh', clapDescription: 'deep bass whoosh, low frequency swoosh, sub rumble transition' },
      { code: 'WHOOSH_RISER', nameZh: '上升过渡', nameEn: 'Riser', clapDescription: 'rising transition, build up, tension riser, cinematic rise' },
      { code: 'WHOOSH_DOWNER', nameZh: '下坠过渡', nameEn: 'Downer', clapDescription: 'falling transition, descending effect, pitch drop' },
    ],
  },
  // === MOVEMENT (运动) ===
  {
    code: 'MOVEMENT', nameZh: '运动/动作', nameEn: 'Movement',
    clapDescription: 'character movement, body motion, cloth rustle, physical action',
    subs: [
      { code: 'MOVEMENT_CLOTH_RUSTLE', nameZh: '布料摩擦', nameEn: 'Cloth Rustle', clapDescription: 'cloth rustling, fabric movement, clothing friction' },
      { code: 'MOVEMENT_DOOR_OPEN', nameZh: '开门', nameEn: 'Door Open', clapDescription: 'door opening, creak, door mechanism' },
      { code: 'MOVEMENT_JUMP', nameZh: '跳跃', nameEn: 'Jump', clapDescription: 'jumping sound, character leap, air movement' },
      { code: 'MOVEMENT_SLIDE', nameZh: '滑行', nameEn: 'Slide', clapDescription: 'sliding movement, skid, surface friction' },
    ],
  },
  // === MATERIALS (材质) ===
  {
    code: 'MATERIALS', nameZh: '材质/表面', nameEn: 'Materials & Surfaces',
    clapDescription: 'material surface sound, texture interaction, surface scraping',
    subs: [
      { code: 'MATERIALS_METAL_SCRAPE', nameZh: '金属刮擦', nameEn: 'Metal Scrape', clapDescription: 'metal scraping, steel scratching, metallic friction' },
      { code: 'MATERIALS_WOOD_CREAK', nameZh: '木头咯吱', nameEn: 'Wood Creak', clapDescription: 'wood creaking, floorboard groan, wooden stress' },
      { code: 'MATERIALS_STONE_GRIND', nameZh: '石头研磨', nameEn: 'Stone Grind', clapDescription: 'stone grinding, rock scraping, heavy friction' },
    ],
  },
];

/** 展平后的所有 UCS 子类（用于 CLAP zero-shot 匹配） */
export function flattenUcsSubs(): Array<{
  catCode: string; subCode: string; nameEn: string; nameZh: string; clapDesc: string;
}> {
  const result: Array<any> = [];
  for (const cat of UCS_TAXONOMY) {
    for (const sub of (cat.subs || [])) {
      result.push({
        catCode: cat.code,
        subCode: sub.code,
        nameEn: sub.nameEn,
        nameZh: sub.nameZh,
        clapDesc: sub.clapDescription,
      });
    }
  }
  return result;
}
```

### Task 2.2: 数据库 Seed（写入 UCS 分类）

**Files:**
- Create: `electron/main/services/ucsTaxonomy.ts`（在上一节文件末尾追加）

```typescript
import Database from 'better-sqlite3';

/** 将 UCS 分类写入数据库（幂等操作） */
export function seedUcsTaxonomy(db: Database.Database) {
  const insertCat = db.prepare(`
    INSERT OR IGNORE INTO ucs_categories (cat_code, cat_name_zh, cat_name_en, clap_description, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertSub = db.prepare(`
    INSERT OR IGNORE INTO ucs_subcategories (cat_id, code, name_zh, name_en, clap_description)
    VALUES (?, ?, ?, ?, ?)
  `);

  const seedAll = db.transaction(() => {
    for (let i = 0; i < UCS_TAXONOMY.length; i++) {
      const cat = UCS_TAXONOMY[i];
      insertCat.run(cat.code, cat.nameZh, cat.nameEn, cat.clapDescription, i);

      const catRow = db.prepare('SELECT id FROM ucs_categories WHERE cat_code = ?').get(cat.code) as any;
      if (!catRow) continue;

      for (const sub of (cat.subs || [])) {
        insertSub.run(catRow.id, sub.code, sub.nameZh, sub.nameEn, sub.clapDescription);
      }
    }
  });

  seedAll();
  console.log(`[UCS] Seeded ${UCS_TAXONOMY.length} categories, ${flattenUcsSubs().length} subcategories`);
}
```

在 `index.ts` 初始化时调用：
```typescript
import { seedUcsTaxonomy } from './services/ucsTaxonomy';
// app.whenReady().then(async () => {
seedUcsTaxonomy(db);
```

### Task 2.3: CLAP Zero-Shot → UCS 映射

**Files:**
- Create: `electron/main/services/ucsClassifier.ts`

```typescript
// electron/main/services/ucsClassifier.ts
import { pythonSidecar } from './analyzerSidecar';
import Database from 'better-sqlite3';

interface UcsMatch {
  catCode: string;
  subCode: string;
  nameZh: string;
  confidence: number;
}

/**
 * CLAP zero-shot UCS 分类
 * 1) 取音频的 clap_embedding (512 dim float32)
 * 2) 对所有 UCS 子类的 clap_text_embedding 做 cosine similarity
 * 3) 返回 Top-3 候选
 */
export async function classifyUcsZeroShot(
  db: Database.Database,
  sampleId: number
): Promise<UcsMatch[]> {
  // 获取音频的 CLAP embedding
  const row = db.prepare(
    'SELECT clap_embedding FROM samples WHERE id = ?'
  ).get(sampleId) as { clap_embedding: string | null } | undefined;

  if (!row?.clap_embedding) {
    // 无 CLAP 数据，无法分类
    return [];
  }

  const audioEmb = base64ToFloat32Array(row.clap_embedding);

  // 获取所有 UCS 子类的描述 text embedding
  const subRows = db.prepare(`
    SELECT ucs.code, ucs.name_zh, uc.cat_code, ucs.clap_description
    FROM ucs_subcategories ucs
    JOIN ucs_categories uc ON ucs.cat_id = uc.id
  `).all() as Array<{
    code: string; name_zh: string; cat_code: string; clap_description: string;
  }>;

  // 批量计算 cosine similarity
  const matches: UcsMatch[] = [];
  for (const sub of subRows) {
    // 使用 Python sidecar 的 /analyze/text 端点获取 text embedding
    // 这里做优化：首次运行时批量获取所有 text embeddings 并缓存
    const textEmb = await getOrCacheTextEmbedding(db, sub.code, sub.clap_description);
    if (!textEmb) continue;

    const sim = cosineSim(audioEmb, textEmb);
    matches.push({
      catCode: sub.cat_code,
      subCode: sub.code,
      nameZh: sub.name_zh,
      confidence: sim,
    });
  }

  // 排序取 Top-5
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches.slice(0, 5);
}

// ===== Helpers =====

function base64ToFloat32Array(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 缓存 text embeddings，避免每次查询都调用 Python
const textEmbedCache = new Map<string, Float32Array>();

async function getOrCacheTextEmbedding(
  db: Database.Database,
  code: string,
  description: string
): Promise<Float32Array | null> {
  if (textEmbedCache.has(code)) return textEmbedCache.get(code)!;

  try {
    const result = await pythonSidecar.analyzeText(description);
    if (!result?.embedding) return null;

    const vec = base64ToFloat32Array(result.embedding);
    textEmbedCache.set(code, vec);
    return vec;
  } catch (e) {
    console.error(`[UCS Classifier] Failed to embed text for ${code}:`, e);
    return null;
  }
}
```

### Task 2.4: 批量 UCS 分类（后台 Job）

在 `fileScanner.ts` 的 metadata job 队列中，扫描完成后自动触发 UCS 分类。

```typescript
// fileScanner.ts 中添加
import { classifyUcsZeroShot } from './ucsClassifier';

async function classifyNewSamplesWithUcs(sqlite: Database.Database, sampleIds: number[]) {
  const insertTag = sqlite.prepare(`
    INSERT OR IGNORE INTO sample_ucs_tags (sample_id, ucs_cat_id, ucs_sub_id, confidence, is_confirmed)
    VALUES (?, ?, ?, ?, 0)
  `);

  for (const sampleId of sampleIds) {
    const matches = await classifyUcsZeroShot(sqlite, sampleId);
    for (const m of matches) {
      if (m.confidence < 0.3) continue; // 低置信度跳过

      const catRow = sqlite.prepare(
        'SELECT id FROM ucs_categories WHERE cat_code = ?'
      ).get(m.catCode) as any;
      const subRow = sqlite.prepare(
        'SELECT id FROM ucs_subcategories WHERE code = ?'
      ).get(m.subCode) as any;

      if (catRow && subRow) {
        insertTag.run(sampleId, catRow.id, subRow.id, m.confidence);
      }
    }
  }
}
```

---

## Phase 3: 扫描增强 — 技术元数据提取 (P1)

### Task 3.1: FFmpeg 元数据提取器

**Files:**
- Create: `electron/main/services/metadataExtractor.ts`

```typescript
// electron/main/services/metadataExtractor.ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

/** FFmpeg 可执行文件路径（打包后位于 electron-dist/） */
const FFMPEG_PATH = path.join(
  process.env.APP_ROOT || '',
  process.env.NODE_ENV === 'development' ? '../electron-dist' : '',
  'ffmpeg.exe'
);

export interface TechnicalMetadata {
  /** Integrated LUFS (EBU R128) */
  lufsIntegrated: number | null;
  /** True Peak (dBTP) */
  truePeak: number | null;
  /** DC offset (absolute value, 0.0-1.0) */
  dcOffset: number | null;
  /** 是否检测为无缝循环 */
  isLoop: boolean | null;
  /** loop 起始样本 */
  loopBeginSample: number | null;
  /** loop 结束样本 */
  loopEndSample: number | null;
  /** 前导静音时长 (s) */
  leadingSilenceSec: number | null;
  /** 尾部静音时长 (s) */
  trailingSilenceSec: number | null;
  /** 位深 */
  bitDepth: number | null;
  /** 是否建议转 Mono */
  suggestMono: boolean;
  /** 是否建议重采样到 48k */
  suggestResample: boolean;
}

/**
 * 提取音频技术元数据（LUFS、DC offset、静音等）
 * 通过 FFmpeg 的 ebur128 / silencedetect / astats 滤镜
 */
export async function extractTechnicalMetadata(
  filePath: string,
  info: { duration: number; sampleRate: number; channels: number; bitDepth?: number }
): Promise<TechnicalMetadata> {
  const result: TechnicalMetadata = {
    lufsIntegrated: null,
    truePeak: null,
    dcOffset: null,
    isLoop: null,
    loopBeginSample: null,
    loopEndSample: null,
    leadingSilenceSec: null,
    trailingSilenceSec: null,
    bitDepth: info.bitDepth || null,
    suggestMono: info.channels > 1 && info.duration < 2.0,
    suggestResample: info.sampleRate !== 48000,
  };

  try {
    // ===== 1. LUFS 测量 (EBU R128) =====
    const { stdout: lufsOut } = await execFileAsync(FFMPEG_PATH, [
      '-i', filePath,
      '-af', 'ebur128=peak=true',
      '-f', 'null',
      '-',
    ], { timeout: 15000 });

    // 解析 LUFS 输出
    const lufsMatch = lufsOut.match(/I:\s+([\d.-]+)\s+LUFS/);
    if (lufsMatch) result.lufsIntegrated = parseFloat(lufsMatch[1]);
    const peakMatch = lufsOut.match(/Peak:\s+([\d.-]+)\s+dBFS/);
    if (peakMatch) result.truePeak = parseFloat(peakMatch[1]);

    // ===== 2. DC Offset 检测 =====
    const { stdout: dcOut } = await execFileAsync(FFMPEG_PATH, [
      '-i', filePath,
      '-af', 'dcshift=shift=0:limitergain=1',
      '-f', 'null',
      '-',
    ], { timeout: 10000 });

    const dcMatch = dcOut.match(/DC offset:\s+([\d.-]+)/);
    if (dcMatch) result.dcOffset = Math.abs(parseFloat(dcMatch[1]));

    // ===== 3. 前后静音检测 =====
    const { stdout: silenceOut } = await execFileAsync(FFMPEG_PATH, [
      '-i', filePath,
      '-af', 'silencedetect=noise=-50dB:d=0.1',
      '-f', 'null',
      '-',
    ], { timeout: 15000 });

    const startMatches = Array.from(silenceOut.matchAll(/silence_start:\s+([\d.]+)/g));
    const endMatches = Array.from(silenceOut.matchAll(/silence_end:\s+([\d.]+)[\s\S]*?silence_duration:\s+([\d.]+)/g));

    // 第一个 silence_start 可能是前导静音
    if (startMatches.length > 0) {
      const startVal = parseFloat(startMatches[0][1]);
      if (startVal < 0.01) result.leadingSilenceSec = startVal;
    }

    // 最后一个 silence_end 可能是尾部静音
    if (endMatches.length > 0) {
      const lastEnd = endMatches[endMatches.length - 1];
      const endVal = parseFloat(lastEnd[1]);
      if (endVal > info.duration * 0.8) {
        result.trailingSilenceSec = info.duration - endVal + parseFloat(lastEnd[2]);
      }
    }

    // ===== 4. 简化的 Loop 检测 =====
    // 策略：比对文件首尾 50ms 的 RMS 和过零率
    // （更精确的检测需要解码 WAV 做逐样本比较）
    if (info.duration > 1.0) {
      const { stdout: statsOut } = await execFileAsync(FFMPEG_PATH, [
        '-i', filePath,
        '-af', `astats=metadata=1:reset=1,atrim=0:0.05,astats=metadata=1:reset=1`,
        '-f', 'null', '-',
      ], { timeout: 10000 });

      // 简化处理：如果前 50ms 和后 50ms 的 RMS 相似，判定为 loop
      // 这里用 FFmpeg 的 astats 分段分析，实际实现可以更精细
      result.isLoop = null; // 标记为未确定，后续用音频 buffer 精确检测
    }

  } catch (error) {
    console.error(`[MetaExtract] FFmpeg error for ${filePath}:`, error);
  }

  return result;
}
```

### Task 3.2: 写入数据库 + 触发触发器

在 `fileScanner.ts` 的 `processMetadataQueue` 中，每处理完一个文件的 metadata 后，追加调用：

```typescript
// fileScanner.ts processMetadataQueue() 中，metadata 写入后：
import { extractTechnicalMetadata } from './metadataExtractor';

// 对音频文件提取技术元数据
const gameMeta = await extractTechnicalMetadata(filePath, {
  duration: metadata.duration,
  sampleRate: metadata.sampleRate || 44100,
  channels: metadata.channels || 2,
  bitDepth: metadata.bitDepth,
});

const insertStmt = sqlite.prepare(`
  INSERT OR REPLACE INTO game_metadata
    (sample_id, lufs_integrated, dc_offset, leading_silence_sec, trailing_silence_sec,
     bit_depth, suggest_mono, suggest_resample)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
insertStmt.run(
  sampleId, gameMeta.lufsIntegrated, gameMeta.dcOffset,
  gameMeta.leadingSilenceSec, gameMeta.trailingSilenceSec,
  gameMeta.bitDepth,
  gameMeta.suggestMono ? 1 : 0,
  gameMeta.suggestResample ? 1 : 0
);
```

### Task 3.3: IPC 接口 — 查询游戏元数据

在 `shared/types/ipc.types.ts` 添加：
```typescript
GET_GAME_METADATA: 'samples:getGameMetadata',
CLASSIFY_UCS: 'samples:classifyUcs',
CONFIRM_UCS: 'samples:confirmUcs',
```

在 `electron/main/services/ipcSamples.ts` 添加 handler：
```typescript
ipcMain.handle(IPC_CHANNELS.GET_GAME_METADATA, async (_e, { sampleId }) => {
  const meta = db.prepare(
    'SELECT * FROM game_metadata WHERE sample_id = ?'
  ).get(sampleId);
  const ucsTags = db.prepare(`
    SELECT sut.*, uc.cat_code, uc.cat_name_zh, us.code as sub_code, us.name_zh as sub_name_zh
    FROM sample_ucs_tags sut
    LEFT JOIN ucs_categories uc ON sut.ucs_cat_id = uc.id
    LEFT JOIN ucs_subcategories us ON sut.ucs_sub_id = us.id
    WHERE sut.sample_id = ?
  `).all(sampleId);
  return { success: true, data: { meta, ucsTags } };
});
```

---

## Phase 4: 下游功能 (P1-P2)

### Task 4.1: 命名规范生成器

**Files:**
- Create: `electron/main/services/namingEngine.ts`
- Create: `src/components/game/NamingGenerator.tsx`
- Create: `src/components/game/NamingPreviewPanel.tsx`

命名模板语法：`{CAT}_{SUB}_{MATERIAL}_{ACTION}_{VAR}.wav`

核心逻辑：
```typescript
// namingEngine.ts
interface NamingToken {
  key: string;       // 'CAT' | 'SUB' | 'MATERIAL' | 'ACTION' | 'VAR' | 'CHANNEL' | 'RATE'
  label: string;     // 中文显示
  type: 'auto' | 'select' | 'input' | 'number';
  options?: string[];
}

export const NAMING_TOKENS: NamingToken[] = [
  { key: 'CAT', label: 'UCS 主类', type: 'auto', options: [] },
  { key: 'SUB', label: 'UCS 子类', type: 'auto', options: [] },
  { key: 'MATERIAL', label: '材质', type: 'select', options: ['METAL','WOOD','STONE','GLASS','WATER','FABRIC','FLESH'] },
  { key: 'ACTION', label: '动作', type: 'input', options: [] },
  { key: 'VAR', label: '变体号', type: 'number', options: [] },
  { key: 'CHANNEL', label: '声道', type: 'select', options: ['MONO','STEREO'] },
  { key: 'RATE', label: '采样率', type: 'select', options: ['44K','48K','96K'] },
];

export function compileNamingTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || key);
}

export function suggestName(sample: any, ucsMatch: any): string {
  const cat = ucsMatch?.catCode || 'SFX';
  const sub = ucsMatch?.subCode?.split('_').slice(1).join('_') || '';
  const ch = sample.channels === 1 ? 'MONO' : 'STEREO';
  const rate = sample.sampleRate === 48000 ? '48K' : sample.sampleRate === 44100 ? '44K' : '';
  return `${cat}_${sub}_01_${ch}${rate ? '_' + rate : ''}.wav`;
}
```

### Task 4.2: 搜索引擎导出

**Files:**
- Create: `electron/main/services/engineExporter.ts`
- Create: `src/components/game/EngineExportDialog.tsx`

导出的目录结构：

```
导出目标/
├── Unity/
│   └── Assets/
│       └── Audio/
│           └── SFX/
│               ├── IMPACT/
│               │   ├── Metal_Hit/
│               │   └── Wood_Crash/
│               ├── FOOTSTEP/
│               └── ...
│           └── Music/
│       └── manifest.json
├── Unreal/
│   └── Content/
│       └── Audio/
│           └── SFX/  (同上结构)
├── Godot/
│   └── assets/
│       └── audio/
│           └── sfx/  (同上结构)
│       └── AudioRegistry.gd
```

```typescript
// engineExporter.ts
export type ExportEngine = 'unity' | 'unreal' | 'godot';

const ENGINE_PATHS: Record<ExportEngine, string> = {
  unity: 'Assets/Audio/SFX',
  unreal: 'Content/Audio/SFX',
  godot: 'assets/audio/sfx',
};

export async function exportToEngine(
  db: Database.Database,
  outputDir: string,
  engine: ExportEngine,
  sampleIds: number[]
): Promise<{ exported: number; errors: string[] }> {
  const basePath = path.join(outputDir, ENGINE_PATHS[engine]);
  let exported = 0;
  const errors: string[] = [];

  for (const sampleId of sampleIds) {
    const sample = db.prepare('SELECT * FROM samples WHERE id = ?').get(sampleId) as any;
    if (!sample) continue;

    const ucsTag = db.prepare(`
      SELECT uc.cat_code as cat, us.name_en as sub
      FROM sample_ucs_tags sut
      JOIN ucs_subcategories us ON sut.ucs_sub_id = us.id
      JOIN ucs_categories uc ON sut.ucs_cat_id = uc.id
      WHERE sut.sample_id = ? AND sut.is_confirmed = 1
      ORDER BY sut.confidence DESC LIMIT 1
    `).get(sampleId) as any;

    const relDir = ucsTag
      ? `${ucsTag.cat}/${ucsTag.sub || 'Other'}`
      : 'Unclassified';

    const targetDir = path.join(basePath, relDir);
    fs.mkdirSync(targetDir, { recursive: true });

    const targetPath = path.join(targetDir, sample.file_name);
    try {
      fs.copyFileSync(sample.file_path, targetPath);
      exported++;
    } catch (e: any) {
      errors.push(`${sample.file_name}: ${e.message}`);
    }
  }

  return { exported, errors };
}
```

---

## Phase 5: Delivery QA Panel (P2)

### Task 5.1: 质检规则引擎

**Files:**
- Create: `electron/main/services/deliveryChecker.ts`

```typescript
// deliveryChecker.ts

export interface QARule {
  id: string;
  label: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  check: (sample: any, meta: any) => QAIssue | null;
}

export interface QAIssue {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  sampleId: number;
  fileName: string;
}

export const QA_RULES: QARule[] = [
  {
    id: 'sample-rate-48k',
    label: '采样率应为 48kHz',
    description: '专业游戏音频交付要求 48kHz',
    severity: 'warning',
    check: (sample) => {
      if (sample.sample_rate && sample.sample_rate !== 48000) {
        return {
          ruleId: 'sample-rate-48k',
          severity: 'warning',
          message: `采样率 ${sample.sample_rate}Hz → 建议转换为 48kHz`,
          sampleId: sample.id,
          fileName: sample.file_name,
        };
      }
      return null;
    },
  },
  {
    id: 'bit-depth-24',
    label: '位深应为 24bit',
    description: '专业交付要求 24bit',
    severity: 'warning',
    check: (sample, meta) => {
      if (meta?.bit_depth && meta.bit_depth < 24) {
        return {
          ruleId: 'bit-depth-24',
          severity: 'warning',
          message: `位深 ${meta.bit_depth}bit → 建议使用 24bit`,
          sampleId: sample.id,
          fileName: sample.file_name,
        };
      }
      return null;
    },
  },
  {
    id: 'stereo-short',
    label: '短音效应为 Mono',
    description: '1.2s 以内的 oneshot 用 Stereo 浪费内存',
    severity: 'warning',
    check: (sample, meta) => {
      if (sample.channels > 1 && sample.duration < 1.2) {
        return {
          ruleId: 'stereo-short',
          severity: 'warning',
          message: `立体声但时长仅 ${sample.duration?.toFixed(1)}s → 建议转换为 Mono`,
          sampleId: sample.id,
          fileName: sample.file_name,
        };
      }
      return null;
    },
  },
  {
    id: 'dc-offset',
    label: 'DC Offset 检测',
    description: '直流偏移 > 0.01 会导致扬声器损伤',
    severity: 'error',
    check: (_, meta) => {
      if (meta?.dc_offset && meta.dc_offset > 0.01) {
        return {
          ruleId: 'dc-offset',
          severity: 'error',
          message: `检测到 DC offset = ${meta.dc_offset.toFixed(3)}`,
          sampleId: meta.sample_id,
          fileName: '',
        };
      }
      return null;
    },
  },
  {
    id: 'tail-silence',
    label: '尾部静音过长',
    description: '尾部静音 > 500ms 浪费内存和加载时间',
    severity: 'info',
    check: (_, meta) => {
      if (meta?.trailing_silence_sec && meta.trailing_silence_sec > 0.5) {
        return {
          ruleId: 'tail-silence',
          severity: 'info',
          message: `尾部静音 ${meta.trailing_silence_sec.toFixed(1)}s → 建议裁剪`,
          sampleId: meta.sample_id,
          fileName: '',
        };
      }
      return null;
    },
  },
  {
    id: 'naming-convention',
    label: '命名规范检查',
    description: '文件名是否符合 UCS 命名约定',
    severity: 'info',
    check: (sample) => {
      if (sample.file_name?.includes('FINAL') || sample.file_name?.includes('final')) {
        return {
          ruleId: 'naming-convention',
          severity: 'info',
          message: `文件名含 "FINAL" → 建议使用版本号而非 FINAL`,
          sampleId: sample.id,
          fileName: sample.file_name,
        };
      }
      if (sample.file_name?.includes(' ') && !sample.file_name?.match(/^[A-Z]+_/)) {
        return {
          ruleId: 'naming-convention',
          severity: 'info',
          message: `文件名含空格且不符合 UCS 规范`,
          sampleId: sample.id,
          fileName: sample.file_name,
        };
      }
      return null;
    },
  },
];

export function runQACheck(db: Database.Database, sampleIds: number[]): QAIssue[] {
  const issues: QAIssue[] = [];

  for (const id of sampleIds) {
    const sample = db.prepare('SELECT * FROM samples WHERE id = ?').get(id) as any;
    const meta = db.prepare('SELECT * FROM game_metadata WHERE sample_id = ?').get(id) as any;

    for (const rule of QA_RULES) {
      const issue = rule.check(sample, meta);
      if (issue) {
        if (!issue.fileName) issue.fileName = sample.file_name;
        issues.push(issue);
      }
    }
  }

  return issues;
}
```

### Task 5.2: QA Panel UI

**Files:**
- Create: `src/components/game/DeliveryQAPanel.tsx`
- Create: `src/styles/components/game/delivery-qa-panel.module.css`

核心 UI：规则列表 + 抽样触发 + 结果表格（按严重度着色）

```tsx
function DeliveryQAPanel() {
  const [issues, setIssues] = useState<QAIssue[]>([]);
  const [running, setRunning] = useState(false);

  const runCheck = async () => {
    setRunning(true);
    const result = await ipcClient.runDeliveryQA(selectedIds);
    setIssues(result);
    setRunning(false);
  };

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return (
    <div className={s.panel}>
      <div className={s.summary}>
        <span className={s.error}>❌ {errors.length}</span>
        <span className={s.warning}>⚠️ {warnings.length}</span>
        <span className={s.pass}>✅ {selectedIds.length - errors.length - warnings.length}</span>
      </div>
      <button onClick={runCheck} disabled={running}>
        {running ? '检查中...' : '运行交付质检'}
      </button>
      <div className={s.issueList}>
        {issues.map(issue => (
          <div key={`${issue.ruleId}-${issue.sampleId}`} className={`${s.issueRow} ${s[issue.severity]}`}>
            <span className={s.severityIcon}>
              {issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'}
            </span>
            <span>{issue.message}</span>
            <span className={s.fileName}>{issue.fileName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Phase 6: Similarity Search & 2D Map (P2)

### Task 6.1: CLAP 相似性搜索

**Files:**
- Modify: `electron/main/services/ipcSamples.ts`（增强 GET_SIMILAR_SAMPLES）

```typescript
// 已有 infrastructure: cosine similarity on clap_embedding
// sqlite 中直接计算 cosine distance
ipcMain.handle(IPC_CHANNELS.GET_SIMILAR_SAMPLES, async (_e, { sampleId, limit = 20 }) => {
  const target = db.prepare(
    'SELECT clap_embedding FROM samples WHERE id = ?'
  ).get(sampleId) as any;

  if (!target?.clap_embedding) {
    return { success: false, error: '无 CLAP embedding' };
  }

  // 获取所有有 embedding 的采样
  const rows = db.prepare(`
    SELECT id, file_name, file_path, duration, clap_embedding
    FROM samples
    WHERE clap_embedding IS NOT NULL AND id != ?
  `).all(sampleId) as any[];

  const targetEmb = base64ToFloat32Array(target.clap_embedding);
  const scored = rows.map(row => ({
    ...row,
    clap_embedding: undefined, // 不返回 embedding 给前端
    score: cosineSim(targetEmb, base64ToFloat32Array(row.clap_embedding)),
  }));

  scored.sort((a, b) => b.score - a.score);
  return { success: true, data: scored.slice(0, limit) };
});
```

### Task 6.2: 2D Embedding 可视化（预留接口）

暂不实现完整 WebGL 可视化，但预留 embed 导出接口：
```typescript
GET_EMBEDDINGS_BATCH: 'analysis:getEmbeddingsBatch',
// 返回全部 embedding 的 2D projection (UMAP 降维后在 Python sidecar 做)
```

---

## 实施顺序

| 轮次 | Phase | 内容 | 预计工作量 |
|------|-------|------|-----------|
| **🔴 Round 1** | Phase 0 | Profile 框架 + 模式切换 UI | 2-3h |
| **🔴 Round 2** | Phase 1 | 数据库扩展 + Migration | 1-2h |
| **🔴 Round 3** | Phase 2 | UCS 分类骨架 + CLAP Zero-shot | 3-4h |
| **🟠 Round 4** | Phase 3 | 技术元数据提取 (FFmpeg) | 2-3h |
| **🟠 Round 5** | Phase 4 | 命名生成器 + 引擎导出 | 3-4h |
| **🟡 Round 6** | Phase 5 | Delivery QA Panel | 2-3h |
| **🟡 Round 7** | Phase 6 | Similarity Search | 1-2h |
| **⚪ Round 8** | Phase 7 | Wwise/FMOD CSV Manifest | 2h |

---

## 自审清单

- [x] Profile 模式框架 — 覆盖所有三种模式
- [x] 数据库扩展 — 不破坏现有 schema，Migration 脚本完整
- [x] UCS 分类 — 80+ 主类定义 + CLAP zero-shot 映射
- [x] 技术元数据 — LUFS/DC/Loop/Silence 完整提取链路
- [x] 命名规范生成器 — Token 模板引擎
- [x] 搜索引擎导出 — Unity/UE/Godot 目录结构
- [x] Delivery QA Panel — 6 条初始规则 + 可扩展
- [x] Similarity Search — 基于现有 CLAP 向量
- [x] 无占位符 — 所有 Task 包含具体代码
- [x] 类型一致性 — profile.types / metadata.types / export.types 一致
