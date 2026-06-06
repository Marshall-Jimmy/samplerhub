/**
 * MIDI 钢琴卷帘组件
 * 使用 Canvas 渲染 MIDI 音符，纯可视化组件
 */
import React, { useRef, useEffect, useMemo } from 'react';

interface NoteData {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  name: string;
}

interface TrackData {
  name: string;
  channel: number;
  notes: NoteData[];
  instrument: string | null;
}

interface MidiPianoRollProps {
  tracks: TrackData[];
  duration: number;
  width?: number;
  height?: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const PIANO_WIDTH = 48;
const MIN_MIDI = 21;
const MAX_MIDI = 108;

// 音轨颜色
const TRACK_COLORS = [
  '#6366F1', '#EC4899', '#14B8A6', '#F59E0B', '#8B5CF6',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

export const MidiPianoRoll: React.FC<MidiPianoRollProps> = ({
  tracks,
  duration,
  width = 600,
  height = 300,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 收集所有音符并计算 MIDI 范围
  const { allNotes, minNote, maxNote } = useMemo(() => {
    const notes: (NoteData & { trackIndex: number })[] = [];
    let min = MAX_MIDI;
    let max = MIN_MIDI;

    tracks.forEach((track, trackIdx) => {
      track.notes.forEach(note => {
        notes.push({ ...note, trackIndex: trackIdx });
        if (note.midi < min) min = note.midi;
        if (note.midi > max) max = note.midi;
      });
    });

    // 至少显示 2 个八度
    if (max - min < 24) {
      const center = Math.floor((min + max) / 2);
      min = Math.max(MIN_MIDI, center - 12);
      max = Math.min(MAX_MIDI, center + 12);
    }

    return { allNotes: notes, minNote: min, maxNote: max };
  }, [tracks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || allNotes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rollWidth = width - PIANO_WIDTH;
    const noteRange = maxNote - minNote + 1;
    const rowHeight = height / noteRange;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // 清除
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // 绘制网格行（黑键/白键区分）
    for (let midi = minNote; midi <= maxNote; midi++) {
      const y = height - (midi - minNote + 1) * rowHeight;
      const noteInOctave = midi % 12;
      const isBlack = BLACK_KEYS.has(noteInOctave);

      if (isBlack) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(PIANO_WIDTH, y, rollWidth, rowHeight);
      }

      // C 音标记线
      if (noteInOctave === 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(PIANO_WIDTH, y + rowHeight);
        ctx.lineTo(width, y + rowHeight);
        ctx.stroke();
      }
    }

    // 绘制钢琴键
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(0, 0, PIANO_WIDTH, height);

    for (let midi = minNote; midi <= maxNote; midi++) {
      const y = height - (midi - minNote + 1) * rowHeight;
      const noteInOctave = midi % 12;
      const octave = Math.floor(midi / 12) - 1;
      const isBlack = BLACK_KEYS.has(noteInOctave);

      if (isBlack) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, y, PIANO_WIDTH, rowHeight);
      } else {
        ctx.fillStyle = '#ddd';
        ctx.fillRect(0, y, PIANO_WIDTH - 1, rowHeight);
      }

      // C 音标注
      if (noteInOctave === 0) {
        ctx.fillStyle = isBlack ? '#999' : '#333';
        ctx.font = '9px monospace';
        ctx.fillText(`C${octave}`, 4, y + rowHeight - 2);
      }
    }

    // 绘制音符
    for (const note of allNotes) {
      const x = PIANO_WIDTH + (note.time / duration) * rollWidth;
      const y = height - (note.midi - minNote + 1) * rowHeight;
      const w = Math.max(2, (note.duration / duration) * rollWidth);
      const h = Math.max(1, rowHeight - 1);

      const color = TRACK_COLORS[note.trackIndex % TRACK_COLORS.length];
      const alpha = 0.5 + note.velocity * 0.5;

      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 2);
      ctx.fill();

      // 音符边框
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      ctx.globalAlpha = 1;
    }
  }, [allNotes, duration, minNote, maxNote, width, height]);

  if (allNotes.length === 0) {
    return (
      <div style={{ width, height, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13 }}>
        No notes
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ borderRadius: 6, display: 'block' }}
    />
  );
};
