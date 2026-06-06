export interface Sample {
  id: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  fileType: 'audio' | 'midi';
  createdAt: Date;
  modifiedAt: Date;
  duration: number;
  sampleRate: number;
  bitRate: number;
  channels: number;
  bpm: number | null;
  key: string | null;
  categoryId: number | null;
  waveformData: Uint8Array | null;
  isCorrupted: boolean;
  isFavorite: boolean;
  playCount: number;
  lastPlayedAt: Date | null;
  indexedAt: Date;
  tags: Tag[];
  category: Category | null;
  // MIDI 专属字段
  midiTrackCount?: number | null;
  midiNoteCount?: number | null;
  midiInstruments?: string[] | null;
  midiTimeSignature?: string | null;
}

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  isSystem: boolean;
  sortOrder: number;
  children?: Category[];
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface ClassificationRule {
  id: number;
  name: string;
  pattern: string;
  ruleType: 'regex' | 'keyword' | 'folder';
  targetCategoryId: number;
  priority: number;
  isActive: boolean;
}

export interface WatchedFolder {
  id: number;
  path: string;
  lastScanAt: Date | null;
  isActive: boolean;
}

export interface SearchFilters {
  query?: string;
  categoryId?: number;
  folderPath?: string;
  fileType?: 'audio' | 'midi';
  tagIds?: number[];
  durationMin?: number;
  durationMax?: number;
  sampleRate?: number;
  bitRate?: number;
  channels?: number;
  bpmMin?: number;
  bpmMax?: number;
  key?: string;
  isFavorite?: boolean;
  isCorrupted?: boolean;
  sortField?: string;
  sortDirection?: 'asc' | 'desc' | 'none';
  offset?: number;
  limit?: number;
}

export interface FolderNode {
  path: string;
  name: string;
  sampleCount: number;
  children: FolderNode[];
}

export interface ScanProgress {
  current: number;
  total: number;
  currentFile: string;
  phase: 'scanning' | 'parsing' | 'classifying' | 'complete';
}

export interface SearchResult {
  items: Sample[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  coverColor: string;
  createdAt: Date;
  updatedAt: Date;
  itemCount?: number;
}

export interface PlaylistItem {
  id: number;
  playlistId: number;
  sampleId: number;
  sortOrder: number;
  addedAt: Date;
  sample?: Sample;
}
