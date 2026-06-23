export type AppMode = 'music' | 'game' | 'post';

export interface ProfileConfig {
  mode: AppMode;
  label: string;
  icon: string;
  taxonomyType: string;
  metadataColumns: string[];
  exportTemplates?: string[];
}

export const PROFILE_CONFIGS: Record<AppMode, ProfileConfig> = {
  music: {
    mode: 'music',
    label: '音乐',
    icon: '\uD83C\uDFA7',
    taxonomyType: 'music',
    metadataColumns: ['duration', 'bpm', 'key', 'channels', 'sampleRate'],
  },
  game: {
    mode: 'game',
    label: '游戏',
    icon: '\uD83C\uDFAE',
    taxonomyType: 'ucs',
    metadataColumns: ['ucsCategory', 'duration', 'channels', 'sampleRate', 'lufs', 'isLoop'],
  },
  post: {
    mode: 'post',
    label: '影视',
    icon: '\uD83C\uDFAC',
    taxonomyType: 'scene',
    metadataColumns: ['duration', 'channels', 'sampleRate', 'lufs'],
  },
};

export const ALL_APP_MODES: AppMode[] = ['music', 'game', 'post'];
