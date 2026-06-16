import React from 'react';
import { Modal, Divider } from 'antd';
import {
  QuestionCircleOutlined,
  SearchOutlined,
  DragOutlined,
  SoundOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ open, onClose }) => {
  const { t } = useTranslation();

  const shortcutStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
  };

  const keyStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    height: 24,
    padding: '0 6px',
    borderRadius: 4,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    fontFamily: 'monospace',
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <QuestionCircleOutlined style={{ color: 'var(--brand-primary)' }} />
          <span>{t('help.title')}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={480}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>
        {/* Quick Start */}
        <section>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
            {t('help.quickStart')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 4 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--brand-primary)', fontSize: 16, marginTop: 2 }}><FolderOutlined /></span>
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t('help.addSampleFolder')}</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{t('help.addSampleFolderDesc')}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--brand-primary)', fontSize: 16, marginTop: 2 }}><SearchOutlined /></span>
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t('help.searchAndFilter')}</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{t('help.searchAndFilterDesc')}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--brand-primary)', fontSize: 16, marginTop: 2 }}><SoundOutlined /></span>
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t('help.previewPlay')}</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{t('help.previewPlayDesc')}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--brand-primary)', fontSize: 16, marginTop: 2 }}><DragOutlined /></span>
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t('help.dragToDaw')}</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{t('help.dragToDawDesc')}</p>
              </div>
            </div>
          </div>
        </section>

        <Divider style={{ margin: 0, borderColor: 'var(--border-subtle)' }} />

        {/* Keyboard Shortcuts */}
        <section>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
            {t('help.keyboardShortcuts')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
            <div style={shortcutStyle}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('help.shortcutPlayPause')}</span>
              <span style={keyStyle}>Space</span>
            </div>
            <div style={shortcutStyle}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('help.shortcutSearch')}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <span style={keyStyle}>Ctrl</span>
                <span style={keyStyle}>F</span>
              </div>
            </div>
            <div style={shortcutStyle}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('help.shortcutPrev')}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <span style={keyStyle}>Ctrl</span>
                <span style={keyStyle}>&larr;</span>
              </div>
            </div>
            <div style={shortcutStyle}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('help.shortcutNext')}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <span style={keyStyle}>Ctrl</span>
                <span style={keyStyle}>&rarr;</span>
              </div>
            </div>
            <div style={shortcutStyle}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('help.shortcutVolumeUp')}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <span style={keyStyle}>Ctrl</span>
                <span style={keyStyle}>&uarr;</span>
              </div>
            </div>
            <div style={shortcutStyle}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('help.shortcutVolumeDown')}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <span style={keyStyle}>Ctrl</span>
                <span style={keyStyle}>&darr;</span>
              </div>
            </div>
          </div>
        </section>

        <Divider style={{ margin: 0, borderColor: 'var(--border-subtle)' }} />

        {/* Supported Formats */}
        <section>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            {t('help.supportedFormats')}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 4 }}>
            {['WAV', 'MP3', 'FLAC', 'OGG', 'AAC', 'AIFF', 'M4A', 'WMA'].map(fmt => (
              <span
                key={fmt}
                style={{
                  padding: '2px 10px',
                  borderRadius: 10,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                }}
              >
                {fmt}
              </span>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
};

export default HelpModal;
