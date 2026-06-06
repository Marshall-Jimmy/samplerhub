import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SearchHistoryState {
  history: string[];
  addQuery: (query: string) => void;
  removeQuery: (query: string) => void;
  clearHistory: () => void;
}

const MAX_HISTORY = 20;

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set, get) => ({
      history: [],

      addQuery: (query) => {
        if (!query.trim()) return;
        const { history } = get();
        // 去重，移到最前
        const filtered = history.filter(h => h !== query);
        const next = [query, ...filtered].slice(0, MAX_HISTORY);
        set({ history: next });
      },

      removeQuery: (query) => {
        set({ history: get().history.filter(h => h !== query) });
      },

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'search-history',
    }
  )
);
