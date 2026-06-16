declare module 'webaudio-tinysynth' {
  export default class WebAudioTinySynth {
    constructor(options?: {
      quality?: number;
      useReverb?: number;
      voices?: number;
      [key: string]: any;
    });
    loadMIDI(data: ArrayBuffer): void;
    playMIDI(): void;
    stopMIDI(): void;
    setLoop(flag: number): void;
    setVolume(vol: number): void;
    setQuality(q: number): void;
    audioContext?: AudioContext;
    context?: AudioContext;
    src?: string;
  }
}
