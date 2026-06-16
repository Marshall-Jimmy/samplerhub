/**
 * MIDI 预览 Hook
 * 基于 webaudio-tinysynth 实现点击即播的 MIDI 预览
 * 单例 AudioContext + 快速 stop/play，体验接近 WAV/MP3
 */
import { useRef, useCallback, useEffect } from 'react';
import WebAudioTinySynth from 'webaudio-tinysynth';

interface MidiPreviewOptions {
  /** 合成质量: 0 = 8-bit chip-tune, 1 = FM (推荐) */
  quality?: number;
  /** 是否启用混响 */
  reverb?: boolean;
  /** 最大复音数 */
  voices?: number;
}

// 模块级单例，所有 MIDI 预览共享同一个 synth 实例
let synthInstance: InstanceType<typeof WebAudioTinySynth> | null = null;
let synthCurrentUrl: string | null = null;

function getSynth(options?: MidiPreviewOptions): InstanceType<typeof WebAudioTinySynth> {
  if (!synthInstance) {
    synthInstance = new WebAudioTinySynth({
      quality: options?.quality ?? 1,
      useReverb: options?.reverb ? 1 : 0,
      voices: options?.voices ?? 24,
    });
  }
  // 解锁 AudioContext（必须在用户手势中调用）
  const ctx = (synthInstance as any).audioContext || (synthInstance as any).context;
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
  return synthInstance;
}

export function useMidiPreview(options?: MidiPreviewOptions) {
  const currentUrlRef = useRef<string | null>(null);

  const play = useCallback(async (filePath: string) => {
    const synth = getSynth(options);

    // 同一首正在播 -> 停止
    if (synthCurrentUrl === filePath) {
      synth.stopMIDI();
      synthCurrentUrl = null;
      currentUrlRef.current = null;
      return;
    }

    // 切换新曲：先停旧
    synth.stopMIDI();
    synthCurrentUrl = null;
    currentUrlRef.current = null;

    try {
      // 通过动态导入 ipcClient 避免循环依赖
      const { ipcClient } = await import('../services/ipcClient');
      const arrayBuffer = await ipcClient.getAudioBuffer(filePath);
      synth.loadMIDI(arrayBuffer);
      synth.playMIDI();
      synthCurrentUrl = filePath;
      currentUrlRef.current = filePath;
    } catch (err) {
      console.error('[MIDI Preview] Failed to load:', err);
      synthCurrentUrl = null;
      currentUrlRef.current = null;
    }
  }, [options]);

  const stop = useCallback(() => {
    if (synthInstance) {
      synthInstance.stopMIDI();
    }
    synthCurrentUrl = null;
    currentUrlRef.current = null;
  }, []);

  const isPlaying = useCallback((filePath: string): boolean => {
    return synthCurrentUrl === filePath;
  }, []);

  useEffect(() => {
    return () => {
      // 组件卸载时不销毁单例 synth，其他组件可能还在用
      // 只清理当前引用
      currentUrlRef.current = null;
    };
  }, []);

  return { play, stop, isPlaying };
}

/**
 * 直接调用 MIDI 播放/停止（非 Hook 场景，如 playerStore）
 */
export function midiPlay(filePath: string, options?: MidiPreviewOptions): Promise<void> {
  const synth = getSynth(options);

  // 同一首正在播 -> 停止
  if (synthCurrentUrl === filePath) {
    synth.stopMIDI();
    synthCurrentUrl = null;
    return Promise.resolve();
  }

  synth.stopMIDI();
  synthCurrentUrl = null;

  // 动态导入避免循环依赖
  return import('../services/ipcClient').then(({ ipcClient }) =>
    ipcClient.getAudioBuffer(filePath).then((arrayBuffer) => {
      synth.loadMIDI(arrayBuffer);
      synth.playMIDI();
      synthCurrentUrl = filePath;
    })
  );
}

export function midiStop(): void {
  if (synthInstance) {
    synthInstance.stopMIDI();
  }
  synthCurrentUrl = null;
}

export function midiIsPlaying(filePath: string): boolean {
  return synthCurrentUrl === filePath;
}
