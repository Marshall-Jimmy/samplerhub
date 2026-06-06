/**
 * MIDI 映射 Hook - 使用 Web MIDI API 将 MIDI 键盘映射到采样试听
 *
 * 功能：
 * - 自动检测 MIDI 输入设备
 * - 将 MIDI 音符映射到当前采样列表
 * - Note On 触发播放，Note Off 停止播放
 * - 支持力度（velocity）控制音量
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { usePlayerStore } from '../stores/playerStore';

export interface MIDIDevice {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MIDIMapping {
  noteNumber: number;  // MIDI 音符号 (0-127)
  sampleIndex: number; // 采样在列表中的索引
}

/** MIDI 音符号转音名 */
export function midiNoteToName(note: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  const name = names[note % 12];
  return `${name}${octave}`;
}

/** 默认映射范围：C3(48) - B4(71)，覆盖 24 个键 */
const DEFAULT_START_NOTE = 48;
const DEFAULT_END_NOTE = 72;

export function useMIDI(options?: {
  samples?: { id: number; filePath: string; fileName: string }[];
  enabled?: boolean;
  startNote?: number;
  onNoteOn?: (note: number, velocity: number) => void;
  onNoteOff?: (note: number) => void;
}) {
  const [devices, setDevices] = useState<MIDIDevice[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const accessRef = useRef<MIDIAccess | null>(null);
  const playRef = useRef(options?.samples);
  const volumeBeforeMidiRef = useRef<number | null>(null);

  useEffect(() => {
    playRef.current = options?.samples;
  }, [options?.samples]);

  const handleNoteOn = useCallback((note: number, velocity: number) => {
    setActiveNotes(prev => new Set(prev).add(note));

    const samples = playRef.current;
    if (!samples || samples.length === 0) return;

    const startNote = options?.startNote ?? DEFAULT_START_NOTE;
    const index = note - startNote;
    if (index < 0 || index >= samples.length) return;

    const sample = samples[index];
    const player = usePlayerStore.getState();

    // 保存当前音量，以便 noteOff 时恢复
    volumeBeforeMidiRef.current = player.volume;

    player.play(sample.id, sample.filePath, sample.fileName);

    // 力度控制音量（0-127 映射到 0-1）
    if (velocity > 0) {
      player.setVolume(velocity / 127);
    }

    options?.onNoteOn?.(note, velocity);
  }, [options]);

  const handleNoteOff = useCallback((note: number) => {
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });

    const player = usePlayerStore.getState();
    if (player.isPlaying) {
      player.pause();
    }

    // 恢复 MIDI 触发前的音量
    if (volumeBeforeMidiRef.current !== null) {
      player.setVolume(volumeBeforeMidiRef.current);
      volumeBeforeMidiRef.current = null;
    }

    options?.onNoteOff?.(note);
  }, [options]);

  // 处理 MIDI 消息
  const handleMIDIMessage = useCallback((event: MIDIMessageEvent) => {
    const data = event.data;
    if (!data || data.length < 3) return;
    const status = data[0];
    const note = data[1];
    const velocity = data[2];
    const command = status & 0xf0;

    if (command === 0x90 && velocity > 0) {
      // Note On
      handleNoteOn(note, velocity);
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      // Note Off
      handleNoteOff(note);
    }
  }, [handleNoteOn, handleNoteOff]);

  // 连接 MIDI 设备
  const connectDevice = useCallback((input: MIDIInput) => {
    input.onmidimessage = handleMIDIMessage;
    setIsConnected(true);
  }, [handleMIDIMessage]);

  // 断开 MIDI 设备
  const disconnectDevice = useCallback((input: MIDIInput) => {
    input.onmidimessage = null;
    setIsConnected(false);
  }, []);

  // 初始化 MIDI
  useEffect(() => {
    if (!options?.enabled) return;

    let mounted = true;

    const init = async () => {
      if (!navigator.requestMIDIAccess) {
        console.warn('[MIDI] Web MIDI API not supported');
        return;
      }

      try {
        const access = await navigator.requestMIDIAccess({ sysex: false });
        if (!mounted) return;
        accessRef.current = access;

        // 列出已有设备
        const deviceList: MIDIDevice[] = [];
        access.inputs.forEach((input) => {
          deviceList.push({
            id: input.id,
            name: input.name || 'Unknown',
            manufacturer: input.manufacturer || 'Unknown',
          });
          connectDevice(input);
        });
        setDevices(deviceList);

        // 监听设备变化
        access.onstatechange = (e) => {
          const port = (e as MIDIConnectionEvent).port;
          if (!port) return;

          if (port.type === 'input') {
            const input = port as MIDIInput;
            if (port.state === 'connected') {
              connectDevice(input);
              setDevices(prev => {
                if (prev.some(d => d.id === input.id)) return prev;
                return [...prev, {
                  id: input.id,
                  name: input.name || 'Unknown',
                  manufacturer: input.manufacturer || 'Unknown',
                }];
              });
            } else {
              disconnectDevice(input);
              setDevices(prev => prev.filter(d => d.id !== input.id));
            }
          }
        };
      } catch (err) {
        console.warn('[MIDI] Failed to access MIDI devices:', err);
      }
    };

    init();

    return () => {
      mounted = false;
      if (accessRef.current) {
        accessRef.current.inputs.forEach(input => {
          input.onmidimessage = null;
        });
        accessRef.current.onstatechange = null;
        accessRef.current = null;
      }
      setIsConnected(false);
      setDevices([]);
      setActiveNotes(new Set());
    };
  }, [options?.enabled, connectDevice, disconnectDevice]);

  /** 获取当前映射的音符范围 */
  const getMapping = useCallback((): MIDIMapping[] => {
    const startNote = options?.startNote ?? DEFAULT_START_NOTE;
    const endNote = DEFAULT_END_NOTE;
    const samples = playRef.current || [];
    const mappings: MIDIMapping[] = [];

    for (let note = startNote; note < endNote && (note - startNote) < samples.length; note++) {
      mappings.push({
        noteNumber: note,
        sampleIndex: note - startNote,
      });
    }

    return mappings;
  }, [options?.startNote]);

  return {
    devices,
    isConnected,
    activeNotes,
    getMapping,
    midiNoteToName,
  };
}
