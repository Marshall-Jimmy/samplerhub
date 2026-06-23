import { create } from 'zustand';
import { ipcClient } from '../services/ipcClient';
import type { Playlist, PlaylistItem } from '@shared/types/sample.types';

interface PlaylistState {
  playlists: Playlist[];
  activePlaylistId: number | null;
  playlistItems: PlaylistItem[];
  isLoading: boolean;

  fetchPlaylists: () => Promise<void>;
  createPlaylist: (name: string, description?: string, coverColor?: string) => Promise<Playlist>;
  updatePlaylist: (id: number, data: { name?: string; description?: string; coverColor?: string }) => Promise<void>;
  deletePlaylist: (id: number) => Promise<void>;
  setActivePlaylist: (id: number | null) => void;
  fetchPlaylistItems: (playlistId: number) => Promise<void>;
  addToPlaylist: (playlistId: number, sampleIds: number[]) => Promise<void>;
  removeFromPlaylist: (playlistId: number, sampleId: number) => Promise<void>;
  reorderPlaylistItems: (playlistId: number, sampleIds: number[]) => Promise<void>;
  exportPlaylist: (playlistId: number) => Promise<void>;
}

const PLAYLIST_COLORS = ['#6366F1', '#EF4444', '#22D3EE', '#F59E0B', '#34D399', '#FB7185', '#A78BFA', '#F472B6'];

export const usePlaylistStore = create<PlaylistState>()((set, get) => ({
  playlists: [],
  activePlaylistId: null,
  playlistItems: [],
  isLoading: false,

  fetchPlaylists: async () => {
    try {
      const playlists = await ipcClient.getPlaylists();
      set({ playlists });
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
    }
  },

  createPlaylist: async (name, description, coverColor) => {
    const color = coverColor || PLAYLIST_COLORS[Math.floor(Math.random() * PLAYLIST_COLORS.length)];
    const playlist = await ipcClient.createPlaylist(name, description, color);
    set(s => ({ playlists: [playlist, ...s.playlists] }));
    return playlist;
  },

  updatePlaylist: async (id, data) => {
    await ipcClient.updatePlaylist(id, data);
    set(s => ({
      playlists: s.playlists.map(p => p.id === id ? { ...p, ...data } : p),
    }));
  },

  deletePlaylist: async (id) => {
    await ipcClient.deletePlaylist(id);
    set(s => ({
      playlists: s.playlists.filter(p => p.id !== id),
      activePlaylistId: s.activePlaylistId === id ? null : s.activePlaylistId,
      playlistItems: s.activePlaylistId === id ? [] : s.playlistItems,
    }));
  },

  setActivePlaylist: (id) => {
    set({ activePlaylistId: id });
    if (id) {
      get().fetchPlaylistItems(id);
    } else {
      set({ playlistItems: [] });
    }
  },

  fetchPlaylistItems: async (playlistId) => {
    set({ isLoading: true });
    try {
      const items = await ipcClient.getPlaylistItems(playlistId);
      set({ playlistItems: items, isLoading: false });
    } catch (err) {
      console.error('Failed to fetch playlist items:', err);
      set({ isLoading: false });
    }
  },

  addToPlaylist: async (playlistId, sampleIds) => {
    await ipcClient.addToPlaylist(playlistId, sampleIds);
    // 更新 itemCount
    set(s => ({
      playlists: s.playlists.map(p =>
        p.id === playlistId
          ? { ...p, itemCount: (p.itemCount || 0) + sampleIds.length }
          : p
      ),
    }));
    // 如果当前正在查看该播放列表，刷新内容
    if (get().activePlaylistId === playlistId) {
      await get().fetchPlaylistItems(playlistId);
    }
  },

  removeFromPlaylist: async (playlistId, sampleId) => {
    await ipcClient.removeFromPlaylist(playlistId, sampleId);
    set(s => ({
      playlists: s.playlists.map(p =>
        p.id === playlistId
          ? { ...p, itemCount: Math.max(0, (p.itemCount || 1) - 1) }
          : p
      ),
      playlistItems: s.activePlaylistId === playlistId
        ? s.playlistItems.filter(i => i.sampleId !== sampleId)
        : s.playlistItems,
    }));
  },

  reorderPlaylistItems: async (playlistId, sampleIds) => {
    // 乐观更新：立即重排本地数据
    set(s => {
      if (s.activePlaylistId !== playlistId) return s;
      const itemMap = new Map(s.playlistItems.map(i => [i.sampleId, i]));
      const reordered = sampleIds
        .map(id => itemMap.get(id))
        .filter(Boolean) as PlaylistItem[];
      return { playlistItems: reordered };
    });
    try {
      await ipcClient.reorderPlaylist(playlistId, sampleIds);
    } catch {
      // 失败时回滚
      get().fetchPlaylistItems(playlistId);
    }
  },

  exportPlaylist: async (playlistId) => {
    await ipcClient.exportPlaylist(playlistId);
  },
}));
