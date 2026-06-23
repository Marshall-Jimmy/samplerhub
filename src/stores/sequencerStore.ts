/**
 * SequencerStore - 步进音序器状态管理 (Zustand)
 */
import { create } from 'zustand';
import { randomizePattern as generateRandomPattern } from '../utils/drumRandomizer';

export type TrackType = 'drum' | 'loop';
export type TimeSignature = '3/4' | '4/4' | '6/8';
export type StepCount = 8 | 16 | 32;

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  stepCount: StepCount;
  steps: boolean[];
  velocity: number;
  sampleId?: number;
  filePath?: string;
  pan: number;
  pitch: number;
  delaySend: number;
  reverbSend: number;
}

interface SequencerState {
  tracks: Track[];
  bpm: number;
  swing: number;
  masterVolume: number;
  isPlaying: boolean;
  currentStep: number;
  timeSignature: TimeSignature;
  // Mixer
  mixerVisible: boolean;
  delayTime: number;
  delayFeedback: number;
  delayMix: number;
  reverbMix: number;

  // Actions
  setTracks: (tracks: Track[]) => void;
  toggleStep: (trackId: string, stepIndex: number) => void;
  setTrackVelocity: (trackId: string, velocity: number) => void;
  setTrackSample: (trackId: string, sampleId: number, filePath: string, name: string) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  setTrackPitch: (trackId: string, pitch: number) => void;
  setTrackDelaySend: (trackId: string, send: number) => void;
  setTrackReverbSend: (trackId: string, send: number) => void;
  setTrackType: (trackId: string, type: TrackType) => void;
  setTrackStepCount: (trackId: string, stepCount: StepCount) => void;
  setTimeSignature: (timeSignature: TimeSignature) => void;
  addTrack: (name: string, type: TrackType) => void;
  removeTrack: (trackId: string) => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setMasterVolume: (volume: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentStep: (step: number) => void;
  resetPattern: () => void;
  randomizePattern: () => void;
  exportPattern: () => string;
  importPattern: (json: string) => boolean;
  // Mixer actions
  setMixerVisible: (visible: boolean) => void;
  setDelayTime: (time: number) => void;
  setDelayFeedback: (feedback: number) => void;
  setDelayMix: (mix: number) => void;
  setReverbMix: (mix: number) => void;
}

const DEFAULT_TRACKS: Track[] = [
  { id: 'kick', name: 'Kick', type: 'drum', stepCount: 16, steps: Array(16).fill(false), velocity: 0.9, pan: 0, pitch: 0, delaySend: 0, reverbSend: 0 },
  { id: 'snare', name: 'Snare', type: 'drum', stepCount: 16, steps: Array(16).fill(false), velocity: 0.8, pan: 0, pitch: 0, delaySend: 0, reverbSend: 0 },
  { id: 'hihat', name: 'Hi-Hat', type: 'drum', stepCount: 16, steps: Array(16).fill(false), velocity: 0.7, pan: 0, pitch: 0, delaySend: 0, reverbSend: 0 },
  { id: 'clap', name: 'Clap', type: 'drum', stepCount: 16, steps: Array(16).fill(false), velocity: 0.8, pan: 0, pitch: 0, delaySend: 0, reverbSend: 0 },
  { id: 'tom', name: 'Tom', type: 'drum', stepCount: 16, steps: Array(16).fill(false), velocity: 0.7, pan: 0, pitch: 0, delaySend: 0, reverbSend: 0 },
  { id: 'crash', name: 'Crash', type: 'drum', stepCount: 16, steps: Array(16).fill(false), velocity: 0.8, pan: 0, pitch: 0, delaySend: 0, reverbSend: 0.3 },
];

let nextTrackIndex = 1;

export const useSequencerStore = create<SequencerState>((set) => ({
  tracks: DEFAULT_TRACKS.map((t) => ({ ...t, steps: [...t.steps] })),
  bpm: 120,
  swing: 0,
  masterVolume: 1,
  isPlaying: false,
  currentStep: -1,
  timeSignature: '4/4',
  // Mixer
  mixerVisible: false,
  delayTime: 0.3,
  delayFeedback: 0.3,
  delayMix: 0.2,
  reverbMix: 0.2,

  setTracks: (tracks) => set({ tracks }),

  toggleStep: (trackId, stepIndex) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId && stepIndex >= 0 && stepIndex < t.steps.length
          ? { ...t, steps: t.steps.map((s, i) => (i === stepIndex ? !s : s)) }
          : t
      ),
    })),

  setTrackVelocity: (trackId, velocity) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, velocity } : t
      ),
    })),

  setTrackSample: (trackId, sampleId, filePath, name) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, sampleId, filePath, name } : t
      ),
    })),

  setTrackPan: (trackId, pan) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, pan } : t
      ),
    })),

  setTrackPitch: (trackId, pitch) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, pitch } : t
      ),
    })),

  setTrackDelaySend: (trackId, delaySend) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, delaySend } : t
      ),
    })),

  setTrackReverbSend: (trackId, reverbSend) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, reverbSend } : t
      ),
    })),

  setTrackType: (trackId, type) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, type } : t
      ),
    })),

  setTrackStepCount: (trackId, stepCount) =>
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== trackId) return t;
        if (t.stepCount === stepCount) return t;
        // Resize steps array, preserving existing steps where possible
        const newSteps = Array(stepCount).fill(false);
        const minLen = Math.min(t.steps.length, stepCount);
        for (let i = 0; i < minLen; i++) {
          newSteps[i] = t.steps[i];
        }
        return { ...t, stepCount, steps: newSteps };
      }),
    })),

  setTimeSignature: (timeSignature) => set({ timeSignature }),

  addTrack: (name, type) =>
    set((state) => {
      if (state.tracks.length >= 10) return state; // 最多10个轨道
      const id = `track-${Date.now()}-${nextTrackIndex++}`;
      const newTrack: Track = {
        id,
        name,
        type,
        stepCount: 16,
        steps: Array(16).fill(false),
        velocity: 0.8,
        pan: 0,
        pitch: 0,
        delaySend: 0,
        reverbSend: 0,
      };
      return { tracks: [...state.tracks, newTrack] };
    }),

  removeTrack: (trackId) =>
    set((state) => ({
      tracks: state.tracks.filter((t) => t.id !== trackId),
    })),

  setBpm: (bpm) => set({ bpm }),
  setSwing: (swing) => set({ swing }),
  setMasterVolume: (masterVolume) => set({ masterVolume }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentStep: (currentStep) => set({ currentStep }),

  resetPattern: () =>
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        steps: Array(t.stepCount).fill(false),
      })),
      currentStep: -1,
    })),

  randomizePattern: () =>
    set((state) => {
      const randomSteps = generateRandomPattern(
        state.tracks.map((t) => ({ id: t.id, type: t.type, stepCount: t.stepCount }))
      );
      return {
        tracks: state.tracks.map((t) => ({
          ...t,
          steps: randomSteps[t.id] || t.steps,
        })),
        currentStep: -1,
      };
    }),

  // Pattern save/load
  exportPattern: () => {
    // 使用 set 回调获取当前状态，避免循环引用
    let result = '';
    useSequencerStore.setState((state) => {
      result = JSON.stringify({
        version: 1,
        bpm: state.bpm,
        swing: state.swing,
        timeSignature: state.timeSignature,
        tracks: state.tracks.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type,
          stepCount: t.stepCount,
          steps: t.steps,
          velocity: t.velocity,
          pan: t.pan,
          pitch: t.pitch,
          delaySend: t.delaySend,
          reverbSend: t.reverbSend,
        })),
      });
      return {};
    });
    return result;
  },

  importPattern: (json: string) => {
    try {
      const data = JSON.parse(json);
      if (!data.tracks || !Array.isArray(data.tracks)) {
        throw new Error('Invalid pattern data');
      }
      set({
        bpm: data.bpm || 120,
        swing: data.swing || 0,
        timeSignature: data.timeSignature || '4/4',
        tracks: data.tracks.map((t: any) => ({
          id: t.id || `track-${Date.now()}-${Math.random()}`,
          name: t.name || 'Track',
          type: t.type || 'drum',
          stepCount: t.stepCount || 16,
          steps: t.steps || Array(t.stepCount || 16).fill(false),
          velocity: t.velocity ?? 0.8,
          pan: t.pan ?? 0,
          pitch: t.pitch ?? 0,
          delaySend: t.delaySend ?? 0,
          reverbSend: t.reverbSend ?? 0,
        })),
        currentStep: -1,
        isPlaying: false,
      });
      return true;
    } catch (err) {
      console.error('[SequencerStore] Failed to import pattern:', err);
      return false;
    }
  },

  // Mixer actions
  setMixerVisible: (mixerVisible) => set({ mixerVisible }),
  setDelayTime: (delayTime) => set({ delayTime }),
  setDelayFeedback: (delayFeedback) => set({ delayFeedback }),
  setDelayMix: (delayMix) => set({ delayMix }),
  setReverbMix: (reverbMix) => set({ reverbMix }),
}));
