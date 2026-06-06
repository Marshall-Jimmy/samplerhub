import React, { useState } from 'react';
import { Modal, Slider, Switch, Button, Divider, Tag, InputNumber, Select, Input, ColorPicker, Popconfirm } from 'antd';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { handleIpcError } from '../../utils/ipcError';
import {
  SettingOutlined,
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
  EditOutlined,
} from '@ant-design/icons';
import { useSettingsStore, ThemeName, BuiltinThemeName, THEME_LABELS, THEME_COLORS, CustomTheme } from '../../stores/settingsStore';
import { usePlayerStore } from '../../stores/playerStore';
import { ipcClient } from '../../services/ipcClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ClassificationRuleEditor from './ClassificationRuleEditor';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'rules'>('general');
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
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SettingOutlined style={{ color: 'var(--brand-primary)' }} />
          <span>{t('settings.title')}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={activeTab === 'rules' ? 700 : 520}
      styles={{
        content: {
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
        },
        header: {
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        },
        body: {
          background: 'var(--bg-surface)',
        },
      }}
    >
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-active)', borderRadius: 8, padding: 2 }}>
        <button
          onClick={() => setActiveTab('general')}
          style={{
            flex: 1, padding: '6px 0', borderRadius: 6,
            border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            background: activeTab === 'general' ? 'var(--bg-elevated)' : 'transparent',
            color: activeTab === 'general' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: activeTab === 'general' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <SettingOutlined style={{ marginRight: 6 }} />{t('settings.general')}
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          style={{
            flex: 1, padding: '6px 0', borderRadius: 6,
            border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            background: activeTab === 'rules' ? 'var(--bg-elevated)' : 'transparent',
            color: activeTab === 'rules' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: activeTab === 'rules' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <UnorderedListOutlined style={{ marginRight: 6 }} />{t('settings.rules')}
        </button>
      </div>

      {activeTab === 'general' ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0' }}>
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
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.onlineSampleEnabled', '在线采样浏览')}</span>
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
                    Freesound API Key（可选，<a href="https://freesound.org/apiv2/apply/" target="_blank" rel="noopener" style={{ color: 'var(--brand-primary)' }}>免费申请</a>）
                  </span>
                  <Input
                    value={freesoundApiKey}
                    onChange={e => setFreesoundApiKey(e.target.value)}
                    placeholder="输入 Freesound API Key"
                    size="small"
                    type="password"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Pixabay API Key（可选，<a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener" style={{ color: 'var(--brand-primary)' }}>免费注册获取</a>）
                  </span>
                  <Input
                    value={pixabayApiKey}
                    onChange={e => setPixabayApiKey(e.target.value)}
                    placeholder="输入 Pixabay API Key"
                    size="small"
                    type="password"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            )}
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
                    {label}
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
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Language</span>
            </div>
            <Select
              size="small"
              value={i18n.language || 'zh-CN'}
              onChange={(val) => i18n.changeLanguage(val)}
              style={{ width: 140 }}
              options={[
                { value: 'zh-CN', label: '简体中文' },
                { value: 'en', label: 'English' },
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
      ) : (
        <ClassificationRuleEditor />
      )}
    </Modal>
  );
};

/* ── Custom Theme Editor ──────────────────────── */
const CUSTOM_THEME_DEFAULTS: CustomTheme['colors'] = {
  bgBase: '#0A0A0B',
  bgSurface: '#111114',
  bgElevated: '#1A1A1F',
  bgHover: '#242429',
  bgActive: '#2C2C33',
  borderSubtle: '#222228',
  borderDefault: '#2C2C34',
  borderStrong: '#3A3A44',
  textPrimary: '#EEEEF0',
  textSecondary: '#9898A4',
  textTertiary: '#7A7A88',
  textDisabled: '#55555F',
  brandPrimary: '#6366F1',
  brandPrimaryHover: '#7577F5',
  brandAccent: '#22D3EE',
};

const COLOR_FIELD_KEYS: { key: keyof CustomTheme['colors']; labelKey: string; groupKey: string }[] = [
  { key: 'bgBase', labelKey: 'settings.themePreviewBgBase', groupKey: 'settings.themeColorsBg' },
  { key: 'bgSurface', labelKey: 'settings.themePreviewBgSurface', groupKey: 'settings.themeColorsBg' },
  { key: 'bgElevated', labelKey: 'settings.themePreviewBgElevated', groupKey: 'settings.themeColorsBg' },
  { key: 'bgHover', labelKey: 'settings.themePreviewBgHover', groupKey: 'settings.themeColorsBg' },
  { key: 'bgActive', labelKey: 'settings.themePreviewBgActive', groupKey: 'settings.themeColorsBg' },
  { key: 'borderSubtle', labelKey: 'settings.themePreviewBorderSubtle', groupKey: 'settings.themeColorsBorder' },
  { key: 'borderDefault', labelKey: 'settings.themePreviewBorderDefault', groupKey: 'settings.themeColorsBorder' },
  { key: 'borderStrong', labelKey: 'settings.themePreviewBorderStrong', groupKey: 'settings.themeColorsBorder' },
  { key: 'textPrimary', labelKey: 'settings.themePreviewTextPrimary', groupKey: 'settings.themeColorsText' },
  { key: 'textSecondary', labelKey: 'settings.themePreviewTextSecondary', groupKey: 'settings.themeColorsText' },
  { key: 'textTertiary', labelKey: 'settings.themePreviewTextTertiary', groupKey: 'settings.themeColorsText' },
  { key: 'textDisabled', labelKey: 'settings.themePreviewTextDisabled', groupKey: 'settings.themeColorsText' },
  { key: 'brandPrimary', labelKey: 'settings.themePreviewBrandPrimary', groupKey: 'settings.themeColorsBrand' },
  { key: 'brandPrimaryHover', labelKey: 'settings.themePreviewBrandPrimaryHover', groupKey: 'settings.themeColorsBrand' },
  { key: 'brandAccent', labelKey: 'settings.themePreviewBrandAccent', groupKey: 'settings.themeColorsBrand' },
];

const CustomThemeEditor: React.FC<{
  onSave: (theme: CustomTheme) => void;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(t('settings.customThemeName'));
  const [colors, setColors] = useState<CustomTheme['colors']>({ ...CUSTOM_THEME_DEFAULTS });

  const updateColor = (key: keyof CustomTheme['colors'], value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
  };

  const groups = [...new Set(COLOR_FIELD_KEYS.map(f => f.groupKey))];

  return (
    <div style={{
      marginTop: 12,
      padding: 16,
      borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('settings.customThemeName')}
          size="small"
          style={{ width: 160, background: 'var(--bg-base)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button size="small" type="primary" onClick={() => onSave({ id: Date.now().toString(), name, colors })}>{t('common.save')}</Button>
        </div>
      </div>

      {/* 预览 */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12,
        padding: 10,
        borderRadius: 'var(--radius-md)',
        background: colors.bgBase,
        border: `1px solid ${colors.borderDefault}`,
      }}>
        <span style={{ display: 'flex', gap: 3 }}>
          <span style={{ width: 24, height: 24, borderRadius: 4, background: colors.bgBase, border: `1px solid ${colors.borderSubtle}` }} />
          <span style={{ width: 24, height: 24, borderRadius: 4, background: colors.bgSurface, border: `1px solid ${colors.borderSubtle}` }} />
          <span style={{ width: 24, height: 24, borderRadius: 4, background: colors.bgElevated, border: `1px solid ${colors.borderDefault}` }} />
          <span style={{ width: 24, height: 24, borderRadius: 4, background: colors.brandPrimary }} />
          <span style={{ width: 24, height: 24, borderRadius: 4, background: colors.brandAccent }} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: colors.textPrimary, fontWeight: 600 }}>Aa {t('settings.themePreviewTextPrimary')}</span>
          <span style={{ fontSize: 10, color: colors.textSecondary }}>Aa {t('settings.themePreviewTextSecondary')}</span>
          <span style={{ fontSize: 9, color: colors.textTertiary }}>Aa {t('settings.themePreviewTextTertiary')}</span>
        </div>
      </div>

      {/* 颜色编辑 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.map(group => (
          <div key={group}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t(group)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COLOR_FIELD_KEYS.filter(f => f.groupKey === group).map(field => (
                <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ColorPicker
                    size="small"
                    value={colors[field.key]}
                    onChange={(_, hex) => updateColor(field.key, hex)}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', minWidth: 52 }}>{t(field.labelKey)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SettingsModal;
