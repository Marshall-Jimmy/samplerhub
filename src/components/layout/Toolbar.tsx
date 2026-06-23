import React, { useEffect, useState } from 'react';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  SoundOutlined,
  CustomerServiceOutlined,
  AppstoreOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../stores/playerStore';
import { modUIRegistry, ModToolbarButton } from '../../mods/modUIRegistry';
import s from '../../styles/components/toolbar.module.css';

interface ToolbarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  playerVisible: boolean;
  onTogglePlayer: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onOpenDocs: (initialTab?: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  sidebarCollapsed,
  onToggleSidebar,
  playerVisible,
  onTogglePlayer,
  onOpenSettings,
  onOpenHelp,
  onOpenDocs,
}) => {
  const { t } = useTranslation();
  const { currentSampleName, isPlaying } = usePlayerStore();
  const [modButtons, setModButtons] = useState<ModToolbarButton[]>([]);

  useEffect(() => {
    setModButtons(modUIRegistry.getButtons());
    const unsubscribe = modUIRegistry.subscribe(() => {
      setModButtons([...modUIRegistry.getButtons()]);
    });
    return () => { unsubscribe(); };
  }, []);
  return (
    <div className={s.toolbar}>
      {/* Left Section */}
      <div className={s.left}>
        <button
          onClick={onToggleSidebar}
          className={s.btn}
          title={sidebarCollapsed ? t('toolbar.expandSidebar') : t('toolbar.collapseSidebar')}
          aria-label={sidebarCollapsed ? t('toolbar.expandSidebar') : t('toolbar.collapseSidebar')}
          aria-pressed={!sidebarCollapsed}
        >
          {sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </button>

        <div className={s.brand}>
          <img src="./appIcon_256.png" alt="SamplerHub" className={s.logo} draggable={false} />
          <span className={s.brandAccent}>Jima's</span>
          <span className={s.brandSub}>{' '}SamplerHub</span>
        </div>
      </div>

      {/* Center Section */}
      <div className={s.center}>
        <div className={s.nowPlaying}>
          {isPlaying && currentSampleName ? (
            <>
              <span className={`${s.playingIndicator} ${s.playingIndicatorActive}`} />
              <span className={s.sampleName}>{currentSampleName}</span>
            </>
          ) : (
            <span className={s.sampleName}>{t('toolbar.readyToPlay')}</span>
          )}
        </div>
      </div>

      {/* Right Section */}
      <div className={s.right}>
        <button
          onClick={() => window.electronAPI.createPadWindow()}
          className={s.btn}
          title={t('pad.title')}
          aria-label={t('pad.title')}
        >
          <AppstoreOutlined />
        </button>

        <button
          onClick={() => window.electronAPI.createSequencerWindow()}
          className={s.btn}
          title={t('sequencer.title')}
          aria-label={t('sequencer.title')}
        >
          <CustomerServiceOutlined />
        </button>

        <div className={s.divider} />

        {/* Mod Buttons */}
        {modButtons.map(btn => (
          <button
            key={btn.id}
            onClick={btn.onClick}
            className={s.btn}
            title={btn.tooltip}
            aria-label={btn.tooltip}
          >
            <span style={{ fontSize: 16 }}>{btn.icon}</span>
          </button>
        ))}

        {modButtons.length > 0 && <div className={s.divider} />}

        <button
          onClick={onTogglePlayer}
          className={`${s.btn} ${playerVisible ? s.btnActive : ''}`}
          title={t('toolbar.togglePlayer')}
          aria-label={t('toolbar.togglePlayer')}
          aria-pressed={playerVisible}
        >
          <SoundOutlined />
        </button>

        <button
          onClick={onOpenHelp}
          className={s.btn}
          title={t('toolbar.help')}
          aria-label={t('toolbar.help')}
        >
          <QuestionCircleOutlined />
        </button>

        <button
          onClick={() => onOpenDocs('tutorial')}
          className={s.btn}
          title={t('toolbar.docs')}
          aria-label={t('toolbar.docs')}
        >
          <BookOutlined />
        </button>

        <button
          onClick={onOpenSettings}
          className={s.btn}
          title={t('toolbar.settings')}
          aria-label={t('toolbar.settings')}
        >
          <SettingOutlined />
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
