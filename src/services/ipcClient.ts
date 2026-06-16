import { IPC_CHANNELS } from '@shared/types/ipc.types';
import type { IpcResponse } from '@shared/types/ipc.types';
import type { Sample, Category, SearchFilters, ScanProgress, SearchResult, WatchedFolder, ClassificationRule, Tag, Playlist, PlaylistItem, FolderNode } from '@shared/types/sample.types';

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = await window.electronAPI.invoke(channel, ...args) as IpcResponse<T>;
  if (!response.success) {
    throw new Error(response.error || 'IPC call failed');
  }
  return response.data as T;
}

// 分析队列相关类型
export interface AnalysisConfig {
  enableCLAP: boolean;
  enablePANNs: boolean;
  enableEssentia: boolean;
  concurrency: number;
}

export interface AnalysisProgress {
  status: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  estimatedTimeMs: number | null;
  elapsedTimeMs: number;
  currentFile: string | null;
}

export interface AnalysisSessionInfo {
  id: number;
  name: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  config: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export interface AnalysisPreset {
  label: string;
  config: AnalysisConfig;
  description: string;
}

export const ipcClient = {
  // 采样
  getSamples: () => invoke<Sample[]>(IPC_CHANNELS.GET_SAMPLES),
  getSamplesPaginated: (offset?: number, limit?: number) => invoke<{ items: Sample[]; total: number; offset: number; limit: number }>(IPC_CHANNELS.GET_SAMPLES_PAGINATED, { offset, limit }),
  searchSamples: (filters: SearchFilters) => invoke<SearchResult>(IPC_CHANNELS.SEARCH_SAMPLES, filters),
  toggleFavorite: (sampleId: number) => invoke<boolean>(IPC_CHANNELS.TOGGLE_FAVORITE, { sampleId }),
  getFavorites: () => invoke<Sample[]>(IPC_CHANNELS.GET_FAVORITES),

  // 最近使用
  addRecent: (sampleId: number) => invoke<void>(IPC_CHANNELS.ADD_RECENT, { sampleId }),
  getRecent: (limit?: number) => invoke<Sample[]>(IPC_CHANNELS.GET_RECENT, { limit }),

  // 分类
  getCategories: () => invoke<Category[]>(IPC_CHANNELS.GET_CATEGORIES),

  // 文件夹
  addWatchedFolder: (path: string) => invoke<void>(IPC_CHANNELS.ADD_WATCHED_FOLDER, { path }),
  removeWatchedFolder: (path: string) => invoke<void>(IPC_CHANNELS.REMOVE_WATCHED_FOLDER, { path }),
  getWatchedFolders: () => invoke<WatchedFolder[]>(IPC_CHANNELS.GET_WATCHED_FOLDERS),
  getFolderTree: () => invoke<FolderNode[]>(IPC_CHANNELS.GET_FOLDER_TREE),
  scanFolder: (folderPath: string) => invoke<{ added: number; updated: number; deleted: number }>(IPC_CHANNELS.SCAN_FOLDER, { folderPath }),

  // 标签
  getTags: () => invoke<Tag[]>(IPC_CHANNELS.GET_TAGS),
  createTag: (name: string, color?: string) => invoke<Tag>(IPC_CHANNELS.CREATE_TAG, { name, color }),
  deleteTag: (tagId: number) => invoke<void>(IPC_CHANNELS.DELETE_TAG, { tagId }),
  addTagToSample: (sampleId: number, tagId: number) => invoke<void>(IPC_CHANNELS.ADD_TAG_TO_SAMPLE, { sampleId, tagId }),
  removeTagFromSample: (sampleId: number, tagId: number) => invoke<void>(IPC_CHANNELS.REMOVE_TAG_FROM_SAMPLE, { sampleId, tagId }),

  // 扫描
  startScan: (folderPath?: string | null) => invoke<{ folderPath: string; added: number; updated: number; deleted: number } | null>(IPC_CHANNELS.START_SCAN, { folderPath }),

  // 分类规则
  getClassificationRules: () => invoke<ClassificationRule[]>(IPC_CHANNELS.GET_CLASSIFICATION_RULES),
  getRules: () => invoke<ClassificationRule[]>(IPC_CHANNELS.GET_RULES),
  createRule: (data: { name: string; pattern: string; ruleType: string; targetCategoryId: number; priority?: number }) => invoke<ClassificationRule>(IPC_CHANNELS.CREATE_RULE, data),
  updateRule: (id: number, data: { name?: string; pattern?: string; ruleType?: string; targetCategoryId?: number; priority?: number; isActive?: boolean }) => invoke<void>(IPC_CHANNELS.UPDATE_RULE, { id, ...data }),
  deleteRule: (id: number) => invoke<void>(IPC_CHANNELS.DELETE_RULE, { id }),
  classifyAll: () => invoke<number>(IPC_CHANNELS.CLASSIFY_ALL),
  classifySample: (sampleId: number) => invoke<number | null>(IPC_CHANNELS.CLASSIFY_SAMPLE, { sampleId }),

  // 对话框
  openFolderDialog: () => invoke<string | null>(IPC_CHANNELS.DIALOG_OPEN_FOLDER),
  openFoldersDialog: () => invoke<string[] | null>(IPC_CHANNELS.DIALOG_OPEN_FOLDERS),

  // 智能推荐
  getSimilarSamples: (sampleId: number, limit?: number) =>
    invoke<{ sourceSample: { id: number; fileName: string } | null; similar: (Sample & { score: number })[] }>(
      IPC_CHANNELS.GET_SIMILAR_SAMPLES, { sampleId, limit }
    ),

  // 文本语义搜索
  textSimilaritySearch: (query: string, limit?: number) =>
    invoke<(Sample & { score: number })[]>(IPC_CHANNELS.TEXT_SIMILARITY_SEARCH, { query, limit }),

  // 文件管理
  getDuplicates: () => invoke<{ hash: string; count: number; ids: string; names: string }[]>(IPC_CHANNELS.GET_DUPLICATES),
  cleanCorrupted: () => invoke<number>(IPC_CHANNELS.CLEAN_CORRUPTED),
  deleteSamples: (ids: number[]) => invoke<{ success: boolean; data?: { deletedSamples: any[]; deletedTags: any[] }; error?: string }>(IPC_CHANNELS.DELETE_SAMPLES, { ids }),
  restoreSamples: (data: { samples: any[]; tags: any[] }) => invoke<{ success: boolean; error?: string }>('samples:restoreSamples', data),
  updateSamplesCategory: (ids: number[], categoryId: number) => invoke<void>(IPC_CHANNELS.UPDATE_SAMPLES_CATEGORY, { ids, categoryId }),
  batchAddTag: (sampleIds: number[], tagId: number) => invoke<void>(IPC_CHANNELS.BATCH_ADD_TAG, { sampleIds, tagId }),
  exportSelection: (filePath: string, startTime: number, endTime: number) => invoke<string>(IPC_CHANNELS.EXPORT_SELECTION, { filePath, startTime, endTime }),

  // 导入/导出
  exportSamplesJson: (ids?: number[]) => invoke<Record<string, any>[]>(IPC_CHANNELS.EXPORT_SAMPLES_JSON, { ids }),
  exportSamplesCsv: (ids?: number[]) => invoke<string>(IPC_CHANNELS.EXPORT_SAMPLES_CSV, { ids }),

  // 波形数据
  getWaveform: (filePath: string) => invoke<number[]>(IPC_CHANNELS.GET_WAVEFORM, { filePath }),
  saveWaveform: (sampleId: number, waveform: number[]) => invoke<void>(IPC_CHANNELS.SAVE_WAVEFORM, { sampleId, waveform }),

  // 峰值包络数据（高精度 min/max）
  getPeakEnvelope: (filePath: string) => invoke<{ min: number; max: number }[]>(IPC_CHANNELS.GET_PEAK_ENVELOPE, { filePath }),

  // MIDI
  parseMidi: (filePath: string) => invoke<{
    duration: number;
    bpm: number | null;
    key: string | null;
    timeSignature: string | null;
    trackCount: number;
    noteCount: number;
    instruments: string[];
    fileType: 'midi';
  }>(IPC_CHANNELS.PARSE_MIDI, { filePath }),
  exportSequencerMidi: (tracks: Array<{
    id: string;
    name: string;
    type?: string;
    stepCount?: number;
    steps: boolean[];
    velocity: number;
  }>, bpm: number, timeSignature?: string) => invoke<{ filePath: string }>(IPC_CHANNELS.EXPORT_SEQUENCER_MIDI, { tracks, bpm, timeSignature }),

  // 音频分析
  analyzeAudioFile: (filePath: string) => invoke<{ bpm: number | null; key: string | null; pitch: number | null; loudness: number | null; confidence: number }>(IPC_CHANNELS.AUDIO_ANALYZE_FILE, filePath),
  analyzeAudioBatch: (filePaths: string[]) => invoke<Array<{ filePath: string; bpm: number | null; key: number | null }>>(IPC_CHANNELS.AUDIO_ANALYZE_BATCH, filePaths),

  // 频谱特征相似度搜索
  findSimilarByFeatures: (sampleId: number, limit?: number) => invoke<Array<{
    id: number;
    fileName: string;
    filePath: string;
    duration: number;
    categoryId: number | null;
    similarity: number;
  }>>('samples:findSimilarByFeatures', { sampleId, limit }),

  // 语义搜索（基于标签关键词）
  semanticSearch: (keywords: string[], limit?: number) => invoke<Array<{
    id: number;
    fileName: string;
    filePath: string;
    duration: number;
    tags: string | null;
  }>>('samples:semanticSearch', { keywords, limit }),
  getMidiPreview: (filePath: string) => invoke<{
    duration: number;
    tracks: Array<{
      name: string;
      channel: number;
      notes: Array<{ midi: number; time: number; duration: number; velocity: number; name: string }>;
      instrument: string | null;
    }>;
    header: {
      tempos: Array<{ bpm: number; time: number }>;
      timeSignatures: Array<{ timeSignature: [number, number]; time: number }>;
      keySignatures: Array<{ key: number; scale: number; time: number }>;
    };
  }>(IPC_CHANNELS.GET_MIDI_PREVIEW, { filePath }),

  // 拖拽到 DAW（支持多文件）
  startDrag: (filePaths: string[]) => {
    if (filePaths.length === 1) {
      window.electronAPI.send('drag:start', { filePath: filePaths[0], name: filePaths[0] });
    } else {
      window.electronAPI.send('drag:start', { filePath: filePaths[0], name: `${filePaths.length} files`, filePaths });
    }
  },

  // 在文件管理器中显示
  showItemInFolder: (filePath: string) => {
    window.electronAPI.send('show-item-in-folder', { filePath });
  },

  // 播放列表
  getPlaylists: () => invoke<Playlist[]>(IPC_CHANNELS.GET_PLAYLISTS),
  createPlaylist: (name: string, description?: string, coverColor?: string) => invoke<Playlist>(IPC_CHANNELS.CREATE_PLAYLIST, { name, description, coverColor }),
  updatePlaylist: (id: number, data: { name?: string; description?: string; coverColor?: string }) => invoke<void>(IPC_CHANNELS.UPDATE_PLAYLIST, { id, ...data }),
  deletePlaylist: (id: number) => invoke<void>(IPC_CHANNELS.DELETE_PLAYLIST, { id }),
  getPlaylistItems: (playlistId: number) => invoke<PlaylistItem[]>(IPC_CHANNELS.GET_PLAYLIST_ITEMS, { playlistId }),
  addToPlaylist: (playlistId: number, sampleIds: number[]) => invoke<void>(IPC_CHANNELS.ADD_TO_PLAYLIST, { playlistId, sampleIds }),
  removeFromPlaylist: (playlistId: number, sampleId: number) => invoke<void>(IPC_CHANNELS.REMOVE_FROM_PLAYLIST, { playlistId, sampleId }),
  reorderPlaylist: (playlistId: number, sampleIds: number[]) => invoke<void>(IPC_CHANNELS.REORDER_PLAYLIST, { playlistId, sampleIds }),
  exportPlaylist: (playlistId: number, format: 'm3u' | 'm3u8' = 'm3u') => invoke<string | null>(IPC_CHANNELS.EXPORT_PLAYLIST, { playlistId, format }),

  // 智能文件夹
  getSmartFolders: () => invoke<any[]>(IPC_CHANNELS.GET_SMART_FOLDERS),
  createSmartFolder: (name: string, query: string, filters: string, icon?: string, color?: string) =>
    invoke<{ id: number }>(IPC_CHANNELS.CREATE_SMART_FOLDER, { name, query, filters, icon, color }),
  updateSmartFolder: (id: number, updates: { name?: string; query?: string; filters?: string; icon?: string; color?: string }) =>
    invoke<void>(IPC_CHANNELS.UPDATE_SMART_FOLDER, { id, ...updates }),
  deleteSmartFolder: (id: number) => invoke<void>(IPC_CHANNELS.DELETE_SMART_FOLDER, { id }),
  querySmartFolder: (id: number, page?: number, pageSize?: number) =>
    invoke<{ samples: any[]; total: number; page: number; pageSize: number }>(IPC_CHANNELS.QUERY_SMART_FOLDER, { id, page, pageSize }),

  // 使用统计
  recordPlay: (sampleId: number) => invoke<void>(IPC_CHANNELS.RECORD_PLAY, { sampleId }),
  getUsageStats: () => invoke<{ totalPlays: number; uniqueSamples: number; avgPlays: number; neverPlayed: number }>(IPC_CHANNELS.GET_USAGE_STATS),
  getMostPlayed: (limit?: number) => invoke<any[]>(IPC_CHANNELS.GET_MOST_PLAYED, { limit }),
  getLeastPlayed: (limit?: number) => invoke<any[]>(IPC_CHANNELS.GET_LEAST_PLAYED, { limit }),

  // 空白检测
  detectSilence: (filePath: string, threshold?: number) =>
    invoke<{ startTime: number; endTime: number; duration: number }>(IPC_CHANNELS.DETECT_SILENCE, { filePath, threshold }),

  // 智能重命名
  getRenameSuggestions: (sampleIds: number[]) =>
    invoke<Array<{ original: string; suggested: string; confidence: number }>>(IPC_CHANNELS.GET_RENAME_SUGGESTIONS, { sampleIds }),
  applyRename: (sampleId: number, newName: string) =>
    invoke<{ newPath: string }>(IPC_CHANNELS.APPLY_RENAME, { sampleId, newName }),

  // 采样分享
  exportSamplesPackage: (sampleIds: number[]) =>
    invoke<{ path: string; count: number } | null>(IPC_CHANNELS.EXPORT_SAMPLES_PACKAGE, { sampleIds }),

  // 批量重命名（基于 UCS 分类）
  generateBatchRename: (sampleIds: number[], template?: string) =>
    invoke<Array<{ sampleId: number; oldName: string; newName: string; ext: string }>>(IPC_CHANNELS.GENERATE_BATCH_RENAME, { sampleIds, template }),

  // 引擎导出
  exportToEngine: (engine: 'unity' | 'unreal' | 'godot', sampleIds: number[]) =>
    invoke<{ exported: number; errors: string[]; manifestPath: string } | null>(IPC_CHANNELS.EXPORT_TO_ENGINE, { engine, sampleIds }),

  // UCS 分类
  getUcsCategories: () =>
    invoke<Array<{ id: number; cat_code: string; cat_name_zh: string; cat_name_en: string; clap_description: string; sort_order: number }>>(
      IPC_CHANNELS.GET_UCS_CATEGORIES
    ),
  getUcsSubcategories: (catId: number) =>
    invoke<Array<{ id: number; cat_id: number; code: string; name_zh: string; name_en: string; clap_description: string }>>(
      IPC_CHANNELS.GET_UCS_SUBCATEGORIES, { catId }
    ),

  // 交付质检
  runDeliveryQA: (sampleIds?: number[]) =>
    invoke<{ issues: Array<{ ruleId: string; severity: string; message: string; sampleId: number; fileName: string }>; summary: { total: number; errors: number; warnings: number; infos: number } }>(IPC_CHANNELS.RUN_DELIVERY_QA, { sampleIds }),
  getQARules: () =>
    invoke<Array<{ id: string; label: string; description: string; severity: string }>>(IPC_CHANNELS.GET_QA_RULES),

  // 在线采样
  onlineSearch: (data: {
    source: 'lotsofsounds' | 'freesound' | 'snddev' | 'pixabay';
    query: string;
    page?: number;
    pageSize?: number;
    filter?: string;
    sort?: string;
    freesoundApiKey?: string;
    pixabayApiKey?: string;
  }) => invoke<{
    samples: Array<{
      id: string;
      name: string;
      tags: string[];
      duration: number;
      previewUrl: string;
      downloadUrl?: string;
      source: string;
      license?: string;
      description?: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }>(IPC_CHANNELS.ONLINE_SEARCH, data),
  onlineDownload: (url: string, fileName: string, headers?: Record<string, string>, saveDir?: string) =>
    invoke<{ path: string; saveDir: string }>(IPC_CHANNELS.ONLINE_DOWNLOAD, { url, fileName, headers, saveDir }),
  onlineGetSnddevCategories: () =>
    invoke<Record<string, string>>(IPC_CHANNELS.ONLINE_GET_SNDDEV_CATEGORIES),
  onlineCachePreview: (url: string) =>
    invoke<{ previewUrl: string }>(IPC_CHANNELS.ONLINE_CACHE_PREVIEW, { url }),
  selectOnlineDownloadFolder: () =>
    invoke<{ folder: string }>(IPC_CHANNELS.SELECT_ONLINE_DOWNLOAD_FOLDER),

  // 备份/恢复
  createBackup: () =>
    invoke<{ success: boolean; path?: string; error?: string; size?: number }>(IPC_CHANNELS.BACKUP_CREATE),
  restoreBackup: (fileName: string) =>
    invoke<{ success: boolean; error?: string }>(IPC_CHANNELS.BACKUP_RESTORE, { fileName }),
  listBackups: () =>
    invoke<Array<{ name: string; size: number; createdAt: string }>>(IPC_CHANNELS.BACKUP_LIST),

  // 配置导入/导出
  exportConfig: () =>
    invoke<{ path: string } | null>(IPC_CHANNELS.CONFIG_EXPORT),
  importConfig: () =>
    invoke<{ imported: boolean; count?: number }>(IPC_CHANNELS.CONFIG_IMPORT),

  // 数据库重置（初始化）
  resetDatabase: () =>
    invoke<{ success: boolean; error?: string }>('database:reset'),

  // 拖放导入音频文件
  importFiles: (filePaths: string[]) =>
    invoke<{ imported: number; skipped: number }>('samples:importFiles', { filePaths }),

  // 更新采样评分和备注
  updateRatingNotes: (sampleId: number, data: { rating?: number; notes?: string }) =>
    invoke<{ success: boolean; error?: string }>('samples:updateRatingNotes', { sampleId, ...data }),

  // 获取 PANNs 音频事件段
  getAudioSegments: (sampleId: number) =>
    invoke<Array<{
      id: number;
      sampleId: number;
      label: string;
      displayLabel: string | null;
      startTime: number;
      endTime: number;
      peakProb: number;
    }>>('samples:getAudioSegments', { sampleId }),

  // 读取音频文件并返回 ArrayBuffer（绕过 file:// URL 特殊字符问题）
  getAudioBuffer: async (filePath: string): Promise<ArrayBuffer> => {
    const data = await invoke<ArrayBuffer | Uint8Array>('samples:getAudioBuffer', { filePath });
    // Node.js Buffer 经 IPC 序列化后可能变成 Uint8Array，需转为 ArrayBuffer
    if (data instanceof Uint8Array) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    return data as ArrayBuffer;
  },

  // ── 分析队列 ──
  analysis: {
    createSession: (name: string, sampleIds: number[], config: AnalysisConfig) =>
      invoke<{ sessionId: number; estimatedTimeMs: number }>('analysis:createSession', { name, sampleIds, config }),
    startSession: (sessionId: number) =>
      invoke<void>('analysis:startSession', { sessionId }),
    pauseSession: (sessionId: number) =>
      invoke<void>('analysis:pauseSession', { sessionId }),
    resumeSession: (sessionId: number) =>
      invoke<void>('analysis:resumeSession', { sessionId }),
    cancelSession: (sessionId: number) =>
      invoke<void>('analysis:cancelSession', { sessionId }),
    getProgress: (sessionId: number) =>
      invoke<AnalysisProgress>('analysis:getProgress', { sessionId }),
    getIncompleteSessions: () =>
      invoke<AnalysisSessionInfo[]>('analysis:getIncompleteSessions'),
    getSessions: () =>
      invoke<AnalysisSessionInfo[]>('analysis:getSessions'),
    getPresets: () =>
      invoke<Record<string, AnalysisPreset>>('analysis:getPresets'),
    estimateTime: (fileCount: number, config: AnalysisConfig) =>
      invoke<{ estimatedTimeMs: number; formattedTime: string }>('analysis:estimateTime', { fileCount, config }),
    onProgress: (callback: (data: { sessionId: number }) => void) => {
      const unsub = window.electronAPI.on('analysis:progress', callback);
      return unsub;
    },
  },

  // 性能指标
  getPerformanceMetrics: () => invoke<{
    startupTime: number;
    memory?: { rss: number; heapTotal: number; heapUsed: number; external: number };
    databaseSize: number;
    sampleCount: number;
    metrics?: Record<string, number>;
  }>('perf:getMetrics'),

  // 事件监听
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    return window.electronAPI.on(IPC_CHANNELS.SCAN_PROGRESS, (...args: unknown[]) => {
      callback(args[0] as ScanProgress);
    });
  },

  onLibraryChanged: (callback: (data: { action: string; filePath: string }) => void) => {
    return window.electronAPI.on(IPC_CHANNELS.LIBRARY_CHANGED, (...args: unknown[]) => {
      callback(args[0] as { action: string; filePath: string });
    });
  },
};
