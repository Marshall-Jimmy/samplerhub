/**
 * PadSequencerEngine - 用于 Pad 页面的步进音序器播放引擎
 * 基于 Web Audio API 的精确调度
 */

import { SequencerPattern } from '../../stores/padStore';

export interface SequencerCallbacks {
  onStep: (step: number) => void;
  onTriggerPad: (padId: string, velocity: number) => void;
}

export class PadSequencerEngine {
  private context: AudioContext | null = null;
  private isPlaying = false;
  private currentStep = 0;
  private pattern: SequencerPattern | null = null;
  private callbacks: SequencerCallbacks | null = null;
  private nextNoteTime = 0;
  private scheduleAheadTime = 0.1; // 提前调度 100ms
  private lookahead = 25; // 每 25ms 检查一次
  private timerId: number | null = null;

  initialize(context: AudioContext): void {
    this.context = context;
  }

  setPattern(pattern: SequencerPattern): void {
    this.pattern = pattern;
  }

  setCallbacks(callbacks: SequencerCallbacks): void {
    this.callbacks = callbacks;
  }

  setBpm(bpm: number): void {
    if (this.pattern) {
      this.pattern.bpm = bpm;
    }
  }

  setSwing(swing: number): void {
    if (this.pattern) {
      this.pattern.swing = swing;
    }
  }

  private getStepDuration(): number {
    if (!this.pattern) return 0.25;
    const beatsPerSecond = this.pattern.bpm / 60;
    const stepsPerBeat = 4; // 16th notes
    return 1 / (beatsPerSecond * stepsPerBeat);
  }

  private getSwingOffset(stepIndex: number): number {
    if (!this.pattern || this.pattern.swing === 0) return 0;
    // Swing only affects even steps (1, 3, 5, 7... in 0-indexed)
    if (stepIndex % 2 === 0) return 0;
    const swingRatio = this.pattern.swing / 100;
    const stepDuration = this.getStepDuration();
    // Max swing: 75% = delay by 50% of step duration
    return stepDuration * swingRatio * 0.5;
  }

  private scheduleNote(stepIndex: number, time: number): void {
    if (!this.pattern || !this.callbacks) return;

    // Apply swing offset for odd steps
    const swingOffset = this.getSwingOffset(stepIndex);
    const actualTime = time + swingOffset;

    // Schedule UI update
    this.callbacks.onStep(stepIndex);

    // Schedule pad triggers
    for (const [padId, track] of Object.entries(this.pattern.tracks)) {
      const step = track[stepIndex];
      if (step?.active) {
        // Use setTimeout for pad trigger since it's handled by PadEngine
        const delayMs = (actualTime - this.context!.currentTime) * 1000;
        setTimeout(() => {
          this.callbacks?.onTriggerPad(padId, step.velocity);
        }, Math.max(0, delayMs));
      }
    }
  }

  private scheduler = (): void => {
    if (!this.context || !this.isPlaying || !this.pattern) return;

    const stepDuration = this.getStepDuration();

    // Schedule all notes that fall within the lookahead window
    while (this.nextNoteTime < this.context.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentStep, this.nextNoteTime);

      // Advance to next step
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % this.pattern.steps;
    }

    this.timerId = window.setTimeout(this.scheduler, this.lookahead);
  };

  play(): void {
    if (this.isPlaying || !this.context) return;

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = this.context.currentTime;
    this.scheduler();
  }

  stop(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  getCurrentStep(): number {
    return this.currentStep;
  }

  isRunning(): boolean {
    return this.isPlaying;
  }

  dispose(): void {
    this.stop();
    this.context = null;
    this.pattern = null;
    this.callbacks = null;
  }
}
