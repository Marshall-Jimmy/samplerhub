import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { Tooltip, Modal, Input, InputNumber, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { handleIpcError } from '../utils/ipcError';
import CategoryTree from './CategoryTree';
import CategoryIcon from './common/CategoryIcon';
import { useProfileStore } from '../stores/profileStore';

const GameCategoryTree = lazy(() => import('./GameCategoryTree'));
const PostSceneEditor = lazy(() => import('./PostSceneEditor'));
import {
  FolderAddOutlined,
  PlusOutlined,
  DeleteOutlined,
  ExportOutlined,
  EditOutlined,
  CloudOutlined,
  CustomerServiceOutlined,
  SearchOutlined,
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
  const appMode = useProfileStore(s => s.appMode);
  const { setActiveSection: setStoreSection, setScanning } = useLibraryStore();
  const { playlists, activePlaylistId, fetchPlaylists, createPlaylist, deletePlaylist, setActivePlaylist, updatePlaylist, exportPlaylist } = usePlaylistStore();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  // 智能文件夹状态
  const [smartFolders, setSmartFolders] = useState<Array<{ id: number; name: string; icon: string; color: string }>>([]);
  const [showSmartFolderModal, setShowSmartFolderModal] = useState(false);
  const [smartFolderForm, setSmartFolderForm] = useState({
    name: '',
    query: '',
    bpmMin: undefined as number | undefined,
    bpmMax: undefined as number | undefined,
    key: undefined as string | undefined,
    isFavorite: false,
  });

  useEffect(() => {
    fetchPlaylists();
    // 加载智能文件夹
    ipcClient.getSmartFolders().then(folders => {
      setSmartFolders(folders || []);
    }).catch(() => {});
  }, [fetchPlaylists]);

  const handleAddFolder = useCallback(async () => {
    try {
      setScanning(true);
      const result = await ipcClient.startScan(null);
      if (!result) {
        setScanning(false);
        return;
      }
      // 导入成功，显示提示并刷新列表
      toast.success(t('library.scanComplete', { added: result.added, updated: result.updated }));
    } catch (err) {
      handleIpcError(err, t('sidebar.addFolder'));
      setScanning(false);
    }
  }, [setScanning, t]);

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

  // 智能文件夹：创建
  const handleCreateSmartFolder = useCallback(async () => {
    if (!smartFolderForm.name.trim()) return;
    try {
      const filters: Record<string, any> = {};
      if (smartFolderForm.query) filters.query = smartFolderForm.query;
      if (smartFolderForm.bpmMin !== undefined) filters.bpmMin = smartFolderForm.bpmMin;
      if (smartFolderForm.bpmMax !== undefined) filters.bpmMax = smartFolderForm.bpmMax;
      if (smartFolderForm.key) filters.key = smartFolderForm.key;
      if (smartFolderForm.isFavorite) filters.isFavorite = true;

      await ipcClient.createSmartFolder(
        smartFolderForm.name.trim(),
        smartFolderForm.query,
        JSON.stringify(filters),
        'search',
        '#10B981'
      );
      const folders = await ipcClient.getSmartFolders();
      setSmartFolders(folders || []);
      setShowSmartFolderModal(false);
      setSmartFolderForm({ name: '', query: '', bpmMin: undefined, bpmMax: undefined, key: undefined, isFavorite: false });
    } catch (err) {
      handleIpcError(err);
    }
  }, [smartFolderForm]);

  // 智能文件夹：选择
  const handleSelectSmartFolder = useCallback((id: number) => {
    setActiveSection('smartFolder');
    setStoreSection('smartFolder');
    useLibraryStore.getState().setActiveSmartFolderId(id);
    onNavigateLibrary?.();
  }, [setStoreSection, onNavigateLibrary]);

  // 智能文件夹：删除
  const handleDeleteSmartFolder = useCallback(async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await ipcClient.deleteSmartFolder(id);
      const folders = await ipcClient.getSmartFolders();
      setSmartFolders(folders || []);
    } catch (err) {
      handleIpcError(err);
    }
  }, []);

  const sections = [
    { key: 'favorites', icon: <CategoryIcon name="favorites" size={16} />, label: t('sidebar.favorites'), color: '#F59E0B' },
    { key: 'recent', icon: <CategoryIcon name="recent" size={16} />, label: t('sidebar.recent'), color: '#818CF8' },
    { key: 'midi', icon: <CustomerServiceOutlined style={{ fontSize: 16 }} />, label: t('sidebar.midi'), color: '#8B5CF6' },
  ];

  // 在线采样入口（仅在设置中启用时显示）
  if (onlineSampleEnabled) {
    sections.push({ key: 'online', icon: <CloudOutlined style={{ fontSize: 16 }} />, label: t('sidebar.onlineSample'), color: '#06B6D4' });
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

      {/* Category Tree / Mode-specific Tree */}
      <div className={s.treeArea}>
        {appMode === 'music' && (
          <CategoryTree
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
          />
        )}
        {appMode === 'game' && (
          <Suspense fallback={null}>
            <GameCategoryTree />
          </Suspense>
        )}
        {appMode === 'post' && (
          <Suspense fallback={null}>
            <PostSceneEditor />
          </Suspense>
        )}
      </div>

      {/* Smart Folders Section */}
      <div className={s.playlistsSection}>
        <div className={s.playlistsHeader}>
          <span className={s.sectionLabel}>{t('sidebar.smartFolders')}</span>
          <button
            onClick={() => setShowSmartFolderModal(true)}
            className={`${s.iconBtn} ${s.iconBtnSmall}`}
            title={t('sidebar.newSmartFolder')}
          >
            <PlusOutlined />
          </button>
        </div>

        <div className={s.playlistList}>
          {smartFolders.map(folder => {
            const isActive = activeSection === 'smartFolder' && useLibraryStore.getState().activeSmartFolderId === folder.id;
            return (
              <div
                key={folder.id}
                onClick={() => handleSelectSmartFolder(folder.id)}
                className={`${s.playlistItem} ${isActive ? s.playlistItemActive : ''}`}
              >
                <SearchOutlined style={{ fontSize: 12, color: folder.color || '#10B981' }} />
                <span className={s.playlistName}>{folder.name}</span>
                <div className={s.playlistActions}>
                  <button
                    onClick={(e) => handleDeleteSmartFolder(e, folder.id)}
                    className={s.actionBtn}
                    title={t('sidebar.deleteSmartFolder')}
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              </div>
            );
          })}
          {smartFolders.length === 0 && (
            <div className={s.emptyHint} onClick={() => setShowSmartFolderModal(true)}>
              {t('sidebar.noSmartFolders')}
            </div>
          )}
        </div>
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

      {/* 创建智能文件夹对话框 */}
      <Modal
        title={t('sidebar.newSmartFolder')}
        open={showSmartFolderModal}
        onOk={handleCreateSmartFolder}
        onCancel={() => { setShowSmartFolderModal(false); setSmartFolderForm({ name: '', query: '', bpmMin: undefined, bpmMax: undefined, key: undefined, isFavorite: false }); }}
        okText={t('sidebar.createSmartFolder')}
        cancelText={t('common.cancel')}
        width={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>{t('sidebar.smartFolderName')}</label>
            <Input
              value={smartFolderForm.name}
              onChange={e => setSmartFolderForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t('sidebar.smartFolderNamePlaceholder')}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>{t('sidebar.smartFolderQuery')}</label>
            <Input
              value={smartFolderForm.query}
              onChange={e => setSmartFolderForm(f => ({ ...f, query: e.target.value }))}
              placeholder={t('sidebar.smartFolderQueryPlaceholder')}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>BPM Min</label>
              <InputNumber
                value={smartFolderForm.bpmMin}
                onChange={v => setSmartFolderForm(f => ({ ...f, bpmMin: v ?? undefined }))}
                min={0} max={300} style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>BPM Max</label>
              <InputNumber
                value={smartFolderForm.bpmMax}
                onChange={v => setSmartFolderForm(f => ({ ...f, bpmMax: v ?? undefined }))}
                min={0} max={300} style={{ width: '100%' }}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>{t('sidebar.smartFolderKey')}</label>
            <Select
              value={smartFolderForm.key}
              onChange={v => setSmartFolderForm(f => ({ ...f, key: v || undefined }))}
              allowClear
              placeholder={t('sidebar.smartFolderKeyPlaceholder')}
              style={{ width: '100%' }}
              options={[
                { value: 'C', label: 'C' }, { value: 'C#', label: 'C#' }, { value: 'D', label: 'D' },
                { value: 'D#', label: 'D#' }, { value: 'E', label: 'E' }, { value: 'F', label: 'F' },
                { value: 'F#', label: 'F#' }, { value: 'G', label: 'G' }, { value: 'G#', label: 'G#' },
                { value: 'A', label: 'A' }, { value: 'A#', label: 'A#' }, { value: 'B', label: 'B' },
              ]}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Sidebar;
