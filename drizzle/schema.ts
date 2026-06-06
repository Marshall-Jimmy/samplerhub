import { sqliteTable, integer, text, real, blob, primaryKey } from 'drizzle-orm/sqlite-core';

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
  parentId: integer('parent_id').references((): any => categories.id),
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
  fileType: text('file_type').notNull().default('audio'),
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
  isCorrupted: integer('is_corrupted', { mode: 'boolean' }).notNull().default(false),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  playCount: integer('play_count').notNull().default(0),
  lastPlayedAt: integer('last_played_at', { mode: 'timestamp' }),
  indexedAt: integer('indexed_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  // MIDI 专属字段
  midiTrackCount: integer('midi_track_count'),
  midiNoteCount: integer('midi_note_count'),
  midiInstruments: text('midi_instruments'),
  midiTimeSignature: text('midi_time_signature'),
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

export const playlists = sqliteTable('playlists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  coverColor: text('cover_color').default('#6366F1'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const playlistItems = sqliteTable('playlist_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playlistId: integer('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  sampleId: integer('sample_id').notNull().references(() => samples.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  addedAt: integer('added_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const recentSamples = sqliteTable('recent_samples', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sampleId: integer('sample_id').notNull().references(() => samples.id),
  playedAt: integer('played_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const smartFolders = sqliteTable('smart_folders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  query: text('query').notNull().default(''),
  filters: text('filters').notNull().default('{}'),
  icon: text('icon').default('folder'),
  color: text('color').default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const usageStats = sqliteTable('usage_stats', {
  sampleId: integer('sample_id').primaryKey().references(() => samples.id, { onDelete: 'cascade' }),
  playCount: integer('play_count').notNull().default(0),
  lastPlayedAt: integer('last_played_at', { mode: 'timestamp' }),
  firstPlayedAt: integer('first_played_at', { mode: 'timestamp' }),
});
