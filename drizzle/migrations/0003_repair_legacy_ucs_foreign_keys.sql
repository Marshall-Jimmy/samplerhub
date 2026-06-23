-- Repairs databases created by the old duplicate 0001 migration, whose first
-- file created UCS/game tables without foreign keys. The migration is also safe
-- on a fresh database: child data is copied before tables are rebuilt.

DROP TABLE IF EXISTS sample_ucs_tags_backup;
CREATE TABLE sample_ucs_tags_backup AS
SELECT * FROM sample_ucs_tags;

DROP TABLE IF EXISTS ucs_subcategories_backup;
CREATE TABLE ucs_subcategories_backup AS
SELECT * FROM ucs_subcategories;

DROP TABLE IF EXISTS game_metadata_backup;
CREATE TABLE game_metadata_backup AS
SELECT * FROM game_metadata;

-- Drop child tables before their parent so this works with foreign_keys=ON.
DROP TABLE sample_ucs_tags;
DROP TABLE ucs_subcategories;
DROP TABLE game_metadata;

CREATE TABLE ucs_subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cat_id INTEGER NOT NULL REFERENCES ucs_categories(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  clap_description TEXT NOT NULL
);
INSERT OR IGNORE INTO ucs_subcategories
  (id, cat_id, code, name_zh, name_en, clap_description)
SELECT b.id, b.cat_id, b.code, b.name_zh, b.name_en, b.clap_description
FROM ucs_subcategories_backup b
INNER JOIN ucs_categories c ON c.id = b.cat_id;
CREATE INDEX IF NOT EXISTS idx_ucs_subcategories_cat
  ON ucs_subcategories(cat_id, id);

CREATE TABLE sample_ucs_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  ucs_cat_id INTEGER REFERENCES ucs_categories(id) ON DELETE SET NULL,
  ucs_sub_id INTEGER REFERENCES ucs_subcategories(id) ON DELETE SET NULL,
  confidence REAL DEFAULT 0,
  is_confirmed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO sample_ucs_tags
  (id, sample_id, ucs_cat_id, ucs_sub_id, confidence, is_confirmed, created_at)
SELECT
  b.id,
  b.sample_id,
  CASE WHEN c.id IS NULL THEN NULL ELSE b.ucs_cat_id END,
  CASE WHEN sc.id IS NULL THEN NULL ELSE b.ucs_sub_id END,
  b.confidence,
  b.is_confirmed,
  b.created_at
FROM sample_ucs_tags_backup b
INNER JOIN samples s ON s.id = b.sample_id
LEFT JOIN ucs_categories c ON c.id = b.ucs_cat_id
LEFT JOIN ucs_subcategories sc ON sc.id = b.ucs_sub_id;
CREATE INDEX IF NOT EXISTS idx_sample_ucs_sample
  ON sample_ucs_tags(sample_id);
CREATE INDEX IF NOT EXISTS idx_sample_ucs_cat
  ON sample_ucs_tags(ucs_cat_id);
CREATE INDEX IF NOT EXISTS idx_sample_ucs_sub
  ON sample_ucs_tags(ucs_sub_id);

CREATE TABLE game_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_id INTEGER NOT NULL UNIQUE REFERENCES samples(id) ON DELETE CASCADE,
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
INSERT OR IGNORE INTO game_metadata
  (id, sample_id, lufs_integrated, is_loop, loop_begin_sample,
   loop_end_sample, dc_offset, leading_silence_sec, trailing_silence_sec,
   bit_depth, suggest_mono, suggest_resample, analyzed_at)
SELECT
  b.id, b.sample_id, b.lufs_integrated, b.is_loop, b.loop_begin_sample,
  b.loop_end_sample, b.dc_offset, b.leading_silence_sec, b.trailing_silence_sec,
  b.bit_depth, b.suggest_mono, b.suggest_resample, b.analyzed_at
FROM game_metadata_backup b
INNER JOIN samples s ON s.id = b.sample_id;

DROP TABLE sample_ucs_tags_backup;
DROP TABLE ucs_subcategories_backup;
DROP TABLE game_metadata_backup;
