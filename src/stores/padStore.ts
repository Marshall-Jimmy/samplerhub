/**
 * PadStore - 打击垫状态管理 (Zustand)
 */
import { create } from 'zustand';

export interface PadConfig {
  id: string;
  key: string;
  name: string;
  filePath?: string;
  sampleId?: number;
  volume: number;
  pan: number;
  pitch: number; // -12 ~ +12 semitones
  mode: 'oneshot' | 'loop';
  searchKeywords?: string[];
  // Effect sends
  delaySend: number; // 0~1
  reverbSend: number; // 0~1
}

export interface SequencerStep {
  active: boolean;
  velocity: number; // 0~1
}

export interface SequencerPattern {
  id: string;
  name: string;
  steps: number; // 8, 16, 32
  swing: number; // 0~1 (50%~75% typical)
  bpm: number;
  tracks: Record<string, SequencerStep[]>; // padId -> steps
}

interface PadState {
  pads: PadConfig[];
  activeKeys: Set<string>;
  masterVolume: number;
  isInitialized: boolean;
  // Sequencer
  patterns: SequencerPattern[];
  currentPatternIndex: number;
  isPlaying: boolean;
  currentStep: number;
  // Effects
  delayTime: number; // 0~1 (mapped to ms)
  delayFeedback: number; // 0~0.95
  delayMix: number; // 0~1
  reverbMix: number; // 0~1
  // Mixer
  mixerVisible: boolean;
  sequencerVisible: boolean;

  // Actions
  setPads: (pads: PadConfig[]) => void;
  updatePad: (id: string, updates: Partial<PadConfig>) => void;
  setPadVolume: (id: string, volume: number) => void;
  setPadPan: (id: string, pan: number) => void;
  setPadPitch: (id: string, pitch: number) => void;
  setPadSample: (id: string, sampleId: number, filePath: string, name: string) => void;
  setPadMode: (id: string, mode: 'oneshot' | 'loop') => void;
  setPadDelaySend: (id: string, send: number) => void;
  setPadReverbSend: (id: string, send: number) => void;
  triggerPad: (key: string) => void;
  releasePad: (key: string) => void;
  setMasterVolume: (volume: number) => void;
  setInitialized: (initialized: boolean) => void;
  resetPads: () => void;
  // Sequencer actions
  setPatterns: (patterns: SequencerPattern[]) => void;
  setCurrentPattern: (index: number) => void;
  updatePattern: (index: number, updates: Partial<SequencerPattern>) => void;
  toggleStep: (patternIndex: number, padId: string, stepIndex: number) => void;
  setStepVelocity: (patternIndex: number, padId: string, stepIndex: number, velocity: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentStep: (step: number) => void;
  addPattern: (pattern: SequencerPattern) => void;
  deletePattern: (index: number) => void;
  // Effect actions
  setDelayTime: (time: number) => void;
  setDelayFeedback: (feedback: number) => void;
  setDelayMix: (mix: number) => void;
  setReverbMix: (mix: number) => void;
  // Mixer
  setMixerVisible: (mixerVisible: boolean) => void;
  setSequencerVisible: (sequencerVisible: boolean) => void;
}

const DEFAULT_PADS: PadConfig[] = [
  { id: 'pad-1', key: 'Q', name: 'Kick', volume: 0.8, pan: 0, pitch: 0, mode: 'oneshot', searchKeywords: ['kick', 'bass drum', 'bd'], delaySend: 0, reverbSend: 0 },
  { id: 'pad-2', key: 'W', name: 'Snare', volume: 0.8, pan: 0, pitch: 0, mode: 'oneshot', searchKeywords: ['snare', 'sd', 'rim'], delaySend: 0, reverbSend: 0 },
  { id: 'pad-3', key: 'E', name: 'Hi-Hat C', volume: 0.8, pan: 0, pitch: 0, mode: 'oneshot', searchKeywords: ['hihat', 'hi-hat', 'hat', 'closed'], delaySend: 0, reverbSend: 0 },
  { id: 'pad-4', key: 'A', name: 'Hi-Hat O', volume: 0.8, pan: 0, pitch: 0, mode: 'oneshot', searchKeywords: ['hihat', 'hi-hat', 'hat', 'open'], delaySend: 0, reverbSend: 0 },
  { id: 'pad-5', key: 'S', name: 'Crash', volume: 0.8, pan: 0, pitch: 0, mode: 'oneshot', searchKeywords: ['crash', 'cymbal'], delaySend: 0, reverbSend: 0.3 },
  { id: 'pad-6', key: 'D', name: 'Ride', volume: 0.8, pan: 0, pitch: 0, mode: 'oneshot', searchKeywords: ['ride', 'cymbal'], delaySend: 0, reverbSend: 0.3 },
  { id: 'pad-7', key: 'Z', name: 'Tom Hi', volume: 0.8, pan: 0, pitch: 0, mode: 'oneshot', searchKeywords: ['tom', 'high tom'], delaySend: 0, reverbSend: 0.2 },
  { id: 'pad-8', key: 'X', name: 'Tom Mid', volume: 0.8, pan: 0, pitch: 0, mode: 'oneshot', searchKeywords: ['tom', 'mid tom'], delaySend: 0, reverbSend: 0.2 },
  { id: 'pad-9', key: 'C', name: 'Tom Lo', volume: 0.8, pan: 0, pitch: 0, mode: 'oneshot', searchKeywords: ['tom', 'low tom', 'floor tom'], delaySend: 0, reverbSend: 0.2 },
];

const createEmptyPattern = (index: number): SequencerPattern => ({
  id: `pattern-${index}`,
  name: `Pattern ${index + 1}`,
  steps: 16,
  swing: 0,
  bpm: 120,
  tracks: {},
});

const DEFAULT_PATTERNS: SequencerPattern[] = Array.from({ length: 8 }, (_, i) => createEmptyPattern(i));

export const usePadStore = create<PadState>((set, get) => ({
  pads: [...DEFAULT_PADS],
  activeKeys: new Set(),
  masterVolume: 1,
  isInitialized: false,
  // Sequencer
  patterns: [...DEFAULT_PATTERNS],
  currentPatternIndex: 0,
  isPlaying: false,
  currentStep: -1,
  // Effects
  delayTime: 0.3,
  delayFeedback: 0.3,
  delayMix: 0.2,
  reverbMix: 0.2,
  // Mixer
  mixerVisible: false,
  sequencerVisible: false,

  setPads: (pads) => set({ pads }),

  updatePad: (id, updates) =>
    set((state) => ({
      pads: state.pads.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),

  setPadVolume: (id, volume) =>
    set((state) => ({
      pads: state.pads.map((p) => (p.id === id ? { ...p, volume } : p)),
    })),

  setPadPan: (id, pan) =>
    set((state) => ({
      pads: state.pads.map((p) => (p.id === id ? { ...p, pan } : p)),
    })),

  setPadPitch: (id, pitch) =>
    set((state) => ({
      pads: state.pads.map((p) => (p.id === id ? { ...p, pitch } : p)),
    })),

  setPadSample: (id, sampleId, filePath, name) =>
    set((state) => ({
      pads: state.pads.map((p) =>
        p.id === id ? { ...p, sampleId, filePath, name: name || p.name } : p
      ),
    })),

  setPadMode: (id, mode) =>
    set((state) => ({
      pads: state.pads.map((p) => (p.id === id ? { ...p, mode } : p)),
    })),

  setPadDelaySend: (id, delaySend) =>
    set((state) => ({
      pads: state.pads.map((p) => (p.id === id ? { ...p, delaySend } : p)),
    })),

  setPadReverbSend: (id, reverbSend) =>
    set((state) => ({
      pads: state.pads.map((p) => (p.id === id ? { ...p, reverbSend } : p)),
    })),

  triggerPad: (key) =>
    set((state) => ({
      activeKeys: new Set([...state.activeKeys, key]),
    })),

  releasePad: (key) =>
    set((state) => {
      const newSet = new Set(state.activeKeys);
      newSet.delete(key);
      return { activeKeys: newSet };
    }),

  setMasterVolume: (masterVolume) => set({ masterVolume }),

  setInitialized: (isInitialized) => set({ isInitialized }),

  resetPads: () => set({ pads: [...DEFAULT_PADS], activeKeys: new Set() }),

  // Sequencer actions
  setPatterns: (patterns) => set({ patterns }),

  setCurrentPattern: (currentPatternIndex) => set({ currentPatternIndex }),

  updatePattern: (index, updates) =>
    set((state) => ({
      patterns: state.patterns.map((p, i) => (i === index ? { ...p, ...updates } : p)),
    })),

  toggleStep: (patternIndex, padId, stepIndex) =>
    set((state) => {
      const patterns = [...state.patterns];
      const pattern = { ...patterns[patternIndex] };
      const tracks = { ...pattern.tracks };
      const track = [...(tracks[padId] || Array(pattern.steps).fill(null).map(() => ({ active: false, velocity: 0.8 })))];
      track[stepIndex] = { ...track[stepIndex], active: !track[stepIndex]?.active };
      tracks[padId] = track;
      pattern.tracks = tracks;
      patterns[patternIndex] = pattern;
      return { patterns };
    }),

  setStepVelocity: (patternIndex, padId, stepIndex, velocity) =>
    set((state) => {
      const patterns = [...state.patterns];
      const pattern = { ...patterns[patternIndex] };
      const tracks = { ...pattern.tracks };
      const track = [...(tracks[padId] || Array(pattern.steps).fill(null).map(() => ({ active: false, velocity: 0.8 })))];
      track[stepIndex] = { ...track[stepIndex], velocity };
      tracks[padId] = track;
      pattern.tracks = tracks;
      patterns[patternIndex] = pattern;
      return { patterns };
    }),

  setIsPlaying: (isPlaying) => set({ isPlaying }),

  setCurrentStep: (currentStep) => set({ currentStep }),

  addPattern: (pattern) =>
    set((state) => ({ patterns: [...state.patterns, pattern] })),

  deletePattern: (index) =>
    set((state) => ({
      patterns: state.patterns.filter((_, i) => i !== index),
      currentPatternIndex: Math.min(state.currentPatternIndex, state.patterns.length - 2),
    })),

  // Effect actions
  setDelayTime: (delayTime) => set({ delayTime }),

  setDelayFeedback: (delayFeedback) => set({ delayFeedback }),

  setDelayMix: (delayMix) => set({ delayMix }),

  setReverbMix: (reverbMix) => set({ reverbMix }),

  // Mixer
  setMixerVisible: (mixerVisible) => set({ mixerVisible }),
  setSequencerVisible: (sequencerVisible) => set({ sequencerVisible }),
}));
