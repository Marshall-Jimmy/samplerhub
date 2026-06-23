import { sqliteTable, integer, text, real, blob, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const watchedFolders = sqliteTable('watched_folders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  lastScanAt: integer('last_scan_at', { mode: 'timestamp' }),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  pathIdx: index('watched_folders_path_idx').on(table.path),
}));

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
  // 频谱特征推断标签（逗号分隔）
  tags: text('tags'),
  // 频谱特征向量（JSON 数组，用于相似度搜索）
  featureVector: text('feature_vector'),
  // CLAP 语义嵌入向量（base64 编码的 512 维 float32）
  clapEmbedding: text('clap_embedding'),
  // 评分和备注
  rating: integer('rating'), // 1-5 星
  notes: text('notes'), // 用户备注
  // MIDI 专属字段
  midiTrackCount: integer('midi_track_count'),
  midiNoteCount: integer('midi_note_count'),
  midiInstruments: text('midi_instruments'),
  midiTimeSignature: text('midi_time_signature'),
}, (table) => ({
  fileNameIdx: index('samples_file_name_idx').on(table.fileName),
  categoryIdIdx: index('samples_category_id_idx').on(table.categoryId),
  bpmIdx: index('samples_bpm_idx').on(table.bpm),
  keyIdx: index('samples_key_idx').on(table.key),
  isFavoriteIdx: index('samples_is_favorite_idx').on(table.isFavorite),
  playCountIdx: index('samples_play_count_idx').on(table.playCount),
  fileTypeIdx: index('samples_file_type_idx').on(table.fileType),
  indexedAtIdx: index('samples_indexed_at_idx').on(table.indexedAt),
  lastPlayedAtIdx: index('samples_last_played_at_idx').on(table.lastPlayedAt),
}));

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

// 分析会话：记录一次批量分析的配置和进度
export const analysisSessions = sqliteTable('analysis_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  // 分析方案配置（JSON）
  config: text('config').notNull(), // { enableCLAP: true, enablePANNs: true, enableEssentia: true, concurrency: 2 }
  // 进度
  totalFiles: integer('total_files').notNull().default(0),
  completedFiles: integer('completed_files').notNull().default(0),
  failedFiles: integer('failed_files').notNull().default(0),
  // 状态
  status: text('status', { enum: ['pending', 'running', 'paused', 'completed', 'cancelled'] }).notNull().default('pending'),
  // 时间预估
  estimatedTimeMs: integer('estimated_time_ms'), // 预估总时间（毫秒）
  elapsedTimeMs: integer('elapsed_time_ms').notNull().default(0),
  // 时间戳
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// 分析队列项：每个待分析文件的任务
export const analysisQueue = sqliteTable('analysis_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => analysisSessions.id, { onDelete: 'cascade' }),
  sampleId: integer('sample_id').notNull().references(() => samples.id, { onDelete: 'cascade' }),
  // 任务类型
  taskType: text('task_type', { enum: ['clap', 'panns', 'essentia', 'full'] }).notNull().default('full'),
  // 状态
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed', 'skipped'] }).notNull().default('pending'),
  // 结果
  errorMessage: text('error_message'),
  // 时间
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  durationMs: integer('duration_ms'), // 单文件分析耗时
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// PANNs SED 时间轴标签（声音事件检测结果）
export const audioSegments = sqliteTable('audio_segments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sampleId: integer('sample_id').notNull().references(() => samples.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),           // PANNs 原始标签（如 "Bird"）
  displayLabel: text('display_label'),      // 用户友好名（如 "鸟叫"）
  startTime: real('start_time').notNull(),  // 事件开始时间（秒）
  endTime: real('end_time').notNull(),      // 事件结束时间（秒）
  peakProb: real('peak_prob').notNull(),    // 峰值概率
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ===== UCS 分类体系 =====
export const ucsCategories = sqliteTable('ucs_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  catCode: text('cat_code').notNull().unique(),
  catNameZh: text('cat_name_zh').notNull(),
  catNameEn: text('cat_name_en').notNull(),
  clapDescription: text('clap_description').notNull(),
  parentId: integer('parent_id'),
  sortOrder: integer('sort_order').default(0),
});

export const ucsSubcategories = sqliteTable('ucs_subcategories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  catId: integer('cat_id').notNull().references(() => ucsCategories.id),
  code: text('code').notNull().unique(),
  nameZh: text('name_zh').notNull(),
  nameEn: text('name_en').notNull(),
  clapDescription: text('clap_description').notNull(),
});

export const sampleUcsTags = sqliteTable('sample_ucs_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sampleId: integer('sample_id').notNull().references(() => samples.id, { onDelete: 'cascade' }),
  ucsCatId: integer('ucs_cat_id'),
  ucsSubId: integer('ucs_sub_id'),
  confidence: real('confidence').default(0),
  isConfirmed: integer('is_confirmed', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

export const gameMetadata = sqliteTable('game_metadata', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sampleId: integer('sample_id').notNull().references(() => samples.id, { onDelete: 'cascade' }).unique(),
  lufsIntegrated: real('lufs_integrated'),
  isLoop: integer('is_loop', { mode: 'boolean' }),
  loopBeginSample: integer('loop_begin_sample'),
  loopEndSample: integer('loop_end_sample'),
  dcOffset: real('dc_offset'),
  leadingSilenceSec: real('leading_silence_sec'),
  trailingSilenceSec: real('trailing_silence_sec'),
  bitDepth: integer('bit_depth'),
  suggestMono: integer('suggest_mono', { mode: 'boolean' }),
  suggestResample: integer('suggest_resample', { mode: 'boolean' }),
  analyzedAt: integer('analyzed_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

// Migration 跟踪表
export const migrations = sqliteTable('migrations', {
  name: text('name').primaryKey(),
  appliedAt: integer('applied_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});
