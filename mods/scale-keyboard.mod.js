/**
 * Scale Keyboard Mod - 音阶弹奏小键盘 v2
 *
 * 基于 react-piano + klavier 思路重构：
 * - CSS Grid 布局（参考 klavier）
 * - 完善的鼠标/触摸/键盘事件（参考 react-piano）
 * - Web Audio API 采样播放
 * - 支持从系统文件管理器拖放音频文件
 */

export default {
  id: 'com.samplerhub.scale-keyboard',
  name: '音阶键盘',
  version: '2.0.1',
  apiVersion: '1.0.0',
  author: 'SamplerHub',
  description: '虚拟钢琴键盘，用采样当乐器即兴弹奏。支持大/小调、五声音阶、布鲁斯、日本音阶。',
  permissions: ['audio:engine', 'ui:inject'],

  // 共享状态
  _audioCtx: null,
  _sampleBuffer: null,
  _sampleName: '',
  _activeSources: new Map(),

  activate(api) {
    const React = window.React;
    const { useState, useCallback, useRef, useEffect, useMemo } = React;
    const self = this;

    // ─── 音阶定义 ──────────────────────────────────────────────
    const SCALES = {
      major:       { name: '大调',     intervals: [0,2,4,5,7,9,11,12], label: 'Major' },
      minor:       { name: '小调',     intervals: [0,2,3,5,7,8,10,12], label: 'Minor' },
      penta_major: { name: '五声大调', intervals: [0,2,4,7,9,12],      label: 'Penta Maj' },
      penta_minor: { name: '五声小调', intervals: [0,3,5,7,10,12],     label: 'Penta Min' },
      blues:       { name: '布鲁斯',   intervals: [0,3,5,6,7,10,12],   label: 'Blues' },
      japanese:    { name: '日本音阶', intervals: [0,1,5,7,8,12],      label: 'Japanese' },
    };

    const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const WHITE_KEYS = ['C','D','E','F','G','A','B'];
    const BLACK_KEYS = { 'C#':1, 'D#':3, 'F#':6, 'G#':8, 'A#':10 };

    // ─── 音频引擎 ──────────────────────────────────────────────
    function getAudioContext() {
      if (!self._audioCtx) {
        self._audioCtx = api.audio.getContext() || new (window.AudioContext || window.webkitAudioContext)();
      }
      if (self._audioCtx.state === 'suspended') self._audioCtx.resume();
      return self._audioCtx;
    }

    function playNote(semitones) {
      if (!self._sampleBuffer) return;
      const ctx = getAudioContext();
      const playbackRate = Math.pow(2, semitones / 12);

      const source = ctx.createBufferSource();
      source.buffer = self._sampleBuffer;
      source.playbackRate.value = playbackRate;

      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.8, now + 0.01);
      gain.gain.linearRampToValueAtTime(0.6, now + 0.1);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.3);
      gain.gain.linearRampToValueAtTime(0, now + self._sampleBuffer.duration / playbackRate + 0.05);

      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);
      source.stop(now + self._sampleBuffer.duration / playbackRate + 0.1);

      self._activeSources.set(semitones, { source, gain });
      source.onended = () => self._activeSources.delete(semitones);
    }

    async function loadSample(arrayBuffer) {
      try {
        self._sampleBuffer = await getAudioContext().decodeAudioData(arrayBuffer.slice(0));
        return true;
      } catch (err) {
        api.logger.error('[ScaleKeyboard] decodeAudioData failed:', err);
        return false;
      }
    }

    // ─── 键盘布局算法 ──────────────────────────────────────────
    // 生成指定音阶和八度范围内的所有音符（MIDI number）
    function generateScaleNotes(scaleType, startOctave, octaves) {
      const scale = SCALES[scaleType];
      const notes = [];
      for (let o = 0; o < octaves; o++) {
        for (const interval of scale.intervals) {
          const midi = (startOctave + o) * 12 + interval;
          const name = NOTE_NAMES[interval % 12];
          notes.push({
            midi,
            name,
            octave: startOctave + o,
            isSharp: name.includes('#'),
            semitones: interval + o * 12,
          });
        }
      }
      return notes;
    }

    // ─── React 组件 ──────────────────────────────────────────────
    function ScaleKeyboard() {
      const [scaleType, setScaleType] = useState('major');
      const [startOctave, setStartOctave] = useState(3);
      const [activeKeys, setActiveKeys] = useState(new Set());
      const [hasSample, setHasSample] = useState(!!self._sampleBuffer);
      const [currentSampleName, setCurrentSampleName] = useState(self._sampleName);
      const [dragOver, setDragOver] = useState(false);
      const [octaves, setOctaves] = useState(2);
      const fileInputRef = useRef(null);
      const pressedKeysRef = useRef(new Set());
      const isMouseDown = useRef(false);

      const scaleNotes = useMemo(() =>
        generateScaleNotes(scaleType, startOctave, octaves),
        [scaleType, startOctave, octaves]
      );

      // 文件加载
      const handleFileLoad = useCallback(async (file) => {
        if (!file) return;
        try {
          const arrayBuffer = await file.arrayBuffer();
          if (await loadSample(arrayBuffer)) {
            setHasSample(true);
            setCurrentSampleName(file.name);
            self._sampleName = file.name;
            api.notifications.show('音阶键盘', { body: '采样已加载: ' + file.name, type: 'success' });
          }
        } catch (err) {
          api.notifications.show('加载失败', { body: '无法解码音频文件', type: 'error' });
        }
      }, []);

      // 全局拖放处理（解决 Electron 中拖放文件到窗口的问题）
      useEffect(() => {
        const handleWindowDragOver = (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        };
        const handleWindowDrop = (e) => {
          e.preventDefault();
          const files = e.dataTransfer.files;
          if (files.length > 0) handleFileLoad(files[0]);
        };
        window.addEventListener('dragover', handleWindowDragOver);
        window.addEventListener('drop', handleWindowDrop);
        return () => {
          window.removeEventListener('dragover', handleWindowDragOver);
          window.removeEventListener('drop', handleWindowDrop);
        };
      }, [handleFileLoad]);

      // 播放音符
      const playKey = useCallback((semitones) => {
        if (!self._sampleBuffer) return;
        playNote(semitones);
        setActiveKeys(prev => new Set(prev).add(semitones));
        setTimeout(() => {
          setActiveKeys(prev => {
            const next = new Set(prev);
            next.delete(semitones);
            return next;
          });
        }, 200);
      }, []);

      // 鼠标事件（支持滑音 glissando）
      const handleMouseDown = useCallback((semitones) => {
        isMouseDown.current = true;
        playKey(semitones);
      }, [playKey]);

      const handleMouseUp = useCallback(() => {
        isMouseDown.current = false;
      }, []);

      const handleMouseEnter = useCallback((semitones) => {
        if (isMouseDown.current) playKey(semitones);
      }, [playKey]);

      const handleMouseLeave = useCallback(() => {}, []);

      // 全局 mouseup（防止在键外松开）
      useEffect(() => {
        const handleGlobalMouseUp = () => { isMouseDown.current = false; };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
      }, []);

      // 键盘事件
      useEffect(() => {
        const KEYBOARD_MAP = {
          'z':0, 's':1, 'x':2, 'd':3, 'c':4, 'v':5, 'g':6, 'b':7, 'h':8, 'n':9, 'j':10, 'm':11,
          'q':12,'2':13,'w':14,'3':15,'e':16,'r':17,'5':18,'t':19,'6':20,'y':21,'7':22,'u':23,
        };
        const handleKeyDown = (e) => {
          if (e.repeat || e.ctrlKey || e.metaKey) return;
          const idx = KEYBOARD_MAP[e.key.toLowerCase()];
          if (idx !== undefined && !pressedKeysRef.current.has(e.key)) {
            pressedKeysRef.current.add(e.key);
            if (idx < scaleNotes.length) playKey(scaleNotes[idx].semitones);
          }
          if (e.key === 'ArrowLeft') setStartOctave(o => Math.max(1, o - 1));
          if (e.key === 'ArrowRight') setStartOctave(o => Math.min(6, o + 1));
        };
        const handleKeyUp = (e) => pressedKeysRef.current.delete(e.key);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
        };
      }, [scaleNotes, playKey]);

      // ─── 渲染 ──────────────────────────────────────────────
      const h = React.createElement;

      // 工具栏
      const header = h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)',
          background: '#16213e', flexShrink: 0,
        }
      },
        h('div', { style: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 } },
          '🎹 音阶键盘'
        ),
        h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
          // 音阶选择
          h('select', {
            value: scaleType,
            onChange: (e) => setScaleType(e.target.value),
            style: { background: '#0f3460', color: '#e0e0e0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', outline: 'none' },
          }, Object.entries(SCALES).map(([k, s]) => h('option', { key: k, value: k }, s.name + ' (' + s.label + ')'))),
          // 八度
          h('button', { style: { background: '#0f3460', color: '#e0e0e0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }, onClick: () => setStartOctave(o => Math.max(1, o - 1)) }, '◀'),
          h('span', { style: { fontSize: 12, fontWeight: 600, minWidth: 40, textAlign: 'center' } }, 'C' + startOctave),
          h('button', { style: { background: '#0f3460', color: '#e0e0e0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }, onClick: () => setStartOctave(o => Math.min(6, o + 1)) }, '▶'),
          // 八度数量
          h('select', {
            value: octaves,
            onChange: (e) => setOctaves(Number(e.target.value)),
            style: { background: '#0f3460', color: '#e0e0e0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', outline: 'none' },
          }, [1,2,3].map(n => h('option', { key: n, value: n }, n + ' 个八度'))),
        )
      );

      // 采样信息栏
      const sampleBar = h('div', {
        style: {
          padding: '6px 12px', fontSize: 11, color: '#888',
          background: '#16213e', borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minHeight: 30,
        }
      },
        self._sampleBuffer
          ? h(React.Fragment, null,
              '🎵 音色: ', h('span', { style: { color: '#e94560', fontWeight: 500 } }, currentSampleName),
              ' | 拖放替换 | ',
              h('button', {
                style: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' },
                onClick: () => fileInputRef.current?.click(),
              }, '选择文件')
            )
          : '🎵 请拖放音频文件到此处，或点击选择文件'
      );

      // 隐藏的文件输入
      const fileInput = h('input', {
        ref: fileInputRef, type: 'file', accept: 'audio/*',
        style: { display: 'none' },
        onChange: (e) => { if (e.target.files[0]) handleFileLoad(e.target.files[0]); e.target.value = ''; },
      });

      // 键盘区域
      const keyboard = h('div', {
        style: {
          flex: 1, display: 'flex', flexDirection: 'column',
          padding: '8px 12px 12px', gap: 2, overflow: 'auto',
          background: '#1a1a2e',
        }
      },
        // 使用 flex 布局的琴键行
        h('div', {
          style: {
            display: 'flex', flex: 1, gap: 2,
            alignItems: 'flex-end', justifyContent: 'center',
            minHeight: 180, position: 'relative',
          }
        },
          scaleNotes.map((note, i) => {
            const isActive = activeKeys.has(note.semitones);
            const isSharp = note.isSharp;

            // 白键样式
            const whiteStyle = {
              flex: 1, height: '100%', minWidth: 36, maxWidth: 60,
              borderRadius: '0 0 6px 6px',
              border: '1px solid rgba(255,255,255,0.15)',
              borderTop: 'none',
              background: isActive ? '#e94560' : '#f0f0f0',
              color: isActive ? '#fff' : '#333',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
              cursor: 'pointer', userSelect: 'none', position: 'relative',
              paddingBottom: 8, fontSize: 11, fontWeight: 500,
              transition: 'background 0.05s, transform 0.05s',
              transform: isActive ? 'scale(0.98)' : 'scale(1)',
              zIndex: 1,
            };

            // 黑键样式（绝对定位覆盖在白键之间）
            const blackStyle = {
              position: 'absolute',
              width: '60%', height: '60%',
              borderRadius: '0 0 4px 4px',
              background: isActive ? '#e94560' : '#1a1a2e',
              border: '1px solid rgba(255,255,255,0.2)',
              borderTop: 'none',
              color: isActive ? '#fff' : '#ccc',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
              cursor: 'pointer', userSelect: 'none',
              paddingBottom: 6, fontSize: 10, fontWeight: 500,
              transition: 'background 0.05s, transform 0.05s',
              transform: isActive ? 'scale(0.98)' : 'scale(1)',
              zIndex: 2,
            };

            // 计算黑键位置：放在当前白键和下一个白键之间
            const keyStyle = isSharp ? blackStyle : whiteStyle;

            return h('div', {
              key: note.midi,
              'data-semitones': note.semitones,
              style: isSharp ? {
                position: 'relative', flex: 1, height: '100%',
              } : keyStyle,
              onMouseDown: (e) => { e.preventDefault(); handleMouseDown(note.semitones); },
              onMouseUp: () => handleMouseUp(),
              onMouseEnter: () => handleMouseEnter(note.semitones),
              onMouseLeave: handleMouseLeave,
              onTouchStart: (e) => { e.preventDefault(); playKey(note.semitones); },
              onTouchEnd: (e) => { e.preventDefault(); },
            },
              isSharp
                ? h('div', {
                    style: {
                      ...blackStyle,
                      position: 'absolute',
                      top: 0,
                      left: '70%',
                      width: '70%',
                      height: '60%',
                    },
                    onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); handleMouseDown(note.semitones); },
                    onMouseUp: (e) => { e.stopPropagation(); handleMouseUp(); },
                    onMouseEnter: (e) => { e.stopPropagation(); handleMouseEnter(note.semitones); },
                  }, note.name)
                : note.name
            );
          })
        )
      );

      // 底部提示
      const footer = h('div', {
        style: {
          padding: '6px 12px', fontSize: 10, color: '#666',
          textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0,
        }
      }, '键盘: ZSXDCVGBHNJM / Q2W3ER5T6Y7U | ←→ 切换八度 | 支持鼠标滑音');

      return h('div', {
        style: {
          display: 'flex', flexDirection: 'column', height: '100%',
          background: '#1a1a2e', color: '#e0e0e0',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          overflow: 'hidden',
        }
      }, header, sampleBar, fileInput, keyboard, footer);
    }

    // ─── 注册 UI ──────────────────────────────────────────────
    api.ui.toolbar.addButton({
      id: 'scale-keyboard-toggle',
      icon: '🎹',
      tooltip: '音阶键盘',
      onClick: () => api.ui.panel.open('scale-keyboard'),
    });

    api.ui.panel.register({
      id: 'scale-keyboard',
      title: '🎹 音阶键盘',
      component: ScaleKeyboard,
      position: 'floating',
    });

    api.logger.info('[ScaleKeyboard] Mod v2 activated');
  },

  deactivate(api) {
    // 停止所有活跃音源
    self._activeSources?.forEach(({ source }) => {
      try { source.stop(); } catch {}
    });
    self._activeSources?.clear();

    if (this._audioCtx) {
      this._audioCtx.close().catch(() => {});
      this._audioCtx = null;
    }
    this._sampleBuffer = null;
    this._sampleName = '';

    api.ui.toolbar.removeButton('scale-keyboard-toggle');
    api.ui.panel.unregister('scale-keyboard');

    api.logger.info('[ScaleKeyboard] Mod v2 deactivated');
  },
};
