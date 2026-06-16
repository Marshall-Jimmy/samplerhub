import React, { useRef, useCallback, useState } from 'react';
import { UploadOutlined, SoundOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { PadConfig } from '../../stores/padStore';
import s from '../../styles/components/pad/drum-pad.module.css';

interface DrumPadProps {
  pad: PadConfig;
  isActive: boolean;
  onTrigger: (id: string, velocity?: number) => void;
  onVolumeChange: (id: string, volume: number) => void;
  onPanChange: (id: string, pan: number) => void;
  onPitchChange?: (id: string, pitch: number) => void;
  onModeChange: (id: string, mode: 'oneshot' | 'loop') => void;
  onDelaySendChange?: (id: string, send: number) => void;
  onReverbSendChange?: (id: string, send: number) => void;
  onFileUpload: (id: string, file: File) => void;
  onSelectSample?: (id: string) => void;
  onDropSample?: (id: string, filePath: string, fileName: string) => void;
}

const DrumPad: React.FC<DrumPadProps> = ({
  pad,
  isActive,
  onTrigger,
  onVolumeChange,
  onPanChange,
  onPitchChange,
  onModeChange,
  onDelaySendChange,
  onReverbSendChange,
  onFileUpload,
  onSelectSample,
  onDropSample,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleClick = useCallback(() => {
    onTrigger(pad.id);
  }, [pad.id, onTrigger]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      onFileUpload(pad.id, file);
    }
  }, [pad.id, onFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    let filePath = e.dataTransfer.getData('text/x-file-path');
    // Fallback: 支持从文件系统直接拖放
    if (!filePath && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('audio/') || /\.(wav|mp3|flac|aiff|ogg|m4a)$/i.test(file.name)) {
        filePath = file.path || '';
      }
    }
    if (filePath && onDropSample) {
      const fileName = filePath.split(/[\\/]/).pop() || 'Unknown';
      onDropSample(pad.id, filePath, fileName);
    }
  }, [pad.id, onDropSample]);

  const hasSample = !!pad.filePath || !!pad.sampleId;

  return (
    <div
      className={`${s.padContainer} ${!hasSample ? s.padEmpty : ''} ${isDragOver ? s.padDragOver : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`${s.padButton} ${isActive ? s.padActive : ''}`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`${t('pad.play')} ${pad.name}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <span className={s.padKey}>{pad.key}</span>
        <span className={s.padName}>{pad.name}</span>
      </div>

      <div className={s.padControls}>
        <div className={s.controlRow}>
          <SoundOutlined className={s.controlIcon} />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={pad.volume}
            onChange={(e) => onVolumeChange(pad.id, parseFloat(e.target.value))}
            className={s.slider}
            aria-label={`${pad.name} volume`}
          />
          <span className={s.controlValue}>{Math.round(pad.volume * 100)}</span>
        </div>

        <div className={s.controlRow}>
          <span className={s.panLabel}>PAN</span>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={pad.pan}
            onChange={(e) => onPanChange(pad.id, parseFloat(e.target.value))}
            className={s.slider}
            aria-label={`${pad.name} pan`}
          />
          <span className={s.controlValue}>
            {pad.pan > 0 ? `R${Math.round(pad.pan * 100)}` : pad.pan < 0 ? `L${Math.round(-pad.pan * 100)}` : 'C'}
          </span>
        </div>

        <div className={s.padActions}>
          <button
            onClick={() => onModeChange(pad.id, pad.mode === 'oneshot' ? 'loop' : 'oneshot')}
            className={`${s.actionBtn} ${pad.mode === 'loop' ? s.actionBtnActive : ''}`}
            title={pad.mode === 'oneshot' ? t('pad.oneshot') : t('pad.loop')}
          >
            <span>{pad.mode === 'oneshot' ? t('pad.oneshot') : t('pad.loop')}</span>
          </button>
        </div>

        {onPitchChange && (
          <div className={s.controlRow}>
            <span className={s.panLabel}>PITCH</span>
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={pad.pitch}
              onChange={(e) => onPitchChange(pad.id, parseInt(e.target.value))}
              className={s.slider}
              aria-label={`${pad.name} pitch`}
            />
            <span className={s.controlValue}>{pad.pitch > 0 ? `+${pad.pitch}` : pad.pitch}</span>
          </div>
        )}

        {onDelaySendChange && (
          <div className={s.controlRow}>
            <span className={s.panLabel}>DELAY</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={pad.delaySend}
              onChange={(e) => onDelaySendChange(pad.id, parseFloat(e.target.value))}
              className={s.slider}
              aria-label={`${pad.name} delay send`}
            />
            <span className={s.controlValue}>{Math.round(pad.delaySend * 100)}</span>
          </div>
        )}

        {onReverbSendChange && (
          <div className={s.controlRow}>
            <span className={s.panLabel}>REVERB</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={pad.reverbSend}
              onChange={(e) => onReverbSendChange(pad.id, parseFloat(e.target.value))}
              className={s.slider}
              aria-label={`${pad.name} reverb send`}
            />
            <span className={s.controlValue}>{Math.round(pad.reverbSend * 100)}</span>
          </div>
        )}
        <div className={s.padActions}>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={s.actionBtn}
            title={t('pad.loadAudio')}
          >
            <UploadOutlined />
            <span>{t('pad.load')}</span>
          </button>
          {onSelectSample && (
            <button
              onClick={() => onSelectSample(pad.id)}
              className={s.actionBtn}
              title={t('pad.selectFromLibrary')}
            >
              <span>{t('pad.library')}</span>
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className={s.hiddenInput}
      />
    </div>
  );
};

export default React.memo(DrumPad);
