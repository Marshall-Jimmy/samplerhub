import React, { useState, useCallback, useRef, lazy, Suspense } from 'react';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  SettingOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
  ControlOutlined,
} from '@ant-design/icons';
import { useShortcutStore, SHORTCUT_LABELS, DEFAULT_SHORTCUTS } from '../../stores/shortcutStore';
import { ModLoader } from '../../mods/ModLoader';
import { createModAPI } from '../../mods/createModAPI';
import { modLoader } from '../../mods/modLoaderInstance';
import { ModManager } from '../mods/ModManager';
import GeneralTab from './GeneralTab';
import ShortcutsPanel from './ShortcutsTab';

const ClassificationRuleEditor = lazy(() => import('./ClassificationRuleEditor'));

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onOpenDocs?: (tab?: string) => void;
}

type TabId = 'general' | 'shortcuts' | 'rules' | 'mods';

interface TabConfig {
  id: TabId;
  icon: React.ReactNode;
  labelKey: string;
}

const TABS: TabConfig[] = [
  { id: 'general', icon: <SettingOutlined />, labelKey: 'settings.general' },
  { id: 'shortcuts', icon: <ControlOutlined />, labelKey: 'settings.shortcuts' },
  { id: 'rules', icon: <UnorderedListOutlined />, labelKey: 'settings.rules' },
  { id: 'mods', icon: <AppstoreOutlined />, labelKey: 'mods.title' },
];

const getTabButtonStyle = (isActive: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '6px 0',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  background: isActive ? 'var(--bg-elevated)' : 'transparent',
  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
  transition: 'all 0.15s ease',
});

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose, onOpenDocs }) => {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  const { t } = useTranslation();

  // Shortcuts state (only used when shortcuts tab is active)
  const shortcuts = useShortcutStore(s => s.shortcuts);
  const updateShortcut = useShortcutStore(s => s.updateShortcut);
  const resetShortcuts = useShortcutStore(s => s.resetShortcuts);
  const exportShortcuts = useShortcutStore(s => s.exportShortcuts);
  const importShortcuts = useShortcutStore(s => s.importShortcuts);
  const [recordingKey, setRecordingKey] = useState<keyof typeof SHORTCUT_LABELS | null>(null);

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
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-active)', borderRadius: 8, padding: 2 }} role="tablist" aria-label={t('settings.title')}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            style={getTabButtonStyle(activeTab === tab.id)}
          >
            <span style={{ marginRight: 6 }}>{tab.icon}</span>{t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === 'general' && <GeneralTab />}

      {activeTab === 'shortcuts' && (
        <ShortcutsPanel
          shortcuts={shortcuts}
          updateShortcut={updateShortcut}
          resetShortcuts={resetShortcuts}
          exportShortcuts={exportShortcuts}
          importShortcuts={importShortcuts}
          recordingKey={recordingKey}
          setRecordingKey={setRecordingKey}
        />
      )}

      {activeTab === 'rules' && (
        <Suspense fallback={
          <div style={{ padding: 20, maxWidth: 800 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ width: 140, height: 24, background: 'var(--bg-active)', borderRadius: 4 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 80, height: 24, background: 'var(--bg-active)', borderRadius: 4 }} />
                <div style={{ width: 80, height: 24, background: 'var(--bg-active)', borderRadius: 4 }} />
                <div style={{ width: 80, height: 24, background: 'var(--bg-active)', borderRadius: 4 }} />
                <div style={{ width: 80, height: 24, background: 'var(--bg-active)', borderRadius: 4 }} />
              </div>
            </div>
            <div style={{ height: 44, background: 'var(--bg-active)', borderRadius: 8, marginBottom: 16 }} />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 44, background: 'var(--bg-active)', borderRadius: 8, marginBottom: 8 }} />
            ))}
          </div>
        }>
          <ClassificationRuleEditor />
        </Suspense>
      )}

      {activeTab === 'mods' && (
        <div id="tabpanel-mods" role="tabpanel" aria-labelledby="tab-mods" style={{ padding: '8px 0' }}>
          <ModManager modLoader={modLoader} onOpenDocs={onOpenDocs} />
        </div>
      )}
    </Modal>
  );
};

export default SettingsModal;
