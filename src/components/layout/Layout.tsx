import React, { useState, useCallback, lazy, Suspense, useEffect, Component } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Toolbar from './Toolbar';
import Sidebar from '../Sidebar';
const PlayerBar = lazy(() => import('../player/PlayerBar'));

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, color: '#e94560', fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>⚠️ Mod Panel Error</div>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11, color: '#ccc' }}>
            {this.state.error?.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
const SettingsModal = lazy(() => import('../settings/SettingsModal'));
const HelpModal = lazy(() => import('../help/HelpModal'));
const DocsModal = lazy(() => import('../docs/DocsModal'));
const OnlineSampleBrowser = lazy(() => import('../online/OnlineSampleBrowser'));
import { useSettingsStore } from '../../stores/settingsStore';
import { useProfileStore } from '../../stores/profileStore';
import { Modal } from 'antd';
import DeliveryQAPanel from '../game/DeliveryQAPanel';

import { modUIRegistry } from '../../mods/modUIRegistry';
import s from '../../styles/components/layout.module.css';

type SidebarMode = 'expanded' | 'collapsed' | 'overlay';

interface LayoutProps {
  children: React.ReactNode;
}

const BREAKPOINT_MD = 1024;
const BREAKPOINT_SM = 768;

function useSidebarMode(): { mode: SidebarMode; width: number } {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (windowWidth < BREAKPOINT_SM) return { mode: 'overlay', width: 0 };
  if (windowWidth < BREAKPOINT_MD) return { mode: 'collapsed', width: 56 };
  return { mode: 'expanded', width: 256 };
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { t } = useTranslation();
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [playerVisible, setPlayerVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsInitialTab, setDocsInitialTab] = useState<string>('tutorial');
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [showOnline, setShowOnline] = useState(false);
  const [closeDialogVisible, setCloseDialogVisible] = useState(false);

  // 游戏模式面板状态
  const [gameQaOpen, setGameQaOpen] = useState(false);
  const onlineSampleEnabled = useSettingsStore(s => s.onlineSampleEnabled);
  const appMode = useProfileStore(s => s.appMode);

  // 模组面板状态
  const [modPanelIds, setModPanelIds] = useState<string[]>([]);
  const [openModPanelIds, setOpenModPanelIds] = useState<string[]>([]);

  useEffect(() => {
    // 初始化面板列表
    setModPanelIds(modUIRegistry.getPanels().map(p => p.id));
    setOpenModPanelIds([...modUIRegistry.getPanels()].filter(p => modUIRegistry.isPanelOpen(p.id)).map(p => p.id));

    const unsubscribe = modUIRegistry.subscribe(() => {
      setModPanelIds(modUIRegistry.getPanels().map(p => p.id));
      setOpenModPanelIds([...modUIRegistry.getPanels()].filter(p => modUIRegistry.isPanelOpen(p.id)).map(p => p.id));
    });
    return () => { unsubscribe(); };
  }, []);

  // 关闭在线采样开关时，自动退出在线浏览
  useEffect(() => {
    if (!onlineSampleEnabled) {
      setShowOnline(false);
    }
  }, [onlineSampleEnabled]);

  // 监听窗口关闭请求（来自主进程）
  useEffect(() => {
    const cleanup = window.electronAPI.on('window:close-requested', () => {
      setCloseDialogVisible(true);
    });
    return cleanup;
  }, []);

  // 监听游戏模式工具事件
  useEffect(() => {
    const handleQa = () => setGameQaOpen(true);
    window.addEventListener('game:open-qa', handleQa);
    return () => window.removeEventListener('game:open-qa', handleQa);
  }, []);

  const { mode: sidebarMode, width: sidebarWidth } = useSidebarMode();

  // In overlay mode, sidebar is hidden by default; toggle opens overlay
  // In collapsed mode, sidebar shows icons only
  // In expanded mode, full sidebar
  const showSidebar = sidebarMode === 'overlay' ? overlayOpen : sidebarVisible;
  const effectiveWidth = sidebarMode === 'overlay' ? 256 : sidebarWidth;

  const toggleSidebar = useCallback(() => {
    if (sidebarMode === 'overlay') {
      setOverlayOpen(prev => !prev);
    } else {
      setSidebarVisible(prev => !prev);
    }
  }, [sidebarMode]);

  const togglePlayer = useCallback(() => {
    setPlayerVisible(prev => !prev);
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlayOpen(false);
  }, []);

  const openDocs = useCallback((initialTab?: string) => {
    setDocsInitialTab(initialTab || 'tutorial');
    setDocsOpen(true);
  }, []);

  return (
    <div className={s.layout}>
      {/* Top Toolbar */}
      <Toolbar
        sidebarCollapsed={sidebarMode === 'overlay' ? !overlayOpen : !sidebarVisible}
        onToggleSidebar={toggleSidebar}
        playerVisible={playerVisible}
        onTogglePlayer={togglePlayer}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenDocs={openDocs}
      />

      {/* Main Content Area */}
      <div className={s.mainArea}>
        {/* Sidebar */}
        {sidebarMode === 'overlay' ? (
          <AnimatePresence>
            {overlayOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={s.overlayBackdrop}
                  onClick={closeOverlay}
                />
                <motion.div
                  initial={{ x: -256, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -256, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className={s.sidebarOverlay}
                >
                  <Sidebar collapsed={false} onOpenOnline={() => setShowOnline(true)} onNavigateLibrary={() => setShowOnline(false)} />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        ) : (
          <AnimatePresence>
            {sidebarVisible && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: effectiveWidth, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className={s.sidebarWrapper}
              >
                <Sidebar collapsed={sidebarMode === 'collapsed'} onOpenOnline={() => setShowOnline(true)} onNavigateLibrary={() => setShowOnline(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Content */}
        <div className={s.contentArea}>
          <div className={s.contentScroll}>
            {showOnline ? (
              <Suspense fallback={null}>
                <OnlineSampleBrowser />
              </Suspense>
            ) : (
              children
            )}
          </div>
        </div>


      </div>

      {/* Bottom Player Bar */}
      <AnimatePresence>
        {playerVisible && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 72, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className={s.playerWrapper}
          >
            <Suspense fallback={null}>
              <PlayerBar />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <Suspense fallback={null}>
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onOpenDocs={openDocs} />
        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
        <DocsModal open={docsOpen} onClose={() => setDocsOpen(false)} initialTab={docsInitialTab} />
        {gameQaOpen && appMode === 'game' && (
          <Modal
            title={t('game.deliveryQA', '交付质检')}
            open={gameQaOpen}
            onCancel={() => setGameQaOpen(false)}
            footer={null}
            width={600}
            styles={{
              content: { background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)' },
              header: { background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' },
              body: { background: 'var(--bg-surface)', maxHeight: '70vh', overflow: 'auto' },
            }}
          >
            <DeliveryQAPanel />
          </Modal>
        )}
      </Suspense>

      {/* 自定义关闭确认弹窗 */}
      <AnimatePresence>
        {closeDialogVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => setCloseDialogVisible(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--bg-elevated, #1C1C21)',
                border: '1px solid var(--border-default, #2A2A32)',
                borderRadius: 12,
                padding: 24,
                width: 360,
                boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
              }}
            >
              <div style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--text-primary, #F0F0F3)',
                marginBottom: 8,
              }}>
                {t('app.closeTitle', '关闭窗口')}
              </div>
              <div style={{
                fontSize: 13,
                color: 'var(--text-secondary, #A0A0AB)',
                marginBottom: 20,
                lineHeight: 1.5,
              }}>
                {t('app.closeMessage', '缩小到托盘后可通过托盘图标重新打开。')}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setCloseDialogVisible(false);
                    window.electronAPI.send('window:minimize-to-tray');
                  }}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: '1px solid var(--border-default, #2A2A32)',
                    background: 'var(--bg-surface, #141417)',
                    color: 'var(--text-primary, #F0F0F3)',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {t('app.minimizeToTray', '缩小到托盘')}
                </button>
                <button
                  onClick={() => {
                    setCloseDialogVisible(false);
                    window.electronAPI.send('window:force-quit');
                  }}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#EF4444',
                    color: '#fff',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {t('app.forceQuit', '直接退出')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mod Floating Panels */}
      {openModPanelIds.map(panelId => {
        const panel = modUIRegistry.getPanel(panelId);
        if (!panel) return null;
        const PanelComponent = panel.component;
        return (
          <div
            key={panelId}
            style={{
              position: 'fixed',
              top: 60,
              right: 16,
              width: 420,
              height: 520,
              zIndex: 1000,
              background: 'var(--bg-surface, #1a1a2e)',
              border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
              background: 'var(--bg-elevated, #16213e)',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{panel.title}</span>
              <button
                onClick={() => modUIRegistry.closePanel(panelId)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary, #888)',
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: '0 4px',
                  lineHeight: 1,
                }}
              >✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <ErrorBoundary>
                <PanelComponent />
              </ErrorBoundary>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Layout;
