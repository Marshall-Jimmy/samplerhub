/**
 * Wavetable Synthesizer Mod - 波表合成器
 *
 * Serum 风格波表合成器，支持波表形变、滤波器、LFO、ADSR 包络、效果器。
 * 基于 Tone.js 引擎，使用 React 渲染 UI。
 *
 * Signal chain: oscillator → sub → noise → filter → distortion → delay → reverb → output
 */

// ─── 1. Manifest + Metadata ─────────────────────────────────────────────────

export default {
  id: 'com.samplerhub.wavetable-synth',
  name: '波表合成器',
  version: '1.0.1',
  apiVersion: '1.0.0',
  author: 'SamplerHub',
  description: 'Serum 风格波表合成器，支持波表形变、滤波器、LFO、ADSR 包络、效果器。基于 Tone.js 引擎。',
  permissions: ['audio:engine', 'ui:inject'],

  // ─── 2. Wavetable Data ──────────────────────────────────────────────────────

  // ─── 3. Helper Functions ────────────────────────────────────────────────────

  // ─── 4. activate() ──────────────────────────────────────────────────────────

  // ─── 5. deactivate() ────────────────────────────────────────────────────────

  // ─── Implementation ─────────────────────────────────────────────────────────

  _nodes: null,
  _listeners: [],
  _animFrameId: null,
  _audioStarted: false,

  activate(api) {
    const Tone = window.Tone;
    const React = window.React;
    const { useState, useCallback, useRef, useEffect, useMemo } = React;
    const self = this;

    // ─── 2. Wavetable Data ────────────────────────────────────────────────────

    const WAVETABLES = {
      basic: [
        [1],
        [1, 0, 0.11, 0, 0.04],
        [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.14, 0.12],
        [1, 0, 0.33, 0, 0.2, 0, 0.14, 0, 0.11, 0, 0.09, 0]
      ],
      harmonic: [
        [1],
        [1, 1, 0, 0, 0, 0],
        [1, 0.5, 1, 0, 0, 0],
        [1, 0.5, 0.33, 1, 0.25, 1]
      ],
      pads: [
        [1, 0.3, 0.1],
        [1, 0.5, 0.3, 0.1, 0.05],
        [1, 0.2, 0.4, 0.1, 0.3, 0.05],
        [1, 0.1, 0.05, 0.3, 0.2, 0.1, 0.05]
      ]
    };

    const WAVETABLE_NAMES = {
      basic: 'Basic',
      harmonic: 'Harmonic',
      pads: 'Pads'
    };

    // ─── 3. Helper Functions ────────────────────────────────────────────────────

    function interpolatePartials(pos, table) {
      const frameCount = table.length;
      const scaledPos = pos * (frameCount - 1);
      const frame1Idx = Math.floor(scaledPos);
      const frame2Idx = Math.min(frame1Idx + 1, frameCount - 1);
      const mix = scaledPos - frame1Idx;
      const frame1 = table[frame1Idx];
      const frame2 = table[frame2Idx];
      const maxLength = Math.max(frame1.length, frame2.length);
      const result = [];
      for (let i = 0; i < maxLength; i++) {
        const p1 = frame1[i] || 0;
        const p2 = frame2[i] || 0;
        result[i] = p1 + (p2 - p1) * mix;
      }
      return result;
    }

    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    function buildKeyboardNotes() {
      const notes = [];
      for (let oct = 3; oct <= 4; oct++) {
        for (let i = 0; i < 12; i++) {
          notes.push(NOTE_NAMES[i] + oct);
        }
      }
      return notes;
    }

    const KEYBOARD_NOTES = buildKeyboardNotes();

    const QWERTY_MAP = {
      'a': 'C3', 'w': 'C#3', 's': 'D3', 'e': 'D#3', 'd': 'E3',
      'f': 'F3', 't': 'F#3', 'g': 'G3', 'y': 'G#3', 'h': 'A3',
      'u': 'A#3', 'j': 'B3',
      'k': 'C4', 'o': 'C#4', 'l': 'D4', 'p': 'D#4', ';': 'E4'
    };

    // ─── 4a. State Initialization ──────────────────────────────────────────────

    const params = {
      osc: { wavetable: 'basic', wtPos: 0 },
      sub: { type: 'square', volume: 0, octave: -1 },
      noise: { type: 'white', volume: 0 },
      filter: { type: 'lowpass', cutoff: 2000, resonance: 1 },
      lfo: { type: 'sine', rate: 1, depth: 0, target: 'cutoff' },
      env: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 1 },
      fx: { distortion: 0, reverbMix: 0.1, delayMix: 0, delayTime: 0.3, delayFeedback: 0.4 }
    };

    // ─── 4b. Audio Engine Setup ────────────────────────────────────────────────

    const nodes = {
      polySynth: null,
      subSynth: null,
      noise: null,
      noiseEnv: null,
      filter: null,
      distortion: null,
      delay: null,
      reverb: null,
      lfo: null,
      lfoGain: null,
      waveform: null,
      isStarted: false,
      activeNotes: new Set()
    };
    self._nodes = nodes;

    async function ensureAudioStarted() {
      if (nodes.isStarted) return;
      await Tone.start();
      self._audioStarted = true;

      // Signal chain: osc → reverb → delay → distortion → filter → destination
      nodes.filter = new Tone.Filter({
        frequency: params.filter.cutoff,
        type: params.filter.type,
        rolloff: -12,
        Q: params.filter.resonance
      }).toDestination();

      nodes.distortion = new Tone.Distortion(params.fx.distortion).connect(nodes.filter);

      nodes.delay = new Tone.FeedbackDelay({
        delayTime: params.fx.delayTime,
        feedback: params.fx.delayFeedback
      }).connect(nodes.distortion);
      nodes.delay.wet.value = params.fx.delayMix;

      nodes.reverb = new Tone.Freeverb({
        roomSize: 0.5,
        dampening: 3000
      }).connect(nodes.delay);
      nodes.reverb.wet.value = params.fx.reverbMix;

      // Waveform analyzer (connected to destination for visualization)
      nodes.waveform = new Tone.Waveform(1024);
      Tone.Destination.connect(nodes.waveform);

      // Main wavetable oscillator (PolySynth with custom partials)
      nodes.polySynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'custom', partials: [1] },
        envelope: {
          attack: params.env.attack,
          decay: params.env.decay,
          sustain: params.env.sustain,
          release: params.env.release
        },
        maxPolyphony: 12
      }).connect(nodes.reverb);

      // Sub oscillator
      nodes.subSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: params.sub.type },
        envelope: {
          attack: params.env.attack,
          decay: params.env.decay,
          sustain: params.env.sustain,
          release: params.env.release
        },
        maxPolyphony: 12
      }).connect(nodes.reverb);
      nodes.subSynth.volume.value = -6;

      // Noise generator
      nodes.noise = new Tone.Noise(params.noise.type).start();
      nodes.noise.volume.value = -Infinity;

      nodes.noiseEnv = new Tone.AmplitudeEnvelope({
        attack: params.env.attack,
        decay: params.env.decay,
        sustain: params.env.sustain,
        release: params.env.release
      }).connect(nodes.reverb);
      nodes.noise.connect(nodes.noiseEnv);

      // LFO
      nodes.lfo = new Tone.LFO({
        frequency: params.lfo.rate,
        type: params.lfo.type,
        min: -1,
        max: 1
      }).start();
      nodes.lfoGain = new Tone.Gain(0);
      nodes.lfo.connect(nodes.lfoGain);
      // Default LFO target: filter cutoff
      nodes.lfoGain.connect(nodes.filter.frequency);

      nodes.isStarted = true;
      updateWavetable();
    }

    function updateWavetable() {
      if (!nodes.polySynth) return;
      const table = WAVETABLES[params.osc.wavetable];
      const partials = interpolatePartials(params.osc.wtPos, table);
      nodes.polySynth.set({ oscillator: { type: 'custom', partials } });
    }

    function playNote(note) {
      if (!nodes.isStarted) return;
      nodes.activeNotes.add(note);
      nodes.polySynth.triggerAttack(note);
      const subNote = Tone.Frequency(note).transpose(params.sub.octave * 12).toNote();
      nodes.subSynth.triggerAttack(subNote);
      if (nodes.activeNotes.size === 1) nodes.noiseEnv.triggerAttack();
    }

    function stopNote(note) {
      if (!nodes.isStarted) return;
      nodes.activeNotes.delete(note);
      nodes.polySynth.triggerRelease(note);
      const subNote = Tone.Frequency(note).transpose(params.sub.octave * 12).toNote();
      nodes.subSynth.triggerRelease(subNote);
      if (nodes.activeNotes.size === 0) nodes.noiseEnv.triggerRelease();
    }

    // ─── 4c. setParam Function ─────────────────────────────────────────────────

    function setParam(module, param, value) {
      if (!nodes.isStarted) return;
      switch (module) {
        case 'osc':
          if (param === 'wavetable') { params.osc.wavetable = value; updateWavetable(); }
          if (param === 'wtPos') { params.osc.wtPos = value; updateWavetable(); }
          break;
        case 'sub':
          if (param === 'type') nodes.subSynth.set({ oscillator: { type: value } });
          if (param === 'volume') nodes.subSynth.volume.value = value === 0 ? -Infinity : Tone.gainToDb(value);
          if (param === 'octave') params.sub.octave = value;
          break;
        case 'noise':
          if (param === 'type') nodes.noise.type = value;
          if (param === 'volume') nodes.noise.volume.value = value === 0 ? -Infinity : Tone.gainToDb(value);
          break;
        case 'filter':
          if (param === 'type') nodes.filter.type = value;
          if (param === 'cutoff') nodes.filter.frequency.value = value;
          if (param === 'resonance') nodes.filter.Q.value = value;
          break;
        case 'lfo':
          if (param === 'type') nodes.lfo.type = value;
          if (param === 'rate') nodes.lfo.frequency.value = value;
          if (param === 'depth') nodes.lfoGain.gain.value = value;
          if (param === 'target') {
            nodes.lfoGain.disconnect();
            if (value === 'cutoff') nodes.lfoGain.connect(nodes.filter.frequency);
            if (value === 'pitch') {
              nodes.lfoGain.connect(nodes.polySynth.detune);
              nodes.lfoGain.connect(nodes.subSynth.detune);
            }
          }
          break;
        case 'env':
          if (param === 'attack') {
            nodes.polySynth.set({ envelope: { attack: value } });
            nodes.subSynth.set({ envelope: { attack: value } });
            nodes.noiseEnv.attack = value;
          }
          if (param === 'decay') {
            nodes.polySynth.set({ envelope: { decay: value } });
            nodes.subSynth.set({ envelope: { decay: value } });
            nodes.noiseEnv.decay = value;
          }
          if (param === 'sustain') {
            nodes.polySynth.set({ envelope: { sustain: value } });
            nodes.subSynth.set({ envelope: { sustain: value } });
            nodes.noiseEnv.sustain = value;
          }
          if (param === 'release') {
            nodes.polySynth.set({ envelope: { release: value } });
            nodes.subSynth.set({ envelope: { release: value } });
            nodes.noiseEnv.release = value;
          }
          break;
        case 'fx':
          if (param === 'distortion') nodes.distortion.distortion = value;
          if (param === 'reverbMix') nodes.reverb.wet.value = value;
          if (param === 'delayMix') nodes.delay.wet.value = value;
          if (param === 'delayTime') nodes.delay.delayTime.value = value;
          if (param === 'delayFeedback') nodes.delay.feedback.value = value;
          break;
      }
    }

    // ─── 4d. UI Component Definitions ──────────────────────────────────────────

    const h = React.createElement;

    // Shared styles
    const STYLES = {
      section: {
        background: '#16213e',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8
      },
      sectionTitle: {
        fontSize: 11,
        fontWeight: 700,
        color: '#6366f1',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8
      },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6
      },
      label: {
        fontSize: 11,
        color: '#a0a0b0',
        minWidth: 50,
        flexShrink: 0
      },
      select: {
        background: '#0f3460',
        color: '#e0e0e0',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 4,
        padding: '3px 6px',
        fontSize: 11,
        cursor: 'pointer',
        outline: 'none',
        flex: 1
      },
      slider: {
        flex: 1,
        height: 4,
        WebkitAppearance: 'none',
        appearance: 'none',
        background: '#0f3460',
        borderRadius: 2,
        outline: 'none',
        cursor: 'pointer'
      },
      valueDisplay: {
        fontSize: 10,
        color: '#888',
        minWidth: 36,
        textAlign: 'right',
        flexShrink: 0
      }
    };

    // Slider component
    function ParamSlider({ label, min, max, step, value, displayValue, onChange }) {
      return h('div', { style: STYLES.row },
        h('span', { style: STYLES.label }, label),
        h('input', {
          type: 'range',
          min, max, step: step || (max - min) / 100,
          value,
          style: STYLES.slider,
          onChange: (e) => onChange(parseFloat(e.target.value))
        }),
        h('span', { style: STYLES.valueDisplay }, displayValue !== undefined ? displayValue : value.toFixed(2))
      );
    }

    // Oscilloscope component
    function Oscilloscope() {
      const canvasRef = useRef(null);
      const animRef = useRef(null);

      useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        function draw() {
          animRef.current = requestAnimationFrame(draw);
          if (!nodes.waveform || !nodes.isStarted) {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, W, H);
            return;
          }
          const values = nodes.waveform.getValue();
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, 0, W, H);

          // Grid lines
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, H / 2);
          ctx.lineTo(W, H / 2);
          ctx.stroke();

          // Waveform
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2;
          ctx.beginPath();
          const sliceWidth = W / values.length;
          for (let i = 0; i < values.length; i++) {
            const x = i * sliceWidth;
            const y = (1 - values[i]) * H / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();

          // Glow effect
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          for (let i = 0; i < values.length; i++) {
            const x = i * sliceWidth;
            const y = (1 - values[i]) * H / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        draw();
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
      }, []);

      return h('canvas', {
        ref: canvasRef,
        width: 480,
        height: 100,
        style: {
          width: '100%',
          height: 100,
          borderRadius: 6,
          border: '1px solid rgba(99,102,241,0.2)',
          display: 'block'
        }
      });
    }

    // Piano keyboard component
    function PianoKeyboard({ activeNotes, onNoteOn, onNoteOff }) {
      const isMouseDownRef = useRef(false);
      const currentMouseNoteRef = useRef(null);

      const handleMouseDown = useCallback((note) => {
        isMouseDownRef.current = true;
        currentMouseNoteRef.current = note;
        onNoteOn(note);
      }, [onNoteOn]);

      const handleMouseUp = useCallback(() => {
        if (currentMouseNoteRef.current) {
          onNoteOff(currentMouseNoteRef.current);
          currentMouseNoteRef.current = null;
        }
        isMouseDownRef.current = false;
      }, [onNoteOff]);

      const handleMouseEnter = useCallback((note) => {
        if (isMouseDownRef.current) {
          if (currentMouseNoteRef.current && currentMouseNoteRef.current !== note) {
            onNoteOff(currentMouseNoteRef.current);
          }
          currentMouseNoteRef.current = note;
          onNoteOn(note);
        }
      }, [onNoteOn, onNoteOff]);

      useEffect(() => {
        const handleGlobalMouseUp = () => {
          if (currentMouseNoteRef.current) {
            onNoteOff(currentMouseNoteRef.current);
            currentMouseNoteRef.current = null;
          }
          isMouseDownRef.current = false;
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
      }, [onNoteOff]);

      // Build keyboard layout
      const whiteNotes = [];
      const blackNotes = [];
      KEYBOARD_NOTES.forEach(note => {
        const name = note.replace(/\d+/, '');
        if (name.includes('#')) {
          blackNotes.push(note);
        } else {
          whiteNotes.push(note);
        }
      });

      const whiteKeyWidth = 100 / whiteNotes.length;

      // Map black key positions relative to white keys
      const blackKeyPositions = {};
      let whiteIdx = 0;
      KEYBOARD_NOTES.forEach(note => {
        const name = note.replace(/\d+/, '');
        if (!name.includes('#')) {
          whiteIdx++;
        } else {
          // Position black key between previous and next white key
          blackKeyPositions[note] = (whiteIdx - 0.6) * whiteKeyWidth;
        }
      });

      return h('div', {
        style: {
          position: 'relative',
          height: 120,
          background: '#0a0a1a',
          borderRadius: '0 0 8px 8px',
          borderTop: '2px solid #333',
          overflow: 'hidden',
          userSelect: 'none'
        }
      },
        // White keys
        whiteNotes.map((note, i) => {
          const isActive = activeNotes.has(note);
          return h('div', {
            key: note,
            style: {
              position: 'absolute',
              left: (i * whiteKeyWidth) + '%',
              width: whiteKeyWidth + '%',
              height: '100%',
              background: isActive ? '#6366f1' : '#f0f0f0',
              borderRight: '1px solid #ccc',
              borderBottom: 'none',
              borderRadius: '0 0 4px 4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: 6,
              fontSize: 9,
              color: isActive ? '#fff' : '#666',
              transition: 'background 0.05s',
              zIndex: 1
            },
            onMouseDown: (e) => { e.preventDefault(); handleMouseDown(note); },
            onMouseUp: () => handleMouseUp(),
            onMouseEnter: () => handleMouseEnter(note),
            onTouchStart: (e) => { e.preventDefault(); onNoteOn(note); },
            onTouchEnd: (e) => { e.preventDefault(); onNoteOff(note); }
          }, note);
        }),
        // Black keys
        blackNotes.map(note => {
          const isActive = activeNotes.has(note);
          return h('div', {
            key: note,
            style: {
              position: 'absolute',
              left: blackKeyPositions[note] + '%',
              width: (whiteKeyWidth * 0.65) + '%',
              height: '60%',
              background: isActive ? '#6366f1' : '#1a1a1a',
              borderRadius: '0 0 3px 3px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: 4,
              fontSize: 8,
              color: isActive ? '#fff' : '#888',
              transition: 'background 0.05s',
              zIndex: 2,
              boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
            },
            onMouseDown: (e) => { e.preventDefault(); e.stopPropagation(); handleMouseDown(note); },
            onMouseUp: (e) => { e.stopPropagation(); handleMouseUp(); },
            onMouseEnter: (e) => { e.stopPropagation(); handleMouseEnter(note); },
            onTouchStart: (e) => { e.preventDefault(); onNoteOn(note); },
            onTouchEnd: (e) => { e.preventDefault(); onNoteOff(note); }
          }, note);
        })
      );
    }

    // ─── 4e. Main Panel Component ─────────────────────────────────────────────

    function WavetableSynthPanel() {
      const [activeNotes, setActiveNotes] = useState(new Set());
      const [audioReady, setAudioReady] = useState(false);
      const pressedKeysRef = useRef(new Set());

      // Initialize audio on first interaction
      const initAudio = useCallback(async () => {
        if (!audioReady) {
          await ensureAudioStarted();
          setAudioReady(true);
        }
      }, [audioReady]);

      const handleNoteOn = useCallback((note) => {
        initAudio();
        playNote(note);
        setActiveNotes(prev => new Set(prev).add(note));
      }, [initAudio]);

      const handleNoteOff = useCallback((note) => {
        stopNote(note);
        setActiveNotes(prev => {
          const next = new Set(prev);
          next.delete(note);
          return next;
        });
      }, []);

      // QWERTY keyboard events
      useEffect(() => {
        const handleKeyDown = (e) => {
          if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
          const note = QWERTY_MAP[e.key.toLowerCase()];
          if (note && !pressedKeysRef.current.has(e.key.toLowerCase())) {
            pressedKeysRef.current.add(e.key.toLowerCase());
            handleNoteOn(note);
          }
        };
        const handleKeyUp = (e) => {
          const note = QWERTY_MAP[e.key.toLowerCase()];
          if (note) {
            pressedKeysRef.current.delete(e.key.toLowerCase());
            handleNoteOff(note);
          }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        const listener = { keydown: handleKeyDown, keyup: handleKeyUp };
        self._listeners.push(listener);
        return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
        };
      }, [handleNoteOn, handleNoteOff]);

      // Cleanup on unmount
      useEffect(() => {
        return () => {
          // Release all active notes
          activeNotes.forEach(note => stopNote(note));
        };
      }, []);

      // ─── Render sections ──────────────────────────────────────────────────

      // Oscilloscope
      const oscilloscopeSection = h('div', { style: { ...STYLES.section, padding: '8px 12px' } },
        h('div', { style: STYLES.sectionTitle }, 'Oscilloscope'),
        h(Oscilloscope)
      );

      // Oscillator section
      const oscSection = h('div', { style: STYLES.section },
        h('div', { style: STYLES.sectionTitle }, 'Oscillator'),
        h('div', { style: STYLES.row },
          h('span', { style: STYLES.label }, 'Wavetable'),
          h('select', {
            style: STYLES.select,
            value: params.osc.wavetable,
            onChange: (e) => {
              params.osc.wavetable = e.target.value;
              if (nodes.isStarted) updateWavetable();
            }
          }, Object.keys(WAVETABLES).map(k => h('option', { key: k, value: k }, WAVETABLE_NAMES[k])))
        ),
        h(ParamSlider, {
          label: 'WT Pos',
          min: 0, max: 1, step: 0.01,
          value: params.osc.wtPos,
          displayValue: params.osc.wtPos.toFixed(2),
          onChange: (v) => {
            params.osc.wtPos = v;
            if (nodes.isStarted) updateWavetable();
          }
        })
      );

      // Sub oscillator section
      const subSection = h('div', { style: STYLES.section },
        h('div', { style: STYLES.sectionTitle }, 'Sub Oscillator'),
        h('div', { style: STYLES.row },
          h('span', { style: STYLES.label }, 'Type'),
          h('select', {
            style: STYLES.select,
            value: params.sub.type,
            onChange: (e) => {
              params.sub.type = e.target.value;
              if (nodes.isStarted) setParam('sub', 'type', e.target.value);
            }
          },
            h('option', { value: 'square' }, 'Square'),
            h('option', { value: 'sine' }, 'Sine'),
            h('option', { value: 'triangle' }, 'Triangle'),
            h('option', { value: 'sawtooth' }, 'Sawtooth')
          )
        ),
        h(ParamSlider, {
          label: 'Volume',
          min: 0, max: 1, step: 0.01,
          value: params.sub.volume,
          displayValue: params.sub.volume.toFixed(2),
          onChange: (v) => {
            params.sub.volume = v;
            if (nodes.isStarted) setParam('sub', 'volume', v);
          }
        }),
        h('div', { style: STYLES.row },
          h('span', { style: STYLES.label }, 'Octave'),
          h('select', {
            style: STYLES.select,
            value: params.sub.octave,
            onChange: (e) => {
              params.sub.octave = parseInt(e.target.value);
              if (nodes.isStarted) setParam('sub', 'octave', params.sub.octave);
            }
          },
            h('option', { value: -2 }, '-2'),
            h('option', { value: -1 }, '-1'),
            h('option', { value: 0 }, '0')
          )
        )
      );

      // Noise section
      const noiseSection = h('div', { style: STYLES.section },
        h('div', { style: STYLES.sectionTitle }, 'Noise'),
        h('div', { style: STYLES.row },
          h('span', { style: STYLES.label }, 'Type'),
          h('select', {
            style: STYLES.select,
            value: params.noise.type,
            onChange: (e) => {
              params.noise.type = e.target.value;
              if (nodes.isStarted) setParam('noise', 'type', e.target.value);
            }
          },
            h('option', { value: 'white' }, 'White'),
            h('option', { value: 'pink' }, 'Pink'),
            h('option', { value: 'brown' }, 'Brown')
          )
        ),
        h(ParamSlider, {
          label: 'Volume',
          min: 0, max: 1, step: 0.01,
          value: params.noise.volume,
          displayValue: params.noise.volume.toFixed(2),
          onChange: (v) => {
            params.noise.volume = v;
            if (nodes.isStarted) setParam('noise', 'volume', v);
          }
        })
      );

      // Filter section
      const filterSection = h('div', { style: STYLES.section },
        h('div', { style: STYLES.sectionTitle }, 'Filter'),
        h('div', { style: STYLES.row },
          h('span', { style: STYLES.label }, 'Type'),
          h('select', {
            style: STYLES.select,
            value: params.filter.type,
            onChange: (e) => {
              params.filter.type = e.target.value;
              if (nodes.isStarted) setParam('filter', 'type', e.target.value);
            }
          },
            h('option', { value: 'lowpass' }, 'Lowpass'),
            h('option', { value: 'highpass' }, 'Highpass'),
            h('option', { value: 'bandpass' }, 'Bandpass')
          )
        ),
        h(ParamSlider, {
          label: 'Cutoff',
          min: 20, max: 20000, step: 1,
          value: params.filter.cutoff,
          displayValue: params.filter.cutoff >= 1000
            ? (params.filter.cutoff / 1000).toFixed(1) + 'k'
            : Math.round(params.filter.cutoff) + '',
          onChange: (v) => {
            params.filter.cutoff = v;
            if (nodes.isStarted) setParam('filter', 'cutoff', v);
          }
        }),
        h(ParamSlider, {
          label: 'Reso',
          min: 0.1, max: 20, step: 0.1,
          value: params.filter.resonance,
          displayValue: params.filter.resonance.toFixed(1),
          onChange: (v) => {
            params.filter.resonance = v;
            if (nodes.isStarted) setParam('filter', 'resonance', v);
          }
        })
      );

      // ADSR Envelope section
      const envSection = h('div', { style: STYLES.section },
        h('div', { style: STYLES.sectionTitle }, 'Envelope (ADSR)'),
        h(ParamSlider, {
          label: 'Attack',
          min: 0.001, max: 5, step: 0.001,
          value: params.env.attack,
          displayValue: params.env.attack.toFixed(3) + 's',
          onChange: (v) => {
            params.env.attack = v;
            if (nodes.isStarted) setParam('env', 'attack', v);
          }
        }),
        h(ParamSlider, {
          label: 'Decay',
          min: 0.001, max: 5, step: 0.001,
          value: params.env.decay,
          displayValue: params.env.decay.toFixed(3) + 's',
          onChange: (v) => {
            params.env.decay = v;
            if (nodes.isStarted) setParam('env', 'decay', v);
          }
        }),
        h(ParamSlider, {
          label: 'Sustain',
          min: 0, max: 1, step: 0.01,
          value: params.env.sustain,
          displayValue: params.env.sustain.toFixed(2),
          onChange: (v) => {
            params.env.sustain = v;
            if (nodes.isStarted) setParam('env', 'sustain', v);
          }
        }),
        h(ParamSlider, {
          label: 'Release',
          min: 0.01, max: 10, step: 0.01,
          value: params.env.release,
          displayValue: params.env.release.toFixed(2) + 's',
          onChange: (v) => {
            params.env.release = v;
            if (nodes.isStarted) setParam('env', 'release', v);
          }
        })
      );

      // LFO section
      const lfoSection = h('div', { style: STYLES.section },
        h('div', { style: STYLES.sectionTitle }, 'LFO'),
        h('div', { style: STYLES.row },
          h('span', { style: STYLES.label }, 'Type'),
          h('select', {
            style: STYLES.select,
            value: params.lfo.type,
            onChange: (e) => {
              params.lfo.type = e.target.value;
              if (nodes.isStarted) setParam('lfo', 'type', e.target.value);
            }
          },
            h('option', { value: 'sine' }, 'Sine'),
            h('option', { value: 'square' }, 'Square'),
            h('option', { value: 'triangle' }, 'Triangle'),
            h('option', { value: 'sawtooth' }, 'Sawtooth')
          )
        ),
        h(ParamSlider, {
          label: 'Rate',
          min: 0.01, max: 20, step: 0.01,
          value: params.lfo.rate,
          displayValue: params.lfo.rate.toFixed(2) + 'Hz',
          onChange: (v) => {
            params.lfo.rate = v;
            if (nodes.isStarted) setParam('lfo', 'rate', v);
          }
        }),
        h(ParamSlider, {
          label: 'Depth',
          min: 0, max: 1, step: 0.01,
          value: params.lfo.depth,
          displayValue: params.lfo.depth.toFixed(2),
          onChange: (v) => {
            params.lfo.depth = v;
            if (nodes.isStarted) setParam('lfo', 'depth', v);
          }
        }),
        h('div', { style: STYLES.row },
          h('span', { style: STYLES.label }, 'Target'),
          h('select', {
            style: STYLES.select,
            value: params.lfo.target,
            onChange: (e) => {
              params.lfo.target = e.target.value;
              if (nodes.isStarted) setParam('lfo', 'target', e.target.value);
            }
          },
            h('option', { value: 'cutoff' }, 'Cutoff'),
            h('option', { value: 'pitch' }, 'Pitch')
          )
        )
      );

      // FX section
      const fxSection = h('div', { style: STYLES.section },
        h('div', { style: STYLES.sectionTitle }, 'Effects'),
        h(ParamSlider, {
          label: 'Distort',
          min: 0, max: 1, step: 0.01,
          value: params.fx.distortion,
          displayValue: params.fx.distortion.toFixed(2),
          onChange: (v) => {
            params.fx.distortion = v;
            if (nodes.isStarted) setParam('fx', 'distortion', v);
          }
        }),
        h(ParamSlider, {
          label: 'Reverb',
          min: 0, max: 1, step: 0.01,
          value: params.fx.reverbMix,
          displayValue: params.fx.reverbMix.toFixed(2),
          onChange: (v) => {
            params.fx.reverbMix = v;
            if (nodes.isStarted) setParam('fx', 'reverbMix', v);
          }
        }),
        h(ParamSlider, {
          label: 'Delay',
          min: 0, max: 1, step: 0.01,
          value: params.fx.delayMix,
          displayValue: params.fx.delayMix.toFixed(2),
          onChange: (v) => {
            params.fx.delayMix = v;
            if (nodes.isStarted) setParam('fx', 'delayMix', v);
          }
        }),
        h(ParamSlider, {
          label: 'Dly Time',
          min: 0.01, max: 1, step: 0.01,
          value: params.fx.delayTime,
          displayValue: params.fx.delayTime.toFixed(2) + 's',
          onChange: (v) => {
            params.fx.delayTime = v;
            if (nodes.isStarted) setParam('fx', 'delayTime', v);
          }
        }),
        h(ParamSlider, {
          label: 'Dly Fdbk',
          min: 0, max: 0.95, step: 0.01,
          value: params.fx.delayFeedback,
          displayValue: params.fx.delayFeedback.toFixed(2),
          onChange: (v) => {
            params.fx.delayFeedback = v;
            if (nodes.isStarted) setParam('fx', 'delayFeedback', v);
          }
        })
      );

      // Keyboard
      const keyboardSection = h('div', { style: STYLES.section },
        h('div', { style: STYLES.sectionTitle }, 'Keyboard (C3 - B4)'),
        h(PianoKeyboard, { activeNotes, onNoteOn: handleNoteOn, onNoteOff: handleNoteOff })
      );

      // Keyboard hint
      const keyboardHint = h('div', {
        style: {
          padding: '6px 12px',
          fontSize: 10,
          color: '#666',
          textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0
        }
      }, 'QWERTY: A W S E D F T G Y H U J K O L P ; | Mouse drag for glissando');

      // ─── Assemble panel ─────────────────────────────────────────────────────

      // Two-column grid layout for compact display
      const gridContainer = h('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          padding: '8px 12px'
        }
      },
        // Left column
        h('div', null,
          oscilloscopeSection,
          oscSection,
          subSection,
          noiseSection
        ),
        // Right column
        h('div', null,
          filterSection,
          envSection,
          lfoSection,
          fxSection
        )
      );

      return h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: '#1a1a2e',
          color: '#e0e0e0',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          overflow: 'hidden'
        }
      },
        // Header
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            background: '#16213e',
            flexShrink: 0
          }
        },
          h('div', {
            style: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }
          }, 'Wavetable Synth'),
          h('div', {
            style: { fontSize: 10, color: '#666' }
          }, audioReady ? 'Audio Active' : 'Click keyboard to start')
        ),
        // Scrollable content area
        h('div', {
          style: {
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden'
          }
        },
          gridContainer,
          // Keyboard spans full width below the grid
          h('div', { style: { padding: '0 12px 8px' } }, keyboardSection)
        ),
        keyboardHint
      );
    }

    // ─── 4f. Panel Registration ───────────────────────────────────────────────

    api.ui.panel.register({
      id: 'wavetable-synth',
      title: 'Wavetable Synth',
      component: WavetableSynthPanel,
      position: 'floating'
    });

    // ─── 4g. Toolbar Button Registration ─────────────────────────────────────

    api.ui.toolbar.addButton({
      id: 'wavetable-synth-toggle',
      icon: 'W',
      tooltip: 'Wavetable Synth',
      onClick: () => api.ui.panel.open('wavetable-synth')
    });

    api.logger.info('[WavetableSynth] Mod v1.0.0 activated');
  },

  // ─── 5. deactivate() ────────────────────────────────────────────────────────

  deactivate(api) {
    const Tone = window.Tone;

    // Dispose all Tone.js nodes
    const nodes = this._nodes;
    if (nodes) {
      try {
        if (nodes.activeNotes) {
          nodes.activeNotes.forEach(note => {
            try { nodes.polySynth?.triggerRelease(note); } catch {}
            try { nodes.subSynth?.triggerRelease(note); } catch {}
          });
          nodes.activeNotes.clear();
        }
        if (nodes.noiseEnv) try { nodes.noiseEnv.triggerRelease(); } catch {}
        if (nodes.noise) try { nodes.noise.stop(); } catch {}
        if (nodes.lfo) try { nodes.lfo.stop(); } catch {}
        if (nodes.polySynth) try { nodes.polySynth.dispose(); } catch {}
        if (nodes.subSynth) try { nodes.subSynth.dispose(); } catch {}
        if (nodes.noise) try { nodes.noise.dispose(); } catch {}
        if (nodes.noiseEnv) try { nodes.noiseEnv.dispose(); } catch {}
        if (nodes.filter) try { nodes.filter.dispose(); } catch {}
        if (nodes.distortion) try { nodes.distortion.dispose(); } catch {}
        if (nodes.delay) try { nodes.delay.dispose(); } catch {}
        if (nodes.reverb) try { nodes.reverb.dispose(); } catch {}
        if (nodes.lfo) try { nodes.lfo.dispose(); } catch {}
        if (nodes.lfoGain) try { nodes.lfoGain.dispose(); } catch {}
        if (nodes.waveform) try { nodes.waveform.dispose(); } catch {}
      } catch (err) {
        api.logger.error('[WavetableSynth] Error during cleanup:', err);
      }
      this._nodes = null;
    }

    // Remove UI
    api.ui.toolbar.removeButton('wavetable-synth-toggle');
    api.ui.panel.unregister('wavetable-synth');

    api.logger.info('[WavetableSynth] Mod v1.0.0 deactivated');
  }
};
