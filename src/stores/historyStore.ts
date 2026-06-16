/**
 * 撤销/重做历史管理器
 *
 * 为关键操作提供 undo/redo 能力：
 * - 删除采样
 * - 批量分类变更
 * - 播放列表编辑
 *
 * 使用命令模式：每个可撤销操作是一个 Command，包含 do/undo 方法
 */

import { create } from 'zustand';

export interface HistoryCommand {
  id: string;
  type: string;
  label: string;
  timestamp: number;
  do: () => Promise<void>;
  undo: () => Promise<void>;
}

interface HistoryState {
  past: HistoryCommand[];
  future: HistoryCommand[];
  isExecuting: boolean;

  // 执行新命令（自动清除 redo 栈）
  execute: (cmd: HistoryCommand) => Promise<void>;
  // 撤销
  undo: () => Promise<void>;
  // 重做
  redo: () => Promise<void>;
  // 清空历史
  clear: () => void;
  // 是否可以撤销/重做
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  isExecuting: false,

  execute: async (cmd) => {
    const state = get();
    if (state.isExecuting) return;

    set({ isExecuting: true });
    try {
      await cmd.do();
      set(s => ({
        past: [...s.past, cmd],
        future: [], // 新操作清除 redo 栈
        isExecuting: false,
      }));
    } catch (err) {
      set({ isExecuting: false });
      throw err;
    }
  },

  undo: async () => {
    const state = get();
    if (state.past.length === 0 || state.isExecuting) return;

    const cmd = state.past[state.past.length - 1];
    set({ isExecuting: true });
    try {
      await cmd.undo();
      set(s => ({
        past: s.past.slice(0, -1),
        future: [cmd, ...s.future],
        isExecuting: false,
      }));
    } catch (err) {
      set({ isExecuting: false });
      throw err;
    }
  },

  redo: async () => {
    const state = get();
    if (state.future.length === 0 || state.isExecuting) return;

    const cmd = state.future[0];
    set({ isExecuting: true });
    try {
      await cmd.do();
      set(s => ({
        past: [...s.past, cmd],
        future: s.future.slice(1),
        isExecuting: false,
      }));
    } catch (err) {
      set({ isExecuting: false });
      throw err;
    }
  },

  clear: () => set({ past: [], future: [], isExecuting: false }),

  canUndo: () => get().past.length > 0 && !get().isExecuting,
  canRedo: () => get().future.length > 0 && !get().isExecuting,
}));
