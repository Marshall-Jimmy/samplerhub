import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcClient } from '../services/ipcClient';
import InlineLoader from './common/InlineLoader';

interface UcsCategory {
  id: number;
  cat_code: string;
  cat_name_zh: string;
  cat_name_en: string;
  subCount: number;
}

interface UcsSubcategory {
  id: number;
  code: string;
  name_zh: string;
  name_en: string;
}

const ToolButton: React.FC<{ icon: string; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 10px',
      borderRadius: 6,
      border: 'none',
      background: 'transparent',
      color: 'var(--text-secondary)',
      cursor: 'pointer',
      fontSize: 12,
      transition: 'background 0.15s, color 0.15s',
      width: '100%',
      textAlign: 'left',
    }}
    onMouseEnter={e => {
      (e.target as HTMLElement).style.background = 'var(--bg-active, rgba(99,102,241,0.08))';
      (e.target as HTMLElement).style.color = 'var(--text-primary)';
    }}
    onMouseLeave={e => {
      (e.target as HTMLElement).style.background = 'transparent';
      (e.target as HTMLElement).style.color = 'var(--text-secondary)';
    }}
  >
    <span style={{ fontSize: 14 }}>{icon}</span>
    <span>{label}</span>
  </button>
);

const GameCategoryTree: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh');
  const [categories, setCategories] = useState<UcsCategory[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [subsMap, setSubsMap] = useState<Record<number, UcsSubcategory[]>>({});
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [selectedSub, setSelectedSub] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ipcClient.getUcsCategories()
      .then(data => {
        setCategories(data.map((c) => ({ ...c, subCount: 0 })));
      })
      .catch(err => {
        console.error('[GameCategoryTree] Failed to load UCS categories:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = useCallback(async (catId: number) => {
    const next = new Set(expandedIds);
    if (next.has(catId)) {
      next.delete(catId);
      setExpandedIds(next);
    } else {
      next.add(catId);
      setExpandedIds(next);
      // 加载子分类（如果还没加载过）
      if (!subsMap[catId]) {
        try {
          const subs = await ipcClient.getUcsSubcategories(catId);
          setSubsMap(prev => ({ ...prev, [catId]: subs }));
        } catch (err) {
          console.error('[GameCategoryTree] Failed to load subcategories:', err);
        }
      }
    }
  }, [expandedIds, subsMap]);

  const handleSelectCat = useCallback((catId: number) => {
    setSelectedCat(catId);
    setSelectedSub(null);
  }, []);

  const handleSelectSub = useCallback((subId: number) => {
    setSelectedSub(subId);
  }, []);

  if (loading) return <InlineLoader />;

  return (
    <div style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontSize: 13 }}>
        {t('game.ucsCategories', 'UCS 分类')}
      </div>
      {categories.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-disabled)', padding: '8px 0' }}>
          {t('game.noCategories', '暂无分类数据')}
        </div>
      ) : (
        categories.map(cat => {
          const isExpanded = expandedIds.has(cat.id);
          const subs = subsMap[cat.id] || [];
          const isSelected = selectedCat === cat.id && !selectedSub;

          return (
            <div key={cat.id} style={{ marginBottom: 1 }}>
              <div
                onClick={() => { toggleExpand(cat.id); handleSelectCat(cat.id); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: isSelected ? 'var(--bg-active, rgba(99,102,241,0.12))' : 'transparent',
                  color: isSelected ? 'var(--text-primary, #F0F0F3)' : 'var(--text-secondary, #A0A0AB)',
                  fontWeight: isSelected ? 600 : 500,
                  transition: 'background 0.15s',
                }}
              >
                <span style={{
                  fontSize: 10,
                  width: 14,
                  textAlign: 'center',
                  transition: 'transform 0.2s',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  opacity: cat.subCount > 0 ? 1 : 0,
                }}>
                  {'\u25B6'}
                </span>
                <span style={{ flex: 1 }}>{isZh ? cat.cat_name_zh : cat.cat_name_en}</span>
                {cat.subCount > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{cat.subCount}</span>
                )}
              </div>
              {isExpanded && subs.length > 0 && (
                <div style={{ paddingLeft: 18 }}>
                  {subs.map(sub => {
                    const isSubSelected = selectedSub === sub.id;
                    return (
                      <div
                        key={sub.id}
                        onClick={(e) => { e.stopPropagation(); handleSelectSub(sub.id); }}
                        style={{
                          padding: '4px 8px 4px 12px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          color: isSubSelected ? 'var(--brand-primary, #6366F1)' : 'var(--text-tertiary, #71717A)',
                          fontWeight: isSubSelected ? 500 : 400,
                          fontSize: 12,
                          transition: 'color 0.15s',
                        }}
                      >
                        {isZh ? sub.name_zh : sub.name_en}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
      {/* Game Mode Tools */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {t('game.tools', '工具')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <ToolButton
            icon="🔍"
            label={t('game.qaCheck', '交付质检')}
            onClick={() => {
              // 触发 QA 面板 - 通过自定义事件通知 Layout
              window.dispatchEvent(new CustomEvent('game:open-qa'));
            }}
          />
          <ToolButton
            icon="📦"
            label={t('game.engineExport', '引擎导出')}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('game:open-export'));
            }}
          />
          <ToolButton
            icon="✏️"
            label={t('game.namingGen', '命名生成')}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('game:open-naming'));
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default GameCategoryTree;
