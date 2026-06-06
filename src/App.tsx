import React, { useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Layout from './components/layout/Layout';
import LibraryPage from './pages/LibraryPage';
import ErrorBoundary from './components/ErrorBoundary';
import { usePlayerStore } from './stores/playerStore';
import { useLibraryStore } from './stores/libraryStore';
import { useSettingsStore, ThemeName, THEME_COLORS, BuiltinThemeName } from './stores/settingsStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const App: React.FC = () => {
  const currentTheme = useSettingsStore((s) => s.theme);

  // 性能监控：首屏渲染时间
  useEffect(() => {
    const mountTime = performance.now();
    console.log(`[Perf] App mounted: ${mountTime.toFixed(0)}ms`);

    // 监控长任务
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 100) {
              console.warn(`[Perf] Long task: ${entry.duration.toFixed(0)}ms`);
            }
          }
        });
        obs.observe({ type: 'longtask', buffered: true });
        return () => obs.disconnect();
      } catch { /* PerformanceObserver not available */ }
    }
  }, []);

  // 全局错误捕获
  useEffect(() => {
    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      console.error('[Unhandled Rejection]', e.reason);
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  // 应用主题到 document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  const isLightTheme = ['light', 'lavender', 'sakura', 'mint', 'sand'].includes(currentTheme);

  const primaryColor = THEME_COLORS[currentTheme as BuiltinThemeName]?.primary || '#6366F1';
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Ctrl+F: 聚焦搜索
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
        return;
      }

      // Space: 播放/暂停（不在输入框时）
      if (e.key === ' ' && !isInput) {
        e.preventDefault();
        const { isPlaying, pause, resume, currentSampleId } = usePlayerStore.getState();
        if (currentSampleId) {
          if (isPlaying) pause();
          else resume();
        }
        return;
      }

      // Ctrl+Left: 上一曲
      if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        usePlayerStore.getState().playPrev();
        return;
      }

      // Ctrl+Right: 下一曲
      if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        usePlayerStore.getState().playNext();
        return;
      }

      // Ctrl+Up: 音量增大
      if (e.ctrlKey && e.key === 'ArrowUp') {
        e.preventDefault();
        const { volume, setVolume } = usePlayerStore.getState();
        setVolume(Math.min(1, volume + 0.05));
        return;
      }

      // Ctrl+Down: 音量减小
      if (e.ctrlKey && e.key === 'ArrowDown') {
        e.preventDefault();
        const { volume, setVolume } = usePlayerStore.getState();
        setVolume(Math.max(0, volume - 0.05));
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider
        theme={{
          algorithm: isLightTheme ? theme.defaultAlgorithm : theme.darkAlgorithm,
          token: {
            colorPrimary: primaryColor,
            colorBgContainer: isLightTheme ? '#F1F3F5' : '#1C1C21',
            colorBgElevated: isLightTheme ? '#FFFFFF' : '#141417',
            colorText: isLightTheme ? '#212529' : '#F0F0F3',
            colorTextSecondary: isLightTheme ? '#495057' : '#A0A0AB',
            colorBorder: isLightTheme ? '#DEE2E6' : '#2A2A32',
            borderRadius: 8,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontSize: 13,
          },
          components: {
            Menu: {
              darkItemBg: 'transparent',
              darkItemColor: '#A0A0AB',
              darkItemSelectedBg: '#25252D',
              darkItemSelectedColor: '#F0F0F3',
              darkItemHoverBg: '#1C1C21',
            },
            Input: {
              colorBgContainer: isLightTheme ? '#F1F3F5' : '#1C1C21',
              colorBorder: isLightTheme ? '#DEE2E6' : '#2A2A32',
              activeBorderColor: primaryColor,
              hoverBorderColor: isLightTheme ? '#CED4DA' : '#3A3A44',
            },
            Button: {
              colorPrimary: primaryColor,
              colorPrimaryHover: primaryColor,
            },
          },
        }}
      >
        <Layout>
          <LibraryPage />
        </Layout>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
            },
          }}
        />
      </ConfigProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;