import React, { useEffect, useRef } from 'react';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { KeyOutlined, ExportOutlined, ImportOutlined } from '@ant-design/icons';
import { useShortcutStore, SHORTCUT_LABELS, formatShortcut, shortcutFromEvent, DEFAULT_SHORTCUTS } from '../../stores/shortcutStore';

const ShortcutsPanel: React.FC<{
  shortcuts: typeof DEFAULT_SHORTCUTS;
  updateShortcut: (key: keyof typeof SHORTCUT_LABELS, value: string) => void;
  resetShortcuts: () => void;
  exportShortcuts: () => string;
  importShortcuts: (json: string) => boolean;
  recordingKey: keyof typeof SHORTCUT_LABELS | null;
  setRecordingKey: (key: keyof typeof SHORTCUT_LABELS | null) => void;
}> = ({ shortcuts, updateShortcut, resetShortcuts, exportShortcuts, importShortcuts, recordingKey, setRecordingKey }) => {
  const { t } = useTranslation();
  const recordingRef = useRef<keyof typeof SHORTCUT_LABELS | null>(null);

  useEffect(() => {
    recordingRef.current = recordingKey;
  }, [recordingKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!recordingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const shortcut = shortcutFromEvent(e);
      if (shortcut) {
        updateShortcut(recordingRef.current, shortcut);
        setRecordingKey(null);
        toast.success(t('settings.shortcutRecorded'));
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [updateShortcut, setRecordingKey, t]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.shortcuts')}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" icon={<ExportOutlined />} onClick={() => {
            const json = exportShortcuts();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'shortcuts.json';
            a.click();
            URL.revokeObjectURL(url);
            toast.success(t('settings.shortcutsExported'));
          }}>
            {t('settings.export')}
          </Button>
          <Button size="small" icon={<ImportOutlined />} onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              const text = await file.text();
              const ok = importShortcuts(text);
              if (ok) {
                toast.success(t('settings.shortcutsImported'));
              } else {
                toast.error(t('settings.shortcutsImportFailed'));
              }
            };
            input.click();
          }}>
            {t('settings.import')}
          </Button>
          <Button size="small" onClick={() => {
            resetShortcuts();
            toast.success(t('settings.shortcutsReset'));
          }}>
            {t('settings.reset')}
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(Object.entries(SHORTCUT_LABELS) as [keyof typeof SHORTCUT_LABELS, string][]).map(([key, label]) => (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: recordingKey === key ? 'var(--brand-primary)15' : 'var(--bg-elevated)',
              border: recordingKey === key ? '1px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onClick={() => setRecordingKey(recordingKey === key ? null : key)}
          >
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{
              fontSize: 12,
              fontFamily: 'monospace',
              color: recordingKey === key ? 'var(--brand-primary)' : 'var(--text-primary)',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              background: recordingKey === key ? 'var(--brand-primary)15' : 'var(--bg-active)',
              border: '1px solid var(--border-default)',
            }}>
              {recordingKey === key ? t('settings.pressKey') : formatShortcut(shortcuts[key])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShortcutsPanel;
