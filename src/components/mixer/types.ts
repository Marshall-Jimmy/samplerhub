/**
 * Mixer 组件通用类型定义
 * 解耦合，不依赖任何 store
 */

export interface MixerChannel {
  id: string;
  name: string;
  key?: string; // 可选：用于 Pad 页面显示按键名
  volume: number;
  pan: number;
  pitch?: number; // 可选：音高偏移
  delaySend?: number; // 可选：延迟发送量
  reverbSend?: number; // 可选：混响发送量
}

export interface MixerEffects {
  delayTime: number;
  delayFeedback: number;
  delayMix: number;
  reverbMix: number;
}

export interface MixerCallbacks {
  onVolumeChange: (id: string, volume: number) => void;
  onPanChange: (id: string, pan: number) => void;
  onPitchChange?: (id: string, pitch: number) => void;
  onDelaySendChange?: (id: string, send: number) => void;
  onReverbSendChange?: (id: string, send: number) => void;
}

export interface MixerProps {
  channels: MixerChannel[];
  masterVolume: number;
  effects: MixerEffects;
  visible: boolean;
  onToggleVisible: () => void;
  onMasterVolumeChange: (volume: number) => void;
  onEffectChange: (key: keyof MixerEffects, value: number) => void;
  callbacks: MixerCallbacks;
}
