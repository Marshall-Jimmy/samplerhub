import React, { useRef, useEffect, useState, useCallback } from 'react';
import { HeartOutlined, HeartFilled } from '@ant-design/icons';
import CategoryIcon from '../common/CategoryIcon';
import type { Sample } from '@shared/types/sample.types';
import { getWaveformOrFallback, onWaveformUpgraded, drawWaveformToCanvas } from '../../utils/waveformCache';
import { getCategoryColor } from '../../utils/categoryColors';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../stores/playerStore';
import s from '../../styles/components/waveform-sample-row.module.css';

interface WaveformSampleRowProps {
  sample: Sample;
  isPlaying?: boolean;
  currentTime: number;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  index?: number;
  onPlay: (id: number) => void;
  onFavorite: (id: number) => void;
  onSelect: (id: number, index: number, e: React.MouseEvent) => void;
  onSeek: (id: number, time: number) => void;
  onContextMenu?: (e: React.MouseEvent, sample: Sample) => void;
}

const WaveformSampleRow: React.FC<WaveformSampleRowProps> = ({
  sample,
  isPlaying: _isPlayingProp,
  currentTime,
  isSelected,
  isMultiSelectMode,
  index = 0,
  onPlay,
  onFavorite,
  onSelect,
  onSeek,
  onContextMenu,
}) => {
  const isPlaying = usePlayerStore(s => s.currentSampleId === sample.id && s.isPlaying);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [waveformVersion, setWaveformVersion] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const catName = (sample.category?.name || 'uncategorized').toLowerCase();
  const accentColor = getCategoryColor(catName);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 注册波形升级回调，升级完成后触发重绘
  useEffect(() => {
    return onWaveformUpgraded(sample.id, () => {
      setWaveformVersion(v => v + 1);
    });
  }, [sample.id]);

  useEffect(() => {
    if (!isVisible || !canvasRef.current) return;
    const waveform = getWaveformOrFallback(sample.id, sample.waveformData, sample.filePath);
    const progressX = isPlaying && sample.duration > 0
      ? (currentTime / sample.duration) * canvasRef.current.getBoundingClientRect().width
      : 0;
    drawWaveformToCanvas(canvasRef.current, waveform || [], {
      accentColor,
      isPlaying,
      progressX,
      hoverX,
      sampleId: sample.id,
    });
  }, [isVisible, sample.id, sample.waveformData, accentColor, isPlaying, currentTime, hoverX, sample.duration, waveformVersion]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || sample.duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * sample.duration;
    onSeek(sample.id, time);
  }, [sample.id, sample.duration, onSeek]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHoverX(e.clientX - canvas.getBoundingClientRect().left);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || isMultiSelectMode) {
      onSelect(sample.id, index, e);
    } else {
      onPlay(sample.id);
    }
  }, [isMultiSelectMode, sample.id, index, onSelect, onPlay]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/x-file-path', sample.filePath);
    e.dataTransfer.effectAllowed = 'copy';
    window.electronAPI.send('drag:start', { filePath: sample.filePath, name: sample.fileName });
    setIsDragging(true);
  }, [sample.filePath, sample.fileName]);

  const handleDragEnd = useCallback(() => setIsDragging(false), []);

  return (
    <div
      ref={containerRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, sample) : undefined}
      className={`${s.row} ${isSelected ? s.rowSelected : ''} ${isPlaying ? s.rowPlaying : ''} ${isDragging ? s.rowDragging : ''}`}
    >
      {/* Category icon */}
      <span className={s.catIcon} style={{ color: accentColor, boxShadow: isPlaying ? `0 0 6px ${accentColor}` : 'none' }}>
        <CategoryIcon name={catName} size={14} stroke={1.5} color={accentColor} />
      </span>

      {/* Name + info */}
      <div className={s.nameCol}>
        <div className={`${s.name} ${isPlaying ? s.namePlaying : ''}`}>
          {sample.fileName.replace(/\.[^.]+$/, '')}
        </div>
        <div className={s.subInfo}>
          {sample.bpm != null && <span>{sample.bpm} BPM</span>}
          {sample.key && <span>{sample.key}</span>}
        </div>
      </div>

      {/* Waveform */}
      <div className={s.waveformCol}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverX(null)}
          className={s.waveform}
        />
      </div>

      {/* Duration */}
      <span className={s.duration}>{formatDuration(sample.duration)}</span>

      {/* Favorite */}
      <button
        onClick={(e) => { e.stopPropagation(); onFavorite(sample.id); }}
        className={`${s.favBtn} ${sample.isFavorite ? s.favBtnActive : ''}`}
      >
        {sample.isFavorite ? <HeartFilled /> : <HeartOutlined />}
      </button>
    </div>
  );
};

export default React.memo(WaveformSampleRow);
