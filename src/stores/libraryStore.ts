import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ViewMode = 'list' | 'grid' | 'waveform';

type SortField = 'fileName' | 'duration' | 'bpm' | 'key' | 'createdAt' | 'playCount' | 'fileSize';
type SortDirection = 'asc' | 'desc' | 'none';

interface LibraryState {
  activeCategoryId: number | null;
  activeFolderPath: string | null;
  activeSection: 'all' | 'favorites' | 'recent' | 'category' | 'folder' | 'midi' | 'smartFolder';
  selectedSampleId: number | null;
  searchQuery: string;
  viewMode: ViewMode;
  sortField: SortField;
  sortDirection: SortDirection;
  isScanning: boolean;
  activeSmartFolderId: number | null;
  scanProgresses: Map<string, {
    current: number;
    total: number;
    currentFile: string;
    phase: string;
    folderPath: string;
    ffmpegMissing?: boolean;
  }>;

  // 多选 - 使用 Set 提高查找性能，序列化时自动转换
  selectedIds: Set<number>;
  isMultiSelectMode: boolean;
  lastClickedIndex: number;

  setActiveCategory: (categoryId: number | null) => void;
  setActiveFolder: (folderPath: string | null) => void;
  setActiveSection: (section: LibraryState['activeSection']) => void;
  setActiveSmartFolderId: (id: number | null) => void;
  setSelectedSample: (sampleId: number | null) => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setSortField: (field: SortField) => void;
  toggleSortDirection: () => void;
  setScanning: (scanning: boolean) => void;
  setScanProgress: (folderPath: string, progress: { current: number; total: number; currentFile: string; phase: string; ffmpegMissing?: boolean }) => void;
  removeScanProgress: (folderPath: string) => void;

  // 多选操作
  toggleSelect: (id: number) => void;
  selectRange: (ids: number[]) => void;
  selectAll: (allIds: number[]) => void;
  clearSelection: () => void;
  setMultiSelectMode: (enabled: boolean) => void;
  isSelected: (id: number) => boolean;
  setLastClickedIndex: (index: number) => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      activeCategoryId: null,
      activeFolderPath: null,
      activeSection: 'all',
      activeSmartFolderId: null,
      selectedSampleId: null,
      searchQuery: '',
      viewMode: 'list',
      sortField: 'fileName',
      sortDirection: 'asc',
      isScanning: false,
      scanProgresses: new Map(),
      selectedIds: new Set(),
      isMultiSelectMode: false,
      lastClickedIndex: -1,

      setActiveCategory: (categoryId) => set({
        activeCategoryId: categoryId,
        activeFolderPath: null,
        activeSection: categoryId ? 'category' : 'all',
        selectedIds: new Set(),
        isMultiSelectMode: false,
      }),

      setActiveFolder: (folderPath) => set({
        activeFolderPath: folderPath,
        activeCategoryId: null,
        activeSection: folderPath ? 'folder' : 'all',
        selectedIds: new Set(),
        isMultiSelectMode: false,
      }),

      setActiveSection: (section) => set({
        activeSection: section,
        activeCategoryId: null,
        activeFolderPath: null,
        selectedIds: new Set(),
        isMultiSelectMode: false,
      }),
      setActiveSmartFolderId: (id) => set({ activeSmartFolderId: id }),

      setSelectedSample: (sampleId) => set({ selectedSampleId: sampleId }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setViewMode: (mode) => set({ viewMode: mode }),

      setSortField: (field) => {
        const { sortField, sortDirection } = get();
        if (sortField === field) {
          // Three-state cycle: asc → desc → none
          if (sortDirection === 'asc') {
            set({ sortDirection: 'desc' });
          } else if (sortDirection === 'desc') {
            set({ sortField: 'fileName', sortDirection: 'none' });
          } else {
            set({ sortDirection: 'asc' });
          }
        } else {
          set({ sortField: field, sortDirection: 'asc' });
        }
      },

      toggleSortDirection: () => set(s => ({
        sortDirection: s.sortDirection === 'asc' ? 'desc' : 'asc',
      })),

      setScanning: (scanning) => set({ isScanning: scanning }),
      setScanProgress: (folderPath, progress) => set((state) => {
        const next = new Map(state.scanProgresses);
        next.set(folderPath, { ...progress, folderPath });
        return { scanProgresses: next };
      }),
      removeScanProgress: (folderPath) => set((state) => {
        const next = new Map(state.scanProgresses);
        next.delete(folderPath);
        return { scanProgresses: next };
      }),

      toggleSelect: (id) => {
        const { selectedIds } = get();
        const next = new Set(selectedIds);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        set({ selectedIds: next, isMultiSelectMode: next.size > 0 });
      },

      selectRange: (ids) => {
        const { selectedIds } = get();
        const merged = new Set(selectedIds);
        ids.forEach(id => merged.add(id));
        set({ selectedIds: merged, isMultiSelectMode: true });
      },

      selectAll: (allIds) => set({
        selectedIds: new Set(allIds),
        isMultiSelectMode: true,
      }),

      clearSelection: () => set({
        selectedIds: new Set(),
        isMultiSelectMode: false,
        lastClickedIndex: -1,
      }),

      setMultiSelectMode: (enabled) => set({
        isMultiSelectMode: enabled,
        selectedIds: enabled ? get().selectedIds : new Set(),
      }),

      isSelected: (id) => get().selectedIds.has(id),

      setLastClickedIndex: (index) => set({ lastClickedIndex: index }),
    }),
    {
      name: 'library-settings',
      // 只持久化视图/排序偏好，不持久化搜索词和选择状态
      partialize: (state) => ({
        viewMode: state.viewMode,
        sortField: state.sortField,
        sortDirection: state.sortDirection,
      }),
    }
  )
);
