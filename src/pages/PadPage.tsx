import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RedoOutlined, SoundOutlined, PushpinOutlined, PushpinFilled, StopOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import DrumPad from '../components/pad/DrumPad';
import { StepSequencer } from '../components/sequencer/StepSequencer';
import { PadSequencerEngine } from '../components/sequencer/PadSequencerEngine';
import { Mixer } from '../components/mixer/Mixer';
import { PadEngine } from '../components/pad/PadEngine';
import { usePadStore } from '../stores/padStore';
import { ipcClient } from '../services/ipcClient';
import { getSamplesForPad } from '../utils/sampleFilter';
import s from '../styles/pages/pad-page.module.css';

// 通过 Electron 读取本地音频文件为 ArrayBuffer
async function readLocalAudioFile(filePath: string): Promise<ArrayBuffer | null> {
  try {
    // 使用 Electron 的 ipcRenderer 读取文件
    const result = await window.electronAPI.invoke('fs:readFile', { filePath }) as { success: boolean; data?: unknown; error?: string };
    if (result.success && result.data) {
      return result.data as ArrayBuffer;
    }
  } catch {
    // fallback: 使用 IPC 读取音频文件，避免 file:// URL 特殊字符问题
    try {
      const buffer = await ipcClient.getAudioBuffer(filePath);
      if (buffer) return buffer;
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

const PadPage: React.FC = () => {
  const [isPinned, setIsPinned] = useState(false);
  const { t } = useTranslation();
  const engineRef = useRef<PadEngine>(new PadEngine());
  const seqEngineRef = useRef<PadSequencerEngine>(new PadSequencerEngine());
  const {
    pads,
    activeKeys,
    masterVolume,
    isInitialized,
    setPadVolume,
    setPadPan,
    setPadPitch,
    setPadSample,
    setPadMode,
    setPadDelaySend,
    setPadReverbSend,
    triggerPad,
    releasePad,
    setMasterVolume,
    setInitialized,
    resetPads,
    patterns,
    currentPatternIndex,
    isPlaying,
    currentStep,
    setIsPlaying,
    setCurrentStep,
    toggleStep,
    setStepVelocity,
    updatePattern,
    setCurrentPattern,
    delayTime,
    delayFeedback,
    delayMix,
    reverbMix,
    setDelayTime,
    setDelayFeedback,
    setDelayMix,
    setReverbMix,
    mixerVisible,
    setMixerVisible,
    sequencerVisible,
    setSequencerVisible,
  } = usePadStore();

  const [showSamplePicker, setShowSamplePicker] = useState(false);
  const [selectingPadId, setSelectingPadId] = useState<string | null>(null);
  const [librarySamples, setLibrarySamples] = useState<Array<{ id: number; fileName: string; filePath: string }>>([]);

  // 初始化音频引擎
  useEffect(() => {
    const init = async () => {
      await engineRef.current.initialize();
      const ctx = engineRef.current.getContext();
      if (ctx) {
        seqEngineRef.current.initialize(ctx);
      }
      setInitialized(true);
    };
    init();
    return () => {
      seqEngineRef.current.dispose();
      engineRef.current.dispose();
    };
  }, [setInitialized]);

  // 设置音序器回调（单独处理，避免 TDZ）
  useEffect(() => {
    if (!isInitialized) return;
    seqEngineRef.current.setCallbacks({
      onStep: (step) => setCurrentStep(step),
      onTriggerPad: (padId, velocity) => {
        const pad = pads.find((p) => p.id === padId);
        if (!pad) return;
        triggerPad(pad.key);
        engineRef.current.play(padId, {
          volume: pad.volume * masterVolume,
          pan: pad.pan,
          pitch: pad.pitch,
          mode: pad.mode,
          delaySend: pad.delaySend,
          reverbSend: pad.reverbSend,
          velocity,
        });
        if (pad.mode === 'oneshot') {
          setTimeout(() => {
            releasePad(pad.key);
          }, 150);
        }
      },
    });
  }, [isInitialized, pads, masterVolume, triggerPad, releasePad, setCurrentStep]);

  // 主音量
  useEffect(() => {
    engineRef.current.setMasterVolume(masterVolume);
  }, [masterVolume]);

  // 效果器参数
  useEffect(() => {
    engineRef.current.setDelayTime(delayTime);
  }, [delayTime]);

  useEffect(() => {
    engineRef.current.setDelayFeedback(delayFeedback);
  }, [delayFeedback]);

  useEffect(() => {
    engineRef.current.setDelayMix(delayMix);
  }, [delayMix]);

  useEffect(() => {
    engineRef.current.setReverbMix(reverbMix);
  }, [reverbMix]);

  // 音序器播放控制
  useEffect(() => {
    const pattern = patterns[currentPatternIndex];
    seqEngineRef.current.setPattern(pattern);
    if (isPlaying) {
      seqEngineRef.current.play();
    } else {
      seqEngineRef.current.stop();
      setCurrentStep(-1);
    }
  }, [isPlaying, currentPatternIndex, patterns, setCurrentStep]);

  // 加载已分配采样的 buffer
  useEffect(() => {
    if (!isInitialized) return;
    const loadBuffers = async () => {
      for (const pad of pads) {
        if (pad.filePath && !engineRef.current.hasBuffer(pad.id)) {
          try {
            const buffer = await readLocalAudioFile(pad.filePath);
            if (buffer) {
              await engineRef.current.loadSampleFromArrayBuffer(buffer, pad.id);
            }
          } catch (err) {
            console.error('[PadPage] Failed to load sample:', pad.filePath, err);
          }
        }
      }
    };
    loadBuffers();
  }, [pads, isInitialized]);

  const handleTrigger = useCallback(
    (padId: string, velocity = 1) => {
      const pad = pads.find((p) => p.id === padId);
      if (!pad) return;

      triggerPad(pad.key);
      engineRef.current.play(padId, {
        volume: pad.volume * masterVolume,
        pan: pad.pan,
        pitch: pad.pitch,
        mode: pad.mode,
        delaySend: pad.delaySend,
        reverbSend: pad.reverbSend,
        velocity,
      });

      // oneshot 模式下 150ms 后移除 active 状态；loop 模式下保持 active 直到手动停止
      if (pad.mode === 'oneshot') {
        setTimeout(() => {
          releasePad(pad.key);
        }, 150);
      }
    },
    [pads, masterVolume, triggerPad, releasePad]
  );

  // 键盘监听
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toUpperCase();
      const pad = pads.find((p) => p.key === key);
      if (pad) {
        event.preventDefault();
        handleTrigger(pad.id);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase();
      releasePad(key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pads, handleTrigger, releasePad]);

  const handleVolumeChange = useCallback(
    (id: string, volume: number) => {
      setPadVolume(id, volume);
    },
    [setPadVolume]
  );

  const handlePanChange = useCallback(
    (id: string, pan: number) => {
      setPadPan(id, pan);
    },
    [setPadPan]
  );

  const handlePitchChange = useCallback(
    (id: string, pitch: number) => {
      setPadPitch(id, pitch);
    },
    [setPadPitch]
  );

  const handleDelaySendChange = useCallback(
    (id: string, send: number) => {
      setPadDelaySend(id, send);
    },
    [setPadDelaySend]
  );

  const handleReverbSendChange = useCallback(
    (id: string, send: number) => {
      setPadReverbSend(id, send);
    },
    [setPadReverbSend]
  );

  const handleModeChange = useCallback(
    (id: string, mode: 'oneshot' | 'loop') => {
      setPadMode(id, mode);
    },
    [setPadMode]
  );

  const handleFileUpload = useCallback(
    async (id: string, file: File) => {
      const success = await engineRef.current.loadSampleFromFile(file, id);
      if (success) {
        setPadSample(id, 0, file.name, file.name.replace(/\.[^.]+$/, ''));
      }
    },
    [setPadSample]
  );

  const handleSelectSample = useCallback(async (padId: string) => {
    setSelectingPadId(padId);
    try {
      const pad = pads.find((p) => p.id === padId);
      if (!pad) return;

      // 使用分类系统筛选采样
      const samples = await getSamplesForPad(pad.name);
      setLibrarySamples(samples);
      setShowSamplePicker(true);
    } catch (err) {
      console.error('[PadPage] Failed to load library samples:', err);
    }
  }, [pads]);

  const handlePickSample = useCallback(
    async (sampleId: number, filePath: string, fileName: string) => {
      if (!selectingPadId) return;
      try {
        const buffer = await readLocalAudioFile(filePath);
        if (buffer) {
          await engineRef.current.loadSampleFromArrayBuffer(buffer, selectingPadId);
          setPadSample(selectingPadId, sampleId, filePath, fileName.replace(/\.[^.]+$/, ''));
        }
      } catch (err) {
        console.error('[PadPage] Failed to load sample:', err);
      }
      setShowSamplePicker(false);
      setSelectingPadId(null);
    },
    [selectingPadId, setPadSample]
  );

  // 拖放加载采样到 Pad
  const handleDropSample = useCallback(
    async (padId: string, filePath: string, fileName: string) => {
      try {
        const buffer = await readLocalAudioFile(filePath);
        if (buffer) {
          await engineRef.current.loadSampleFromArrayBuffer(buffer, padId);
          setPadSample(padId, 0, filePath, fileName.replace(/\.[^.]+$/, ''));
        }
      } catch (err) {
        console.error('[PadPage] Failed to load dropped sample:', err);
      }
    },
    [setPadSample]
  );

  return (
    <div className={s.container}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.title}>{t('pad.title')}</h1>
          <p className={s.subtitle}>{t('pad.subtitle')}</p>
        </div>
        <div className={s.headerActions}>
          <button onClick={() => engineRef.current.stopAll()} className={s.headerBtn} title={t('pad.stopAll')}>
            <StopOutlined />
            <span>{t('pad.stopAll')}</span>
          </button>
          <button onClick={resetPads} className={s.headerBtn} title={t('pad.reset')}>
            <RedoOutlined />
            <span>{t('pad.reset')}</span>
          </button>
          <button
            onClick={async () => {
              const newState = !isPinned;
              setIsPinned(newState);
              await window.electronAPI.setAlwaysOnTop(newState);
            }}
            className={`${s.headerBtn} ${isPinned ? s.headerBtnActive : ''}`}
            title={isPinned ? t('pad.unpin') : t('pad.pin')}
          >
            {isPinned ? <PushpinFilled /> : <PushpinOutlined />}
          </button>
        </div>
      </div>

      {/* Master Volume */}
      <div className={s.masterControl}>
        <SoundOutlined className={s.masterIcon} />
        <span className={s.masterLabel}>{t('pad.masterVolume')}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={masterVolume}
          onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
          className={s.masterSlider}
        />
        <span className={s.masterValue}>{Math.round(masterVolume * 100)}%</span>
      </div>

      {/* Step Sequencer - collapsible */}
      <div className={s.sequencerSection}>
        <button
          className={s.sectionToggle}
          onClick={() => setSequencerVisible(!sequencerVisible)}
        >
          <span>{sequencerVisible ? '▼' : '▶'}</span>
          <span>{t('sequencer.title')}</span>
        </button>
        {sequencerVisible && (
          <StepSequencer
            pads={pads}
            pattern={patterns[currentPatternIndex]}
            currentPatternIndex={currentPatternIndex}
            isPlaying={isPlaying}
            currentStep={currentStep}
            onToggleStep={toggleStep}
            onSetStepVelocity={setStepVelocity}
            onPlay={() => setIsPlaying(true)}
            onStop={() => setIsPlaying(false)}
            onPatternChange={setCurrentPattern}
            onUpdatePattern={updatePattern}
            onTriggerPad={handleTrigger}
          />
        )}
      </div>

      {/* Pad Grid */}
      <div className={s.padGrid}>
        {pads.map((pad) => (
          <DrumPad
            key={pad.id}
            pad={pad}
            isActive={activeKeys.has(pad.key)}
            onTrigger={handleTrigger}
            onVolumeChange={handleVolumeChange}
            onPanChange={handlePanChange}
            onPitchChange={handlePitchChange}
            onModeChange={handleModeChange}
            onDelaySendChange={handleDelaySendChange}
            onReverbSendChange={handleReverbSendChange}
            onFileUpload={handleFileUpload}
            onSelectSample={handleSelectSample}
            onDropSample={handleDropSample}
          />
        ))}
      </div>

      {/* Keyboard hint */}
      <div className={s.keyboardHint}>
        {t('pad.keyboardHint')}
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
              <div className={s.modalHeader}>
                <h3 className={s.modalTitle}>{t('pad.selectSample')}</h3>
                {selectingPadId && pads.find(p => p.id === selectingPadId)?.searchKeywords && (
                  <span className={s.filterHint}>
                    {t('pad.filteredBy')}: {pads.find(p => p.id === selectingPadId)?.searchKeywords?.join(', ')}
                  </span>
                )}
              </div>
              <div className={s.sampleList}>
                {librarySamples.length === 0 ? (
                  <div className={s.emptyState}>{t('pad.noSamplesFound')}</div>
                ) : (
                  librarySamples.map((sample) => (
                    <button
                      key={sample.id}
                      className={s.sampleItem}
                      onClick={() => handlePickSample(sample.id, sample.filePath, sample.fileName)}
                      title={sample.fileName}
                    >
                      {sample.fileName.replace(/\.[^.]+$/, '')}
                    </button>
                  ))
                )}
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
        channels={pads.map((pad) => ({
          id: pad.id,
          name: pad.filePath ? pad.name : `${pad.key} - ${pad.name}`,
          key: pad.key,
          volume: pad.volume,
          pan: pad.pan,
          pitch: pad.pitch,
          delaySend: pad.delaySend,
          reverbSend: pad.reverbSend,
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
          onVolumeChange: handleVolumeChange,
          onPanChange: handlePanChange,
          onPitchChange: handlePitchChange,
          onDelaySendChange: handleDelaySendChange,
          onReverbSendChange: handleReverbSendChange,
        }}
      />
    </div>
  );
};

export default React.memo(PadPage);
