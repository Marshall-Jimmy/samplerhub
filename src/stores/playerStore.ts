import { create } from 'zustand';
import Howl from 'howler';
import { ipcClient } from '../services/ipcClient';

interface PlayableItem {
  id: number;
  filePath: string;
  fileName: string;
}

// 变速播放预设
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type PlaybackRate = typeof PLAYBACK_RATES[number];

// Howl 实例存于模块级变量，不进入 Zustand state
let currentHowl: Howl.Howl | null = null;
let preloadedHowl: Howl.Howl | null = null;
let preloadedId: number | null = null;

interface PlayerState {
  currentSampleId: number | null;
  currentSampleName: string;
  currentSamplePath: string;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  progress: number;
  volume: number;
  isLooping: boolean;
  playbackRate: PlaybackRate;
  playQueue: PlayableItem[];
  queueIndex: number;

  // A-B 循环
  loopStart: number | null;
  loopEnd: number | null;
  isABLooping: boolean;

  play: (sampleId: number, filePath: string, fileName: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleLoop: () => void;
  setPlaybackRate: (rate: PlaybackRate) => void;
  tick: () => void;
  setQueue: (items: PlayableItem[], startIndex?: number) => void;
  playNext: () => void;
  playPrev: () => void;

  // A-B 循环控制
  setLoopA: () => void;
  setLoopB: () => void;
  clearABLoop: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSampleId: null,
  currentSampleName: '',
  currentSamplePath: '',
  isPlaying: false,
  duration: 0,
  currentTime: 0,
  progress: 0,
  volume: 0.75,
  isLooping: false,
  playbackRate: 1,
  playQueue: [],
  queueIndex: -1,
  loopStart: null,
  loopEnd: null,
  isABLooping: false,

  play: (sampleId, filePath, fileName) => {
    const { playQueue, playbackRate } = get();

    // 如果是同一个文件，切换播放/暂停
    if (currentHowl && get().currentSampleId === sampleId) {
      if (get().isPlaying) {
        currentHowl.pause();
        set({ isPlaying: false });
      } else {
        currentHowl.play();
        set({ isPlaying: true });
      }
      return;
    }

    // 停止当前播放
    if (currentHowl) {
      currentHowl.unload();
      currentHowl = null;
    }

    // 清除 A-B 循环
    set({ loopStart: null, loopEnd: null, isABLooping: false });

    // 更新队列索引
    const idx = playQueue.findIndex(item => item.id === sampleId);
    if (idx >= 0) {
      set({ queueIndex: idx });
    }

    // 记录播放统计
    ipcClient.recordPlay(sampleId).catch(() => {});

    // 创建新的 Howl 实例
    const newHowl = new Howl.Howl({
      src: [`file://${filePath}`],
      volume: get().volume,
      rate: playbackRate,
      loop: get().isLooping,
      html5: true,
      onload: () => {
        set({ duration: newHowl.duration() });
      },
      onplay: () => {
        set({ isPlaying: true });
      },
      onpause: () => {
        set({ isPlaying: false });
      },
      onstop: () => {
        set({ isPlaying: false, currentTime: 0, progress: 0 });
      },
      onend: () => {
        const { isLooping } = get();
        if (isLooping) return;
        // 非循环模式：播放完毕即停止，不自动播放下一个
        set({ isPlaying: false, currentTime: 0, progress: 0 });
      },
    });

    currentHowl = newHowl;
    newHowl.play();

    set({
      currentSampleId: sampleId,
      currentSampleName: fileName,
      currentSamplePath: filePath,
      isPlaying: true,
      currentTime: 0,
      progress: 0,
    });

    // 预加载队列中下一个采样
    const currentIdx = idx >= 0 ? idx : playQueue.findIndex(item => item.id === sampleId);
    if (currentIdx >= 0 && currentIdx + 1 < playQueue.length) {
      const nextItem = playQueue[currentIdx + 1];
      if (preloadedId !== nextItem.id) {
        if (preloadedHowl) {
          preloadedHowl.unload();
        }
        preloadedId = nextItem.id;
        preloadedHowl = new Howl.Howl({
          src: [`file://${nextItem.filePath}`],
          volume: get().volume,
          rate: playbackRate,
          html5: true,
          preload: true,
        });
      }
    }
  },

  pause: () => {
    if (currentHowl) {
      currentHowl.pause();
      set({ isPlaying: false });
    }
  },

  resume: () => {
    if (currentHowl) {
      currentHowl.play();
      set({ isPlaying: true });
    }
  },

  stop: () => {
    if (currentHowl) {
      currentHowl.stop();
      currentHowl.unload();
      currentHowl = null;
    }
    if (preloadedHowl) {
      preloadedHowl.unload();
      preloadedHowl = null;
      preloadedId = null;
    }
    set({ isPlaying: false, currentTime: 0, progress: 0, loopStart: null, loopEnd: null, isABLooping: false });
  },

  seek: (time: number) => {
    const { duration } = get();
    if (currentHowl) {
      currentHowl.seek(time);
      set({
        currentTime: time,
        progress: duration > 0 ? time / duration : 0,
      });
    }
  },

  setVolume: (volume: number) => {
    if (currentHowl) {
      currentHowl.volume(volume);
    }
    set({ volume });
  },

  toggleLoop: () => {
    const { isLooping } = get();
    const newLooping = !isLooping;
    if (currentHowl) {
      currentHowl.loop(newLooping);
    }
    set({ isLooping: newLooping });
  },

  setPlaybackRate: (rate: PlaybackRate) => {
    if (currentHowl) {
      currentHowl.rate(rate);
    }
    set({ playbackRate: rate });
  },

  tick: () => {
    const { duration, isABLooping, loopStart, loopEnd } = get();
    if (currentHowl && get().isPlaying) {
      const currentTime = currentHowl.seek() as number;

      // A-B 循环检测
      if (isABLooping && loopStart !== null && loopEnd !== null && currentTime >= loopEnd) {
        currentHowl.seek(loopStart);
        set({
          currentTime: loopStart,
          progress: duration > 0 ? loopStart / duration : 0,
        });
        return;
      }

      set({
        currentTime,
        progress: duration > 0 ? currentTime / duration : 0,
      });
    }
  },

  setQueue: (items: PlayableItem[], startIndex: number = 0) => {
    set({ playQueue: items, queueIndex: startIndex });
  },

  playNext: () => {
    const { playQueue, queueIndex } = get();
    const nextIndex = queueIndex + 1;
    if (nextIndex < playQueue.length) {
      const next = playQueue[nextIndex];
      // 如果已预加载，直接使用预加载实例实现无缝切换
      const cached = preloadedHowl;
      if (cached && preloadedId === next.id) {
        if (currentHowl) {
          currentHowl.unload();
        }
        currentHowl = cached;
        preloadedHowl = null;
        preloadedId = null;

        currentHowl.volume(get().volume);
        currentHowl.rate(get().playbackRate);
        currentHowl.loop(get().isLooping);
        currentHowl.play();

        set({
          currentSampleId: next.id,
          currentSampleName: next.fileName,
          currentSamplePath: next.filePath,
          isPlaying: true,
          currentTime: 0,
          progress: 0,
          queueIndex: nextIndex,
          loopStart: null,
          loopEnd: null,
          isABLooping: false,
          duration: currentHowl.duration() || 0,
        });

        // 预加载下下个
        if (nextIndex + 1 < playQueue.length) {
          const nextNextItem = playQueue[nextIndex + 1];
          preloadedId = nextNextItem.id;
          preloadedHowl = new Howl.Howl({
            src: [`file://${nextNextItem.filePath}`],
            volume: get().volume,
            rate: get().playbackRate,
            html5: true,
            preload: true,
          });
        }
      } else {
        get().play(next.id, next.filePath, next.fileName);
      }
    }
  },

  playPrev: () => {
    const { playQueue, queueIndex, currentTime } = get();
    if (currentTime > 3) {
      get().seek(0);
      return;
    }
    const prevIndex = queueIndex - 1;
    if (prevIndex >= 0) {
      const prev = playQueue[prevIndex];
      get().play(prev.id, prev.filePath, prev.fileName);
    }
  },

  setLoopA: () => {
    const { currentTime } = get();
    set({ loopStart: currentTime, isABLooping: false });
    const { loopEnd } = get();
    if (loopEnd !== null && loopEnd > currentTime) {
      set({ isABLooping: true });
    }
  },

  setLoopB: () => {
    const { currentTime, loopStart } = get();
    set({ loopEnd: currentTime });
    if (loopStart !== null && currentTime > loopStart) {
      set({ isABLooping: true });
    }
  },

  clearABLoop: () => {
    set({ loopStart: null, loopEnd: null, isABLooping: false });
  },
}));
