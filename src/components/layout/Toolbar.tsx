import React from 'react';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../stores/playerStore';
import s from '../../styles/components/toolbar.module.css';

interface ToolbarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  playerVisible: boolean;
  onTogglePlayer: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  sidebarCollapsed,
  onToggleSidebar,
  playerVisible,
  onTogglePlayer,
  onOpenSettings,
  onOpenHelp,
}) => {
  const { t } = useTranslation();
  const { currentSampleName, isPlaying } = usePlayerStore();
  return (
    <div className={s.toolbar}>
      {/* Left Section */}
      <div className={s.left}>
        <button
          onClick={onToggleSidebar}
          className={s.btn}
          title={sidebarCollapsed ? t('toolbar.expandSidebar') : t('toolbar.collapseSidebar')}
        >
          {sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </button>

        <div className={s.brand}>
          <img src="./appIcon_256.png" alt="" className={s.logo} draggable={false} />
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
          onClick={onTogglePlayer}
          className={`${s.btn} ${playerVisible ? s.btnActive : ''}`}
          title={t('toolbar.togglePlayer')}
        >
          <SoundOutlined />
        </button>

        <button
          onClick={onOpenHelp}
          className={s.btn}
          title={t('toolbar.help')}
        >
          <QuestionCircleOutlined />
        </button>

        <button
          onClick={onOpenSettings}
          className={s.btn}
          title={t('toolbar.settings')}
        >
          <SettingOutlined />
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
