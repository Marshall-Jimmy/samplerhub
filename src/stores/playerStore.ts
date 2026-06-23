import { create } from 'zustand';
import Howl from 'howler';
import { ipcClient } from '../services/ipcClient';
import { midiPlay, midiStop, midiIsPlaying } from '../hooks/useMidiPreview';

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
let currentBlobUrl: string | null = null;
let preloadedHowl: Howl.Howl | null = null;
let preloadedBlobUrl: string | null = null;
let preloadedId: number | null = null;
// 播放代数，用于防止旧 Howl 的异步回调覆盖新播放状态
let playGeneration = 0;

/** 清理 Howl 实例和对应的 Blob URL */
function cleanupHowl(howl: Howl.Howl | null, blobUrl: string | null): void {
  if (howl) {
    howl.unload();
  }
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
  }
}

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

  // 最近播放（最多 50 条）
  recentSamples: PlayableItem[];
  addToRecent: (item: PlayableItem) => void;
  clearRecent: () => void;

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
  recentSamples: [],

  addToRecent: (item) => {
    set(s => {
      const filtered = s.recentSamples.filter(r => r.id !== item.id);
      return { recentSamples: [item, ...filtered].slice(0, 50) };
    });
  },
  clearRecent: () => set({ recentSamples: [] }),

  play: (sampleId, filePath, fileName) => {
    const { playQueue, playbackRate, isPlaying, currentSampleId } = get();

    // --- MIDI 文件走 tinysynth 路径 ---
    const isMidi = fileName.toLowerCase().endsWith('.mid') || fileName.toLowerCase().endsWith('.midi');
    if (isMidi) {
      // 同一首 MIDI 正在播 -> 停止
      if (midiIsPlaying(filePath) && currentSampleId === sampleId && isPlaying) {
        midiStop();
        set({ isPlaying: false, currentTime: 0, progress: 0 });
        if (typeof window !== 'undefined') {
          (window as any).__modEventBus?.emit('player:stop', {});
        }
        return;
      }

      // 停止当前播放（音频或 MIDI）
      cleanupHowl(currentHowl, currentBlobUrl);
      currentHowl = null;
      currentBlobUrl = null;
      midiStop();

      // 清除 A-B 循环
      set({ loopStart: null, loopEnd: null, isABLooping: false });

      // 更新队列索引
      const idx = playQueue.findIndex(item => item.id === sampleId);
      if (idx >= 0) {
        set({ queueIndex: idx });
      }

      // 记录播放统计
      ipcClient.recordPlay(sampleId).catch(() => {});
      get().addToRecent({ id: sampleId, filePath, fileName });

      // 设置播放状态
      set({
        currentSampleId: sampleId,
        currentSampleName: fileName,
        currentSamplePath: filePath,
        isPlaying: true,
        currentTime: 0,
        progress: 0,
      });

      if (typeof window !== 'undefined') {
        (window as any).__modEventBus?.emit('player:play', { sampleId, filePath, fileName });
      }

      // 异步加载并播放 MIDI
      midiPlay(filePath).catch((err) => {
        console.error('[Player] MIDI play failed:', err);
        set({ isPlaying: false, currentTime: 0, progress: 0 });
      });
      return;
    }
    // --- MIDI 路径结束 ---

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

    // 递增代数，使旧 Howl 的异步回调失效
    const gen = ++playGeneration;

    // 停止当前播放：先 stop 再 unload，确保 HTML5 Audio 立即停止
    cleanupHowl(currentHowl, currentBlobUrl);
    currentHowl = null;
    currentBlobUrl = null;

    // 清除 A-B 循环
    set({ loopStart: null, loopEnd: null, isABLooping: false });

    // 更新队列索引
    const idx = playQueue.findIndex(item => item.id === sampleId);
    if (idx >= 0) {
      set({ queueIndex: idx });
    }

    // 记录播放统计
    ipcClient.recordPlay(sampleId).catch(() => {});

    // 添加到最近播放
    get().addToRecent({ id: sampleId, filePath, fileName });

    // 通过 IPC 读取音频文件并创建 Blob URL，绕过 file:// URL 特殊字符问题
    ipcClient.getAudioBuffer(filePath).then((arrayBuffer) => {
      if (playGeneration !== gen) return;
      const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
      const blobUrl = URL.createObjectURL(blob);

      const newHowl = new Howl.Howl({
        src: [blobUrl],
        format: ['wav', 'mp3', 'flac'],
        volume: get().volume,
        rate: playbackRate,
        loop: get().isLooping,
        html5: true,
        onload: () => {
          if (playGeneration !== gen) return;
          set({ duration: newHowl.duration() });
        },
        onloaderror: (_id, err) => {
          if (playGeneration !== gen) return;
          console.error('[Player] load error:', err);
          URL.revokeObjectURL(blobUrl);
          set({ isPlaying: false, currentTime: 0, progress: 0 });
        },
        onplay: () => {
          if (playGeneration !== gen) return;
          set({ isPlaying: true });
        },
        onplayerror: (_id, err) => {
          if (playGeneration !== gen) return;
          console.error('[Player] play error:', err);
          newHowl.once('unlock', () => {
            if (playGeneration === gen) newHowl.play();
          });
        },
        onpause: () => {
          if (playGeneration !== gen) return;
          set({ isPlaying: false });
        },
        onstop: () => {
          if (playGeneration !== gen) return;
          set({ isPlaying: false, currentTime: 0, progress: 0 });
        },
        onend: () => {
          if (playGeneration !== gen) return;
          const { isLooping } = get();
          if (isLooping) return;
          URL.revokeObjectURL(blobUrl);
          set({ isPlaying: false, currentTime: 0, progress: 0 });
        },
      });

      currentHowl = newHowl;
      currentBlobUrl = blobUrl;
      newHowl.play();
    }).catch((err) => {
      if (playGeneration !== gen) return;
      console.error('[Player] Failed to load audio buffer:', err);
      set({ isPlaying: false, currentTime: 0, progress: 0 });
    });

    set({
      currentSampleId: sampleId,
      currentSampleName: fileName,
      currentSamplePath: filePath,
      isPlaying: true,
      currentTime: 0,
      progress: 0,
    });

    if (typeof window !== 'undefined') {
      (window as any).__modEventBus?.emit('player:play', { sampleId, filePath, fileName });
    }

    // 预加载队列中下一个采样
    const currentIdx = idx >= 0 ? idx : playQueue.findIndex(item => item.id === sampleId);
    if (currentIdx >= 0 && currentIdx + 1 < playQueue.length) {
      const nextItem = playQueue[currentIdx + 1];
      if (preloadedId !== nextItem.id) {
        cleanupHowl(preloadedHowl, preloadedBlobUrl);
        preloadedHowl = null;
        preloadedBlobUrl = null;
        preloadedId = nextItem.id;
        // 预加载也使用 IPC 读取，避免 file:// URL 特殊字符问题
        ipcClient.getAudioBuffer(nextItem.filePath).then((arrayBuffer) => {
          const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
          const blobUrl = URL.createObjectURL(blob);
          preloadedHowl = new Howl.Howl({
            src: [blobUrl],
            format: ['wav', 'mp3', 'flac'],
            volume: get().volume,
            rate: playbackRate,
            html5: true,
            preload: true,
          });
          preloadedBlobUrl = blobUrl;
        }).catch(() => {});
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
    // 停止 MIDI
    midiStop();
    // 停止普通音频
    cleanupHowl(currentHowl, currentBlobUrl);
    currentHowl = null;
    currentBlobUrl = null;
    cleanupHowl(preloadedHowl, preloadedBlobUrl);
    preloadedHowl = null;
    preloadedBlobUrl = null;
    preloadedId = null;
    set({ isPlaying: false, currentTime: 0, progress: 0, loopStart: null, loopEnd: null, isABLooping: false });
    if (typeof window !== 'undefined') {
      (window as any).__modEventBus?.emit('player:stop', {});
    }
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
      const cachedBlobUrl = preloadedBlobUrl;
      if (cached && preloadedId === next.id) {
        cleanupHowl(currentHowl, currentBlobUrl);
        currentHowl = cached;
        currentBlobUrl = cachedBlobUrl;
        preloadedHowl = null;
        preloadedBlobUrl = null;
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
          // 预加载也使用 IPC 读取，避免 file:// URL 特殊字符问题
          ipcClient.getAudioBuffer(nextNextItem.filePath).then((arrayBuffer) => {
            const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
            const blobUrl = URL.createObjectURL(blob);
            preloadedHowl = new Howl.Howl({
              src: [blobUrl],
              format: ['wav', 'mp3', 'flac'],
              volume: get().volume,
              rate: get().playbackRate,
              html5: true,
              preload: true,
            });
            preloadedBlobUrl = blobUrl;
          }).catch(() => {});
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
