import React, { useState, useCallback, useEffect } from 'react';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { handleIpcError } from '../utils/ipcError';
import CategoryTree from './CategoryTree';
import CategoryIcon from './common/CategoryIcon';
import {
  FolderAddOutlined,
  PlusOutlined,
  DeleteOutlined,
  ExportOutlined,
  EditOutlined,
  CloudOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons';
import { ipcClient } from '../services/ipcClient';
import { useLibraryStore } from '../stores/libraryStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePlaylistStore } from '../stores/playlistStore';
import s from '../styles/components/sidebar.module.css';

interface SidebarProps {
  collapsed?: boolean;
  onOpenOnline?: () => void;
  onNavigateLibrary?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed = false, onOpenOnline, onNavigateLibrary }) => {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<string>('library');
  const onlineSampleEnabled = useSettingsStore(s => s.onlineSampleEnabled);
  const { setActiveSection: setStoreSection, setScanning } = useLibraryStore();
  const { playlists, activePlaylistId, fetchPlaylists, createPlaylist, deletePlaylist, setActivePlaylist, updatePlaylist, exportPlaylist } = usePlaylistStore();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const handleAddFolder = useCallback(async () => {
    try {
      setScanning(true);
      const result = await ipcClient.startScan(null);
      if (!result) {
        setScanning(false);
      }
    } catch (err) {
      handleIpcError(err, t('sidebar.addFolder'));
      setScanning(false);
    }
  }, [setScanning]);

  const handleSectionChange = useCallback((key: string) => {
    setActiveSection(key);
    setActivePlaylist(null);
    if (key === 'favorites') {
      setStoreSection('favorites');
      onNavigateLibrary?.();
    } else if (key === 'recent') {
      setStoreSection('recent');
      onNavigateLibrary?.();
    } else if (key === 'midi') {
      setStoreSection('midi');
      onNavigateLibrary?.();
    } else if (key === 'online') {
      onOpenOnline?.();
    } else if (key.startsWith('folder:')) {
      // 文件夹选择已由 CategoryTree 内部通过 setActiveFolder 处理
      onNavigateLibrary?.();
    } else if (key.startsWith('cat-')) {
      // 分类选择已由 CategoryTree 内部通过 setActiveCategory 处理
      onNavigateLibrary?.();
    } else {
      onNavigateLibrary?.();
    }
  }, [setStoreSection, setActivePlaylist, onOpenOnline, onNavigateLibrary]);

  const handleCreatePlaylist = useCallback(async () => {
    const name = t('sidebar.playlistName', { index: playlists.length + 1 });
    await createPlaylist(name);
  }, [playlists.length, createPlaylist]);

  const handleSelectPlaylist = useCallback((id: number) => {
    setActiveSection('playlist');
    setActivePlaylist(id);
    setStoreSection('all');
    onNavigateLibrary?.();
  }, [setActivePlaylist, setStoreSection, onNavigateLibrary]);

  const handleDeletePlaylist = useCallback(async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await deletePlaylist(id);
  }, [deletePlaylist]);

  const handleExportPlaylist = useCallback(async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await exportPlaylist(id);
  }, [exportPlaylist]);

  const handleStartEdit = useCallback((e: React.MouseEvent, playlist: { id: number; name: string }) => {
    e.stopPropagation();
    setEditingId(playlist.id);
    setEditingName(playlist.name);
  }, []);

  const handleFinishEdit = useCallback(async (id: number) => {
    if (editingName.trim()) {
      await updatePlaylist(id, { name: editingName.trim() });
    }
    setEditingId(null);
  }, [editingName, updatePlaylist]);

  const sections = [
    { key: 'favorites', icon: <CategoryIcon name="favorites" size={16} />, label: t('sidebar.favorites'), color: '#F59E0B' },
    { key: 'recent', icon: <CategoryIcon name="recent" size={16} />, label: t('sidebar.recent'), color: '#818CF8' },
    { key: 'midi', icon: <CustomerServiceOutlined style={{ fontSize: 16 }} />, label: t('sidebar.midi', 'MIDI'), color: '#8B5CF6' },
  ];

  // 在线采样入口（仅在设置中启用时显示）
  if (onlineSampleEnabled) {
    sections.push({ key: 'online', icon: <CloudOutlined style={{ fontSize: 16 }} />, label: t('sidebar.onlineSample', '在线采样'), color: '#06B6D4' });
  }

  // Collapsed mode: icon-only sidebar
  if (collapsed) {
    return (
      <div className={s.sidebarCollapsed}>
        <Tooltip title={t('sidebar.addFolder')} placement="right">
          <button onClick={handleAddFolder} className={s.collapsedIconBtn}>
            <FolderAddOutlined />
          </button>
        </Tooltip>

        <div className={s.collapsedDivider} />

        {sections.map((section) => {
          const isActive = activeSection === section.key;
          return (
            <Tooltip key={section.key} title={section.label} placement="right">
              <button
                onClick={() => handleSectionChange(section.key)}
                className={`${s.collapsedIconBtn} ${isActive ? s.collapsedIconBtnActive : ''}`}
                style={{ '--icon-color': section.color } as React.CSSProperties}
                aria-label={section.label}
                aria-pressed={isActive}
              >
                {section.icon}
              </button>
            </Tooltip>
          );
        })}

        <div className={s.collapsedDivider} />

        {playlists.slice(0, 5).map(playlist => {
          const isActive = activePlaylistId === playlist.id && activeSection === 'playlist';
          return (
            <Tooltip key={playlist.id} title={playlist.name} placement="right">
              <button
                onClick={() => handleSelectPlaylist(playlist.id)}
                className={`${s.collapsedIconBtn} ${isActive ? s.collapsedIconBtnActive : ''}`}
              >
                <span
                  className={s.collapsedPlaylistDot}
                  style={{ background: playlist.coverColor || '#6366F1' }}
                />
              </button>
            </Tooltip>
          );
        })}

        {playlists.length > 5 && (
          <Tooltip title={t('sidebar.morePlaylists', { count: playlists.length - 5 })} placement="right">
            <span className={s.collapsedMore}>+{playlists.length - 5}</span>
          </Tooltip>
        )}
      </div>
    );
  }

  // Expanded mode: full sidebar
  return (
    <div className={s.sidebar}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerRow}>
          <span className={s.sectionLabel}>{t('sidebar.library')}</span>
          <button
            onClick={handleAddFolder}
            className={s.iconBtn}
            title={t('sidebar.addFolder')}
          >
            <FolderAddOutlined />
          </button>
        </div>
      </div>

      {/* Category Tree */}
      <div className={s.treeArea}>
        <CategoryTree
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
        />
      </div>

      {/* Playlists Section */}
      <div className={s.playlistsSection}>
        <div className={s.playlistsHeader}>
          <span className={s.sectionLabel}>{t('sidebar.playlists')}</span>
          <button
            onClick={handleCreatePlaylist}
            className={`${s.iconBtn} ${s.iconBtnSmall}`}
            title={t('sidebar.newPlaylist')}
          >
            <PlusOutlined />
          </button>
        </div>

        <div className={s.playlistList}>
          {playlists.map(playlist => {
            const isActive = activePlaylistId === playlist.id && activeSection === 'playlist';
            const isEditing = editingId === playlist.id;

            return (
              <div
                key={playlist.id}
                onClick={() => handleSelectPlaylist(playlist.id)}
                className={`${s.playlistItem} ${isActive ? s.playlistItemActive : ''}`}
              >
                <span
                  className={s.playlistDot}
                  style={{ background: playlist.coverColor || '#6366F1' }}
                />

                {isEditing ? (
                  <input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={() => handleFinishEdit(playlist.id)}
                    onKeyDown={e => { if (e.key === 'Enter') handleFinishEdit(playlist.id); }}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                    className={s.playlistEditInput}
                  />
                ) : (
                  <span className={s.playlistName}>
                    {playlist.name}
                  </span>
                )}

                <span className={s.playlistCount}>
                  {playlist.itemCount || 0}
                </span>

                <div className={s.playlistActions}>
                  <button
                    onClick={(e) => handleStartEdit(e, playlist)}
                    className={s.actionBtn}
                    title={t('sidebar.rename')}
                  >
                    <EditOutlined />
                  </button>
                  <button
                    onClick={(e) => handleExportPlaylist(e, playlist.id)}
                    className={s.actionBtn}
                    title={t('sidebar.exportM3U')}
                  >
                    <ExportOutlined />
                  </button>
                  <button
                    onClick={(e) => handleDeletePlaylist(e, playlist.id)}
                    className={s.actionBtn}
                    title={t('sidebar.deletePlaylist')}
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Quick Sections */}
      <div className={s.quickSections} role="navigation" aria-label="快捷导航">
        {sections.map((section) => {
          const isActive = activeSection === section.key;
          return (
            <div
              key={section.key}
              onClick={() => handleSectionChange(section.key)}
              className={`${s.quickSectionItem} ${isActive ? s.quickSectionItemActive : ''}`}
              role="button"
              tabIndex={0}
              aria-label={section.label}
              aria-pressed={isActive}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSectionChange(section.key); } }}
            >
              <span className={s.quickSectionIcon} style={{ color: section.color }}>{section.icon}</span>
              <span className={s.quickSectionLabel}>{section.label}</span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className={s.footer}>
        <span className={s.footerBrand}>SamplerHub</span>
        <span className={s.footerVersion}>v1.0</span>
      </div>
    </div>
  );
};

export default Sidebar;
