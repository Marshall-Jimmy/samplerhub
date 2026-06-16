import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CloseOutlined,
  HeartOutlined,
  HeartFilled,
  PlayCircleOutlined,
  PauseOutlined,
  FolderOpenOutlined,
  CopyOutlined,
  DesktopOutlined,
  ThunderboltOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import type { Sample } from '@shared/types/sample.types';
import { ipcClient } from '../../services/ipcClient';
import { usePlayerStore } from '../../stores/playerStore';
import { getCachedWaveform, drawWaveformToCanvas } from '../../utils/waveformCache';
import { formatDuration, formatFileSize } from '../../utils/format';
import SimilarityRadar, { computeSimilarityRadar } from './SimilarityRadar';
import { MidiPreview } from '../midi/MidiPreview';
import s from '../../styles/components/sample-detail-panel.module.css';

interface SampleDetailPanelProps {
  sample: Sample | null;
  onClose: () => void;
  onFavorite: (id: number) => void;
  onPlaySample?: (sample: Sample) => void;
}

const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 320;

const SampleDetailPanel: React.FC<SampleDetailPanelProps> = ({ sample, onClose, onFavorite, onPlaySample }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const currentSampleId = usePlayerStore(s => s.currentSampleId);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const currentTime = usePlayerStore(s => s.currentTime);
  const isCurrentPlaying = sample && currentSampleId === sample.id && isPlaying;

  // Check if small screen
  const isSmallScreen = window.innerWidth < 768;

  const { data: similarSamples } = useQuery({
    queryKey: ['similar-samples', sample?.id],
    queryFn: async () => {
      const result = await ipcClient.getSimilarSamples(sample!.id, 6);
      return result.similar;
    },
    enabled: !!sample,
  });

  const { data: audioSegments } = useQuery({
    queryKey: ['audio-segments', sample?.id],
    queryFn: () => ipcClient.getAudioSegments(sample!.id),
    enabled: !!sample,
  });

  // Drag resize handler
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const handleMove = (moveE: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX - moveE.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setPanelWidth(newWidth);
    };

    const handleUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [panelWidth]);

  useEffect(() => {
    if (!sample || !canvasRef.current) return;
    const waveform = getCachedWaveform(sample.id, sample.waveformData);
    const progressX = isCurrentPlaying && sample.duration > 0
      ? (currentTime / sample.duration) * canvasRef.current.getBoundingClientRect().width
      : 0;
    drawWaveformToCanvas(canvasRef.current, waveform || [], {
      accentColor: '#6366F1',
      isPlaying: !!isCurrentPlaying,
      progressX,
      hoverX,
    });
  }, [sample, isCurrentPlaying, currentTime, hoverX]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!sample || sample.duration <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * sample.duration;
    const playerState = usePlayerStore.getState();
    if (playerState.currentSampleId !== sample.id) {
      playerState.play(sample.id, sample.filePath, sample.fileName);
    }
    playerState.seek(time);
  }, [sample]);

  const handlePlay = useCallback(() => {
    if (!sample) return;
    const playerState = usePlayerStore.getState();
    if (playerState.currentSampleId === sample.id && playerState.isPlaying) {
      playerState.pause();
    } else {
      playerState.play(sample.id, sample.filePath, sample.fileName);
    }
  }, [sample]);

  if (!sample) return null;

  const metaItems = [
    { label: t('detail.fileName'), value: sample.fileName },
    { label: t('detail.duration'), value: formatDuration(sample.duration) },
    { label: 'BPM', value: sample.bpm != null ? String(Math.round(sample.bpm)) : '-' },
    { label: 'Key', value: sample.key || '-' },
    { label: t('detail.sampleRate'), value: sample.sampleRate ? `${(sample.sampleRate / 1000).toFixed(1)} kHz` : '-' },
    { label: t('detail.bitRate'), value: sample.bitRate ? `${Math.round(sample.bitRate / 1000)} kbps` : '-' },
    { label: t('detail.channels'), value: sample.channels === 1 ? t('detail.mono') : sample.channels === 2 ? t('detail.stereo') : `${sample.channels} ch` },
    { label: t('detail.fileSize'), value: formatFileSize(sample.fileSize) },
    { label: t('detail.category'), value: sample.category?.name || t('detail.uncategorized') },
    { label: t('detail.playCount'), value: String(sample.playCount) },
    { label: t('detail.filePath'), value: sample.filePath },
  ];

  // Small screen: overlay/drawer mode
  if (isSmallScreen) {
    return (
      <>
        <div className={s.overlayBackdrop} onClick={onClose} />
        <div className={s.panelOverlay}>
          <div className={s.header}>
            <span className={s.headerTitle}>{t('detail.title')}</span>
            <button onClick={onClose} className={s.closeBtn}>
              <CloseOutlined />
            </button>
          </div>
          <div className={s.content}>
            {/* Reuse same content structure */}
            <DetailContent
              sample={sample}
              canvasRef={canvasRef}
              hoverX={hoverX}
              setHoverX={setHoverX}
              isCurrentPlaying={!!isCurrentPlaying}
              onCanvasClick={handleCanvasClick}
              onPlay={handlePlay}
              onFavorite={onFavorite}
              similarSamples={similarSamples}
              audioSegments={audioSegments}
              onPlaySample={onPlaySample}
              metaItems={metaItems}
            />
          </div>
        </div>
      </>
    );
  }

  // Desktop: resizable side panel
  return (
    <div className={s.panel} style={{ width: panelWidth }}>
      {/* Drag handle */}
      <div
        className={s.resizeHandle}
        onMouseDown={handleDragStart}
      />

      <div className={s.header}>
        <span className={s.headerTitle}>{t('detail.title')}</span>
        <button onClick={onClose} className={s.closeBtn}>
          <CloseOutlined />
        </button>
      </div>

      <div className={s.content}>
        <DetailContent
          sample={sample}
          canvasRef={canvasRef}
          hoverX={hoverX}
          setHoverX={setHoverX}
          isCurrentPlaying={!!isCurrentPlaying}
          onCanvasClick={handleCanvasClick}
          onPlay={handlePlay}
          onFavorite={onFavorite}
          similarSamples={similarSamples}
          audioSegments={audioSegments}
          onPlaySample={onPlaySample}
          metaItems={metaItems}
        />
      </div>
    </div>
  );
};

/* Extracted content to avoid duplication */
interface DetailContentProps {
  sample: Sample;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  hoverX: number | null;
  setHoverX: (x: number | null) => void;
  isCurrentPlaying: boolean;
  onCanvasClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onPlay: () => void;
  onFavorite: (id: number) => void;
  similarSamples: any;
  audioSegments?: Array<{
    id: number;
    sampleId: number;
    label: string;
    displayLabel: string | null;
    startTime: number;
    endTime: number;
    peakProb: number;
  }>;
  onPlaySample?: (sample: Sample) => void;
  metaItems: { label: string; value: string }[];
}

const DetailContent: React.FC<DetailContentProps> = ({
  sample, canvasRef, hoverX, setHoverX, isCurrentPlaying,
  onCanvasClick, onPlay, onFavorite, similarSamples, audioSegments, onPlaySample, metaItems,
}) => {
  const { t } = useTranslation();

  // 按标签分组事件段
  const groupedSegments = React.useMemo(() => {
    if (!audioSegments || audioSegments.length === 0) return [];
    const map = new Map<string, typeof audioSegments>();
    for (const seg of audioSegments) {
      const key = seg.displayLabel || seg.label;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(seg);
    }
    return Array.from(map.entries()).map(([label, segs]) => ({
      label,
      segs: segs.sort((a, b) => a.startTime - b.startTime),
      maxProb: Math.max(...segs.map(s => s.peakProb)),
    })).sort((a, b) => b.maxProb - a.maxProb);
  }, [audioSegments]);

  return (
    <>
    {/* MIDI 文件显示钢琴卷帘，音频文件显示波形 */}
    {sample.fileType === 'midi' ? (
      <MidiPreview sample={sample} />
    ) : (
      <div className={s.waveformWrap}>
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          onMouseMove={e => setHoverX(e.clientX - e.currentTarget.getBoundingClientRect().left)}
          onMouseLeave={() => setHoverX(null)}
          className={s.waveform}
        />
      </div>
    )}

    <div className={s.playRow}>
      <button onClick={onPlay} className={s.playBtn}>
        {isCurrentPlaying ? <PauseOutlined /> : <PlayCircleOutlined />}
        {isCurrentPlaying ? t('player.pause') : t('player.play')}
      </button>
      <button onClick={() => onFavorite(sample.id)} className={`${s.favBtn} ${sample.isFavorite ? s.favBtnActive : ''}`}>
        {sample.isFavorite ? <HeartFilled /> : <HeartOutlined />}
      </button>
    </div>

    <div className={s.quickActions}>
      <button onClick={() => ipcClient.showItemInFolder(sample.filePath)} className={s.quickBtn}>
        <FolderOpenOutlined style={{ fontSize: 12 }} /> {t('detail.openFolder')}
      </button>
      <button onClick={() => { navigator.clipboard.writeText(sample.filePath); }} className={s.quickBtn}>
        <CopyOutlined style={{ fontSize: 12 }} /> {t('detail.copyPath')}
      </button>
      <button onClick={() => ipcClient.startDrag([sample.filePath])} className={s.quickBtn}>
        <DesktopOutlined style={{ fontSize: 12 }} /> {t('detail.dragToDAW')}
      </button>
    </div>

    <div className={s.metaBlock}>
      {metaItems.map(item => (
        <div key={item.label} className={s.metaRow}>
          <span className={s.metaLabel}>{item.label}</span>
          <span className={s.metaValue}>{item.value}</span>
        </div>
      ))}
    </div>

    {sample.tags && sample.tags.length > 0 && (
      <div className={s.tagsSection}>
        <span className={s.tagsTitle}>{t('detail.tags')}</span>
        <div className={s.tagsList}>
          {sample.tags.map(tag => (
            <span key={tag.id} className={s.tag} style={{ background: `${tag.color}18`, color: tag.color, borderColor: `${tag.color}30` }}>
              {tag.name}
            </span>
          ))}
        </div>
      </div>
    )}

    {/* 频谱推断标签 */}
    {sample.inferredTags && (
      <div className={s.tagsSection}>
        <span className={s.tagsTitle}>{t('detail.inferredTags') || '音频特征'}</span>
        <div className={s.tagsList}>
          {sample.inferredTags.split(',').filter(Boolean).map(tag => (
            <span key={tag} className={s.tag} style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
              {t(`inferredTags.${tag.trim()}`, tag.trim())}
            </span>
          ))}
        </div>
      </div>
    )}

    {/* PANNs 音频事件时间轴标签 */}
    {groupedSegments.length > 0 && (
      <div className={s.segmentsSection}>
        <div className={s.segmentsHeader}>
          <SoundOutlined style={{ fontSize: 12, color: 'var(--brand-primary)' }} />
          <span className={s.segmentsTitle}>{t('detail.audioSegments')}</span>
        </div>
        <div className={s.segmentsList}>
          {groupedSegments.map(({ label, segs, maxProb }) => (
            <div key={label} className={s.segmentGroup}>
              <div className={s.segmentLabel}>
                <span className={s.segmentName}>{label}</span>
                <span className={s.segmentProb}>{Math.round(maxProb * 100)}%</span>
              </div>
              <div className={s.segmentTimeline}>
                {segs.map((seg, idx) => (
                  <div
                    key={idx}
                    className={s.segmentBar}
                    style={{
                      left: `${(seg.startTime / sample.duration) * 100}%`,
                      width: `${Math.max(((seg.endTime - seg.startTime) / sample.duration) * 100, 1)}%`,
                      opacity: 0.4 + seg.peakProb * 0.6,
                    }}
                    title={`${label}: ${seg.startTime.toFixed(2)}s - ${seg.endTime.toFixed(2)}s (${Math.round(seg.peakProb * 100)}%)`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {similarSamples && similarSamples.length > 0 && (
      <div className={s.similarSection}>
        <div className={s.similarHeader}>
          <ThunderboltOutlined style={{ fontSize: 12, color: 'var(--brand-primary)' }} />
          <span className={s.similarTitle}>{t('detail.similar')}</span>
        </div>
        {similarSamples.length > 0 && (
          <SimilarityRadar
            data={computeSimilarityRadar(sample, similarSamples[0])}
            size={160}
          />
        )}
        <div className={s.similarList}>
          {similarSamples.slice(0, 6).map((sim: Sample) => (
            <button
              key={sim.id}
              onClick={() => onPlaySample?.(sim)}
              className={s.similarItem}
            >
              <PlayCircleOutlined style={{ fontSize: 12, color: 'var(--brand-primary)', flexShrink: 0 }} />
              <span className={s.similarName}>{sim.fileName}</span>
              {sim.bpm != null && (
                <span className={s.similarBpm}>{Math.round(sim.bpm)} BPM</span>
              )}
            </button>
          ))}
        </div>
      </div>
    )}
  </>
  );
};

export default React.memo(SampleDetailPanel);
