import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from 'antd';
import { CaretRightOutlined, BorderOutlined, RedoOutlined, SoundOutlined, PushpinOutlined, PushpinFilled, CustomerServiceOutlined, DownloadOutlined, ShakeOutlined, PlusOutlined, CloseOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { SequencerEngine } from '../components/sequencer/SequencerEngine';
import { Mixer } from '../components/mixer/Mixer';
import { useSequencerStore, TrackType, StepCount, TimeSignature } from '../stores/sequencerStore';
import { ipcClient } from '../services/ipcClient';
import { getSamplesForPad, getAllAudioSamples } from '../utils/sampleFilter';
import s from '../styles/pages/sequencer-page.module.css';

/** Loop 轨道波形组件 */
function LoopWaveform({ trackId, engineRef, isPlaying, accentColor }: {
  trackId: string;
  engineRef: React.MutableRefObject<SequencerEngine | null>;
  isPlaying: boolean;
  accentColor: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const [waveformData, setWaveformData] = useState<Float32Array | null>(null);

  // 从引擎获取 AudioBuffer 并提取波形数据
  useEffect(() => {
    const extractWaveform = () => {
      if (!engineRef.current) return;
      const ctx = engineRef.current.getContext();
      const buffer = ctx ? engineRef.current.getBuffer(trackId) : null;
      if (!buffer || !(buffer instanceof AudioBuffer)) return;

      // 取第一个声道，降采样到 512 点
      const rawData = buffer.getChannelData(0);
      const samples = 512;
      const blockSize = Math.floor(rawData.length / samples);
      const waveform = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[i * blockSize + j]);
        }
        waveform[i] = sum / blockSize;
      }
      setWaveformData(waveform);
    };

    // 等待 buffer 加载完成
    const checkInterval = setInterval(() => {
      if (engineRef.current?.hasBuffer(trackId)) {
        extractWaveform();
        clearInterval(checkInterval);
      }
    }, 200);
    return () => clearInterval(checkInterval);
  }, [trackId, engineRef]);

  // 绘制波形
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const mid = h / 2;

    ctx.clearRect(0, 0, w, h);

    // 绘制波形柱
    const barWidth = w / waveformData.length;
    for (let i = 0; i < waveformData.length; i++) {
      const amplitude = Math.min(waveformData[i] * 3, 1); // 放大3倍，clamp到1
      const barH = amplitude * mid * 0.85;

      // 解析 accentColor 获取实际颜色值
      const color = isPlaying ? accentColor : 'rgba(255,255,255,0.25)';
      ctx.fillStyle = color;
      ctx.fillRect(
        i * barWidth,
        mid - barH,
        Math.max(barWidth - 0.5, 0.5),
        barH * 2
      );
    }
  }, [waveformData, isPlaying, accentColor]);

  // 清理
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={s.loopWaveformCanvas}
      style={{ width: '100%', height: '40px' }}
    />
  );
}

// 通过 Electron 读取本地音频文件为 ArrayBuffer
async function readLocalAudioFile(filePath: string): Promise<ArrayBuffer | null> {
  try {
    const result = await window.electronAPI.invoke('fs:readFile', { filePath }) as { success: boolean; data?: unknown; error?: string };
    if (result.success && result.data) {
      return result.data as ArrayBuffer;
    }
  } catch {
    try {
      // 使用 IPC 读取音频文件，避免 file:// URL 特殊字符问题
      const buffer = await ipcClient.getAudioBuffer(filePath);
      if (buffer) return buffer;
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

const BASE_GRID_COLS = 32;

const SequencerPage: React.FC = () => {
  const [isPinned, setIsPinned] = useState(false);
  const { t } = useTranslation();
  const engineRef = useRef<SequencerEngine | null>(null);
  const {
    tracks,
    bpm,
    swing,
    masterVolume,
    isPlaying,
    currentStep,
    timeSignature,
    toggleStep,
    setTrackVelocity,
    setTrackSample,
    setTrackPan,
    setTrackPitch,
    setTrackDelaySend,
    setTrackReverbSend,
    setTrackType,
    setTrackStepCount,
    setTimeSignature,
    addTrack,
    removeTrack,
    setBpm,
    setSwing,
    setMasterVolume,
    setIsPlaying,
    setCurrentStep,
    resetPattern,
    randomizePattern,
    exportPattern,
    importPattern,
    mixerVisible,
    setMixerVisible,
    delayTime,
    delayFeedback,
    delayMix,
    reverbMix,
    setDelayTime,
    setDelayFeedback,
    setDelayMix,
    setReverbMix,
  } = useSequencerStore();

  const [showSamplePicker, setShowSamplePicker] = useState(false);
  const [selectingTrackId, setSelectingTrackId] = useState<string | null>(null);
  const [librarySamples, setLibrarySamples] = useState<Array<{ id: number; fileName: string; filePath: string }>>([]);
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [newTrackName, setNewTrackName] = useState('');
  const [newTrackType, setNewTrackType] = useState<TrackType>('drum');

  // 初始化音频引擎
  useEffect(() => {
    const engine = new SequencerEngine();
    engineRef.current = engine;
    const init = async () => {
      await engine.initialize();
      engine.setOnStep((step) => {
        setCurrentStep(step);
      });
    };
    init();
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [setCurrentStep]);

  // 同步 BPM / Swing / TimeSignature 到引擎
  useEffect(() => {
    engineRef.current?.setBpm(bpm);
  }, [bpm]);

  useEffect(() => {
    engineRef.current?.setSwing(swing);
  }, [swing]);

  useEffect(() => {
    engineRef.current?.setTimeSignature(timeSignature);
  }, [timeSignature]);

  useEffect(() => {
    engineRef.current?.setMasterVolume(masterVolume);
  }, [masterVolume]);

  // 加载已分配采样的 buffer
  useEffect(() => {
    const loadBuffers = async () => {
      if (!engineRef.current) return;
      for (const track of tracks) {
        if (track.filePath && !engineRef.current.hasBuffer(track.id)) {
          try {
            const buffer = await readLocalAudioFile(track.filePath);
            if (buffer) {
              const ctx = engineRef.current.getContext();
              if (!ctx) continue;
              const audioBuffer = await ctx.decodeAudioData(buffer);
              engineRef.current.loadBuffer(track.id, audioBuffer);
            }
          } catch (err) {
            console.error('[SequencerPage] Failed to load sample:', track.filePath, err);
          }
        }
      }
    };
    loadBuffers();
  }, [tracks]);

  // 播放期间 tracks 变化时同步到引擎
  useEffect(() => {
    if (isPlaying) {
      engineRef.current?.updateTracks(tracks);
    }
  }, [isPlaying, tracks]);

  // 停止
  const stopPlayback = useCallback(() => {
    engineRef.current?.stop();
    setIsPlaying(false);
  }, [setIsPlaying]);

  const handlePlay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      engineRef.current?.play(tracks);
      setIsPlaying(true);
    }
  }, [isPlaying, tracks, setIsPlaying, stopPlayback]);

  const handleToggleStep = useCallback((trackId: string, stepIndex: number) => {
    toggleStep(trackId, stepIndex);
  }, [toggleStep]);

  const handleSelectSample = useCallback(async (trackId: string) => {
    setSelectingTrackId(trackId);
    try {
      const track = tracks.find((t) => t.id === trackId);
      let samples: Array<{ id: number; fileName: string; filePath: string }> = [];

      if (track) {
        // 根据轨道类型（Kick/Snare/Hi-Hat等）使用分类筛选
        samples = await getSamplesForPad(track.name);
      }

      // 如果分类筛选没有结果，回退到全部音频采样
      if (samples.length === 0) {
        samples = await getAllAudioSamples();
      }

      setLibrarySamples(samples);
      setShowSamplePicker(true);
    } catch (err) {
      console.error('[SequencerPage] Failed to load library samples:', err);
    }
  }, [tracks]);

  const handlePickSample = useCallback(
    async (sampleId: number, filePath: string, fileName: string) => {
      if (!selectingTrackId || !engineRef.current) return;
      try {
        const buffer = await readLocalAudioFile(filePath);
        if (buffer) {
          const ctx = engineRef.current.getContext();
          if (!ctx) return;
          const audioBuffer = await ctx.decodeAudioData(buffer);
          engineRef.current.loadBuffer(selectingTrackId, audioBuffer);
          setTrackSample(selectingTrackId, sampleId, filePath, fileName.replace(/\.[^.]+$/, ''));
        }
      } catch (err) {
        console.error('[SequencerPage] Failed to load sample:', err);
      }
      setShowSamplePicker(false);
      setSelectingTrackId(null);
    },
    [selectingTrackId, setTrackSample]
  );

  // 拖放加载采样到轨道
  const handleTrackDrop = useCallback(
    async (trackId: string, filePath: string, fileName: string) => {
      if (!engineRef.current) return;
      try {
        const buffer = await readLocalAudioFile(filePath);
        if (buffer) {
          const ctx = engineRef.current.getContext();
          if (!ctx) return;
          const audioBuffer = await ctx.decodeAudioData(buffer);
          engineRef.current.loadBuffer(trackId, audioBuffer);
          setTrackSample(trackId, 0, filePath, fileName.replace(/\.[^.]+$/, ''));
        }
      } catch (err) {
        console.error('[SequencerPage] Failed to load dropped sample:', err);
      }
    },
    [setTrackSample]
  );

  const handleExportMidi = useCallback(async () => {
    const result = await ipcClient.exportSequencerMidi(tracks, bpm, timeSignature);
    if (result.filePath) {
      // 可选：显示成功提示
    }
  }, [tracks, bpm, timeSignature]);

  const handleSavePattern = useCallback(async () => {
    const patternJson = exportPattern();
    const { dialog } = await import('electron');
    const result = await dialog.showSaveDialog({
      title: 'Save Pattern',
      defaultPath: 'pattern.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!result.canceled && result.filePath) {
      await window.electronAPI.invoke('fs:writeFile', {
        filePath: result.filePath,
        data: patternJson,
      });
    }
  }, [exportPattern]);

  const handleLoadPattern = useCallback(async () => {
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog({
      title: 'Load Pattern',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const response = await window.electronAPI.invoke('fs:readFile', { filePath }) as { success: boolean; data?: string };
      if (response.success && response.data) {
        importPattern(response.data);
      }
    }
  }, [importPattern]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, trackId: string) => {
      e.preventDefault();
      let filePath = e.dataTransfer.getData('text/x-file-path');
      // Fallback: 支持从文件系统直接拖放
      if (!filePath && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('audio/') || /\.(wav|mp3|flac|aiff|ogg|m4a)$/i.test(file.name)) {
          filePath = file.path || '';
        }
      }
      if (filePath) {
        const fileName = filePath.split(/[\\/]/).pop() || 'Unknown';
        handleTrackDrop(trackId, filePath, fileName);
      }
    },
    [handleTrackDrop]
  );

  const handleAddTrack = useCallback(() => {
    if (!newTrackName.trim()) return;
    addTrack(newTrackName.trim(), newTrackType);
    setNewTrackName('');
    setShowAddTrack(false);
  }, [newTrackName, newTrackType, addTrack]);

  // 计算每个轨道 step 在 32 列网格中的跨度
  const getStepSpan = (stepCount: StepCount) => BASE_GRID_COLS / stepCount;

  // 生成 32 列的节拍标记（基于拍号）
  const beatMarkers = useMemo(() => {
    const markers: number[] = [];
    const [beats] = timeSignature.split('/').map(Number);
    const colsPerBeat = BASE_GRID_COLS / beats;
    for (let i = 0; i < beats; i++) {
      markers.push(Math.round(i * colsPerBeat));
    }
    return markers;
  }, [timeSignature]);

  return (
    <div className={s.container}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.title}>{t('sequencer.title')}</h1>
          <p className={s.subtitle}>{t('sequencer.subtitle')}</p>
        </div>
        <div className={s.headerActions}>
          <button onClick={handleSavePattern} className={s.headerBtn} title={t('sequencer.savePattern')}>
            <SaveOutlined />
            <span>{t('sequencer.savePattern')}</span>
          </button>
          <button onClick={handleLoadPattern} className={s.headerBtn} title={t('sequencer.loadPattern')}>
            <UploadOutlined />
            <span>{t('sequencer.loadPattern')}</span>
          </button>
          <button onClick={handleExportMidi} className={s.headerBtn} title={t('sequencer.exportMidi')}>
            <DownloadOutlined />
            <span>{t('sequencer.exportMidi')}</span>
          </button>
          <button onClick={randomizePattern} className={s.headerBtn} title={t('sequencer.randomize')}>
            <ShakeOutlined />
            <span>{t('sequencer.randomize')}</span>
          </button>
          <button onClick={resetPattern} className={s.headerBtn} title={t('sequencer.reset')}>
            <RedoOutlined />
            <span>{t('sequencer.reset')}</span>
          </button>
          <button
            onClick={async () => {
              const newState = !isPinned;
              setIsPinned(newState);
              await window.electronAPI.setAlwaysOnTop(newState);
            }}
            className={`${s.headerBtn} ${isPinned ? s.headerBtnActive : ''}`}
            title={isPinned ? t('sequencer.unpin') : t('sequencer.pin')}
          >
            {isPinned ? <PushpinFilled /> : <PushpinOutlined />}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className={s.controls}>
        <button
          onClick={handlePlay}
          className={`${s.playBtn} ${isPlaying ? s.playBtnActive : ''}`}
        >
          {isPlaying ? <BorderOutlined /> : <CaretRightOutlined style={{ marginLeft: 2 }} />}
          <span>{isPlaying ? t('sequencer.stop') : t('sequencer.play')}</span>
        </button>

        <div className={s.controlGroup}>
          <span className={s.controlLabel}>BPM</span>
          <input
            type="number"
            min={60}
            max={200}
            value={bpm}
            onChange={(e) => setBpm(parseInt(e.target.value) || 120)}
            className={s.bpmInput}
          />
        </div>

        <div className={s.controlGroup}>
          <span className={s.controlLabel}>{t('sequencer.timeSignature')}</span>
          <Select
            value={timeSignature}
            onChange={(v) => setTimeSignature(v as TimeSignature)}
            options={[
              { value: '3/4', label: '3/4' },
              { value: '4/4', label: '4/4' },
              { value: '6/8', label: '6/8' },
            ]}
            size="small"
            style={{ minWidth: 80 }}
          />
        </div>

        <div className={s.controlGroup}>
          <span className={s.controlLabel}>{t('sequencer.swing')}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={swing}
            onChange={(e) => setSwing(parseFloat(e.target.value))}
            className={s.slider}
          />
          <span className={s.controlValue}>{Math.round(swing * 100)}%</span>
        </div>

        <div className={s.controlGroup}>
          <SoundOutlined className={s.controlIcon} />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
            className={s.slider}
          />
          <span className={s.controlValue}>{Math.round(masterVolume * 100)}%</span>
        </div>
      </div>

      {/* Step Grid */}
      <div className={s.gridContainer}>
        {/* 扫描线 */}
        <div className={`${s.scanLine} ${isPlaying && currentStep >= 0 ? s.scanLineVisible : ''}`} />

        {/* Step number header — 只显示16个（16分音符位置） */}
        <div className={s.gridHeader}>
          <div className={s.trackLabelCell} />
          <div className={s.stepNumbersGrid}>
            {Array.from({ length: 16 }, (_, i) => (
              <div
                key={i}
                className={`${s.stepNumber} ${beatMarkers.includes(i * 2) ? s.stepNumberBeat : ''} ${currentStep === i * 2 ? s.stepNumberActive : ''}`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Tracks */}
        {tracks.map((track) => (
          <div
            key={track.id}
            className={s.trackRow}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, track.id)}
          >
            <div className={s.trackInfo}>
              <div className={s.trackInfoTop}>
                <button
                  className={s.trackNameBtn}
                  onClick={() => handleSelectSample(track.id)}
                  title={track.filePath ? track.name : t('sequencer.clickToSelect')}
                >
                  <CustomerServiceOutlined />
                  <span>{track.name}</span>
                </button>
                <button
                  className={s.removeTrackBtn}
                  onClick={() => removeTrack(track.id)}
                  title={t('sequencer.removeTrack')}
                >
                  <CloseOutlined />
                </button>
              </div>
              <div className={s.trackMeta}>
                <span className={`${s.trackTypeBadge} ${track.type === 'loop' ? s.trackTypeLoop : s.trackTypeDrum}`}>
                  {t(`sequencer.${track.type}`)}
                </span>
                {track.type !== 'loop' && (
                  <Select
                    value={track.stepCount}
                    onChange={(v) => setTrackStepCount(track.id, v as StepCount)}
                    options={[
                      { value: 8, label: '8' },
                      { value: 16, label: '16' },
                      { value: 32, label: '32' },
                    ]}
                    size="small"
                    style={{ width: 60 }}
                    title={t('sequencer.stepCount')}
                  />
                )}
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={track.velocity}
                onChange={(e) => setTrackVelocity(track.id, parseFloat(e.target.value))}
                className={s.velocitySlider}
                title={`${t('sequencer.velocity')}: ${Math.round(track.velocity * 100)}%`}
              />
            </div>
            {track.type === 'loop' ? (
              /* Loop 轨道：显示波形预览 */
              <div className={s.loopWaveformContainer}>
                {track.filePath ? (
                  <LoopWaveform
                    trackId={track.id}
                    engineRef={engineRef}
                    isPlaying={isPlaying}
                    accentColor="var(--primary)"
                  />
                ) : (
                  <div className={s.loopEmpty}>
                    <CustomerServiceOutlined style={{ fontSize: 20, opacity: 0.3 }} />
                    <span>{t('sequencer.clickToSelect')}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className={s.trackStepsGrid}>
                {track.steps.map((isActive, stepIndex) => {
                  const span = getStepSpan(track.stepCount);
                  const globalIndex = Math.round(stepIndex * span);
                  return (
                    <button
                      key={stepIndex}
                      className={`${s.stepButton} ${isActive ? s.stepButtonActive : ''} ${currentStep === globalIndex ? s.stepButtonCurrent : ''} ${beatMarkers.includes(globalIndex) ? s.stepButtonBeat : ''}`}
                      style={{ gridColumn: `span ${span}` }}
                      onClick={() => handleToggleStep(track.id, stepIndex)}
                      aria-label={`${track.name} step ${stepIndex + 1}`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Add Track */}
        <div className={s.addTrackRow}>
          {!showAddTrack ? (
            <button
              className={s.addTrackBtn}
              onClick={() => setShowAddTrack(true)}
              disabled={tracks.length >= 10}
              title={tracks.length >= 10 ? '最多10个轨道' : t('sequencer.addTrack')}
            >
              <PlusOutlined />
              <span>{t('sequencer.addTrack')} ({tracks.length}/10)</span>
            </button>
          ) : (
            <div className={s.addTrackForm}>
              <input
                type="text"
                value={newTrackName}
                onChange={(e) => setNewTrackName(e.target.value)}
                placeholder={t('sequencer.trackName')}
                className={s.addTrackInput}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTrack(); }}
              />
              <Select
                value={newTrackType}
                onChange={(v) => setNewTrackType(v as TrackType)}
                options={[
                  { value: 'drum', label: t('sequencer.drum') },
                  { value: 'loop', label: t('sequencer.loop') },
                ]}
                size="small"
                style={{ minWidth: 90 }}
              />
              <button className={s.addTrackConfirm} onClick={handleAddTrack}>
                {t('common.confirm')}
              </button>
              <button className={s.addTrackCancel} onClick={() => { setShowAddTrack(false); setNewTrackName(''); }}>
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sample Picker Modal */}
      <AnimatePresence>
        {showSamplePicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={s.modalOverlay}
            onClick={() => setShowSamplePicker(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={s.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className={s.modalTitle}>{t('sequencer.selectSample')}</h3>
              <div className={s.sampleList}>
                {librarySamples.map((sample) => (
                  <button
                    key={sample.id}
                    className={s.sampleItem}
                    onClick={() => handlePickSample(sample.id, sample.filePath, sample.fileName)}
                  >
                    {sample.fileName.replace(/\.[^.]+$/, '')}
                  </button>
                ))}
              </div>
              <button className={s.modalClose} onClick={() => setShowSamplePicker(false)}>
                {t('common.cancel')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mixer */}
      <Mixer
        channels={tracks.map((track) => ({
          id: track.id,
          name: track.name,
          volume: track.velocity,
          pan: track.pan,
          pitch: track.pitch,
          delaySend: track.delaySend,
          reverbSend: track.reverbSend,
        }))}
        masterVolume={masterVolume}
        effects={{
          delayTime,
          delayFeedback,
          delayMix,
          reverbMix,
        }}
        visible={mixerVisible}
        onToggleVisible={() => setMixerVisible(!mixerVisible)}
        onMasterVolumeChange={setMasterVolume}
        onEffectChange={(key, value) => {
          switch (key) {
            case 'delayTime': setDelayTime(value); break;
            case 'delayFeedback': setDelayFeedback(value); break;
            case 'delayMix': setDelayMix(value); break;
            case 'reverbMix': setReverbMix(value); break;
          }
        }}
        callbacks={{
          onVolumeChange: (id, volume) => setTrackVelocity(id, volume),
          onPanChange: setTrackPan,
          onPitchChange: setTrackPitch,
          onDelaySendChange: setTrackDelaySend,
          onReverbSendChange: setTrackReverbSend,
        }}
      />
    </div>
  );
};

export default React.memo(SequencerPage);
