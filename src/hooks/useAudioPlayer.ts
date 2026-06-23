import { useCallback, useEffect, useRef } from 'react';
import { usePlayerStore, PlaybackRate, PLAYBACK_RATES } from '../stores/playerStore';
import { formatDuration } from '../utils/format';

export function useAudioPlayer() {
  const {
    currentSampleId,
    currentSampleName,
    currentSamplePath,
    isPlaying,
    duration,
    currentTime,
    progress,
    volume,
    isLooping,
    playbackRate,
    loopStart,
    loopEnd,
    isABLooping,
    play,
    pause,
    resume,
    stop,
    seek,
    setVolume,
    toggleLoop,
    setPlaybackRate,
    tick,
    playNext,
    playPrev,
    setLoopA,
    setLoopB,
    clearABLoop,
  } = usePlayerStore();

  const rafRef = useRef<number | null>(null);
  const isVisibleRef = useRef(true);

  // 监听页面可见性
  useEffect(() => {
    const handleVisibility = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // 使用 requestAnimationFrame 循环更新进度
  useEffect(() => {
    const updateProgress = () => {
      // 页面不可见时暂停 rAF 循环，可见时恢复
      if (!isVisibleRef.current) {
        rafRef.current = requestAnimationFrame(updateProgress);
        return;
      }
      tick();
      rafRef.current = requestAnimationFrame(updateProgress);
    };

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updateProgress);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, tick]);

  const formatTime = useCallback((seconds: number): string => {
    return formatDuration(seconds);
  }, []);

  return {
    currentSampleId,
    currentSampleName,
    currentSamplePath,
    isPlaying,
    duration,
    currentTime,
    progress,
    volume,
    isLooping,
    playbackRate,
    loopStart,
    loopEnd,
    isABLooping,
    play,
    pause,
    resume,
    stop,
    seek,
    setVolume,
    toggleLoop,
    setPlaybackRate,
    playNext,
    playPrev,
    setLoopA,
    setLoopB,
    clearABLoop,
    formatTime,
    PLAYBACK_RATES,
  };
}
