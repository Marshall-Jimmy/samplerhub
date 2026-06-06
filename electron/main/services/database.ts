import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../../drizzle/schema';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let Database: any;
let dbLoadError: string = '';
try {
  Database = require('better-sqlite3');
} catch (err) {
  dbLoadError = (err as Error).message;
  console.warn('better-sqlite3 not available:', dbLoadError);
}

let db: ReturnType<typeof drizzle> | null = null;
let sqlite: any = null;

export function getDatabase() {
  if (!db) {
    if (!Database) {
      throw new Error(`Database module not available: ${dbLoadError}`);
    }
    const dbPath = path.join(app.getPath('userData'), 'samplerhub.db');
    sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
  }
  return db;
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
let backupTimer: ReturnType<typeof setInterval> | null = null;

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

export function initDatabase(): void {
  const d = getDatabase();
  const s = getSqlite();

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
      indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
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

    INSERT OR IGNORE INTO categories (id, name, is_system, sort_order) VALUES
      (1, 'Kick', 1, 1),
      (2, 'Snare', 1, 2),
      (3, 'Clap', 1, 3),
      (4, 'Hi-Hat', 1, 4),
      (5, 'Open Hat', 1, 5),
      (6, '808 Bass', 1, 6),
      (7, 'Percussion', 1, 7),
      (8, 'Rim', 1, 8),
      (9, 'Bass', 1, 9),
      (10, 'Synth', 1, 10),
      (11, 'Vocal', 1, 11),
      (12, 'FX', 1, 12),
      (13, 'Drum Loop', 1, 13),
      (14, 'Top Loop', 1, 14),
      (15, 'Shaker', 1, 15),
      (16, 'Pad', 1, 16),
      (17, 'Loop', 1, 17),
      (18, 'One Shot', 1, 18),
      (19, 'Uncategorized', 1, 99);

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
      ('One Shot - folder', 'one shots|oneshot', 'folder', 18, 70, 1);

    -- FTS5 全文搜索虚拟表
    CREATE VIRTUAL TABLE IF NOT EXISTS samples_fts USING fts5(
      file_name,
      tags,
      category_name,
      content='samples',
      content_rowid='id'
    );

    -- FTS 同步触发器已移除，改为扫描后批量重建

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
  `);

  // 迁移：添加 is_corrupted 列（如果不存在）
  try {
    s.exec(`ALTER TABLE samples ADD COLUMN is_corrupted INTEGER DEFAULT 0`);
  } catch {
    // 列已存在，忽略
  }

  // 迁移：添加 file_type 列（区分音频/MIDI）
  try {
    s.exec(`ALTER TABLE samples ADD COLUMN file_type TEXT NOT NULL DEFAULT 'audio'`);
  } catch {
    // 列已存在，忽略
  }

  // 迁移：添加 MIDI 专属字段
  try {
    s.exec(`ALTER TABLE samples ADD COLUMN midi_track_count INTEGER`);
  } catch {}
  try {
    s.exec(`ALTER TABLE samples ADD COLUMN midi_note_count INTEGER`);
  } catch {}
  try {
    s.exec(`ALTER TABLE samples ADD COLUMN midi_instruments TEXT`);
  } catch {}
  try {
    s.exec(`ALTER TABLE samples ADD COLUMN midi_time_signature TEXT`);
  } catch {}

  // 迁移：将已有的 MIDI 文件标记为 midi 类型
  try {
    s.exec(`UPDATE samples SET file_type = 'midi' WHERE file_name LIKE '%.mid' OR file_name LIKE '%.midi'`);
  } catch {}
}

/** 批量重建 FTS5 索引（扫描完成后调用，替代逐行触发器） */
export function rebuildFtsIndex(): void {
  const s = getSqlite();
  const start = Date.now();
  s.exec(`
    INSERT INTO samples_fts(samples_fts) VALUES ('rebuild');
  `);
  console.log(`[Perf] FTS rebuild took ${Date.now() - start}ms`);
}
