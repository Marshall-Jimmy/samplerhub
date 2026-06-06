import React from 'react';
import s from '../../styles/components/skeleton.module.css';

interface SampleListSkeletonProps {
  count?: number;
  viewMode?: 'list' | 'grid' | 'waveform';
}

const SampleListSkeleton: React.FC<SampleListSkeletonProps> = ({ count = 8, viewMode = 'list' }) => {
  if (viewMode === 'grid') {
    return (
      <div className={s.gridContainer}>
        {Array.from({ length: count }).map((_, i) => (
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
        {Array.from({ length: count }).map((_, i) => (
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
      {Array.from({ length: count }).map((_, i) => (
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
