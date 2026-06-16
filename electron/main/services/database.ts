import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../../drizzle/schema';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

var Database: any;
var dbLoadError: string = '';
try {
  Database = require('better-sqlite3');
} catch (err) {
  dbLoadError = (err as Error).message;
  console.warn('better-sqlite3 not available:', dbLoadError);
}

var db: ReturnType<typeof drizzle> | null = null;
var sqlite: any = null;

var isDatabaseInitialized = false;

export function getDatabase() {
  if (!db) {
    if (!Database) {
      throw new Error(`Database module not available: ${dbLoadError}`);
    }
    const dbPath = path.join(app.getPath('userData'), 'samplerhub.db');
    sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
  }
  return db;
}

/**
 * 重置数据库连接（用于备份恢复后）
 */
export function resetDatabaseConnection() {
  try { sqlite?.close() } catch {}
  db = null;
  sqlite = null;
}

export function getSqlite() {
  if (!sqlite) {
    getDatabase();
  }
  return sqlite;
}

/** 获取数据库文件路径 */
export function getDbPath(): string {
  return path.join(app.getPath('userData'), 'samplerhub.db');
}

/** 备份数据库到用户目录/backups */
export function backupDatabase(): string {
  const dbPath = getDbPath();
  const backupDir = path.join(app.getPath('userData'), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `samplerhub-${timestamp}.db`);

  // 使用 SQLite backup API（安全在线备份）
  const s = getSqlite();
  s.backup(backupPath);

  // 清理旧备份，保留最近 10 个
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('samplerhub-') && f.endsWith('.db'))
    .sort()
    .reverse();
  for (let i = 10; i < backups.length; i++) {
    fs.unlinkSync(path.join(backupDir, backups[i]));
  }

  return backupPath;
}

/** 启动定时备份（每 24 小时） */
var backupTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoBackup(): void {
  // 首次启动延迟 5 分钟备份，避免影响启动性能
  setTimeout(() => {
    try {
      backupDatabase();
      console.log('[Backup] Initial backup completed');
    } catch (err) {
      console.error('[Backup] Initial backup failed:', err);
    }
  }, 5 * 60 * 1000);

  // 每 24 小时备份一次
  backupTimer = setInterval(() => {
    try {
      const path = backupDatabase();
      console.log('[Backup] Scheduled backup completed:', path);
    } catch (err) {
      console.error('[Backup] Scheduled backup failed:', err);
    }
  }, 24 * 60 * 60 * 1000);
}

export function stopAutoBackup(): void {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}

// 数据库 schema 版本，每次新增迁移时递增
const DB_SCHEMA_VERSION = 2;

function getDbVersion(s: any): number {
  try {
    return s.prepare('PRAGMA user_version').pluck().get() as number;
  } catch { return 0; }
}

function setDbVersion(s: any, v: number): void {
  s.prepare(`PRAGMA user_version = ${v}`).run();
}

export async function initDatabase(): Promise<void> {
  if (isDatabaseInitialized) return;

  // 先确保数据库连接已创建
  getDatabase();
  const s = getSqlite();
  const startTime = Date.now();
  let stepStart = startTime;

  // --- a. 快速路径：检查 schema 版本，已初始化则跳过重型操作 ---
  const currentVersion = getDbVersion(s);
  if (currentVersion >= DB_SCHEMA_VERSION) {
    console.log(`[DB] Schema v${currentVersion} already up to date, skipping init (${Date.now() - startTime}ms)`);
    isDatabaseInitialized = true;
    return;
  }
  console.log(`[DB] Schema upgrade: v${currentVersion} -> ${DB_SCHEMA_VERSION}`);

  // --- a2. 增量迁移：只执行版本间差异，不重跑全量初始化 ---
  if (currentVersion >= 1 && currentVersion < 2) {
    stepStart = Date.now();
    console.log('[DB] Applying v1->v2 incremental migrations...');
    // v2: 添加排序索引
    try { s.exec(`CREATE INDEX IF NOT EXISTS idx_samples_created_at ON samples(created_at)`); } catch {}
    try { s.exec(`CREATE INDEX IF NOT EXISTS idx_samples_file_name ON samples(file_name)`); } catch {}
    setDbVersion(s, 2);
    console.log(`[DB] v1->v2 migrations completed in ${Date.now() - stepStart}ms`);
    return;
  }

  // --- a3. 首次创建数据库时，批量更新 samples 的 category_id ---
  // 此逻辑只在全新数据库（currentVersion === 0）时执行
  if (currentVersion === 0) {
    stepStart = Date.now();
    console.log('[DB] First-time init: batch updating sample category_ids...');
    try {
      // 获取所有分类，构建名称到 id 的映射
      const allCategories = s.prepare('SELECT id, name FROM categories').all();
      const categoryMap = new Map(allCategories.map((c: any) => [c.name, c.id]));

      // 获取所有需要更新 category_id 的 samples（category_id IS NULL 或 0 的情况）
      const samplesToUpdate = s.prepare('SELECT id, file_name FROM samples WHERE category_id IS NULL OR category_id = 0').all();

      if (samplesToUpdate && (samplesToUpdate as any[]).length > 0) {
        // 简单的文件名分类匹配逻辑
        const classifySample = (fileName: string): string | null => {
          const lower = fileName.toLowerCase();
          if (/808|sub bass|subbass/.test(lower)) return '808 Bass';
          if (/kick|bd|bass drum/.test(lower)) return 'Kick';
          if (/snare|sd/.test(lower)) return 'Snare';
          if (/clap/.test(lower)) return 'Clap';
          if (/hi.?hat|hihat|closed hat|hh/.test(lower)) return 'Hi-Hat';
          if (/open hat|openhat/.test(lower)) return 'Open Hat';
          if (/perc|conga|bongo|tabala|tamb/.test(lower)) return 'Percussion';
          if (/rim/.test(lower)) return 'Rim';
          if (/bass/.test(lower)) return 'Sub Bass';
          if (/synth|chord|pluck|lead/.test(lower)) return 'Synth Lead';
          if (/vocal|vox|voice|chant|choir/.test(lower)) return 'Vocal';
          if (/fx|sfx|effect|impact|riser|faller|transition|whoosh|glitch|foley|sweep/.test(lower)) return 'FX';
          if (/drum loop|drumloop|full drum|drum break/.test(lower)) return 'Drum Loop';
          if (/top loop|no kick|no_kick/.test(lower)) return 'Top Loop';
          if (/shaker/.test(lower)) return 'Shaker';
          if (/pad|atmosphere|ambient|texture/.test(lower)) return 'Pad';
          if (/loop|full mix|construction/.test(lower)) return 'Loop';
          if (/one shot|oneshot|one_shot/.test(lower)) return 'One Shot';
          if (/piano|keys|key|rhodes|epiano/.test(lower)) return 'Piano';
          if (/guitar|gtr|acoustic/.test(lower)) return 'Guitar';
          if (/electric guitar|el gtr|distorted/.test(lower)) return 'Electric Guitar';
          if (/violin|fiddle|viola/.test(lower)) return 'Violin';
          if (/strings|string|ensemble|orchestra/.test(lower)) return 'Strings';
          if (/brass|trumpet|trombone|horn|tuba/.test(lower)) return 'Brass';
          if (/flute|recorder/.test(lower)) return 'Flute';
          if (/sax|saxophone/.test(lower)) return 'Saxophone';
          if (/organ|hammond|b3/.test(lower)) return 'Organ';
          return null;
        };

        // 批量更新：每批 500 条，减少事务开销
        const BATCH_SIZE = 500;
        const sampleList = samplesToUpdate as any[];
        let updatedCount = 0;

        for (let i = 0; i < sampleList.length; i += BATCH_SIZE) {
          const batch = sampleList.slice(i, i + BATCH_SIZE);
          const updateStmt = s.prepare('UPDATE samples SET category_id = ? WHERE id = ?');

          s.transaction(() => {
            for (const sample of batch) {
              const matchedCategory = classifySample(sample.file_name || '');
              const categoryId = matchedCategory ? categoryMap.get(matchedCategory) : null;
              if (categoryId) {
                updateStmt.run(categoryId, sample.id);
                updatedCount++;
              }
            }
          })();
        }

        console.log(`[DB] Updated ${updatedCount} sample category_ids in ${Date.now() - stepStart}ms`);
      } else {
        console.log('[DB] No samples need category_id update');
      }
    } catch (err) {
      console.error('[DB] Category update error:', err);
    }
  }

  // --- b. Tables + indexes + categories + rules creation ---
  stepStart = Date.now();
  s.exec(`
    CREATE TABLE IF NOT EXISTS watched_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      last_scan_at INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      parent_id INTEGER REFERENCES categories(id),
      is_system INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      modified_at INTEGER NOT NULL,
      duration REAL NOT NULL DEFAULT 0,
      sample_rate INTEGER NOT NULL DEFAULT 0,
      bit_rate INTEGER NOT NULL DEFAULT 0,
      channels INTEGER NOT NULL DEFAULT 0,
      bpm REAL,
      key TEXT,
      category_id INTEGER REFERENCES categories(id),
      waveform_data BLOB,
      is_corrupted INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      play_count INTEGER DEFAULT 0,
      last_played_at INTEGER,
      indexed_at INTEGER NOT NULL DEFAULT (unixepoch()),
      file_type TEXT NOT NULL DEFAULT 'audio',
      midi_track_count INTEGER,
      midi_note_count INTEGER,
      midi_instruments TEXT,
      midi_time_signature TEXT,
      tags TEXT,
      feature_vector TEXT,
      rating INTEGER,
      notes TEXT,
      clap_embedding TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT '#1890ff',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sample_tags (
      sample_id INTEGER NOT NULL REFERENCES samples(id),
      tag_id INTEGER NOT NULL REFERENCES tags(id),
      PRIMARY KEY (sample_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS classification_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pattern TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      target_category_id INTEGER NOT NULL REFERENCES categories(id),
      priority INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS recent_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id INTEGER NOT NULL REFERENCES samples(id),
      played_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      cover_color TEXT DEFAULT '#6366F1',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS playlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(playlist_id, sample_id)
    );

    -- 父分类（分组）
    INSERT OR IGNORE INTO categories (id, name, is_system, sort_order) VALUES
      (100, 'Drums', 1, 1),
      (101, 'Bass', 1, 2),
      (102, 'Synths', 1, 3),
      (103, 'Instruments', 1, 4),
      (104, 'Loops', 1, 5),
      (105, 'Vocal & FX', 1, 6),
      (106, 'Uncategorized', 1, 99);

    -- Drums 子分类
    INSERT OR IGNORE INTO categories (id, name, parent_id, is_system, sort_order) VALUES
      (1, 'Kick', 100, 1, 1),
      (2, 'Snare', 100, 1, 2),
      (3, 'Clap', 100, 1, 3),
      (4, 'Hi-Hat', 100, 1, 4),
      (5, 'Open Hat', 100, 1, 5),
      (7, 'Percussion', 100, 1, 6),
      (8, 'Rim', 100, 1, 7),
      (15, 'Shaker', 100, 1, 8),
      (20, 'Tom', 100, 1, 9),
      (21, 'Cymbal', 100, 1, 10),
      (22, 'Crash', 100, 1, 11),
      (23, 'Ride', 100, 1, 12);

    -- Bass 子分类
    INSERT OR IGNORE INTO categories (id, name, parent_id, is_system, sort_order) VALUES
      (6, '808 Bass', 101, 1, 1),
      (9, 'Sub Bass', 101, 1, 2),
      (24, 'Acoustic Bass', 101, 1, 3);

    -- Synths 子分类
    INSERT OR IGNORE INTO categories (id, name, parent_id, is_system, sort_order) VALUES
      (10, 'Synth Lead', 102, 1, 1),
      (16, 'Pad', 102, 1, 2),
      (25, 'Pluck', 102, 1, 3),
      (26, 'Arp', 102, 1, 4),
      (27, 'Chord', 102, 1, 5),
      (28, 'Stab', 102, 1, 6);

    -- Instruments 子分类（钢琴、吉他、弦乐等）
    INSERT OR IGNORE INTO categories (id, name, parent_id, is_system, sort_order) VALUES
      (30, 'Piano', 103, 1, 1),
      (31, 'Guitar', 103, 1, 2),
      (32, 'Electric Guitar', 103, 1, 3),
      (33, 'Bass Guitar', 103, 1, 4),
      (34, 'Violin', 103, 1, 5),
      (35, 'Cello', 103, 1, 6),
      (36, 'Strings', 103, 1, 7),
      (37, 'Brass', 103, 1, 8),
      (38, 'Woodwind', 103, 1, 9),
      (39, 'Organ', 103, 1, 10),
      (40, 'Flute', 103, 1, 11),
      (41, 'Saxophone', 103, 1, 12);

    -- Loops 子分类
    INSERT OR IGNORE INTO categories (id, name, parent_id, is_system, sort_order) VALUES
      (13, 'Drum Loop', 104, 1, 1),
      (14, 'Top Loop', 104, 1, 2),
      (17, 'Loop', 104, 1, 3),
      (42, 'Instrument Loop', 104, 1, 4),
      (43, 'Vocal Loop', 104, 1, 5);

    -- Vocal & FX 子分类
    INSERT OR IGNORE INTO categories (id, name, parent_id, is_system, sort_order) VALUES
      (11, 'Vocal', 105, 1, 1),
      (44, 'Vocal Chop', 105, 1, 2),
      (12, 'FX', 105, 1, 3),
      (45, 'Riser', 105, 1, 4),
      (46, 'Impact', 105, 1, 5),
      (47, 'Sweep', 105, 1, 6),
      (48, 'Transition', 105, 1, 7),
      (18, 'One Shot', 105, 1, 8);

    -- 强制修复已有记录的 parent_id 和 name（兼容旧数据库升级）
    UPDATE categories SET parent_id = 100, name = 'Kick' WHERE id = 1;
    UPDATE categories SET parent_id = 100, name = 'Snare' WHERE id = 2;
    UPDATE categories SET parent_id = 100, name = 'Clap' WHERE id = 3;
    UPDATE categories SET parent_id = 100, name = 'Hi-Hat' WHERE id = 4;
    UPDATE categories SET parent_id = 100, name = 'Open Hat' WHERE id = 5;
    UPDATE categories SET parent_id = 101, name = '808 Bass' WHERE id = 6;
    UPDATE categories SET parent_id = 100, name = 'Percussion' WHERE id = 7;
    UPDATE categories SET parent_id = 100, name = 'Rim' WHERE id = 8;
    UPDATE categories SET parent_id = 101, name = 'Sub Bass' WHERE id = 9;
    UPDATE categories SET parent_id = 102, name = 'Synth Lead' WHERE id = 10;
    UPDATE categories SET parent_id = 105, name = 'Vocal' WHERE id = 11;
    UPDATE categories SET parent_id = 105, name = 'FX' WHERE id = 12;
    UPDATE categories SET parent_id = 104, name = 'Drum Loop' WHERE id = 13;
    UPDATE categories SET parent_id = 104, name = 'Top Loop' WHERE id = 14;
    UPDATE categories SET parent_id = 100, name = 'Shaker' WHERE id = 15;
    UPDATE categories SET parent_id = 102, name = 'Pad' WHERE id = 16;
    UPDATE categories SET parent_id = 104, name = 'Loop' WHERE id = 17;
    UPDATE categories SET parent_id = 105, name = 'One Shot' WHERE id = 18;
    -- 旧 Uncategorized(19) 已不存在，样本会被数据修复逻辑迁移到 106

    INSERT OR IGNORE INTO classification_rules (name, pattern, rule_type, target_category_id, priority, is_active) VALUES
      -- 808 必须在 Bass 之前匹配，避免 808 被归入普通 Bass
      ('808 Bass - keyword', '808|808s|sub bass|subbass|sub hit|sub drop', 'keyword', 6, 200, 1),
      ('808 Bass - folder', '808|808s|sub', 'folder', 6, 200, 1),
      ('808 Bass - bracket', '\\[808\\]|\\(808\\)', 'regex', 6, 210, 1),
      -- Kick
      ('Kick - keyword', 'kick|kicks|bd|bass drum', 'keyword', 1, 150, 1),
      ('Kick - folder', 'kick|kicks', 'folder', 1, 150, 1),
      ('Kick - bracket', '\\[kick\\]|\\(kick\\)', 'regex', 1, 155, 1),
      -- Snare
      ('Snare - keyword', 'snare|snares|sd', 'keyword', 2, 150, 1),
      ('Snare - folder', 'snare|snares', 'folder', 2, 150, 1),
      ('Snare - bracket', '\\[snare\\]|\\(snare\\)', 'regex', 2, 155, 1),
      -- Clap
      ('Clap - keyword', 'clap|claps', 'keyword', 3, 150, 1),
      ('Clap - folder', 'clap|claps', 'folder', 3, 150, 1),
      ('Clap - bracket', '\\[clap\\]|\\(clap\\)', 'regex', 3, 155, 1),
      -- Hi-Hat (closed)
      ('Hi-Hat - keyword', 'hi hat|hihat|hi-hat|closed hat|hh', 'keyword', 4, 150, 1),
      ('Hi-Hat - folder', 'hi hat|hi-hat|hihat|hh|closed hat', 'folder', 4, 150, 1),
      ('Hi-Hat - bracket', '\\[hh\\]|\\(hh\\)|\\[hat\\]|\\(hat\\)', 'regex', 4, 155, 1),
      -- Open Hat
      ('Open Hat - keyword', 'open hat|openhat|open', 'keyword', 5, 150, 1),
      ('Open Hat - folder', 'open hat|open hat|openhat|open hats', 'folder', 5, 150, 1),
      -- Percussion
      ('Percussion - keyword', 'perc|percussion|conga|bongo|tabala|tamb', 'keyword', 7, 130, 1),
      ('Percussion - folder', 'perc|percussion|conga|bongo', 'folder', 7, 130, 1),
      -- Rim
      ('Rim - keyword', 'rim', 'keyword', 8, 140, 1),
      ('Rim - folder', 'rim', 'folder', 8, 140, 1),
      -- Bass (普通 Bass，排除 808)
      ('Bass - folder', 'bass|bass loops|bass one shots', 'folder', 9, 100, 1),
      ('Bass - keyword', 'bass', 'keyword', 9, 90, 1),
      -- Synth
      ('Synth - keyword', 'synth|chord|pluck|lead', 'keyword', 10, 120, 1),
      ('Synth - folder', 'synth|synth lead|synth pluck|chord', 'folder', 10, 120, 1),
      -- Vocal
      ('Vocal - keyword', 'vocal|vox|voice|chant|ad-lib|choir', 'keyword', 11, 120, 1),
      ('Vocal - folder', 'vocal|vox|voice|chant|vocals', 'folder', 11, 120, 1),
      -- FX
      ('FX - keyword', 'fx|sfx|effect|impact|riser|faller|transition|whoosh|glitch|foley|sweep', 'keyword', 12, 120, 1),
      ('FX - folder', 'fx|sfx|impacts|risers|foley|glitch', 'folder', 12, 120, 1),
      -- Drum Loop
      ('Drum Loop - keyword', 'drum loop|drumloop|full drum|drum break', 'keyword', 13, 140, 1),
      ('Drum Loop - folder', 'drum loops|drum fills', 'folder', 13, 140, 1),
      -- Top Loop
      ('Top Loop - keyword', 'top loop|no kick|no_kick', 'keyword', 14, 140, 1),
      ('Top Loop - folder', 'top loops', 'folder', 14, 140, 1),
      -- Shaker
      ('Shaker - keyword', 'shaker', 'keyword', 15, 130, 1),
      ('Shaker - folder', 'shaker', 'folder', 15, 130, 1),
      -- Pad / Atmosphere
      ('Pad - keyword', 'pad|atmosphere|ambient|texture', 'keyword', 16, 110, 1),
      ('Pad - folder', 'pads|atmospheres|ambient', 'folder', 16, 110, 1),
      -- Loop (通用，优先级最低)
      ('Loop - keyword', 'loop|full mix|construction', 'keyword', 17, 60, 1),
      ('Loop - folder', 'loops', 'folder', 17, 60, 1),
      -- One Shot
      ('One Shot - keyword', 'one shot|oneshot|one_shot', 'keyword', 18, 70, 1),
      ('One Shot - folder', 'one shots|oneshot', 'folder', 18, 70, 1),
      -- Instruments
      ('Piano - keyword', 'piano|keys|key|rhodes|epiano|electric piano', 'keyword', 30, 130, 1),
      ('Piano - folder', 'piano|keys|rhodes', 'folder', 30, 130, 1),
      ('Guitar - keyword', 'guitar|gtr|acoustic guitar|ac gtr', 'keyword', 31, 130, 1),
      ('Guitar - folder', 'guitar|gtr|acoustic', 'folder', 31, 130, 1),
      ('Electric Guitar - keyword', 'electric guitar|el gtr|distorted guitar|clean guitar|overdriven', 'keyword', 32, 130, 1),
      ('Electric Guitar - folder', 'electric guitar|el gtr|distorted', 'folder', 32, 130, 1),
      ('Violin - keyword', 'violin|fiddle|viola', 'keyword', 34, 130, 1),
      ('Violin - folder', 'violin|strings|viola', 'folder', 34, 130, 1),
      ('Strings - keyword', 'strings|string|ensemble|orchestra|orchestral', 'keyword', 36, 120, 1),
      ('Strings - folder', 'strings|orchestral|ensemble', 'folder', 36, 120, 1),
      ('Brass - keyword', 'brass|trumpet|trombone|horn|tuba', 'keyword', 37, 130, 1),
      ('Brass - folder', 'brass|trumpet|trombone', 'folder', 37, 130, 1),
      ('Flute - keyword', 'flute|flutes|recorder', 'keyword', 40, 130, 1),
      ('Flute - folder', 'flute', 'folder', 40, 130, 1),
      ('Saxophone - keyword', 'sax|saxophone|saxs', 'keyword', 41, 130, 1),
      ('Saxophone - folder', 'sax|saxophone', 'folder', 41, 130, 1),
      ('Organ - keyword', 'organ|hammond|b3|church organ', 'keyword', 39, 130, 1),
      ('Organ - folder', 'organ|hammond', 'folder', 39, 130, 1),
      -- FX subtypes
      ('Riser - keyword', 'riser|risers|rise|build|buildup|build up', 'keyword', 45, 140, 1),
      ('Riser - folder', 'risers|buildups|build ups', 'folder', 45, 140, 1),
      ('Impact - keyword', 'impact|impacts|boom|hit|bang|downer', 'keyword', 46, 140, 1),
      ('Impact - folder', 'impacts|booms|hits', 'folder', 46, 140, 1),
      ('Sweep - keyword', 'sweep|sweeps|whoosh|wind', 'keyword', 47, 130, 1),
      ('Sweep - folder', 'sweeps|whooshes', 'folder', 47, 130, 1),
      ('Transition - keyword', 'transition|transitions|fill|fills', 'keyword', 48, 120, 1),
      ('Transition - folder', 'transitions|fills', 'folder', 48, 120, 1),
      ('Vocal Chop - keyword', 'vocal chop|vox chop|vocal slice', 'keyword', 44, 140, 1),
      ('Vocal Chop - folder', 'vocal chops|vox chops', 'folder', 44, 140, 1);

    -- 智能文件夹：保存搜索条件为动态虚拟文件夹
    CREATE TABLE IF NOT EXISTS smart_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      query TEXT NOT NULL DEFAULT '',
      filters TEXT NOT NULL DEFAULT '{}',
      icon TEXT DEFAULT 'folder',
      color TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- 使用统计：记录采样播放次数
    CREATE TABLE IF NOT EXISTS usage_stats (
      sample_id INTEGER PRIMARY KEY REFERENCES samples(id) ON DELETE CASCADE,
      play_count INTEGER NOT NULL DEFAULT 0,
      last_played_at INTEGER,
      first_played_at INTEGER
    );

    -- 性能索引
    CREATE INDEX IF NOT EXISTS idx_samples_category_id ON samples(category_id);
    CREATE INDEX IF NOT EXISTS idx_samples_is_favorite ON samples(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_samples_play_count ON samples(play_count DESC);
    CREATE INDEX IF NOT EXISTS idx_samples_file_path ON samples(file_path);
    CREATE INDEX IF NOT EXISTS idx_samples_file_hash ON samples(file_hash);
    CREATE INDEX IF NOT EXISTS idx_recent_samples_played_at ON recent_samples(played_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sample_tags_tag_id ON sample_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_id ON playlist_items(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_items_sample_id ON playlist_items(sample_id);

    -- 搜索/筛选复合索引
    CREATE INDEX IF NOT EXISTS idx_samples_bpm ON samples(bpm);
    CREATE INDEX IF NOT EXISTS idx_samples_key ON samples(key);
    CREATE INDEX IF NOT EXISTS idx_samples_duration ON samples(duration);
    CREATE INDEX IF NOT EXISTS idx_samples_category_favorite ON samples(category_id, is_favorite);
    CREATE INDEX IF NOT EXISTS idx_samples_modified_at ON samples(modified_at);

    -- 高性能复合索引：覆盖常用搜索组合
    CREATE INDEX IF NOT EXISTS idx_samples_search_combo ON samples(category_id, bpm, key, is_favorite, duration);
    CREATE INDEX IF NOT EXISTS idx_samples_clap ON samples(clap_embedding) WHERE clap_embedding IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_samples_feature ON samples(feature_vector) WHERE feature_vector IS NOT NULL;

    -- 排序索引：created_at 用于默认按日期排序
    CREATE INDEX IF NOT EXISTS idx_samples_created_at ON samples(created_at);

    -- UCS 游戏音效分类体系（兜底创建，确保迁移失败时也能工作）
    CREATE TABLE IF NOT EXISTS ucs_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cat_code TEXT NOT NULL UNIQUE,
      cat_name_zh TEXT NOT NULL,
      cat_name_en TEXT NOT NULL,
      clap_description TEXT NOT NULL,
      parent_id INTEGER,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ucs_subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cat_id INTEGER NOT NULL REFERENCES ucs_categories(id),
      code TEXT NOT NULL UNIQUE,
      name_zh TEXT NOT NULL,
      name_en TEXT NOT NULL,
      clap_description TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sample_ucs_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
      ucs_cat_id INTEGER,
      ucs_sub_id INTEGER,
      confidence REAL DEFAULT 0,
      is_confirmed INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
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
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sample_ucs_sample ON sample_ucs_tags(sample_id);
    CREATE INDEX IF NOT EXISTS idx_sample_ucs_cat ON sample_ucs_tags(ucs_cat_id);
    CREATE INDEX IF NOT EXISTS idx_game_metadata_sample ON game_metadata(sample_id);

    -- 样本-分类多对多关联（支持一个样本属于多个分类）
    CREATE TABLE IF NOT EXISTS sample_categories (
      sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      is_primary INTEGER DEFAULT 0,
      PRIMARY KEY (sample_id, category_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sample_categories_sample ON sample_categories(sample_id);
    CREATE INDEX IF NOT EXISTS idx_sample_categories_cat ON sample_categories(category_id);
  `);
  console.log(`[DB] Step b (tables+indexes+categories+rules) took ${Date.now() - stepStart}ms`);

  // --- c. FTS5 virtual table creation (separate to identify bottleneck) ---
  stepStart = Date.now();
  const fts5Exists = s.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='samples_fts'").get();
  if (!fts5Exists) {
    s.exec(`
      CREATE VIRTUAL TABLE samples_fts USING fts5(
        file_name,
        tags,
        content='samples',
        content_rowid='id'
      );
    `);
    console.log(`[DB] FTS5 virtual table created`);
  } else {
    console.log(`[DB] FTS5 virtual table already exists, skipped`);
  }
  console.log(`[DB] Step c (FTS5) took ${Date.now() - stepStart}ms`);

  // --- d. Column migrations (loop through ALTER TABLEs) ---
  stepStart = Date.now();
  const columnMigrations = [
    { col: 'is_corrupted', sql: `ALTER TABLE samples ADD COLUMN is_corrupted INTEGER DEFAULT 0` },
    { col: 'file_type', sql: `ALTER TABLE samples ADD COLUMN file_type TEXT NOT NULL DEFAULT 'audio'` },
    { col: 'midi_track_count', sql: `ALTER TABLE samples ADD COLUMN midi_track_count INTEGER` },
    { col: 'midi_note_count', sql: `ALTER TABLE samples ADD COLUMN midi_note_count INTEGER` },
    { col: 'midi_instruments', sql: `ALTER TABLE samples ADD COLUMN midi_instruments TEXT` },
    { col: 'midi_time_signature', sql: `ALTER TABLE samples ADD COLUMN midi_time_signature TEXT` },
    { col: 'tags', sql: `ALTER TABLE samples ADD COLUMN tags TEXT` },
    { col: 'feature_vector', sql: `ALTER TABLE samples ADD COLUMN feature_vector TEXT` },
    { col: 'rating', sql: `ALTER TABLE samples ADD COLUMN rating INTEGER` },
    { col: 'notes', sql: `ALTER TABLE samples ADD COLUMN notes TEXT` },
    { col: 'clap_embedding', sql: `ALTER TABLE samples ADD COLUMN clap_embedding TEXT` },
    { col: 'text_embedding', sql: `ALTER TABLE samples ADD COLUMN text_embedding BLOB` },
  ];
  for (const { col, sql } of columnMigrations) {
    try {
      s.exec(sql);
    } catch {
      // 列已存在，忽略
    }
  }
  console.log(`[DB] Step d (column migrations) took ${Date.now() - stepStart}ms`);

  // --- e. Conditional data fixes (check before UPDATE) ---
  stepStart = Date.now();
  // 迁移：将已有的 MIDI 文件标记为 midi 类型（条件执行）
  try {
    const midiCount = s.prepare(`SELECT COUNT(*) as cnt FROM samples WHERE file_type = 'audio' AND (file_name LIKE '%.mid' OR file_name LIKE '%.midi')`).get() as { cnt: number };
    if (midiCount && midiCount.cnt > 0) {
      s.exec(`UPDATE samples SET file_type = 'midi' WHERE file_type = 'audio' AND (file_name LIKE '%.mid' OR file_name LIKE '%.midi')`);
      console.log(`[DB] Fixed ${midiCount.cnt} MIDI file type(s)`);
    }
  } catch {}
  console.log(`[DB] Step e (conditional data fixes) took ${Date.now() - stepStart}ms`);

  // --- f. SQL file migrations (keep existing logic) ---
  stepStart = Date.now();
  try {
    const { fileURLToPath } = await import('node:url');
    const _selfPath = fileURLToPath(import.meta.url);
    const appRoot = process.env.APP_ROOT || path.join(path.dirname(_selfPath), '../..');
    const migrationsDir = path.join(appRoot, 'drizzle', 'migrations');
    console.log(`[DB] Migrations dir: ${migrationsDir}, exists: ${fs.existsSync(migrationsDir)}`);

    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of migrationFiles) {
        try {
          const applied = s.prepare(
            'SELECT 1 FROM migrations WHERE name = ?'
          ).get(file);

          if (applied) continue;

          console.log(`[DB] Applying migration: ${file}`);
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
          s.exec(sql);
          s.prepare('INSERT OR IGNORE INTO migrations (name) VALUES (?)').run(file);
          console.log(`[DB] Migration ${file} applied successfully`);
        } catch (migrationErr) {
          console.error(`[DB] Migration ${file} failed:`, migrationErr);
        }
      }
    } else {
      console.warn(`[DB] Migrations directory not found: ${migrationsDir}`);
    }
  } catch (err) {
    console.error('[DB] Migration error:', err);
  }
  console.log(`[DB] Step f (SQL file migrations) took ${Date.now() - stepStart}ms`);

  // --- g. Auxiliary tables (analysis_sessions, audio_segments, etc.) ---
  stepStart = Date.now();
  try {
    s.exec(`
      CREATE TABLE IF NOT EXISTS analysis_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        config TEXT NOT NULL,
        total_files INTEGER NOT NULL DEFAULT 0,
        completed_files INTEGER NOT NULL DEFAULT 0,
        failed_files INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        estimated_time_ms INTEGER,
        elapsed_time_ms INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  } catch {}
  try {
    s.exec(`
      CREATE TABLE IF NOT EXISTS analysis_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
        sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
        task_type TEXT NOT NULL DEFAULT 'full',
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        started_at INTEGER,
        completed_at INTEGER,
        duration_ms INTEGER,
        created_at INTEGER NOT NULL
      )
    `);
  } catch {}
  try {
    s.exec(`CREATE INDEX IF NOT EXISTS idx_analysis_queue_session ON analysis_queue(session_id, status)`);
  } catch {}
  try {
    s.exec(`
      CREATE TABLE IF NOT EXISTS audio_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        display_label TEXT,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        peak_prob REAL NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  } catch {}
  try {
    s.exec(`CREATE INDEX IF NOT EXISTS idx_audio_segments_sample ON audio_segments(sample_id)`);
  } catch {}
  try {
    s.exec(`CREATE INDEX IF NOT EXISTS idx_samples_tags ON samples(tags)`);
  } catch {}
  console.log(`[DB] Step g (auxiliary tables) took ${Date.now() - stepStart}ms`);

  // --- h. 数据修复：将旧的 category_id 映射到新的层级体系（条件执行） ---
  stepStart = Date.now();
  try {
    const oldUncategorized = s.prepare('SELECT COUNT(*) as cnt FROM samples WHERE category_id = 19').get() as { cnt: number };
    if (oldUncategorized && oldUncategorized.cnt > 0) {
      const fixResult = s.prepare('UPDATE samples SET category_id = 106 WHERE category_id = 19').run();
      console.log(`[DB] Fixed ${fixResult.changes} samples from old Uncategorized(19) to new(106)`);
    }
  } catch (fixErr) {
    console.error('[DB] Data fix error:', fixErr);
  }
  console.log(`[DB] Step h (data fixes) took ${Date.now() - stepStart}ms`);

  // --- i. 标记 schema 已初始化完成 ---
  setDbVersion(s, DB_SCHEMA_VERSION);
  isDatabaseInitialized = true;
  console.log(`[DB] Init completed in ${Date.now() - startTime}ms`);
}

/**
 * 重置数据库：删除数据库文件并重新初始化
 * 警告：这会删除所有数据！调用前必须确认用户已备份
 */
export function resetDatabase(): void {
  // 关闭现有连接
  if (sqlite) {
    try { sqlite.close(); } catch {}
    sqlite = null;
    db = null;
  }

  const dbPath = getDbPath();
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';

  // 删除数据库文件
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(walPath); } catch {}
  try { fs.unlinkSync(shmPath); } catch {}

  // 重置初始化标志，否则 initDatabase() 会直接返回
  isDatabaseInitialized = false;

  // 重新初始化
  initDatabase();
}

/** 批量重建 FTS5 索引（扫描完成后调用，替代逐行触发器） */
export function rebuildFtsIndex(): void {
  try {
    const s = getSqlite();
    const start = Date.now();
    s.exec(`
      INSERT INTO samples_fts(samples_fts) VALUES ('rebuild');
    `);
    console.log(`[Perf] FTS rebuild took ${Date.now() - start}ms`);
  } catch (err) {
    console.error('[FTS] Rebuild failed:', err);
  }
}
