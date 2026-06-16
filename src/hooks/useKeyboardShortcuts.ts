import { useEffect, useCallback, useMemo } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useLibraryStore } from '../stores/libraryStore';
import { useShortcutStore, parseShortcut } from '../stores/shortcutStore';

export interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * 全局键盘快捷键 Hook
 * 支持用户自定义快捷键配置（从 shortcutStore 读取）
 */
export function useKeyboardShortcuts(options?: {
  onToggleSearchPanel?: () => void;
  onPlaySelected?: () => void;
  onToggleFavorite?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onFocusSearch?: () => void;
  onEscape?: () => void;
  onSelectAll?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  const togglePlayPause = usePlayerStore(s => s.isPlaying ? s.pause : s.resume);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const resume = usePlayerStore(s => s.resume);
  const pause = usePlayerStore(s => s.pause);
  const clearSelection = useLibraryStore(s => s.clearSelection);
  const shortcuts = useShortcutStore(s => s.shortcuts);

  // 预编译快捷键匹配器
  const matchers = useMemo(() => ({
    playPause: parseShortcut(shortcuts.playPause),
    navigateUp: parseShortcut(shortcuts.navigateUp),
    navigateDown: parseShortcut(shortcuts.navigateDown),
    playSelected: parseShortcut(shortcuts.playSelected),
    toggleFavorite: parseShortcut(shortcuts.toggleFavorite),
    focusSearch: parseShortcut(shortcuts.focusSearch),
    toggleFilter: parseShortcut(shortcuts.toggleFilter),
    selectAll: parseShortcut(shortcuts.selectAll),
    escape: parseShortcut(shortcuts.escape),
  }), [shortcuts]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // 忽略在输入框中的快捷键（Ctrl 组合键除外）
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Ctrl/Cmd 组合键始终生效
    if (matchers.focusSearch(e)) {
      e.preventDefault();
      options?.onFocusSearch?.();
      return;
    }

    if (matchers.toggleFilter(e)) {
      e.preventDefault();
      options?.onToggleSearchPanel?.();
      return;
    }

    if (matchers.selectAll(e)) {
      e.preventDefault();
      options?.onSelectAll?.();
      return;
    }

    // 在输入框中不处理以下快捷键
    if (isInput) return;

    if (matchers.playPause(e)) {
      e.preventDefault();
      if (isPlaying) { pause(); } else { resume(); }
      return;
    }

    if (matchers.navigateUp(e)) {
      e.preventDefault();
      options?.onNavigateUp?.();
      return;
    }

    if (matchers.navigateDown(e)) {
      e.preventDefault();
      options?.onNavigateDown?.();
      return;
    }

    if (matchers.playSelected(e)) {
      e.preventDefault();
      options?.onPlaySelected?.();
      return;
    }

    if (matchers.toggleFavorite(e)) {
      options?.onToggleFavorite?.();
      return;
    }

    if (matchers.escape(e)) {
      clearSelection();
      options?.onEscape?.();
      return;
    }

    // Ctrl+Z / Cmd+Z: 撤销
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      options?.onUndo?.();
      return;
    }

    // Ctrl+Shift+Z / Cmd+Shift+Z: 重做
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
      e.preventDefault();
      options?.onRedo?.();
      return;
    }

    // Ctrl+Y / Cmd+Y: 重做（备选）
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      options?.onRedo?.();
      return;
    }
  }, [isPlaying, pause, resume, clearSelection, options, matchers]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
