import type { Sample, Category, Tag, ClassificationRule, WatchedFolder, SearchFilters, ScanProgress, SearchResult } from './sample.types';

// IPC 通道定义
export const IPC_CHANNELS = {
  // 采样相关
  GET_SAMPLES: 'samples:get',
  GET_SAMPLES_PAGINATED: 'samples:getPaginated',
  GET_SAMPLE_BY_ID: 'samples:getById',
  SEARCH_SAMPLES: 'samples:search',
  UPDATE_SAMPLE: 'samples:update',
  DELETE_SAMPLE: 'samples:delete',
  
  // 分类相关
  GET_CATEGORIES: 'categories:get',
  CREATE_CATEGORY: 'categories:create',
  UPDATE_CATEGORY: 'categories:update',
  DELETE_CATEGORY: 'categories:delete',
  
  // 文件夹监控
  ADD_WATCHED_FOLDER: 'folders:add',
  REMOVE_WATCHED_FOLDER: 'folders:remove',
  GET_WATCHED_FOLDERS: 'folders:get',
  SCAN_FOLDER: 'folders:scan',
  GET_FOLDER_TREE: 'folders:getTree',
  
  // 扫描进度
  SCAN_PROGRESS: 'scan:progress',
  
  // 标签
  GET_TAGS: 'tags:get',
  CREATE_TAG: 'tags:create',
  UPDATE_TAG: 'tags:update',
  DELETE_TAG: 'tags:delete',
  ADD_TAG_TO_SAMPLE: 'tags:addToSample',
  REMOVE_TAG_FROM_SAMPLE: 'tags:removeFromSample',
  
  // 分类规则
  GET_RULES: 'rules:get',
  CREATE_RULE: 'rules:create',
  UPDATE_RULE: 'rules:update',
  DELETE_RULE: 'rules:delete',
  
  // 收藏
  TOGGLE_FAVORITE: 'favorites:toggle',
  GET_FAVORITES: 'favorites:get',
  
  // 最近使用
  GET_RECENT: 'recent:get',
  ADD_RECENT: 'recent:add',

  // 扫描
  START_SCAN: 'scan:start',
  STOP_SCAN: 'scan:stop',

  // 分类
  CLASSIFY_SAMPLE: 'classify:sample',
  CLASSIFY_ALL: 'classify:all',
  GET_CLASSIFICATION_RULES: 'classify:rules',

  // 对话框
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
  DIALOG_OPEN_FOLDERS: 'dialog:openFolders',

  // 库变化通知
  LIBRARY_CHANGED: 'library:changed',

  // 波形数据
  GET_WAVEFORM: 'waveform:get',
  SAVE_WAVEFORM: 'waveform:save',
  GET_PEAK_ENVELOPE: 'audio:getPeakEnvelope',

  // MIDI
  PARSE_MIDI: 'midi:parse',
  GET_MIDI_PREVIEW: 'midi:getPreview',
  EXPORT_SEQUENCER_MIDI: 'sequencer:exportMidi',

  // 播放列表
  GET_PLAYLISTS: 'playlists:get',
  CREATE_PLAYLIST: 'playlists:create',
  UPDATE_PLAYLIST: 'playlists:update',
  DELETE_PLAYLIST: 'playlists:delete',
  GET_PLAYLIST_ITEMS: 'playlists:getItems',
  ADD_TO_PLAYLIST: 'playlists:addItem',
  REMOVE_FROM_PLAYLIST: 'playlists:removeItem',
  REORDER_PLAYLIST: 'playlists:reorder',
  EXPORT_PLAYLIST: 'playlists:export',

  // 智能文件夹
  GET_SMART_FOLDERS: 'smartFolders:get',
  CREATE_SMART_FOLDER: 'smartFolders:create',
  UPDATE_SMART_FOLDER: 'smartFolders:update',
  DELETE_SMART_FOLDER: 'smartFolders:delete',
  QUERY_SMART_FOLDER: 'smartFolders:query',

  // 使用统计
  RECORD_PLAY: 'usage:recordPlay',
  GET_USAGE_STATS: 'usage:getStats',
  GET_MOST_PLAYED: 'usage:mostPlayed',
  GET_LEAST_PLAYED: 'usage:leastPlayed',

  // 空白检测
  DETECT_SILENCE: 'audio:detectSilence',

  // 智能重命名
  GET_RENAME_SUGGESTIONS: 'smartRename:suggestions',
  APPLY_RENAME: 'smartRename:apply',

  // 采样分享
  EXPORT_SAMPLES_PACKAGE: 'share:exportPackage',

  // 在线采样
  ONLINE_SEARCH: 'online:search',
  ONLINE_DOWNLOAD: 'online:download',
  ONLINE_GET_SNDDEV_CATEGORIES: 'online:snddevCategories',
  ONLINE_CACHE_PREVIEW: 'online:cachePreview',
  SELECT_ONLINE_DOWNLOAD_FOLDER: 'online:selectDownloadFolder',

  // 智能推荐
  GET_SIMILAR_SAMPLES: 'recommend:similar',
  TEXT_SIMILARITY_SEARCH: 'samples:textSimilaritySearch',

  // 文件管理
  GET_DUPLICATES: 'files:duplicates',
  CLEAN_CORRUPTED: 'files:cleanCorrupted',
  DELETE_SAMPLES: 'files:deleteSamples',
  UPDATE_SAMPLES_CATEGORY: 'samples:updateCategory',
  BATCH_ADD_TAG: 'samples:batchAddTag',
  EXPORT_SELECTION: 'audio:exportSelection',

  // 导入/导出
  EXPORT_SAMPLES_JSON: 'export:json',
  EXPORT_SAMPLES_CSV: 'export:csv',

  // 备份/恢复
  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_LIST: 'backup:list',

  // 配置导入/导出
  CONFIG_EXPORT: 'config:export',
  CONFIG_IMPORT: 'config:import',

  // 音频分析
  AUDIO_ANALYZE_FILE: 'audio:analyzeFile',
  AUDIO_ANALYZE_BATCH: 'audio:analyzeBatch',

  // 批量重命名
  GENERATE_BATCH_RENAME: 'samples:generateBatchRename',

  // 引擎导出
  EXPORT_TO_ENGINE: 'export:toEngine',

  // UCS 分类
  GET_UCS_CATEGORIES: 'ucs:getCategories',
  GET_UCS_SUBCATEGORIES: 'ucs:getSubcategories',

  // 交付质检
  RUN_DELIVERY_QA: 'delivery:runQA',
  GET_QA_RULES: 'delivery:getRules',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

// IPC 请求/响应类型
export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// IPC 处理器类型
export type IpcHandler<T = unknown, R = unknown> = (
  event: Electron.IpcMainInvokeEvent,
  data: T
) => Promise<IpcResponse<R>>;
