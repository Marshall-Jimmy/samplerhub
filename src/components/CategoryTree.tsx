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
  'Kick': '#EF4444',
  'Snare': '#F59E0B',
  'Clap': '#FB923C',
  'Hi-Hat': '#EAB308',
  'Open Hat': '#FCD34D',
  '808 Bass': '#22D3EE',
  'Percussion': '#A78BFA',
  'Rim': '#C084FC',
  'Bass': '#38BDF8',
  'Synth': '#818CF8',
  'Vocal': '#FB7185',
  'FX': '#34D399',
  'Drum Loop': '#F472B6',
  'Top Loop': '#E879F9',
  'Shaker': '#FBBF24',
  'Pad': '#67E8F9',
  'Loop': '#A3E635',
  'One Shot': '#60A5FA',
  'Uncategorized': '#6B7280',
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

  const { data: folderTree } = useQuery({
    queryKey: ['folderTree'],
    queryFn: () => ipcClient.getFolderTree(),
  });

  const dbCategoryNodes: CategoryNode[] = (categories || []).map((cat: Category) => {
    const color = categoryColorMap[cat.name] || '#6B7280';
    return {
      id: `cat-${cat.id}`,
      name: cat.name,
      icon: <CategoryIcon name={cat.name} size={14} color={color} />,
      color,
      isSystem: cat.isSystem,
      dbId: cat.id,
    };
  });

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

      {/* 文件组 - 可折叠 */}
      {folderTree && folderTree.length > 0 && (
        <>
          <div
            className={s.groupHeader}
            onClick={() => setFilesCollapsed(!filesCollapsed)}
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
            <span className={s.treeLabel}>{t('sidebar.files', '文件')}</span>
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
                {folderTree.map(node => renderFolderNode(node))}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};

export default CategoryTree;
