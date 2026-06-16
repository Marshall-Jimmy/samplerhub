import React, { useMemo } from 'react';
import s from '../../styles/components/skeleton.module.css';

const ROW_HEIGHTS = { list: 50, waveform: 64, grid: 120 };

interface SampleListSkeletonProps {
  count?: number;
  viewMode?: 'list' | 'grid' | 'waveform';
  containerHeight?: number;
}

const SampleListSkeleton: React.FC<SampleListSkeletonProps> = ({ count, viewMode = 'list', containerHeight }) => {
  // 动态计算骨架屏数量：根据容器高度和行高
  const dynamicCount = useMemo(() => {
    if (count !== undefined) return count;
    if (containerHeight && containerHeight > 0) {
      const rowH = ROW_HEIGHTS[viewMode] || 50;
      return Math.max(3, Math.ceil(containerHeight / rowH) + 2);
    }
    // 默认根据视口高度计算
    const rowH = ROW_HEIGHTS[viewMode] || 50;
    const viewportH = window.innerHeight;
    const availableH = viewportH - 200; // 减去 header/toolbar 等
    return Math.max(3, Math.ceil(availableH / rowH));
  }, [count, containerHeight, viewMode]);
  if (viewMode === 'grid') {
    return (
      <div className={s.gridContainer}>
        {Array.from({ length: dynamicCount }).map((_, i) => (
          <div key={i} className={s.gridCard} style={{ animationDelay: `${i * 50}ms` }}>
            <div className={`${s.shimmer} ${s.gridWaveform}`} />
            <div className={`${s.shimmer} ${s.gridName}`} />
            <div className={s.gridMeta}>
              <div className={`${s.shimmer} ${s.gridMetaItem}`} />
              <div className={`${s.shimmer} ${s.gridMetaItem}`} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === 'waveform') {
    return (
      <div className={s.listContainer}>
        {Array.from({ length: dynamicCount }).map((_, i) => (
          <div key={i} className={s.waveformRow} style={{ animationDelay: `${i * 40}ms` }}>
            <div className={`${s.shimmer} ${s.playBtn}`} />
            <div className={`${s.shimmer} ${s.waveformBar}`} />
            <div className={s.rowInfo}>
              <div className={`${s.shimmer} ${s.rowName}`} />
              <div className={s.rowMeta}>
                <div className={`${s.shimmer} ${s.rowMetaItem}`} />
                <div className={`${s.shimmer} ${s.rowMetaItem}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // List view
  return (
    <div className={s.listContainer}>
      {Array.from({ length: dynamicCount }).map((_, i) => (
        <div key={i} className={s.listRow} style={{ animationDelay: `${i * 40}ms` }}>
          <div className={`${s.shimmer} ${s.playBtn}`} />
          <div className={`${s.shimmer} ${s.miniWaveform}`} />
          <div className={s.rowInfo}>
            <div className={`${s.shimmer} ${s.rowName}`} />
            <div className={s.rowMeta}>
              <div className={`${s.shimmer} ${s.rowMetaItem}`} />
              <div className={`${s.shimmer} ${s.rowMetaItem}`} />
              <div className={`${s.shimmer} ${s.rowMetaItemShort}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SampleListSkeleton;
