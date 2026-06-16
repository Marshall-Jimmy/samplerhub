import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BuiltinThemeName =
  | 'obsidian' | 'midnight' | 'rose' | 'forest' | 'ink' | 'light' | 'high-contrast'
  | 'aurora' | 'cyberpunk' | 'sunset' | 'ocean'
  | 'lavender' | 'sakura' | 'mint' | 'sand'
  | 'teal';

export type ThemeName = BuiltinThemeName | `custom-${string}`;

export interface CustomTheme {
  id: string;
  name: string;
  colors: {
    bgBase: string;
    bgSurface: string;
    bgElevated: string;
    bgHover: string;
    bgActive: string;
    borderSubtle: string;
    borderDefault: string;
    borderStrong: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textDisabled: string;
    brandPrimary: string;
    brandPrimaryHover: string;
    brandAccent: string;
  };
}

export const THEME_LABELS: Record<BuiltinThemeName, string> = {
  obsidian: '黑曜石',
  midnight: '午夜蓝',
  rose: '玫瑰粉',
  forest: '墨绿',
  ink: '水墨',
  light: '浅色',
  'high-contrast': '高对比度',
  aurora: '极光',
  cyberpunk: '赛博朋克',
  sunset: '日落',
  ocean: '深海',
  lavender: '薰衣草',
  sakura: '樱花',
  mint: '薄荷',
  sand: '沙漠',
  teal: '青绿',
};

export const THEME_COLORS: Record<BuiltinThemeName, { primary: string; bg: string; accent: string }> = {
  obsidian: { primary: '#6366F1', bg: '#0A0A0B', accent: '#22D3EE' },
  midnight: { primary: '#3B82F6', bg: '#0B1120', accent: '#06B6D4' },
  rose: { primary: '#F43F5E', bg: '#1A0A10', accent: '#FB923C' },
  forest: { primary: '#22C55E', bg: '#0A120A', accent: '#A3E635' },
  ink: { primary: '#A78BFA', bg: '#0D0D0D', accent: '#F9A8D4' },
  light: { primary: '#4F46E5', bg: '#F8F9FA', accent: '#0891B2' },
  'high-contrast': { primary: '#FFD700', bg: '#000000', accent: '#00FFFF' },
  aurora: { primary: '#8B5CF6', bg: '#0C0E1A', accent: '#34D399' },
  cyberpunk: { primary: '#FF2D78', bg: '#0A0A0F', accent: '#00FFD4' },
  sunset: { primary: '#FF6B35', bg: '#120A08', accent: '#C084FC' },
  ocean: { primary: '#0EA5E9', bg: '#040810', accent: '#2DD4BF' },
  lavender: { primary: '#7C3AED', bg: '#F5F0FF', accent: '#A78BFA' },
  sakura: { primary: '#EC4899', bg: '#FFF5F7', accent: '#FB7185' },
  mint: { primary: '#10B981', bg: '#F0FBF4', accent: '#06B6D4' },
  sand: { primary: '#D97706', bg: '#FBF7F0', accent: '#EF4444' },
  teal: { primary: '#14B8A6', bg: '#041214', accent: '#5EEAD4' },
};

/** 将自定义主题的 colors 应用到 document */
export function applyCustomTheme(theme: CustomTheme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', `custom-${theme.id}`);
  const c = theme.colors;
  const vars: Record<string, string> = {
    '--bg-base': c.bgBase,
    '--bg-surface': c.bgSurface,
    '--bg-elevated': c.bgElevated,
    '--bg-hover': c.bgHover,
    '--bg-active': c.bgActive,
    '--border-subtle': c.borderSubtle,
    '--border-default': c.borderDefault,
    '--border-strong': c.borderStrong,
    '--text-primary': c.textPrimary,
    '--text-secondary': c.textSecondary,
    '--text-tertiary': c.textTertiary,
    '--text-disabled': c.textDisabled,
    '--brand-primary': c.brandPrimary,
    '--brand-primary-hover': c.brandPrimaryHover,
    '--brand-accent': c.brandAccent,
    '--brand-accent-dim': `${c.brandAccent}26`,
    '--scrollbar-thumb': c.borderDefault,
    '--scrollbar-thumb-hover': c.borderStrong,
    '--selection-bg': `${c.brandPrimary}66`,
  };
  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
}

/** 清除自定义主题的 inline styles */
export function clearCustomTheme() {
  const root = document.documentElement;
  const customVars = [
    '--bg-base', '--bg-surface', '--bg-elevated', '--bg-hover', '--bg-active',
    '--border-subtle', '--border-default', '--border-strong',
    '--text-primary', '--text-secondary', '--text-tertiary', '--text-disabled',
    '--brand-primary', '--brand-primary-hover', '--brand-accent', '--brand-accent-dim',
    '--scrollbar-thumb', '--scrollbar-thumb-hover', '--selection-bg',
  ];
  customVars.forEach(v => root.style.removeProperty(v));
}

/** 快捷键配置 */
export interface ShortcutConfig {
  playPause: string;       // 播放/暂停
  navigateUp: string;      // 上移
  navigateDown: string;    // 下移
  playSelected: string;    // 播放选中
  toggleFavorite: string;  // 切换收藏
  focusSearch: string;     // 聚焦搜索
  toggleFilter: string;    // 切换筛选面板
  selectAll: string;       // 全选
  escape: string;          // 取消/关闭
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  playPause: 'Space',
  navigateUp: 'j',
  navigateDown: 'k',
  playSelected: 'Enter',
  toggleFavorite: 'l',
  focusSearch: 'Ctrl+f',
  toggleFilter: 'Ctrl+Shift+f',
  selectAll: 'Ctrl+a',
  escape: 'Escape',
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

interface SettingsState {
  volume: number;
  autoPlayNext: boolean;
  waveformDataEnabled: boolean;
  theme: ThemeName;
  customThemes: CustomTheme[];
  shortcuts: ShortcutConfig;
  onlineSampleEnabled: boolean;
  freesoundApiKey: string;
  pixabayApiKey: string;
  onlineDownloadFolder: string;
  hasCompletedOnboarding: boolean;

  setVolume: (volume: number) => void;
  setAutoPlayNext: (enabled: boolean) => void;
  setWaveformDataEnabled: (enabled: boolean) => void;
  setTheme: (theme: ThemeName) => void;
  setShortcuts: (shortcuts: Partial<ShortcutConfig>) => void;
  resetShortcuts: () => void;
  addCustomTheme: (theme: CustomTheme) => void;
  removeCustomTheme: (id: string) => void;
  updateCustomTheme: (id: string, updates: Partial<CustomTheme>) => void;
  exportCustomThemes: () => string;
  importCustomThemes: (json: string) => { imported: number; skipped: number };
  setOnlineSampleEnabled: (enabled: boolean) => void;
  setFreesoundApiKey: (key: string) => void;
  setPixabayApiKey: (key: string) => void;
  setOnlineDownloadFolder: (folder: string) => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      volume: 0.75,
      autoPlayNext: true,
      waveformDataEnabled: true,
      theme: 'teal' as ThemeName,
      customThemes: [],
      shortcuts: DEFAULT_SHORTCUTS,
      onlineSampleEnabled: false,
      freesoundApiKey: '',
      pixabayApiKey: '',
      onlineDownloadFolder: '',
      hasCompletedOnboarding: false,

      setVolume: (volume) => set({ volume }),
      setAutoPlayNext: (enabled) => set({ autoPlayNext: enabled }),
      setWaveformDataEnabled: (enabled) => set({ waveformDataEnabled: enabled }),
      setShortcuts: (updates) => set(s => ({ shortcuts: { ...s.shortcuts, ...updates } })),
      resetShortcuts: () => set({ shortcuts: DEFAULT_SHORTCUTS }),
      setTheme: (theme) => {
        clearCustomTheme();
        if (theme.startsWith('custom-')) {
          const customId = theme.replace('custom-', '');
          const ct = get().customThemes.find(t => t.id === customId);
          if (ct) applyCustomTheme(ct);
        }
        set({ theme });
      },
      addCustomTheme: (theme) => set(s => ({ customThemes: [...s.customThemes, theme] })),
      removeCustomTheme: (id) => set(s => ({
        customThemes: s.customThemes.filter(t => t.id !== id),
        theme: s.theme === `custom-${id}` ? 'teal' : s.theme,
      })),
      updateCustomTheme: (id, updates) => set(s => ({
        customThemes: s.customThemes.map(t => t.id === id ? { ...t, ...updates } : t),
      })),
      exportCustomThemes: () => {
        const { customThemes } = get();
        return JSON.stringify({ version: 1, themes: customThemes }, null, 2);
      },
      importCustomThemes: (json) => {
        try {
          const data = JSON.parse(json);
          const themes: CustomTheme[] = Array.isArray(data?.themes) ? data.themes : [];
          const existingIds = new Set(get().customThemes.map(t => t.id));
          let imported = 0;
          let skipped = 0;
          const newThemes: CustomTheme[] = [];
          for (const t of themes) {
            if (t.id && t.name && t.colors && !existingIds.has(t.id)) {
              newThemes.push(t);
              imported++;
            } else {
              skipped++;
            }
          }
          if (newThemes.length > 0) {
            set(s => ({ customThemes: [...s.customThemes, ...newThemes] }));
          }
          return { imported, skipped };
        } catch {
          return { imported: 0, skipped: 0 };
        }
      },
      setOnlineSampleEnabled: (enabled) => set({ onlineSampleEnabled: enabled }),
      setFreesoundApiKey: (key) => set({ freesoundApiKey: key }),
      setPixabayApiKey: (key) => set({ pixabayApiKey: key }),
      setOnlineDownloadFolder: (folder) => set({ onlineDownloadFolder: folder }),
      setHasCompletedOnboarding: (completed) => set({ hasCompletedOnboarding: completed }),
    }),
    {
      name: 'samplerhub-settings',
    }
  )
);
