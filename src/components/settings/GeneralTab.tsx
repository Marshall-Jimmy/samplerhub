import React, { useState } from 'react';
import { Slider, Switch, Button, Divider, Tag, Select, Input, Popconfirm, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../stores/profileStore';
import { PROFILE_CONFIGS, type AppMode } from '@shared/types/profile.types';
import { toast } from 'sonner';
import { handleIpcError } from '../../utils/ipcError';
import {
  SoundOutlined,
  RetweetOutlined,
  LineChartOutlined,
  FolderOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  BgColorsOutlined,
  UnorderedListOutlined,
  PlusOutlined,
  ReloadOutlined,
  GlobalOutlined,
  CloudUploadOutlined,
  ExportOutlined,
  ImportOutlined,
  HistoryOutlined,
  ExclamationCircleOutlined,
  AppstoreOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useSettingsStore, BuiltinThemeName, THEME_LABELS, THEME_COLORS, CustomTheme } from '../../stores/settingsStore';
import { usePlayerStore } from '../../stores/playerStore';
import { ipcClient } from '../../services/ipcClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BackupList from './BackupList';
import CustomThemeEditor from './CustomThemeEditor';
import PerformanceMonitor from './PerformanceMonitor';
import CollapsibleSection from '../common/CollapsibleSection';

const THEME_I18N_KEYS: Record<BuiltinThemeName, string> = {
  obsidian: 'themes.obsidian',
  midnight: 'themes.midnight',
  rose: 'themes.rose',
  forest: 'themes.forest',
  ink: 'themes.ink',
  light: 'themes.light',
  'high-contrast': 'themes.highContrast',
  aurora: 'themes.aurora',
  cyberpunk: 'themes.cyberpunk',
  sunset: 'themes.sunset',
  ocean: 'themes.ocean',
  lavender: 'themes.lavender',
  sakura: 'themes.sakura',
  mint: 'themes.mint',
  sand: 'themes.sand',
  teal: 'themes.teal',
};

const GeneralTab: React.FC = () => {
  const { appMode, setAppMode } = useProfileStore();
  const {
    volume,
    autoPlayNext,
    waveformDataEnabled,
    theme: currentTheme,
    customThemes,
    onlineSampleEnabled,
    freesoundApiKey,
    pixabayApiKey,
    setVolume,
    setAutoPlayNext,
    setWaveformDataEnabled,
    setTheme,
    addCustomTheme,
    removeCustomTheme,
    exportCustomThemes,
    importCustomThemes,
    setOnlineSampleEnabled,
    setFreesoundApiKey,
    setPixabayApiKey,
  } = useSettingsStore();

  const [showCustomThemeEditor, setShowCustomThemeEditor] = useState(false);

  const setPlayerVolume = usePlayerStore(s => s.setVolume);
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();

  const { data: watchedFolders = [] } = useQuery({
    queryKey: ['watchedFolders'],
    queryFn: () => ipcClient.getWatchedFolders(),
  });

  const handleVolumeChange = (value: number) => {
    setVolume(value);
    setPlayerVolume(value);
  };

  const handleRemoveFolder = async (folderPath: string) => {
    try {
      await ipcClient.removeWatchedFolder(folderPath);
      queryClient.invalidateQueries({ queryKey: ['watchedFolders'] });
    } catch (err) {
      handleIpcError(err, t('settings.removeFolder'));
    }
  };

  return (
    <div id="tabpanel-general" role="tabpanel" aria-labelledby="tab-general" style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0' }}>
      {/* Playback Settings */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <SoundOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.playback')}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingLeft: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.volume')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 200 }}>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolumeChange}
                style={{ flex: 1, margin: 0 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', width: 36, textAlign: 'right' }}>
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.autoPlayNext')}</span>
            <Switch
              checked={autoPlayNext}
              onChange={setAutoPlayNext}
              size="small"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.waveformEnabled')}</span>
            <Switch
              checked={waveformDataEnabled}
              onChange={setWaveformDataEnabled}
              size="small"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.onlineSampleEnabled')}</span>
            <Switch
              checked={onlineSampleEnabled}
              onChange={setOnlineSampleEnabled}
              size="small"
            />
          </div>

          {onlineSampleEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {t('settings.freesoundApiKeyLabel')}
                </span>
                <Input
                  value={freesoundApiKey}
                  onChange={e => setFreesoundApiKey(e.target.value)}
                  placeholder={t('settings.freesoundApiKeyPlaceholder')}
                  size="small"
                  type="password"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {t('settings.pixabayApiKeyLabel')}
                </span>
                <Input
                  value={pixabayApiKey}
                  onChange={e => setPixabayApiKey(e.target.value)}
                  placeholder={t('settings.pixabayApiKeyPlaceholder')}
                  size="small"
                  type="password"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Workspace Mode */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <AppstoreOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.workspaceMode', '工作模式')}</span>
        </div>

        <div style={{ paddingLeft: 22, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(Object.keys(PROFILE_CONFIGS) as AppMode[]).map((mode) => {
            const cfg = PROFILE_CONFIGS[mode];
            const isActive = appMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setAppMode(mode)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: isActive
                    ? '2px solid var(--brand-primary, #6366F1)'
                    : '2px solid var(--border-default, #2A2A32)',
                  background: isActive
                    ? 'var(--bg-active, rgba(99,102,241,0.12))'
                    : 'var(--bg-elevated, #1C1C21)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                }}
              >
                <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--text-primary, #F0F0F3)' : 'var(--text-secondary, #A0A0AB)',
                  }}>
                    {cfg.label}
                  </span>
                  <span style={{
                    fontSize: 10,
                    color: 'var(--text-tertiary, #71717A)',
                  }}>
                    {mode === 'music' ? t('settings.modeMusicDesc', '音乐制作') : mode === 'game' ? t('settings.modeGameDesc', '游戏音效') : t('settings.modePostDesc', '影视后期')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <Divider style={{ margin: 0, borderColor: 'var(--border-subtle)' }} />

      {/* Theme */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <BgColorsOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.theme')}</span>
        </div>

        <div style={{ paddingLeft: 22, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(Object.entries(THEME_LABELS) as [BuiltinThemeName, string][]).map(([key, label]) => {
            const colors = THEME_COLORS[key];
            const isActive = currentTheme === key;
            return (
              <button
                key={key}
                onClick={() => setTheme(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: isActive
                    ? `2px solid ${colors.primary}`
                    : '2px solid var(--border-default)',
                  background: isActive
                    ? `${colors.primary}15`
                    : 'var(--bg-elevated)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                }}
              >
                {/* 三色预览：背景色 + 主色 + 强调色 */}
                <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 3, background: colors.bg, border: '1px solid rgba(128,128,128,0.3)' }} />
                  <span style={{ width: 16, height: 16, borderRadius: 3, background: colors.primary }} />
                  <span style={{ width: 16, height: 16, borderRadius: 3, background: colors.accent }} />
                </span>
                <span style={{
                  fontSize: 12,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                }}>
                  {t(THEME_I18N_KEYS[key])}
                </span>
              </button>
            );
          })}

          {/* 自定义主题 */}
          {customThemes.map(ct => {
            const isActive = currentTheme === `custom-${ct.id}`;
            return (
              <button
                key={ct.id}
                onClick={() => setTheme(`custom-${ct.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: isActive
                    ? `2px solid ${ct.colors.brandPrimary}`
                    : '2px solid var(--border-default)',
                  background: isActive
                    ? `${ct.colors.brandPrimary}15`
                    : 'var(--bg-elevated)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                }}
              >
                <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 3, background: ct.colors.bgBase, border: '1px solid rgba(128,128,128,0.3)' }} />
                  <span style={{ width: 16, height: 16, borderRadius: 3, background: ct.colors.brandPrimary }} />
                  <span style={{ width: 16, height: 16, borderRadius: 3, background: ct.colors.brandAccent }} />
                </span>
                <span style={{
                  fontSize: 12,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                }}>
                  {ct.name}
                </span>
                <Popconfirm title={t('settings.deleteTheme')} onConfirm={(e) => { e?.stopPropagation(); removeCustomTheme(ct.id); }} onCancel={(e) => e?.stopPropagation()}>
                  <DeleteOutlined style={{ fontSize: 10, color: 'var(--text-disabled)' }} onClick={e => e.stopPropagation()} />
                </Popconfirm>
              </button>
            );
          })}

          {/* 新建自定义主题按钮 */}
          <button
            onClick={() => setShowCustomThemeEditor(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: '2px dashed var(--border-default)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: 12,
              transition: 'all 0.2s ease',
              outline: 'none',
            }}
          >
            <PlusOutlined style={{ fontSize: 11 }} />
            {t('settings.customTheme')}
          </button>
        </div>

        {/* 自定义主题编辑器 */}
        {showCustomThemeEditor && (
          <CustomThemeEditor
            onSave={(theme) => { addCustomTheme(theme); setTheme(`custom-${theme.id}`); setShowCustomThemeEditor(false); toast.success(t('settings.themeCreated')); }}
            onCancel={() => setShowCustomThemeEditor(false)}
          />
        )}

        {/* 导入/导出主题 */}
        {customThemes.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button size="small" onClick={() => {
              const json = exportCustomThemes();
              navigator.clipboard.writeText(json);
              toast.success(t('settings.themeExported'));
            }}>{t('settings.exportThemes')}</Button>
            <Button size="small" onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const text = await file.text();
                const result = importCustomThemes(text);
                toast.success(t('settings.themeImported', { imported: result.imported, skipped: result.skipped }));
              };
              input.click();
            }}>{t('settings.importThemes')}</Button>
          </div>
        )}
      </section>

      <Divider style={{ margin: 0, borderColor: 'var(--border-subtle)' }} />

      {/* Language */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GlobalOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.language')}</span>
          </div>
          <Select
            size="small"
            value={i18n.language || 'zh-CN'}
            onChange={(val) => i18n.changeLanguage(val)}
            style={{ width: 140 }}
            options={[
              { value: 'zh-CN', label: t('settings.languageZh') },
              { value: 'en', label: t('settings.languageEn') },
              { value: 'ja', label: t('settings.languageJa') },
              { value: 'ko', label: t('settings.languageKo') },
              { value: 'fr', label: t('settings.languageFr') },
              { value: 'de', label: t('settings.languageDe') },
              { value: 'es', label: t('settings.languageEs') },
              { value: 'pt-BR', label: t('settings.languagePtBR') },
              { value: 'ru', label: t('settings.languageRu') },
              { value: 'it', label: t('settings.languageIt') },
              { value: 'ug', label: t('settings.languageUg') },
            ]}
          />
        </div>
      </section>

      <Divider style={{ margin: 0, borderColor: 'var(--border-subtle)' }} />
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.watchedFolders')}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={async () => {
                try {
                  const folders = await ipcClient.openFoldersDialog();
                  if (folders && folders.length > 0) {
                    for (const p of folders) {
                      await ipcClient.addWatchedFolder(p);
                    }
                    queryClient.invalidateQueries({ queryKey: ['watchedFolders'] });
                    queryClient.invalidateQueries({ queryKey: ['samples'] });
                  }
                } catch (err) {
                  handleIpcError(err, t('settings.addFolder'));
                }
              }}
            >
              {t('settings.addFolder')}
            </Button>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={async () => {
                try {
                  for (const folder of watchedFolders) {
                    await ipcClient.scanFolder(folder.path);
                  }
                  queryClient.invalidateQueries({ queryKey: ['samples'] });
                  toast.success(t('settings.rescanComplete'));
                } catch (err) {
                  handleIpcError(err, t('settings.rescanFailed'));
                }
              }}
            >
              {t('settings.rescan')}
            </Button>
          </div>
        </div>

        <div style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {watchedFolders.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>{t('settings.noFolders')}</span>
          ) : (
            watchedFolders.map((folder: any) => (
              <div
                key={folder.id || folder.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <FolderOutlined style={{ fontSize: 12, color: 'var(--brand-primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {folder.path}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                  <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={async () => {
                      try {
                        await ipcClient.scanFolder(folder.path);
                        queryClient.invalidateQueries({ queryKey: ['samples'] });
                      } catch (err) {
                        handleIpcError(err, t('settings.rescanFailed'));
                      }
                    }}
                    title={t('settings.rescanThis')}
                    style={{ fontSize: 11 }}
                  />
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveFolder(folder.path)}
                    title={t('settings.removeFolder')}
                    style={{ fontSize: 11 }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <Divider style={{ margin: 0, borderColor: 'var(--border-subtle)' }} />

      {/* File Management */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <LineChartOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.fileManagement')}</span>
        </div>
        <div style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.detectDuplicates')}</span>
            <Button
              size="small"
              onClick={async () => {
                try {
                  const dupes = await ipcClient.getDuplicates();
                  const total = dupes.reduce((acc, d) => acc + d.count - 1, 0);
                  toast.success(t('settings.detectComplete', { count: dupes.length }));
                } catch (err) { handleIpcError(err, t('settings.detectFailed')); }
              }}
            >
              {t('settings.detect')}
            </Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.cleanCorrupted')}</span>
            <Button
              size="small"
              danger
              onClick={async () => {
                try {
                  const count = await ipcClient.cleanCorrupted();
                  toast.success(t('settings.cleanComplete', { count }));
                  queryClient.invalidateQueries({ queryKey: ['samples'] });
                } catch (err) { handleIpcError(err, t('settings.cleanFailed')); }
              }}
            >
              {t('settings.clean')}
            </Button>
          </div>
        </div>
      </section>

      <Divider style={{ margin: 0, borderColor: 'var(--border-subtle)' }} />

      {/* Config Import/Export */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <RetweetOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.config')}</span>
        </div>
        <div style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.exportConfig')}</span>
            <Button
              size="small"
              icon={<ExportOutlined />}
              onClick={async () => {
                try {
                  const result = await ipcClient.exportConfig();
                  if (result?.path) {
                    toast.success(t('settings.configExported'));
                  }
                } catch (err) {
                  handleIpcError(err, t('settings.exportConfig'));
                }
              }}
            >
              {t('settings.export')}
            </Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.importConfig')}</span>
            <Button
              size="small"
              icon={<ImportOutlined />}
              onClick={async () => {
                try {
                  const result = await ipcClient.importConfig();
                  if (result.imported) {
                    toast.success(t('settings.configImported'));
                  }
                } catch (err) {
                  handleIpcError(err, t('settings.importConfig'));
                }
              }}
            >
              {t('settings.import')}
            </Button>
          </div>
        </div>
      </section>

      <Divider style={{ margin: 0, borderColor: 'var(--border-subtle)' }} />

      {/* Backup & Restore */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <HistoryOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.backup')}</span>
        </div>
        <div style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.manualBackup')}</span>
            <Button
              size="small"
              icon={<CloudUploadOutlined />}
              onClick={async () => {
                try {
                  const result = await ipcClient.createBackup();
                  if (result.success) {
                    toast.success(t('settings.backupSuccess'));
                    queryClient.invalidateQueries({ queryKey: ['backups'] });
                  } else {
                    toast.error(result.error || t('settings.backupFailed'));
                  }
                } catch (err) {
                  handleIpcError(err, t('settings.manualBackup'));
                }
              }}
            >
              {t('settings.createBackup')}
            </Button>
          </div>

          {/* 备份列表 */}
          <BackupList />
        </div>
      </section>

      <Divider style={{ margin: 0, borderColor: 'var(--border-subtle)' }} />

      {/* Performance Monitor (collapsed) */}
      <CollapsibleSection
        title={t('settings.performance', '性能监控')}
        icon={<DashboardOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />}
        defaultOpen={false}
      >
        <PerformanceMonitor />
      </CollapsibleSection>

      <Divider style={{ margin: 0, borderColor: 'var(--border-subtle)' }} />

      {/* Danger Zone */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <ExclamationCircleOutlined style={{ color: 'var(--error)', fontSize: 14 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--error)' }}>{t('settings.dangerZone')}</span>
        </div>
        <div style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.initializeDatabase')}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t('settings.initializeDatabaseDesc')}</span>
            </div>
            <Button
              size="small"
              danger
              onClick={async () => {
                Modal.confirm({
                  title: t('settings.initializeConfirmTitle'),
                  content: t('settings.initializeConfirmContent'),
                  okText: t('settings.initializeConfirmOk'),
                  okButtonProps: { danger: true },
                  cancelText: t('settings.initializeConfirmCancel'),
                  onOk: async () => {
                    try {
                      await ipcClient.resetDatabase();
                      toast.success(t('settings.initializeSuccess'));
                      // 刷新页面以重新加载空数据库
                      window.location.reload();
                    } catch (err) {
                      handleIpcError(err, t('settings.initializeDatabase'));
                    }
                  },
                });
              }}
            >
              {t('settings.initialize')}
            </Button>
          </div>
        </div>
      </section>

      <Divider style={{ margin: 0, borderColor: 'var(--border-subtle)' }} />
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <InfoCircleOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.about')}</span>
        </div>
        <div style={{ paddingLeft: 22 }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
            Jima's SamplerHub v1.0.0
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
            {t('settings.aboutDesc')}
          </p>
        </div>
      </section>
    </div>
  );
};

export default GeneralTab;
