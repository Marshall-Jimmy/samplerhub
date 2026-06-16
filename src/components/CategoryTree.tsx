import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ipcClient } from '../services/ipcClient';
import { useLibraryStore } from '../stores/libraryStore';
import {
  CaretRightOutlined,
  FolderOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import CategoryIcon from './common/CategoryIcon';
import type { Category, FolderNode } from '@shared/types/sample.types';
import s from '../styles/components/category-tree.module.css';

interface CategoryNode {
  id: string;
  name: string;
  icon?: React.ReactNode;
  color?: string;
  count?: number;
  children?: CategoryNode[];
  isSystem?: boolean;
  dbId?: number;
}

interface CategoryTreeProps {
  activeSection: string;
  onSectionChange: (key: string) => void;
}

const categoryColorMap: Record<string, string> = {
  // 父分类
  'Drums': '#EF4444',
  'Bass': '#38BDF8',
  'Synths': '#818CF8',
  'Instruments': '#F59E0B',
  'Loops': '#A3E635',
  'Vocal & FX': '#FB7185',
  'Uncategorized': '#6B7280',
  // Drums 子分类
  'Kick': '#EF4444',
  'Snare': '#F59E0B',
  'Clap': '#FB923C',
  'Hi-Hat': '#EAB308',
  'Open Hat': '#FCD34D',
  '808 Bass': '#22D3EE',
  'Percussion': '#A78BFA',
  'Rim': '#C084FC',
  'Shaker': '#FBBF24',
  'Tom': '#F87171',
  'Cymbal': '#FDE68A',
  'Crash': '#FCA5A5',
  'Ride': '#FED7AA',
  // Bass 子分类
  'Sub Bass': '#0EA5E9',
  'Acoustic Bass': '#06B6D4',
  // Synths 子分类
  'Synth Lead': '#818CF8',
  'Pad': '#67E8F9',
  'Pluck': '#A5B4FC',
  'Arp': '#C4B5FD',
  'Chord': '#DDD6FE',
  'Stab': '#E9D5FF',
  // Instruments 子分类
  'Piano': '#F59E0B',
  'Guitar': '#D97706',
  'Electric Guitar': '#B45309',
  'Bass Guitar': '#92400E',
  'Violin': '#DC2626',
  'Cello': '#991B1B',
  'Strings': '#7C3AED',
  'Brass': '#D97706',
  'Woodwind': '#059669',
  'Organ': '#4338CA',
  'Flute': '#0891B2',
  'Saxophone': '#BE185D',
  // Loops 子分类
  'Drum Loop': '#F472B6',
  'Top Loop': '#E879F9',
  'Loop': '#A3E635',
  'Instrument Loop': '#86EFAC',
  'Vocal Loop': '#FDA4AF',
  // Vocal & FX 子分类
  'Vocal': '#FB7185',
  'Vocal Chop': '#F43F5E',
  'FX': '#34D399',
  'Riser': '#F97316',
  'Impact': '#EF4444',
  'Sweep': '#06B6D4',
  'Transition': '#8B5CF6',
  'One Shot': '#60A5FA',
};

const CategoryTree: React.FC<CategoryTreeProps> = ({ activeSection, onSectionChange }) => {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const { setActiveCategory, setActiveFolder, setActiveSection, activeCategoryId, activeFolderPath } = useLibraryStore();

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => ipcClient.getCategories(),
  });

  const [filesSectionExpanded, setFilesSectionExpanded] = useState(false);

  const { data: folderTree } = useQuery({
    queryKey: ['folderTree'],
    queryFn: () => ipcClient.getFolderTree(),
    enabled: filesSectionExpanded, // 只有展开文件面板时才加载
    staleTime: 10 * 60 * 1000, // 10 分钟内不重新请求
  });

  const dbCategoryNodes: CategoryNode[] = React.useMemo(() => {
    const cats = categories || [];
    // 构建 parent -> children 映射（不修改原始对象）
    const childrenMap = new Map<number, Category[]>();
    cats.forEach((cat: Category) => {
      if (cat.parentId !== null && cat.parentId !== undefined) {
        const siblings = childrenMap.get(cat.parentId) || [];
        siblings.push(cat);
        childrenMap.set(cat.parentId, siblings);
      }
    });
    
    // 构建节点
    const buildNode = (cat: Category): CategoryNode => {
      const color = categoryColorMap[cat.name] || '#6B7280';
      const childCats = childrenMap.get(cat.id) || [];
      const childNodes = childCats
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(buildNode);
      return {
        id: `cat-${cat.id}`,
        name: cat.name,
        icon: <CategoryIcon name={cat.name} size={14} color={color} />,
        color,
        isSystem: cat.isSystem,
        dbId: cat.id,
        children: childNodes.length > 0 ? childNodes : undefined,
      };
    };
    
    // 只渲染顶层分类（parentId === null）
    return cats
      .filter((cat: Category) => cat.parentId === null || cat.parentId === undefined)
      .sort((a: Category, b: Category) => a.sortOrder - b.sortOrder)
      .map(buildNode);
  }, [categories]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleNodeClick = useCallback((node: CategoryNode) => {
    if (node.dbId) {
      setActiveCategory(node.dbId);
    } else if (node.id === 'favorites') {
      setActiveSection('favorites');
    } else if (node.id === 'recent') {
      setActiveSection('recent');
    }
    onSectionChange(node.id);
  }, [setActiveCategory, setActiveSection, onSectionChange]);

  const handleFolderClick = useCallback((folderPath: string) => {
    setActiveFolder(folderPath);
    onSectionChange(`folder:${folderPath}`);
  }, [setActiveFolder, onSectionChange]);

  const renderNode = (node: CategoryNode, depth: number = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isActive = activeSection === 'category' && activeCategoryId !== null && node.dbId === activeCategoryId;

    return (
      <div key={node.id} role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={isActive}>
        <div
          onClick={() => {
            if (hasChildren) toggleExpand(node.id);
            handleNodeClick(node);
          }}
          className={`${s.node} ${isActive ? s.nodeActive : ''}`}
          style={{ paddingLeft: `${12 + depth * 18}px`, '--node-color': node.color || 'var(--brand-accent)' } as React.CSSProperties}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (hasChildren) toggleExpand(node.id);
              handleNodeClick(node);
            }
          }}
        >
          {isActive && (
            <div
              className={s.activeIndicator}
              style={{ background: node.color || 'var(--brand-accent)' }}
            />
          )}

          {hasChildren ? (
            <motion.span
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.15 }}
              className={`${s.expandArrow} ${isExpanded ? s.expandArrowExpanded : ''}`}
            >
              <CaretRightOutlined />
            </motion.span>
          ) : (
            <span className={s.expandSpacer} />
          )}

          <span className={s.nodeIcon} style={{ color: node.color }}>
            {node.icon || (
              <span className={s.nodeDot} style={{ background: node.color }} />
            )}
          </span>

          <span className={s.nodeName}>
            {node.name}
          </span>
        </div>

        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={s.children}
            >
              {node.children!.map(child => renderNode(child, depth + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderFolderNode = (node: FolderNode, depth: number = 0) => {
    const nodeId = `folder:${node.path}`;
    const isExpanded = expandedIds.has(nodeId);
    const hasChildren = node.children && node.children.length > 0;
    const isActive = activeSection === 'folder' && activeFolderPath === node.path;

    return (
      <div key={nodeId} role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={isActive}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggleExpand(nodeId);
            handleFolderClick(node.path);
          }}
          className={`${s.node} ${isActive ? s.nodeActive : ''}`}
          style={{ paddingLeft: `${12 + depth * 18}px`, '--node-color': '#F59E0B' } as React.CSSProperties}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (hasChildren) toggleExpand(nodeId);
              handleFolderClick(node.path);
            }
          }}
        >
          {isActive && (
            <div className={s.activeIndicator} style={{ background: '#F59E0B' }} />
          )}

          {hasChildren ? (
            <motion.span
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.15 }}
              className={`${s.expandArrow} ${isExpanded ? s.expandArrowExpanded : ''}`}
            >
              <CaretRightOutlined />
            </motion.span>
          ) : (
            <span className={s.expandSpacer} />
          )}

          <span className={s.nodeIcon} style={{ color: '#F59E0B' }}>
            {isExpanded && hasChildren ? <FolderOpenOutlined style={{ fontSize: 14 }} /> : <FolderOutlined style={{ fontSize: 14 }} />}
          </span>

          <span className={s.nodeName}>
            {node.name}
          </span>

          <span className={s.nodeCount}>
            {node.sampleCount}
          </span>
        </div>

        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={s.children}
            >
              {node.children.map(child => renderFolderNode(child, depth + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className={s.tree} role="tree" aria-label="分类导航">
      {/* 分类组 - 可折叠 */}
      <div
        className={s.groupHeader}
        onClick={() => setCategoriesCollapsed(!categoriesCollapsed)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCategoriesCollapsed(!categoriesCollapsed); } }}
      >
        <motion.span
          animate={{ rotate: categoriesCollapsed ? 0 : 90 }}
          transition={{ duration: 0.15 }}
          className={s.groupArrow}
        >
          <CaretRightOutlined />
        </motion.span>
        <span className={s.treeLabel}>{t('sidebar.categories')}</span>
      </div>

      <AnimatePresence>
        {!categoriesCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={s.children}
          >
            {dbCategoryNodes.map(cat => renderNode(cat))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 文件组 - 可折叠，默认折叠，展开时才加载 folderTree */}
      <div
        className={s.groupHeader}
        onClick={() => {
          const next = !filesCollapsed;
          setFilesCollapsed(next);
          if (next === false) {
            setFilesSectionExpanded(true); // 展开时触发加载
          }
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilesCollapsed(!filesCollapsed); } }}
      >
        <motion.span
          animate={{ rotate: filesCollapsed ? 0 : 90 }}
          transition={{ duration: 0.15 }}
          className={s.groupArrow}
        >
          <CaretRightOutlined />
        </motion.span>
        <span className={s.treeLabel}>{t('sidebar.files')}</span>
      </div>

      <AnimatePresence>
        {!filesCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={s.children}
          >
            {folderTree ? (
              folderTree.map(node => renderFolderNode(node))
            ) : (
              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', opacity: 0.6 }}>
                {filesSectionExpanded ? t('common.loading', 'Loading...') : t('sidebar.clickToLoad', 'Click to load folders')}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CategoryTree;
