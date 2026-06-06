import React, { useState, useCallback, lazy, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Toolbar from './Toolbar';
import Sidebar from '../Sidebar';
const PlayerBar = lazy(() => import('../player/PlayerBar'));
const SettingsModal = lazy(() => import('../settings/SettingsModal'));
const HelpModal = lazy(() => import('../help/HelpModal'));
const OnlineSampleBrowser = lazy(() => import('../online/OnlineSampleBrowser'));
import { useSettingsStore } from '../../stores/settingsStore';
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
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [playerVisible, setPlayerVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [showOnline, setShowOnline] = useState(false);
  const onlineSampleEnabled = useSettingsStore(s => s.onlineSampleEnabled);

  // 关闭在线采样开关时，自动退出在线浏览
  useEffect(() => {
    if (!onlineSampleEnabled) {
      setShowOnline(false);
    }
  }, [onlineSampleEnabled]);

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
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      </Suspense>
    </div>
  );
};

export default Layout;
