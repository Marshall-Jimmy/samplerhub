import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { handleIpcError } from '../../utils/ipcError';
import {
  TagOutlined,
  PlusOutlined,
  CloseOutlined,
  DeleteOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ipcClient } from '../../services/ipcClient';
import type { Tag } from '@shared/types/sample.types';
import s from '../../styles/components/tag-manager.module.css';

interface TagManagerProps {
  sampleId: number;
  sampleTags: number[];
  onClose: () => void;
}

const TAG_COLORS = [
  '#EF4444', '#F59E0B', '#EAB308', '#22C55E', '#14B8A6',
  '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7',
  '#D946EF', '#EC4899', '#F43F5E', '#78716C',
];

const TagManager: React.FC<TagManagerProps> = ({ sampleId, sampleTags, onClose }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showCreate, setShowCreate] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);

  // 检测面板是否超出右边界，如果超出则右对齐
  useEffect(() => {
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) {
        setAlignRight(true);
      }
    }
  }, []);

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: () => ipcClient.getTags(),
  });

  const handleToggleTag = useCallback(async (tagId: number) => {
    try {
      if (sampleTags.includes(tagId)) {
        await ipcClient.removeTagFromSample(sampleId, tagId);
      } else {
        await ipcClient.addTagToSample(sampleId, tagId);
      }
      queryClient.invalidateQueries({ queryKey: ['samples'] });
    } catch (err) {
      handleIpcError(err, t('tagManager.title'));
    }
  }, [sampleId, sampleTags, queryClient]);

  const handleCreateTag = useCallback(async () => {
    if (!newTagName.trim()) return;
    try {
      const tag = await ipcClient.createTag(newTagName.trim(), newTagColor);
      if (tag) {
        await ipcClient.addTagToSample(sampleId, tag.id);
        queryClient.invalidateQueries({ queryKey: ['tags'] });
        queryClient.invalidateQueries({ queryKey: ['samples'] });
        setNewTagName('');
        setShowCreate(false);
      }
    } catch (err) {
      handleIpcError(err, t('tagManager.create'));
    }
  }, [newTagName, newTagColor, sampleId, queryClient]);

  const handleDeleteTag = useCallback(async (tagId: number) => {
    try {
      await ipcClient.deleteTag(tagId);
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['samples'] });
    } catch (err) {
      handleIpcError(err, t('tagManager.title'));
    }
  }, [queryClient]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      className={`${s.panel} ${alignRight ? s.panelAlignRight : ''}`}
      ref={panelRef}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className={s.header}>
        <span className={s.headerTitle}>
          <TagOutlined style={{ fontSize: 12 }} />
          {t('tagManager.title')}
        </span>
        <button onClick={onClose} className={s.closeBtn}>
          <CloseOutlined style={{ fontSize: 12 }} />
        </button>
      </div>

      {/* Existing tags */}
      <div className={s.tagList}>
        {tags.length === 0 && (
          <span className={s.emptyHint}>{t('tagManager.emptyHint')}</span>
        )}
        {tags.map((tag: Tag) => {
          const isSelected = sampleTags.includes(tag.id);
          return (
            <div
              key={tag.id}
              className={`${s.tagItem} ${isSelected ? s.tagItemSelected : ''}`}
              onClick={() => handleToggleTag(tag.id)}
              style={isSelected ? { background: `${tag.color}12` } : undefined}
            >
              <div
                className={`${s.tagCheck} ${isSelected ? s.tagCheckSelected : ''}`}
                style={isSelected ? { background: tag.color } : { borderColor: `${tag.color}40` }}
              >
                {isSelected && <CheckOutlined style={{ fontSize: 8, color: '#fff' }} />}
              </div>
              <span className={s.tagName} style={{ color: isSelected ? tag.color : undefined }}>
                {tag.name}
              </span>
              <button
                onClick={e => { e.stopPropagation(); handleDeleteTag(tag.id); }}
                className={s.deleteBtn}
              >
                <DeleteOutlined style={{ fontSize: 10 }} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Create new tag */}
      {showCreate ? (
        <div className={s.createSection}>
          <input
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            placeholder={t('tagManager.tagNamePlaceholder')}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleCreateTag(); }}
            className={s.createInput}
          />
          <div className={s.colorPicker}>
            {TAG_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewTagColor(c)}
                className={s.colorBtn}
                style={{
                  background: c,
                  border: newTagColor === c ? `2px solid ${c}` : '2px solid transparent',
                }}
              />
            ))}
          </div>
          <div className={s.createActions}>
            <button
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
              className={`${s.createBtn} ${newTagName.trim() ? s.createBtnEnabled : ''}`}
            >
              {t('tagManager.create')}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewTagName(''); }}
              className={s.cancelBtn}
            >
              {t('tagManager.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowCreate(true)} className={s.addBtn}>
          <PlusOutlined />
          {t('tagManager.newTag')}
        </button>
      )}
    </motion.div>
  );
};

export default TagManager;
