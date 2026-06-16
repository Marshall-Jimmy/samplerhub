import React, { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation, Trans } from 'react-i18next';
import {
  FolderOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  TagOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { ipcClient } from '../../services/ipcClient';
import type { SearchFilters, Category, Tag } from '@shared/types/sample.types';
import s from '../../styles/components/search-panel.module.css';

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  resultCount: number;
}

const durationPresets = [
  { labelKey: 'search.all', min: undefined, max: undefined },
  { labelKey: '0-1s', min: 0, max: 1 },
  { labelKey: '1-4s', min: 1, max: 4 },
  { labelKey: '4-10s', min: 4, max: 10 },
  { labelKey: '10s+', min: 10, max: undefined },
];

const bpmPresets = [
  { labelKey: 'search.all', min: undefined, max: undefined },
  { labelKey: '80-100', min: 80, max: 100 },
  { labelKey: '100-120', min: 100, max: 120 },
  { labelKey: '120-140', min: 120, max: 140 },
  { labelKey: '140-170', min: 140, max: 170 },
  { labelKey: '170+', min: 170, max: undefined },
];

const musicalKeys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SearchPanel: React.FC<SearchPanelProps> = ({ isOpen, onClose, filters, onFiltersChange, resultCount }) => {
  const { t } = useTranslation();
  const { data: categories } = useQuery({
    queryKey: ['categories', 'v2'],
    queryFn: () => ipcClient.getCategories(),
  });

  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => ipcClient.getTags(),
  });

  // 从 filters 反推 active index，确保单一数据源
  const activeDurationIdx = useMemo(() => {
    const idx = durationPresets.findIndex(p => p.min === filters.durationMin && p.max === filters.durationMax);
    return idx >= 0 ? idx : 0;
  }, [filters.durationMin, filters.durationMax]);

  const activeBpmIdx = useMemo(() => {
    const idx = bpmPresets.findIndex(p => p.min === filters.bpmMin && p.max === filters.bpmMax);
    return idx >= 0 ? idx : 0;
  }, [filters.bpmMin, filters.bpmMax]);

  const handleCategoryClick = useCallback((catId: number | undefined) => {
    onFiltersChange({ ...filters, categoryId: catId });
  }, [filters, onFiltersChange]);

  const handleDurationClick = useCallback((idx: number) => {
    const preset = durationPresets[idx];
    onFiltersChange({ ...filters, durationMin: preset.min, durationMax: preset.max });
  }, [filters, onFiltersChange]);

  const handleBpmClick = useCallback((idx: number) => {
    const preset = bpmPresets[idx];
    onFiltersChange({ ...filters, bpmMin: preset.min, bpmMax: preset.max });
  }, [filters, onFiltersChange]);

  const handleKeyClick = useCallback((key: string | undefined) => {
    onFiltersChange({ ...filters, key: filters.key === key ? undefined : key });
  }, [filters, onFiltersChange]);

  const handleClear = useCallback(() => {
    onFiltersChange({});
  }, [onFiltersChange]);

  const hasActiveFilters = filters.categoryId || filters.durationMin !== undefined
    || filters.bpmMin !== undefined || filters.key || filters.isFavorite;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className={s.panel}
    >
      {/* Category */}
      <div className={s.section}>
        <div className={s.sectionLabel}>
          <FolderOutlined style={{ fontSize: 12 }} />
          {t('search.category')}
        </div>
        <div className={s.chips}>
          <button
            onClick={() => handleCategoryClick(undefined)}
            className={`${s.chip} ${!filters.categoryId ? s.chipActive : ''}`}
          >
            {t('search.all')}
          </button>
          {(categories || []).map((cat: Category) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(filters.categoryId === cat.id ? undefined : cat.id)}
              className={`${s.chip} ${filters.categoryId === cat.id ? s.chipActive : ''}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div className={s.section}>
        <div className={s.sectionLabel}>
          <ClockCircleOutlined style={{ fontSize: 12 }} />
          {t('search.duration')}
        </div>
        <div className={s.chips}>
          {durationPresets.map((dur, idx) => (
            <button
              key={dur.labelKey}
              onClick={() => handleDurationClick(idx)}
              className={`${s.chip} ${activeDurationIdx === idx ? s.chipActive : ''}`}
            >
              {dur.labelKey === 'search.all' ? t(dur.labelKey) : dur.labelKey}
            </button>
          ))}
        </div>
      </div>

      {/* BPM */}
      <div className={s.section}>
        <div className={s.sectionLabel}>
          <PlayCircleOutlined style={{ fontSize: 12 }} />
          BPM
        </div>
        <div className={s.chips}>
          {bpmPresets.map((bpm, idx) => (
            <button
              key={bpm.labelKey}
              onClick={() => handleBpmClick(idx)}
              className={`${s.chip} ${activeBpmIdx === idx ? s.chipActive : ''}`}
            >
              {bpm.labelKey === 'search.all' ? t(bpm.labelKey) : bpm.labelKey}
            </button>
          ))}
        </div>
      </div>

      {/* Key */}
      <div className={s.section}>
        <div className={s.sectionLabel}>
          <TagOutlined style={{ fontSize: 12 }} />
          {t('search.key')}
        </div>
        <div className={s.chips}>
          {musicalKeys.map(k => (
            <button
              key={k}
              onClick={() => handleKeyClick(k)}
              className={`${s.chip} ${s.chipKey} ${filters.key === k ? s.chipActive : ''}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionLabel}>
            <TagOutlined style={{ fontSize: 12 }} />
            {t('search.tags')}
          </div>
          <div className={s.chips}>
            {tags.map((tag: Tag) => {
              const isSelected = filters.tagIds?.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    const currentTagIds = filters.tagIds || [];
                    const newTagIds = isSelected
                      ? currentTagIds.filter(id => id !== tag.id)
                      : [...currentTagIds, tag.id];
                    onFiltersChange({ ...filters, tagIds: newTagIds.length > 0 ? newTagIds : undefined });
                  }}
                  className={`${s.chip} ${isSelected ? s.chipActive : ''}`}
                  style={isSelected ? { background: `${tag.color}20`, color: tag.color } : undefined}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Divider + Result Count */}
      <div className={s.footer}>
        <span className={s.resultCount}>
          <Trans i18nKey="search.resultCount" values={{ count: resultCount.toLocaleString() }} components={{ strong: <strong style={{ color: 'var(--text-primary)' }} /> }} />
        </span>
        <div className={s.footerActions}>
          {hasActiveFilters && (
            <button onClick={handleClear} className={s.footerBtn}>
              <ClearOutlined />
              {t('search.clear')}
            </button>
          )}
          <button onClick={onClose} className={s.footerBtn}>
            {t('search.close')}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default SearchPanel;
