import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ShortcutConfig {
  playPause: string;
  navigateUp: string;
  navigateDown: string;
  playSelected: string;
  toggleFavorite: string;
  focusSearch: string;
  toggleFilter: string;
  selectAll: string;
  escape: string;
}

interface ShortcutState {
  shortcuts: ShortcutConfig;
  updateShortcut: (key: keyof ShortcutConfig, value: string) => void;
  resetShortcuts: () => void;
  exportShortcuts: () => string;
  importShortcuts: (json: string) => boolean;
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  playPause: 'Space',
  navigateUp: 'ArrowUp',
  navigateDown: 'ArrowDown',
  playSelected: 'Enter',
  toggleFavorite: 'F',
  focusSearch: 'Ctrl+K',
  toggleFilter: 'Ctrl+Shift+F',
  selectAll: 'Ctrl+A',
  escape: 'Escape',
};

export const SHORTCUT_LABELS: Record<keyof ShortcutConfig, string> = {
  playPause: '播放/暂停',
  navigateUp: '上一个采样',
  navigateDown: '下一个采样',
  playSelected: '播放选中采样',
  toggleFavorite: '收藏/取消收藏',
  focusSearch: '聚焦搜索框',
  toggleFilter: '切换筛选面板',
  selectAll: '全选',
  escape: '取消/关闭',
};

/** 解析快捷键字符串为匹配函数 */
export function parseShortcut(shortcut: string): (e: KeyboardEvent) => boolean {
  const parts = shortcut.toLowerCase().split('+').map(p => p.trim());
  const key = parts[parts.length - 1];
  const hasCtrl = parts.includes('ctrl') || parts.includes('cmd') || parts.includes('meta');
  const hasShift = parts.includes('shift');
  const hasAlt = parts.includes('alt');

  return (e: KeyboardEvent) => {
    const ctrlMatch = hasCtrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
    const shiftMatch = hasShift ? e.shiftKey : !e.shiftKey;
    const altMatch = hasAlt ? e.altKey : !e.altKey;
    const keyMatch = e.key.toLowerCase() === key || e.code.toLowerCase() === key;
    return ctrlMatch && shiftMatch && altMatch && keyMatch;
  };
}

/** 格式化快捷键显示 */
export function formatShortcut(shortcut: string): string {
  return shortcut
    .replace(/Ctrl/g, 'Ctrl')
    .replace(/Shift/g, 'Shift')
    .replace(/Alt/g, 'Alt')
    .replace(/ArrowUp/g, '↑')
    .replace(/ArrowDown/g, '↓')
    .replace(/ArrowLeft/g, '←')
    .replace(/ArrowRight/g, '→')
    .replace(/Space/g, '空格');
}

/** 从键盘事件生成快捷键字符串 */
export function shortcutFromEvent(e: KeyboardEvent): string | null {
  // 忽略单独的修饰键
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    return null;
  }

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');

  let key = e.key;
  if (e.code.startsWith('Key') && e.key.length === 1) {
    key = e.key.toUpperCase();
  } else if (e.code.startsWith('Digit')) {
    key = e.key;
  } else if (e.code.startsWith('Arrow')) {
    key = e.code;
  } else if (e.key === ' ') {
    key = 'Space';
  }

  parts.push(key);
  return parts.join('+');
}

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set, get) => ({
      shortcuts: { ...DEFAULT_SHORTCUTS },
      updateShortcut: (key, value) =>
        set((state) => ({
          shortcuts: { ...state.shortcuts, [key]: value },
        })),
      resetShortcuts: () => set({ shortcuts: { ...DEFAULT_SHORTCUTS } }),
      exportShortcuts: () => {
        return JSON.stringify({ version: 1, shortcuts: get().shortcuts }, null, 2);
      },
      importShortcuts: (json) => {
        try {
          const data = JSON.parse(json);
          if (data.shortcuts && typeof data.shortcuts === 'object') {
            const validKeys = Object.keys(DEFAULT_SHORTCUTS);
            const imported: Partial<ShortcutConfig> = {};
            for (const key of validKeys) {
              if (typeof data.shortcuts[key] === 'string') {
                imported[key as keyof ShortcutConfig] = data.shortcuts[key];
              }
            }
            set((state) => ({
              shortcuts: { ...state.shortcuts, ...imported },
            }));
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'samplerhub-shortcuts',
    }
  )
);
