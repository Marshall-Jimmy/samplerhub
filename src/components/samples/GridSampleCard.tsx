import React, { useRef, useEffect, useState, useCallback } from 'react';
import { HeartOutlined, HeartFilled } from '@ant-design/icons';
import CategoryIcon from '../common/CategoryIcon';
import type { Sample } from '@shared/types/sample.types';
import { getWaveformOrFallback, onWaveformUpgraded, drawWaveformToCanvas } from '../../utils/waveformCache';
import { getCategoryColor } from '../../utils/categoryColors';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../stores/playerStore';
import s from '../../styles/components/grid-sample-card.module.css';

interface GridSampleCardProps {
  sample: Sample;
  isPlaying?: boolean;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  index?: number;
  onPlay: (id: number) => void;
  onFavorite: (id: number) => void;
  onSelect: (id: number, index: number, e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent, sample: Sample) => void;
}

const GridSampleCard: React.FC<GridSampleCardProps> = ({
  sample,
  isPlaying: _isPlayingProp,
  isSelected,
  isMultiSelectMode,
  index = 0,
  onPlay,
  onFavorite,
  onSelect,
  onContextMenu,
}) => {
  const isPlaying = usePlayerStore(s => s.currentSampleId === sample.id && s.isPlaying);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    drawWaveformToCanvas(canvasRef.current, waveform, {
      accentColor,
      isPlaying,
      sampleId: sample.id,
    });
  }, [isVisible, sample.id, sample.waveformData, accentColor, isPlaying, waveformVersion]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/x-file-path', sample.filePath);
    e.dataTransfer.effectAllowed = 'copy';
    // Custom drag image: audio file icon
    const canvas = document.createElement('canvas');
    canvas.width = 140;
    canvas.height = 40;
    // Must append to DOM for setDragImage to work reliably in Electron
    canvas.style.position = 'fixed';
    canvas.style.top = '-9999px';
    canvas.style.left = '-9999px';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1E1E2E';
      ctx.beginPath();
      ctx.roundRect(0, 0, 140, 40, 8);
      ctx.fill();
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.roundRect(0, 0, 4, 40, [8, 0, 0, 8]);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText('🎵', 14, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '12px system-ui, sans-serif';
      const name = sample.fileName.replace(/\.[^/.]+$/, '');
      ctx.fillText(name.length > 12 ? name.slice(0, 12) + '…' : name, 38, 26);
      e.dataTransfer.setDragImage(canvas, 70, 20);
    }
    // Clean up after drag starts
    requestAnimationFrame(() => {
      if (canvas.parentNode) document.body.removeChild(canvas);
    });
    window.electronAPI.send('drag:start', { filePath: sample.filePath, name: sample.fileName });
    setIsDragging(true);
  }, [sample.filePath, sample.fileName, accentColor]);

  const handleDragEnd = useCallback(() => setIsDragging(false), []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || isMultiSelectMode) {
      onSelect(sample.id, index, e);
    } else {
      onPlay(sample.id);
    }
  }, [isMultiSelectMode, sample.id, index, onSelect, onPlay]);

  return (
    <div
      ref={containerRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, sample) : undefined}
      className={`${s.card} ${isSelected ? s.cardSelected : ''} ${isPlaying ? s.cardPlaying : ''} ${isDragging ? s.cardDragging : ''}`}
    >
      {/* Category accent bar + icon + label */}
      <div className={s.accentBar} style={{ background: accentColor, opacity: isPlaying ? 1 : 0.6 }}>
        <span className={s.accentBarIcon}>
          <CategoryIcon name={catName} size={10} stroke={2} color="#fff" />
        </span>
        <span className={s.accentBarLabel}>{sample.category?.name || 'Uncategorized'}</span>
      </div>

      {/* Mini waveform */}
      <canvas ref={canvasRef} className={s.waveform} />

      {/* Info */}
      <div className={s.info}>
        <span className={`${s.name} ${isPlaying ? s.namePlaying : ''}`}>
          {sample.fileName.replace(/\.[^/.]+$/, '')}
        </span>
        <div className={s.meta}>
          {sample.fileType === 'midi' && <span className={s.midiBadge}>MIDI</span>}
          {sample.bpm != null && <span>{sample.bpm}</span>}
          {sample.key && <span>{sample.key}</span>}
          <span>{formatDuration(sample.duration)}</span>
          <span className={s.playCount}>{sample.playCount || 0}</span>
        </div>
      </div>

      {/* Favorite button */}
      <button
        onClick={(e) => { e.stopPropagation(); onFavorite(sample.id); }}
        className={`${s.favBtn} ${sample.isFavorite ? `${s.favBtnVisible} ${s.favBtnGlow}` : ''}`}
      >
        {sample.isFavorite ? <HeartFilled /> : <HeartOutlined />}
      </button>
    </div>
  );
};

export default React.memo(GridSampleCard);
