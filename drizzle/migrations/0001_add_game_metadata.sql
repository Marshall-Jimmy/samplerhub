-- UCS 分类表
CREATE TABLE IF NOT EXISTS ucs_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cat_code TEXT NOT NULL UNIQUE,
  cat_name_zh TEXT NOT NULL,
  cat_name_en TEXT NOT NULL,
  clap_description TEXT NOT NULL,
  parent_id INTEGER,
  sort_order INTEGER DEFAULT 0
);

-- UCS 子分类表
CREATE TABLE IF NOT EXISTS ucs_subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cat_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  clap_description TEXT NOT NULL
);

-- 采样-UCS 映射
CREATE TABLE IF NOT EXISTS sample_ucs_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_id INTEGER NOT NULL,
  ucs_cat_id INTEGER,
  ucs_sub_id INTEGER,
  confidence REAL DEFAULT 0,
  is_confirmed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 游戏技术元数据
CREATE TABLE IF NOT EXISTS game_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_id INTEGER NOT NULL UNIQUE,
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

-- Migration 跟踪表
CREATE TABLE IF NOT EXISTS migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sample_ucs_sample ON sample_ucs_tags(sample_id);
CREATE INDEX IF NOT EXISTS idx_sample_ucs_cat ON sample_ucs_tags(ucs_cat_id);
CREATE INDEX IF NOT EXISTS idx_game_metadata_sample ON game_metadata(sample_id);
