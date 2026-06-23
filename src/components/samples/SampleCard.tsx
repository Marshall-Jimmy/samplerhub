import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  CaretRightOutlined,
  PauseOutlined,
  HeartOutlined,
  HeartFilled,
  TagOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import CategoryIcon from '../common/CategoryIcon';
import TagManager from '../tags/TagManager';
import { highlightText } from '../../utils/highlight';
import { getCategoryColor } from '../../utils/categoryColors';
import { getWaveformOrFallback, onWaveformUpgraded } from '../../utils/waveformCache';
import { usePlayerStore } from '../../stores/playerStore';
import s from '../../styles/components/sample-card.module.css';

interface SampleCardProps {
  id: number;
  name: string;
  filePath?: string;
  waveformData?: unknown;
  category: string;
  bpm?: number | null;
  musicalKey?: string | null;
  bitDepth?: string;
  sampleRate?: string;
  fileSize?: string;
  duration?: number;
  fileType?: 'audio' | 'midi';
  isFavorite?: boolean;
  isPlaying?: boolean;
  isCorrupted?: boolean;
  isFocused?: boolean;
  isSelected?: boolean;
  isMultiSelectMode?: boolean;
  index?: number;
  tagIds?: number[];
  onPlay?: (id: number) => void;
  onFavorite?: (id: number) => void;
  onExport?: (id: number) => void;
  onSelect?: (id: number, index: number, e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent, id: number) => void;
  searchQuery?: string;
}

const SampleCard: React.FC<SampleCardProps> = ({
  id,
  name,
  filePath,
  waveformData,
  category,
  bpm,
  musicalKey,
  duration,
  fileType = 'audio',
  isFavorite = false,
  isPlaying: _isPlayingProp = false,
  isCorrupted = false,
  isFocused = false,
  isSelected = false,
  isMultiSelectMode = false,
  index = 0,
  tagIds = [],
  onPlay,
  onFavorite,
  onSelect,
  onContextMenu,
  searchQuery,
}) => {
  const { t } = useTranslation();
  // 从 store 直接读取播放状态，避免父组件因播放状态变化而重渲染
  const isCurrentlyPlaying = usePlayerStore(s => s.currentSampleId === id && s.isPlaying);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformVersion, setWaveformVersion] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const tagCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // IntersectionObserver 懒加载：可见时才绘制波形
  useEffect(() => {
    const el = canvasRef.current?.closest('[data-sample-card]');
    if (!el) {
      setIsVisible(true); // 如果没有包裹元素，默认可见
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '50px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const catColor = getCategoryColor(category);

  // 清理标签面板延迟关闭定时器
  useEffect(() => {
    return () => {
      if (tagCloseTimeoutRef.current) {
        clearTimeout(tagCloseTimeoutRef.current);
        tagCloseTimeoutRef.current = null;
      }
    };
  }, []);

  // 注册波形升级回调，升级完成后触发重绘
  useEffect(() => {
    return onWaveformUpgraded(id, () => {
      setWaveformVersion(v => v + 1);
    });
  }, [id]);

  // Draw mini waveform (MIDI files skip waveform drawing)
  useEffect(() => {
    if (!isVisible) return;
    if (fileType === 'midi') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const barCount = Math.floor(w / 3);
    const barWidth = 2;
    const gap = 1;

    const waveform = getWaveformOrFallback(id, waveformData, filePath);

    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, catColor + '60');
    gradient.addColorStop(1, catColor + '30');

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap);
      const amplitude = waveform[i] ?? 0;
      const barH = amplitude * (h - 4);
      const y = (h - barH) / 2;

      ctx.fillStyle = isCurrentlyPlaying ? catColor : gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 1);
      ctx.fill();
    }
  }, [id, waveformData, filePath, catColor, isCurrentlyPlaying, waveformVersion, isVisible]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Ctrl/Cmd+Click: 多选切换
    // Shift+Click: 范围选
    // 普通点击: 如果已有多选则切换选中，否则播放
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      onSelect?.(id, index, e);
      return;
    }
    // 如果当前在多选模式且点击了已选中的项，切换选中
    if (isMultiSelectMode && isSelected) {
      e.preventDefault();
      e.stopPropagation();
      onSelect?.(id, index, e);
      return;
    }
    // 普通点击：播放
    onPlay?.(id);
  }, [id, index, isMultiSelectMode, isSelected, onSelect, onPlay]);

  const handlePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onPlay?.(id);
  }, [id, onPlay]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (!filePath) return;
    e.dataTransfer.setData('text/x-file-path', filePath);
    e.dataTransfer.effectAllowed = 'copy';
    // Custom drag image with waveform thumbnail
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 180;
        thumbCanvas.height = 52;
        // Must append to DOM for setDragImage to work reliably in Electron
        thumbCanvas.style.position = 'fixed';
        thumbCanvas.style.top = '-9999px';
        thumbCanvas.style.left = '-9999px';
        document.body.appendChild(thumbCanvas);
        const ctx = thumbCanvas.getContext('2d');
        if (ctx) {
          // Dark background with rounded corners
          ctx.fillStyle = '#1E1E2E';
          ctx.beginPath();
          ctx.roundRect(0, 0, 180, 52, 6);
          ctx.fill();
          // Category accent bar at top
          ctx.fillStyle = catColor;
          ctx.beginPath();
          ctx.roundRect(0, 0, 180, 3, [6, 6, 0, 0]);
          ctx.fill();
          // Waveform
          ctx.drawImage(canvas, 6, 8, 168, 28);
          // File name label
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.font = '10px system-ui, sans-serif';
          const displayName = name.replace(/\.[^/.]+$/, '');
          ctx.fillText(displayName.length > 24 ? displayName.slice(0, 24) + '...' : displayName, 6, 47);
          e.dataTransfer.setDragImage(thumbCanvas, 90, 26);
        }
        // Clean up after drag starts
        requestAnimationFrame(() => {
          if (thumbCanvas.parentNode) document.body.removeChild(thumbCanvas);
        });
      } catch {
        // Fallback to default drag image
      }
    }
    window.electronAPI.send('drag:start', { filePath, name });
  }, [filePath, name, catColor]);

  const displayName = name.replace(/\.[^/.]+$/, '');

  return (
    <div
      draggable={!!filePath}
      onDragStart={handleDragStart}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        if (showTagManager) {
          tagCloseTimeoutRef.current = setTimeout(() => setShowTagManager(false), 300);
        }
      }}
      onClick={handleClick}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, id) : undefined}
      className={`${s.card} ${isCurrentlyPlaying ? s.cardPlaying : ''} ${isFocused ? s.cardFocused : ''} ${isSelected ? s.cardSelected : ''} ${filePath ? s.cardDraggable : ''}`}
      style={{ '--card-accent': catColor } as React.CSSProperties}
    >
      {/* Play button */}
      <button
        onClick={handlePlay}
        className={`${s.playBtn} ${isCurrentlyPlaying ? s.playBtnPlaying : ''}`}
        style={{ '--card-accent': catColor } as React.CSSProperties}
        aria-label={isCurrentlyPlaying ? t('a11y.pauseSample', { name: displayName }) : t('a11y.playSample', { name: displayName })}
        aria-pressed={isCurrentlyPlaying}
        role="button"
        tabIndex={0}
      >
        {isCurrentlyPlaying ? <PauseOutlined /> : <CaretRightOutlined style={{ marginLeft: 1 }} />}
      </button>

      {/* Mini waveform / MIDI icon */}
      {fileType === 'midi' ? (
        <div className={s.miniWaveform} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CustomerServiceOutlined style={{ fontSize: 14, opacity: 0.5 }} />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className={`${s.miniWaveform} ${isCurrentlyPlaying ? s.miniWaveformPlaying : ''}`}
        />
      )}

      {/* Name */}
      <span className={`${s.name} ${isCurrentlyPlaying ? s.namePlaying : ''} ${isCorrupted ? s.nameCorrupted : ''}`}>
        {searchQuery ? highlightText(displayName, searchQuery) : displayName}
      </span>

      {/* Corrupted badge */}
      {isCorrupted && (
        <span className={s.corruptedBadge}>ERR</span>
      )}

      {/* Category icon */}
      <span className={`${s.categoryIcon} ${isCurrentlyPlaying ? s.categoryIconPlaying : ''}`}>
        <CategoryIcon name={category} size={14} stroke={1.5} color={catColor} />
      </span>

      {/* Meta info */}
      <div className={s.metaInfo}>
        {fileType === 'midi' && (
          <span className={s.midiBadge}>MIDI</span>
        )}
        {bpm && (
          <span className={`${s.metaItem} ${s.metaNum}`}>{bpm}</span>
        )}
        {musicalKey && (
          <span className={`${s.metaItem} ${s.metaNum}`}>{musicalKey}</span>
        )}
        {duration != null && (
          <span className={`${s.metaItem} ${s.metaItemDim}`}>
            {duration.toFixed(1)}s
          </span>
        )}
      </div>

      {/* Actions */}
      <div className={`${s.actions} ${isHovered || isFavorite ? s.actionsVisible : ''}`} onClick={e => e.stopPropagation()}>
        <button
          onClick={e => { e.stopPropagation(); onFavorite?.(id); }}
          className={`${s.actionBtn} ${isFavorite ? s.actionBtnFavorite : ''}`}
          aria-label={isFavorite ? t('a11y.unfavoriteSample', { name: displayName }) : t('a11y.favoriteSample', { name: displayName })}
          aria-pressed={isFavorite}
          role="button"
          tabIndex={0}
        >
          {isFavorite ? <HeartFilled /> : <HeartOutlined />}
        </button>

        <button
          onClick={e => { e.stopPropagation(); setShowTagManager(!showTagManager); }}
          className={`${s.actionBtn} ${showTagManager ? s.actionBtnTagActive : ''}`}
          aria-label={showTagManager ? t('a11y.closeTagManager') : t('a11y.openTagManager')}
          aria-expanded={showTagManager}
          role="button"
          tabIndex={0}
        >
          <TagOutlined />
        </button>
      </div>

      {/* Tag Manager popup */}
      {showTagManager && (
        <div
          className={s.tagPopup}
          onClick={e => e.stopPropagation()}
          onMouseEnter={() => {
            if (tagCloseTimeoutRef.current) {
              clearTimeout(tagCloseTimeoutRef.current);
              tagCloseTimeoutRef.current = null;
            }
          }}
          onMouseLeave={() => {
            tagCloseTimeoutRef.current = setTimeout(() => setShowTagManager(false), 300);
          }}
        >
          <TagManager
            sampleId={id}
            sampleTags={tagIds}
            onClose={() => setShowTagManager(false)}
          />
        </div>
      )}
    </div>
  );
};

export default SampleCard;
