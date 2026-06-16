import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppMode, ProfileConfig } from '@shared/types/profile.types';
import { PROFILE_CONFIGS } from '@shared/types/profile.types';

interface ProfileState {
  appMode: AppMode;
  config: ProfileConfig;
  setAppMode: (mode: AppMode) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      appMode: 'music',
      config: PROFILE_CONFIGS.music,
      setAppMode: (mode: AppMode) => {
        set({
          appMode: mode,
          config: PROFILE_CONFIGS[mode],
        });
        if (typeof window !== 'undefined') {
          (window as any).__modEventBus?.emit('profile:modeChange', mode);
        }
      },
    }),
    {
      name: 'samplerhub-profile',
      partialize: (state) => ({ appMode: state.appMode }),
      merge: (persisted: unknown, current: ProfileState): ProfileState => {
        const mode =
          typeof (persisted as Record<string, unknown>)?.appMode === 'string' &&
          ['music', 'game', 'post'].includes((persisted as Record<string, unknown>).appMode as string)
            ? ((persisted as Record<string, unknown>).appMode as AppMode)
            : current.appMode;
        return {
          ...current,
          appMode: mode,
          config: PROFILE_CONFIGS[mode],
        };
      },
    }
  )
);
