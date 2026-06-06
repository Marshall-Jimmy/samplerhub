import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Input, Button, Dropdown, Menu } from 'antd';
import { useTranslation } from 'react-i18next';
import { handleIpcError } from '../utils/ipcError';
import { toast } from 'sonner';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import {
  SearchOutlined,
  FolderAddOutlined,
  FilterOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  SoundOutlined,
  DeleteOutlined,
  TagOutlined,
  FolderOutlined,
  CopyOutlined,
  SelectOutlined,
  PlayCircleOutlined,
  HeartOutlined,
  HeartFilled,
  FolderOpenOutlined,
  InfoCircleOutlined,
  DesktopOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FileZipOutlined,
  CheckOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FixedSizeList as List, FixedSizeGrid as Grid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { ipcClient } from '../services/ipcClient';
import { useLibraryStore } from '../stores/libraryStore';
import { usePlayerStore } from '../stores/playerStore';
import { useSearchHistoryStore } from '../stores/searchHistoryStore';
import { usePlaylistStore } from '../stores/playlistStore';
import type { Sample, SearchFilters, Category, Tag } from '@shared/types/sample.types';
import SampleCard from '../components/samples/SampleCard';
import GridSampleCard from '../components/samples/GridSampleCard';
import WaveformSampleRow from '../components/samples/WaveformSampleRow';
import SampleDetailPanel from '../components/samples/SampleDetailPanel';
import SearchPanel from '../components/search/SearchPanel';
import { useContextMenu, type ContextMenuItem } from '../components/common/ContextMenu';
import EmptyState from '../components/common/EmptyState';
import SampleListSkeleton from '../components/common/SampleListSkeleton';
import s from '../styles/components/library-page.module.css';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

const ROW_HEIGHT = 50;

const LibraryPage: React.FC = () => {
  const { t } = useTranslation();
  const {
    searchQuery,
    isScanning,
    scanProgresses,
    activeCategoryId,
    activeFolderPath,
    activeSection,
    viewMode,
    sortField,
    sortDirection,
    selectedIds,
    isMultiSelectMode,
    lastClickedIndex,
    setSearchQuery,
    setScanning,
    setScanProgress,
    removeScanProgress,
    setViewMode,
    setSortField,
    toggleSelect,
    selectAll,
    clearSelection,
    selectRange,
    setLastClickedIndex,
    setActiveCategory,
    setActiveFolder,
    setActiveSection,
  } = useLibraryStore();

  const currentSampleId = usePlayerStore(s => s.currentSampleId);
  const isPlayerPlaying = usePlayerStore(s => s.isPlaying);
  const currentTime = usePlayerStore(s => s.currentTime);
  const queryClient = useQueryClient();

  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [detailSample, setDetailSample] = useState<Sample | null>(null);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<SearchFilters>({});
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<List>(null);
  const searchInputRef = useRef<any>(null);
  const { showMenu, MenuComponent } = useContextMenu();
  const { history: searchHistory, addQuery: addSearchQuery, removeQuery: removeSearchQuery, clearHistory } = useSearchHistoryStore();
  const { activePlaylistId, playlistItems, playlists, fetchPlaylistItems } = usePlaylistStore();

  const debouncedQuery = useDebounce(searchQuery, 300);

  const isPlaylistView = activePlaylistId !== null;

  const mergedFilters: SearchFilters = {
    ...advancedFilters,
    query: debouncedQuery || undefined,
    categoryId: activeSection === 'category' ? (activeCategoryId ?? undefined) : advancedFilters.categoryId,
    folderPath: activeSection === 'folder' ? (activeFolderPath ?? undefined) : undefined,
    isFavorite: activeSection === 'favorites' ? true : advancedFilters.isFavorite,
    fileType: activeSection === 'midi' ? 'midi' : undefined,
    sortField: sortField,
    sortDirection: sortDirection === 'none' ? undefined : sortDirection,
  };

  const cleanFilters = Object.fromEntries(
    Object.entries(mergedFilters).filter(([_, v]) => v !== undefined && v !== '')
  ) as SearchFilters;

  const hasFilters = Object.keys(cleanFilters).length > 0;

  const hasActiveFilters = !!(advancedFilters.categoryId || advancedFilters.bpmMin !== undefined
    || advancedFilters.durationMin !== undefined || advancedFilters.key || advancedFilters.isFavorite
    || (advancedFilters.tagIds && advancedFilters.tagIds.length > 0));

  const PAGE_SIZE = 200;

  const { data: searchResult, isLoading } = useQuery({
    queryKey: ['samples', cleanFilters, activeSection],
    queryFn: async () => {
      if (activeSection === 'favorites') {
        const items = await ipcClient.getFavorites();
        return { items, total: items.length };
      }
      if (activeSection === 'recent') {
        const items = await ipcClient.getRecent();
        return { items, total: items.length };
      }
      return ipcClient.searchSamples(cleanFilters);
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => ipcClient.getCategories(),
  });

  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => ipcClient.getTags(),
  });

  // 搜索建议：基于当前输入匹配分类/标签/BPM/Key
  const searchSuggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 1) return [];
    const q = searchQuery.toLowerCase();
    const suggestions: { type: 'category' | 'tag' | 'bpm' | 'key'; label: string; value: string }[] = [];

    // 匹配分类
    categories?.forEach((c: Category) => {
      if (c.name.toLowerCase().includes(q)) {
        suggestions.push({ type: 'category', label: c.name, value: c.name });
      }
    });

    // 匹配标签
    tags?.forEach((t: Tag) => {
      if (t.name.toLowerCase().includes(q)) {
        suggestions.push({ type: 'tag', label: t.name, value: t.name });
      }
    });

    // BPM 建议
    const bpmMatch = q.match(/^(\d{2,3})/);
    if (bpmMatch) {
      const bpm = parseInt(bpmMatch[1]);
      if (bpm >= 60 && bpm <= 200) {
        suggestions.push({ type: 'bpm', label: `BPM ${bpm}`, value: `bpm:${bpm}` });
      }
    }

    // Key 建议
    const keyMatch = q.match(/^([a-gA-G]#?)/);
    if (keyMatch) {
      const key = keyMatch[1].charAt(0).toUpperCase() + keyMatch[1].slice(1);
      suggestions.push({ type: 'key', label: `Key ${key}`, value: `key:${key}` });
    }

    return suggestions.slice(0, 8);
  }, [searchQuery, categories, tags]);

  const samples = useMemo(() => {
    return searchResult?.items ?? [];
  }, [searchResult]);

  const totalSamples = searchResult?.total ?? 0;

  const playlistSamples = useMemo(() => {
    if (!isPlaylistView) return [];
    return playlistItems.map(item => item.sample).filter(Boolean) as Sample[];
  }, [isPlaylistView, playlistItems]);

  const displaySamples = isPlaylistView ? playlistSamples : samples;

  // 构建面包屑路径
  const breadcrumbItems = useMemo<{ label: string; onClick: () => void }[]>(() => {
    const items: { label: string; onClick: () => void }[] = [];

    // 首页（始终显示，除"全部"视图外）
    if (activeSection !== 'all' || isPlaylistView) {
      items.push({
        label: t('breadcrumb.home'),
        onClick: () => {
          setActiveSection('all');
          setActiveCategory(null);
          setActiveFolder(null);
          usePlaylistStore.getState().setActivePlaylist(null);
        },
      });
    }

    // 播放列表视图
    if (isPlaylistView) {
      const playlist = playlists.find(p => p.id === activePlaylistId);
      items.push({
        label: playlist?.name || t('sidebar.playlists'),
        onClick: () => {},
      });
      return items;
    }

    // 收藏夹
    if (activeSection === 'favorites') {
      items.push({ label: t('sidebar.favorites'), onClick: () => {} });
      return items;
    }

    // 最近使用
    if (activeSection === 'recent') {
      items.push({ label: t('sidebar.recent'), onClick: () => {} });
      return items;
    }

    // MIDI
    if (activeSection === 'midi') {
      items.push({ label: t('sidebar.midi', 'MIDI'), onClick: () => {} });
      return items;
    }

    // 分类视图：构建分类层级路径
    if (activeSection === 'category' && activeCategoryId !== null && categories) {
      // 查找分类及其所有祖先
      const categoryMap = new Map<number, Category>();
      const parentMap = new Map<number, number | null>();
      (categories as Category[]).forEach((cat: Category) => {
        categoryMap.set(cat.id, cat);
        parentMap.set(cat.id, cat.parentId);
      });

      const path: Category[] = [];
      let currentId: number | null = activeCategoryId;
      while (currentId !== null) {
        const cat = categoryMap.get(currentId);
        if (!cat) break;
        path.unshift(cat);
        currentId = cat.parentId;
      }

      path.forEach((cat, index) => {
        const isLast = index === path.length - 1;
        items.push({
          label: cat.name,
          onClick: isLast
            ? () => {}
            : () => setActiveCategory(cat.id),
        });
      });
      return items;
    }

    // 文件夹视图：构建文件夹路径
    if (activeSection === 'folder' && activeFolderPath) {
      const parts = activeFolderPath.split(/[/\\]/).filter(Boolean);
      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;
        const folderPath = parts.slice(0, index + 1).join('/');
        items.push({
          label: part,
          onClick: isLast
            ? () => {}
            : () => setActiveFolder(folderPath),
        });
      });
      return items;
    }

    return items;
  }, [activeSection, activeCategoryId, activeFolderPath, isPlaylistView, activePlaylistId, categories, playlists, t, setActiveCategory, setActiveFolder, setActiveSection]);

  useEffect(() => {
    const unsubProgress = ipcClient.onScanProgress((progress) => {
      const folderPath = (progress as any).folderPath || 'default';
      if (progress.phase === 'complete') {
        removeScanProgress(folderPath);
        queryClient.invalidateQueries({ queryKey: ['samples'] });
      } else {
        setScanProgress(folderPath, progress);
      }
      // 如果所有扫描都完成了，设置 isScanning = false
      const remaining = useLibraryStore.getState().scanProgresses.size;
      if (remaining === 0) {
        setScanning(false);
      } else {
        setScanning(true);
      }
    });
    const unsubChanged = ipcClient.onLibraryChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['samples'] });
    });
    return () => { unsubProgress(); unsubChanged(); };
  }, [setScanProgress, removeScanProgress, setScanning, queryClient]);

  const handlePlay = useCallback((id: number) => {
    const sample = samples?.find(s => s.id === id);
    if (!sample) return;
    if (samples) {
      const queue = samples.map(s => ({ id: s.id, filePath: s.filePath, fileName: s.fileName }));
      const idx = queue.findIndex(q => q.id === id);
      usePlayerStore.getState().setQueue(queue, idx >= 0 ? idx : 0);
    }
    usePlayerStore.getState().play(id, sample.filePath, sample.fileName);
    ipcClient.addRecent(id).catch(() => {});
  }, [samples]);

  const handleFavorite = useCallback(async (id: number) => {
    try {
      await ipcClient.toggleFavorite(id);
      queryClient.invalidateQueries({ queryKey: ['samples'] });
    } catch (err) {
      handleIpcError(err);
    }
  }, [queryClient]);

  // 统一的选择处理：支持 Ctrl/Cmd+Click 切换，Shift+Click 范围选
  const handleSelect = useCallback((id: number, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedIndex >= 0) {
      // Shift+Click: 范围选
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const rangeIds = displaySamples?.slice(start, end + 1).map(s => s.id) || [];
      selectRange(rangeIds);
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Click: 切换选中
      toggleSelect(id);
    } else {
      // 普通点击在多选模式下：切换选中
      toggleSelect(id);
    }
    setLastClickedIndex(index);
  }, [lastClickedIndex, displaySamples, selectRange, toggleSelect, setLastClickedIndex]);

  const handleSeek = useCallback((id: number, time: number) => {
    const sample = samples?.find(s => s.id === id);
    if (!sample) return;
    const playerState = usePlayerStore.getState();
    if (playerState.currentSampleId !== id) {
      playerState.play(id, sample.filePath, sample.fileName);
    }
    playerState.seek(time);
  }, [samples]);

  const handleAddFolder = async () => {
    try {
      setScanning(true);
      const result = await ipcClient.startScan(null);
      if (!result) setScanning(false);
    } catch (err) {
      handleIpcError(err);
      setScanning(false);
    }
  };

  const handleFiltersChange = useCallback((newFilters: SearchFilters) => {
    setAdvancedFilters(newFilters);
  }, []);

  // 全局键盘快捷键
  useKeyboardShortcuts({
    onFocusSearch: useCallback(() => {
      searchInputRef.current?.focus();
    }, []),
    onToggleSearchPanel: useCallback(() => {
      setShowSearchPanel(prev => !prev);
    }, []),
    onNavigateUp: useCallback(() => {
      if (!displaySamples || displaySamples.length === 0) return;
      setFocusedIndex(prev => {
        const next = Math.max(prev - 1, 0);
        listRef.current?.scrollToItem(next, 'auto');
        return next;
      });
    }, [displaySamples]),
    onNavigateDown: useCallback(() => {
      if (!displaySamples || displaySamples.length === 0) return;
      setFocusedIndex(prev => {
        const next = Math.min(prev + 1, displaySamples.length - 1);
        listRef.current?.scrollToItem(next, 'auto');
        return next;
      });
    }, [displaySamples]),
    onPlaySelected: useCallback(() => {
      if (focusedIndex >= 0 && focusedIndex < (displaySamples?.length ?? 0)) {
        handlePlay(displaySamples[focusedIndex].id);
      }
    }, [focusedIndex, displaySamples, handlePlay]),
    onToggleFavorite: useCallback(() => {
      if (focusedIndex >= 0 && focusedIndex < (displaySamples?.length ?? 0)) {
        handleFavorite(displaySamples[focusedIndex].id);
      }
    }, [focusedIndex, displaySamples, handleFavorite]),
    onEscape: useCallback(() => {
      setFocusedIndex(-1);
      setDetailSample(null);
    }, []),
    onSelectAll: useCallback(() => {
      selectAll(displaySamples.map(s => s.id));
    }, [displaySamples, selectAll]),
  });

  // Keyboard navigation for sample list
  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!displaySamples || displaySamples.length === 0) return;

    // Ctrl/Cmd+A: 全选
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      selectAll(displaySamples.map(s => s.id));
      return;
    }

    // Escape: 取消选择
    if (e.key === 'Escape') {
      if (isMultiSelectMode) {
        clearSelection();
      }
      setFocusedIndex(-1);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = Math.min(prev + 1, displaySamples.length - 1);
          listRef.current?.scrollToItem(next, 'auto');
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = Math.max(prev - 1, 0);
          listRef.current?.scrollToItem(next, 'auto');
          return next;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < displaySamples.length) {
          handlePlay(displaySamples[focusedIndex].id);
        }
        break;
      case 'Delete':
      case 'Backspace':
        if (focusedIndex >= 0 && focusedIndex < displaySamples.length && !e.metaKey && !e.ctrlKey) {
          toggleSelect(displaySamples[focusedIndex].id);
        }
        break;
    }
  }, [displaySamples, focusedIndex, handlePlay, toggleSelect, isMultiSelectMode, clearSelection, selectAll]);

  const handleSampleContextMenu = useCallback((e: React.MouseEvent, sample: Sample) => {
    const items: ContextMenuItem[] = [
      { key: 'play', label: t('contextMenu.play'), icon: <PlayCircleOutlined />, shortcut: 'Enter', onClick: () => handlePlay(sample.id) },
      { key: 'favorite', label: sample.isFavorite ? t('contextMenu.unfavorite') : t('contextMenu.favorite'), icon: sample.isFavorite ? <HeartFilled style={{ color: '#FB7185' }} /> : <HeartOutlined />, shortcut: 'Ctrl+Shift+F', onClick: () => handleFavorite(sample.id) },
      { key: 'divider1', label: '', divider: true, onClick: () => {} },
      { key: 'open-folder', label: t('contextMenu.openInExplorer'), icon: <FolderOpenOutlined />, onClick: () => { ipcClient.showItemInFolder(sample.filePath); } },
      { key: 'copy-path', label: t('contextMenu.copyPath'), icon: <CopyOutlined />, shortcut: 'Ctrl+Shift+C', onClick: () => { navigator.clipboard.writeText(sample.filePath); } },
      { key: 'drag-daw', label: t('contextMenu.dragToDAW'), icon: <DesktopOutlined />, onClick: () => { ipcClient.startDrag([sample.filePath]); } },
      { key: 'divider2', label: '', divider: true, onClick: () => {} },
      { key: 'add-to-playlist', label: t('contextMenu.addToPlaylist'), icon: <UnorderedListOutlined />, onClick: () => {
        const playlists = usePlaylistStore.getState().playlists;
        if (playlists.length === 0) {
          usePlaylistStore.getState().createPlaylist(t('sidebar.defaultPlaylist')).then(p => { usePlaylistStore.getState().addToPlaylist(p.id, [sample.id]); });
        } else { usePlaylistStore.getState().addToPlaylist(playlists[0].id, [sample.id]); }
      }},
      { key: 'select', label: selectedIds.includes(sample.id) ? t('contextMenu.deselect') : t('contextMenu.select'), icon: <SelectOutlined />, onClick: () => toggleSelect(sample.id) },
      { key: 'info', label: t('contextMenu.viewDetail'), icon: <InfoCircleOutlined />, onClick: () => { setDetailSample(sample); } },
      { key: 'divider3', label: '', divider: true, onClick: () => {} },
      { key: 'delete', label: t('contextMenu.delete'), icon: <DeleteOutlined />, danger: true, onClick: () => {} },
    ];
    showMenu(e, items);
  }, [handlePlay, handleFavorite, selectedIds, toggleSelect, showMenu]);

  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    console.log('Batch delete:', ids);
    clearSelection();
  }, [selectedIds, clearSelection]);

  const handleBatchExport = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const data = await ipcClient.exportSamplesJson(ids);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `samples-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      handleIpcError(err);
    }
  }, [selectedIds]);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handlePlaylistDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handlePlaylistDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handlePlaylistDrop = useCallback(async (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex || !activePlaylistId) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const items = [...displaySamples];
    const [moved] = items.splice(dragIndex, 1);
    items.splice(dropIndex, 0, moved);
    const sampleIds = items.map(s => s.id);
    await usePlaylistStore.getState().reorderPlaylistItems(activePlaylistId, sampleIds);
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, displaySamples, activePlaylistId]);

  const handlePlaylistDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const sample = displaySamples?.[index];
    if (!sample) return null;
    const isDragTarget = dragOverIndex === index && dragIndex !== null && dragIndex !== index;
    return (
      <div
        style={{
          ...style,
          ...(isDragTarget ? { borderTop: '2px solid var(--brand-primary)' } : {}),
        }}
        draggable={isPlaylistView}
        onDragStart={() => isPlaylistView && handlePlaylistDragStart(index)}
        onDragOver={(e) => isPlaylistView && handlePlaylistDragOver(e, index)}
        onDrop={() => isPlaylistView && handlePlaylistDrop(index)}
        onDragEnd={handlePlaylistDragEnd}
      >
        <SampleCard
          id={sample.id}
          name={sample.fileName}
          filePath={sample.filePath}
          waveformData={sample.waveformData}
          category={sample.category?.name || 'unknown'}
          bpm={sample.bpm}
          musicalKey={sample.key}
          bitDepth={sample.bitRate ? `${sample.bitRate}-bit` : undefined}
          sampleRate={sample.sampleRate ? `${(sample.sampleRate / 1000).toFixed(1)} kHz` : undefined}
          fileSize={sample.fileSize ? `${(sample.fileSize / 1024 / 1024).toFixed(1)} MB` : undefined}
          duration={sample.duration}
          fileType={sample.fileType}
          isFavorite={sample.isFavorite}
          isFocused={focusedIndex === index}
          isSelected={selectedIds.includes(sample.id)}
          isMultiSelectMode={isMultiSelectMode}
          index={index}
          isCorrupted={sample.isCorrupted}
          tagIds={sample.tags?.map(t => t.id) || []}
          onPlay={handlePlay}
          onFavorite={handleFavorite}
          onSelect={handleSelect}
          onContextMenu={(e, _id) => handleSampleContextMenu(e, sample)}
          searchQuery={debouncedQuery}
        />
      </div>
    );
  }, [displaySamples, focusedIndex, selectedIds, isMultiSelectMode, handlePlay, handleFavorite, handleSelect, handleSampleContextMenu, debouncedQuery, isPlaylistView, dragIndex, dragOverIndex, handlePlaylistDragStart, handlePlaylistDragOver, handlePlaylistDrop, handlePlaylistDragEnd]);

  useEffect(() => {
    listRef.current?.scrollTo(0);
  }, [activeSection, activeCategoryId, activePlaylistId]);

  const SortHeader: React.FC<{ field: string; label: string; width?: number }> = ({ field, label, width }) => {
    const isActive = sortField === field && sortDirection !== 'none';
    return (
      <span
        onClick={() => setSortField(field as any)}
        className={`${s.sortHeader} ${isActive ? s.sortHeaderActive : ''}`}
        style={width ? { width } : undefined}
      >
        {label}
        <span className={`${s.sortArrow} ${isActive ? s.sortArrowVisible : ''} ${isActive && sortDirection === 'desc' ? s.sortArrowDesc : ''}`}>
          ↑
        </span>
      </span>
    );
  };

  const viewButtons = [
    { mode: 'list' as const, icon: <UnorderedListOutlined />, label: t('library.view.list') },
    { mode: 'grid' as const, icon: <AppstoreOutlined />, label: t('library.view.grid') },
    { mode: 'waveform' as const, icon: <SoundOutlined />, label: t('library.view.waveform') },
  ];

  return (
    <div className={s.container}>
      <div className={s.mainColumn}>
      {/* Header section */}
      <div className={s.header}>
        <div className={s.headerRow}>
          <div>
            <h1 className={s.title}>
              {isPlaylistView ? playlists.find(p => p.id === activePlaylistId)?.name || t('sidebar.playlists') : activeSection === 'favorites' ? t('sidebar.favorites') : activeSection === 'recent' ? t('sidebar.recent') : activeSection === 'midi' ? t('sidebar.midi', 'MIDI') : activeSection === 'folder' ? (activeFolderPath?.split(/[/\\]/).pop() || t('sidebar.files', '文件')) : t('sidebar.library')}
            </h1>
            {displaySamples && displaySamples.length > 0 && (
              <p className={s.subtitle}>{t('library.sampleCount', { count: (totalSamples || displaySamples.length).toLocaleString() })}</p>
            )}
          </div>

          <div className={s.headerActions}>
            {/* View switcher */}
            <div className={s.viewSwitcher}>
              {viewButtons.map(btn => (
                <button
                  key={btn.mode}
                  onClick={() => setViewMode(btn.mode)}
                  title={btn.label}
                  className={`${s.viewBtn} ${viewMode === btn.mode ? s.viewBtnActive : ''}`}
                >
                  {btn.icon}
                </button>
              ))}
            </div>

            <Button
              type="primary"
              icon={<FolderAddOutlined />}
              onClick={handleAddFolder}
              loading={isScanning}
              size="middle"
              style={{ borderRadius: 'var(--radius-md)', paddingLeft: 16, paddingRight: 16 }}
            >
              {isScanning ? t('library.scanning') : t('library.addFolder')}
            </Button>
          </div>
        </div>

        {/* Scan Progress */}
        {isScanning && scanProgresses.size > 0 && (
          <div className={s.scanProgressList}>
            {Array.from(scanProgresses.values()).map((progress) => (
              <div key={progress.folderPath} className={s.scanProgressItem}>
                <span className={s.scanProgressFolder} title={progress.folderPath}>
                  {progress.folderPath === 'default' ? t('library.scanning') : progress.folderPath.split(/[/\\]/).pop() || progress.folderPath}
                </span>
                <div className={s.scanProgressBar}>
                  <div
                    className={s.scanProgressFill}
                    style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }}
                  />
                </div>
                <span className={s.scanProgressText}>
                  {progress.phase === 'scanning' && t('library.scanningFiles')}
                  {progress.phase === 'parsing' && t('library.parsingFile', { file: progress.currentFile, current: progress.current, total: progress.total })}
                  {progress.phase === 'classifying' && t('library.classifyingFile', { file: progress.currentFile, current: progress.current, total: progress.total })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Breadcrumb */}
        {breadcrumbItems.length > 0 && (
          <nav className={s.breadcrumb} aria-label={t('breadcrumb.ariaLabel')}>
            {breadcrumbItems.map((item, index) => {
              const isLast = index === breadcrumbItems.length - 1;
              return (
                <React.Fragment key={index}>
                  {index > 0 && (
                    <span className={s.breadcrumbSeparator}>/</span>
                  )}
                  <span
                    className={`${s.breadcrumbItem} ${isLast ? s.breadcrumbActive : ''}`}
                    onClick={isLast ? undefined : item.onClick}
                    role={isLast ? 'none' : 'button'}
                    tabIndex={isLast ? -1 : 0}
                    onKeyDown={(e) => {
                      if (!isLast && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        item.onClick();
                      }
                    }}
                  >
                    {item.label}
                  </span>
                </React.Fragment>
              );
            })}
          </nav>
        )}

        {/* Search Bar */}
        <div className={s.searchBar}>
          <Input
            ref={searchInputRef}
            prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)', marginRight: 8 }} />}
            suffix={
              <button
                onClick={() => setShowSearchPanel(!showSearchPanel)}
                className={`${s.filterToggle} ${showSearchPanel ? s.filterToggleActive : ''}`}
              >
                <FilterOutlined /> {t('library.filter')}
              </button>
            }
            placeholder={t('library.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => { if (!searchQuery && searchHistory.length > 0) setShowSearchHistory(true); }}
            onPressEnter={() => {
              if (searchQuery.trim()) { addSearchQuery(searchQuery.trim()); setShowSearchHistory(false); }
            }}
            size="large"
            style={{
              borderRadius: 'var(--radius-lg)', height: 44,
              background: 'var(--bg-elevated)',
              borderColor: showSearchPanel ? 'var(--brand-primary)' : 'var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />

          {/* Search suggestions */}
          {searchSuggestions.length > 0 && searchQuery && !showSearchHistory && (
            <div className={s.searchHistory}>
              <div className={s.searchHistoryHeader}>
                <span className={s.searchHistoryTitle}>{t('library.suggestions', 'Suggestions')}</span>
              </div>
              {searchSuggestions.map((sug) => (
                <div
                  key={`${sug.type}:${sug.value}`}
                  onClick={() => { setSearchQuery(sug.value); addSearchQuery(sug.value); }}
                  className={s.searchHistoryItem}
                >
                  {sug.type === 'category' && <FolderOutlined style={{ fontSize: 12, color: 'var(--text-tertiary)' }} />}
                  {sug.type === 'tag' && <TagOutlined style={{ fontSize: 12, color: 'var(--text-tertiary)' }} />}
                  {sug.type === 'bpm' && <SoundOutlined style={{ fontSize: 12, color: 'var(--text-tertiary)' }} />}
                  {sug.type === 'key' && <PlayCircleOutlined style={{ fontSize: 12, color: 'var(--text-tertiary)' }} />}
                  <span style={{ flex: 1 }}>{sug.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sug.type}</span>
                </div>
              ))}
            </div>
          )}

          {/* Search history dropdown */}
          {showSearchHistory && searchHistory.length > 0 && !searchQuery && (
            <div className={s.searchHistory}>
              <div className={s.searchHistoryHeader}>
                <span className={s.searchHistoryTitle}>{t('library.searchHistory')}</span>
                <button onClick={() => { clearHistory(); setShowSearchHistory(false); }} className={s.searchHistoryClear}>{t('library.clearHistory')}</button>
              </div>
              {searchHistory.map((q) => (
                <div
                  key={q}
                  onClick={() => { setSearchQuery(q); setShowSearchHistory(false); addSearchQuery(q); }}
                  className={s.searchHistoryItem}
                >
                  <ClockCircleOutlined style={{ fontSize: 12, color: 'var(--text-tertiary)' }} />
                  <span style={{ flex: 1 }}>{q}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeSearchQuery(q); }} style={{ border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 2 }}>
                    <CloseCircleOutlined style={{ fontSize: 11 }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <AnimatePresence>
            {showSearchPanel && (
              <div style={{ position: 'absolute', top: 52, left: 0, right: 0, zIndex: 100 }}>
                <SearchPanel
                  isOpen={showSearchPanel}
                  onClose={() => setShowSearchPanel(false)}
                  filters={advancedFilters}
                  onFiltersChange={handleFiltersChange}
                  resultCount={displaySamples?.length || 0}
                />
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Active filter tags */}
        {hasActiveFilters && (
          <div className={s.filterTags}>
            {advancedFilters.categoryId && (
              <span className={s.filterTag}>
                {t('library.category')}: {categories?.find((c: Category) => c.id === advancedFilters.categoryId)?.name || advancedFilters.categoryId}
                <button className={s.filterTagClose} onClick={() => setAdvancedFilters(prev => { const { categoryId, ...rest } = prev; return rest; })}>×</button>
              </span>
            )}
            {advancedFilters.bpmMin !== undefined && (
              <span className={s.filterTag}>
                BPM: {advancedFilters.bpmMin}{advancedFilters.bpmMax ? `-${advancedFilters.bpmMax}` : '+'}
                <button className={s.filterTagClose} onClick={() => setAdvancedFilters(prev => { const { bpmMin, bpmMax, ...rest } = prev; return rest; })}>×</button>
              </span>
            )}
            {advancedFilters.durationMin !== undefined && (
              <span className={s.filterTag}>
                {t('library.duration')}: {advancedFilters.durationMin}s{advancedFilters.durationMax ? `-${advancedFilters.durationMax}s` : '+'}
                <button className={s.filterTagClose} onClick={() => setAdvancedFilters(prev => { const { durationMin, durationMax, ...rest } = prev; return rest; })}>×</button>
              </span>
            )}
            {advancedFilters.key && (
              <span className={s.filterTag}>
                {t('library.keyLabel')}: {advancedFilters.key}
                <button className={s.filterTagClose} onClick={() => setAdvancedFilters(prev => { const { key, ...rest } = prev; return rest; })}>×</button>
              </span>
            )}
            {advancedFilters.isFavorite && (
              <span className={s.filterTag}>
                {t('library.favoritesOnly')}
                <button className={s.filterTagClose} onClick={() => setAdvancedFilters(prev => { const { isFavorite, ...rest } = prev; return rest; })}>×</button>
              </span>
            )}
            {advancedFilters.tagIds && advancedFilters.tagIds.length > 0 && (
              <span className={s.filterTag}>
                {t('library.tags')}: {t('library.tagsCount', { count: advancedFilters.tagIds.length })}
                <button className={s.filterTagClose} onClick={() => setAdvancedFilters(prev => { const { tagIds, ...rest } = prev; return rest; })}>×</button>
              </span>
            )}
            <button className={s.filterTagClear} onClick={() => setAdvancedFilters({})}>
              {t('library.clearAll')}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 28px 24px' }} tabIndex={0} onKeyDown={handleListKeyDown} className={s.contentArea}>
        {isLoading ? (
          <SampleListSkeleton count={12} viewMode={viewMode} />
        ) : displaySamples && displaySamples.length > 0 ? (
          <>
            {/* List view */}
            {viewMode === 'list' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className={s.listHeader}>
                  <div style={{ width: 30, flexShrink: 0 }} />
                  <div style={{ width: 64, flexShrink: 0 }} />
                  <SortHeader field="fileName" label={t('library.sort.name')} />
                  <span style={{ width: 6, flexShrink: 0 }} />
                  <div style={{ display: 'flex', gap: 10, flexShrink: 0, width: 180 }}>
                    <SortHeader field="bpm" label="BPM" width={40} />
                    <SortHeader field="key" label="KEY" width={30} />
                    <SortHeader field="duration" label={t('library.sort.time')} width={40} />
                  </div>
                  <div style={{ width: 52, flexShrink: 0 }} />
                </div>

                <div style={{ flex: 1 }}>
                  <AutoSizer disableWidth>
                    {({ height }) => (
                      <List ref={listRef} height={height} itemCount={displaySamples.length} itemSize={ROW_HEIGHT} width="100%" overscanCount={10} style={{ outline: 'none' }} aria-label={t('library.sampleList')}>
                        {Row}
                      </List>
                    )}
                  </AutoSizer>
                </div>
              </div>
            )}

            {/* Grid view */}
            {viewMode === 'grid' && (
              <AutoSizer>
                {({ width, height }) => {
                  const COLUMN_WIDTH = 196;
                  const ROW_HEIGHT_GRID = 160;
                  const columnCount = Math.max(1, Math.floor(width / COLUMN_WIDTH));
                  const rowCount = Math.ceil(displaySamples.length / columnCount);

                  const GridCell = ({ columnIndex, rowIndex, style }: { columnIndex: number; rowIndex: number; style: React.CSSProperties }) => {
                    const idx = rowIndex * columnCount + columnIndex;
                    if (idx >= displaySamples.length) return <div style={style} />;
                    const sample = displaySamples[idx];
                    return (
                      <div style={{ ...style, padding: '0 6px 12px' }}>
                        <GridSampleCard sample={sample} isSelected={selectedIds.includes(sample.id)} isMultiSelectMode={isMultiSelectMode} index={idx} onPlay={handlePlay} onFavorite={handleFavorite} onSelect={handleSelect} onContextMenu={handleSampleContextMenu} />
                      </div>
                    );
                  };

                  return (
                    <Grid columnCount={columnCount} columnWidth={COLUMN_WIDTH} height={height} rowCount={rowCount} rowHeight={ROW_HEIGHT_GRID} width={width} overscanRowCount={5} style={{ outline: 'none' }}>
                      {GridCell}
                    </Grid>
                  );
                }}
              </AutoSizer>
            )}

            {/* Waveform view */}
            {viewMode === 'waveform' && (
              <AutoSizer disableWidth>
                {({ height }) => (
                  <List height={height} itemCount={displaySamples.length} itemSize={64} width="100%" overscanCount={15} style={{ outline: 'none' }}>
                    {({ index, style }) => {
                      const sample = displaySamples[index];
                      return (
                        <div style={style}>
                          <WaveformSampleRow sample={sample} currentTime={currentSampleId === sample.id ? currentTime : 0} isSelected={selectedIds.includes(sample.id)} isMultiSelectMode={isMultiSelectMode} index={index} onPlay={handlePlay} onFavorite={handleFavorite} onSelect={handleSelect} onSeek={handleSeek} onContextMenu={handleSampleContextMenu} />
                        </div>
                      );
                    }}
                  </List>
                )}
              </AutoSizer>
            )}
          </>
        ) : (
          <div className={s.emptyState}>
            <EmptyState
              type="no-samples"
              action={
                <Button type="primary" icon={<FolderAddOutlined />} onClick={handleAddFolder} size="middle">
                  {t('library.addSampleFolder')}
                </Button>
              }
            />
          </div>
        )}
      </div>

      {/* Batch action bar */}
      <AnimatePresence>
        {isMultiSelectMode && selectedIds.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={s.batchBar}
          >
            <span className={s.batchInfo}>
              {t('library.batch.selected')} <span className={s.batchCount}>{selectedIds.length}</span> {t('library.batch.items')}
            </span>
            <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
            <div className={s.batchActions}>
              {/* 全选 */}
              <Button size="small" icon={<CheckOutlined />} onClick={() => selectAll(displaySamples?.map(s => s.id) || [])}>{t('library.batch.selectAll', '全选')}</Button>

              {/* 标签 - 下拉选择 */}
              <Dropdown menu={{
                items: (tags || []).map(tag => ({
                  key: String(tag.id),
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color || '#6366F1', display: 'inline-block' }} />
                      {tag.name}
                    </span>
                  ),
                  onClick: async () => {
                    try {
                      await ipcClient.batchAddTag(Array.from(selectedIds), tag.id);
                      queryClient.invalidateQueries({ queryKey: ['samples'] });
                      toast.success(t('library.batch.tagAdded'));
                    } catch (err) { handleIpcError(err); }
                  },
                })),
              }} trigger={['click']}>
                <Button size="small" icon={<TagOutlined />}>{t('library.batch.addTag')} <DownOutlined style={{ fontSize: 10 }} /></Button>
              </Dropdown>

              {/* 分类 - 下拉选择 */}
              <Dropdown menu={{
                items: (categories || []).map(cat => ({
                  key: String(cat.id),
                  label: cat.name,
                  onClick: async () => {
                    try {
                      await ipcClient.updateSamplesCategory(Array.from(selectedIds), cat.id);
                      queryClient.invalidateQueries({ queryKey: ['samples'] });
                      toast.success(t('library.batch.categoryMoved'));
                    } catch (err) { handleIpcError(err); }
                  },
                })),
              }} trigger={['click']}>
                <Button size="small" icon={<FolderOutlined />}>{t('library.batch.moveCategory')} <DownOutlined style={{ fontSize: 10 }} /></Button>
              </Dropdown>

              {/* 播放列表 - 下拉选择 */}
              <Dropdown menu={{
                items: [
                  ...(usePlaylistStore.getState().playlists || []).map(pl => ({
                    key: String(pl.id),
                    label: pl.name,
                    onClick: () => { usePlaylistStore.getState().addToPlaylist(pl.id, selectedIds); toast.success(t('library.batch.addedToList', '已添加到播放列表')); },
                  })),
                  { key: 'new', label: `+ ${t('library.batch.newPlaylist', '新建播放列表')}`, onClick: () => {
                    usePlaylistStore.getState().createPlaylist(t('sidebar.defaultPlaylist')).then(p => { usePlaylistStore.getState().addToPlaylist(p.id, selectedIds); toast.success(t('library.batch.addedToList', '已添加到播放列表')); });
                  }},
                ],
              }} trigger={['click']}>
                <Button size="small" icon={<UnorderedListOutlined />}>{t('library.batch.addToList')} <DownOutlined style={{ fontSize: 10 }} /></Button>
              </Dropdown>

              {/* 导出 ZIP */}
              <Button size="small" icon={<FileZipOutlined />} onClick={async () => {
                try {
                  const result = await ipcClient.exportSamplesPackage(Array.from(selectedIds));
                  if (result) toast.success(t('library.batch.exported', '已导出 {{count}} 个采样', { count: result.count }));
                } catch (err) { handleIpcError(err); }
              }}>{t('library.batch.exportZip', '导出ZIP')}</Button>

              {/* 导出 JSON */}
              <Button size="small" icon={<CopyOutlined />} onClick={handleBatchExport}>{t('library.export')}</Button>

              {/* 拖拽到 DAW */}
              <Button size="small" icon={<DesktopOutlined />} onClick={() => {
                const paths = displaySamples
                  ?.filter(s => selectedIds.includes(s.id))
                  .map(s => s.filePath) ?? [];
                if (paths.length > 0) ipcClient.startDrag(paths);
              }}>{t('library.batch.dragToDAW')}</Button>

              {/* 删除 */}
              <Button size="small" danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>{t('library.delete')}</Button>

              <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
              <Button size="small" type="text" onClick={clearSelection}>{t('library.batch.deselect')}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <MenuComponent />
      </div>
      {/* Detail panel */}
      {detailSample && (
        <SampleDetailPanel sample={detailSample} onClose={() => setDetailSample(null)} onFavorite={handleFavorite} />
      )}
    </div>
  );
};

export default LibraryPage;
