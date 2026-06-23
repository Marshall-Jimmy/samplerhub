/**
 * MIDI 预览组件
 * 独立于音频播放器，专门处理 MIDI 文件的预览展示
 * 显示钢琴卷帘视图 + 音轨列表 + 元数据信息
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ipcClient } from '../../services/ipcClient';
import { MidiPianoRoll } from './MidiPianoRoll';
import type { Sample } from '@shared/types/sample.types';
import s from '../../styles/components/midi-preview.module.css';

interface MidiPreviewProps {
  sample: Sample;
  onClose?: () => void;
}

export const MidiPreview: React.FC<MidiPreviewProps> = ({ sample, onClose }) => {
  const { t } = useTranslation();

  const { data: previewData, isLoading } = useQuery({
    queryKey: ['midiPreview', sample.filePath],
    queryFn: async () => {
      const result = await ipcClient.getMidiPreview(sample.filePath);
      return result;
    },
    enabled: sample.fileType === 'midi',
  });

  const instruments = useMemo(() => {
    if (!sample.midiInstruments) return [];
    if (typeof sample.midiInstruments === 'string') {
      try { return JSON.parse(sample.midiInstruments); } catch { return []; }
    }
    return sample.midiInstruments;
  }, [sample.midiInstruments]);

  if (sample.fileType !== 'midi') return null;

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div className={s.title}>
          <span className={s.midiBadge}>MIDI</span>
          <span className={s.fileName}>{sample.fileName}</span>
        </div>
        {onClose && (
          <button className={s.closeBtn} onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        )}
      </div>

      {/* 元数据信息条 */}
      <div className={s.metaBar}>
        {sample.bpm && (
          <span className={s.metaItem}>
            <span className={s.metaLabel}>BPM</span>
            <span className={s.metaValue}>{sample.bpm}</span>
          </span>
        )}
        {sample.key && (
          <span className={s.metaItem}>
            <span className={s.metaLabel}>Key</span>
            <span className={s.metaValue}>{sample.key}</span>
          </span>
        )}
        {sample.midiTimeSignature && (
          <span className={s.metaItem}>
            <span className={s.metaLabel}>{t('midi.timeSignature', '拍号')}</span>
            <span className={s.metaValue}>{sample.midiTimeSignature}</span>
          </span>
        )}
        {sample.midiTrackCount != null && (
          <span className={s.metaItem}>
            <span className={s.metaLabel}>{t('midi.tracks', '音轨')}</span>
            <span className={s.metaValue}>{sample.midiTrackCount}</span>
          </span>
        )}
        {sample.midiNoteCount != null && (
          <span className={s.metaItem}>
            <span className={s.metaLabel}>{t('midi.notes', '音符')}</span>
            <span className={s.metaValue}>{sample.midiNoteCount}</span>
          </span>
        )}
        {sample.duration > 0 && (
          <span className={s.metaItem}>
            <span className={s.metaLabel}>{t('midi.duration', '时长')}</span>
            <span className={s.metaValue}>{sample.duration.toFixed(1)}s</span>
          </span>
        )}
      </div>

      {/* 钢琴卷帘 */}
      <div className={s.rollContainer}>
        {isLoading ? (
          <div className={s.loading}>{t('common.loading', '加载中...')}</div>
        ) : previewData ? (
          <MidiPianoRoll
            tracks={previewData.tracks}
            duration={previewData.duration}
          />
        ) : (
          <div className={s.noData}>{t('midi.noPreviewData', '无法加载预览数据')}</div>
        )}
      </div>

      {/* 乐器列表 */}
      {instruments.length > 0 && (
        <div className={s.instrumentList}>
          <span className={s.instrumentLabel}>{t('midi.instruments', '乐器')}</span>
          <div className={s.instrumentTags}>
            {instruments.map((inst: string, i: number) => (
              <span key={i} className={s.instrumentTag}>{inst}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
