import React, { useEffect, lazy, Suspense, useState } from 'react';
import { ConfigProvider, theme } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Layout from './components/layout/Layout';
import LibraryPage from './pages/LibraryPage';
import ErrorBoundary from './components/ErrorBoundary';
import AppLoader from './components/common/AppLoader';
import { usePlayerStore } from './stores/playerStore';
import { useLibraryStore } from './stores/libraryStore';
import { useSettingsStore, ThemeName, THEME_COLORS, BuiltinThemeName } from './stores/settingsStore';
import { initModLoader } from './mods/modLoaderInstance';
import { ipcClient } from './services/ipcClient';

const PadPage = lazy(() => import('./pages/PadPage'));
const SequencerPage = lazy(() => import('./pages/SequencerPage'));

// 检测当前窗口类型
function getToolType(): 'main' | 'pad' | 'sequencer' {
  const params = new URLSearchParams(window.location.search);
  const tool = params.get('tool');
  if (tool === 'pad') return 'pad';
  if (tool === 'sequencer') return 'sequencer';
  return 'main';
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const toolType = getToolType();
const isToolWindow = toolType !== 'main';

const App: React.FC = () => {
  const currentTheme = useSettingsStore((s) => s.theme);
  const [isReady, setIsReady] = useState(false);
  const [loaderDone, setLoaderDone] = useState(false);

  // 启动加载流程：预加载采样数据 + Mod 初始化
  useEffect(() => {
    // 在后台延迟初始化 ModLoader
    initModLoader();

    // 延迟预加载采样数据，避免与启动时的其他 IPC 请求冲突
    // 使用 fileName/asc 与 libraryStore 默认排序一致，确保缓存命中
    const prefetchTimer = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ['samples', { query: '', categoryId: undefined, tagIds: [], key: '', bpmMin: 0, bpmMax: 300, durationMin: 0, durationMax: 60, sortField: 'fileName', sortDirection: 'asc' }, 'all', null, false],
        queryFn: () => ipcClient.searchSamples({ query: '', categoryId: undefined, tagIds: [], key: '', bpmMin: 0, bpmMax: 300, durationMin: 0, durationMax: 60, sortField: 'fileName', sortDirection: 'asc' }),
        staleTime: 5 * 60 * 1000,
      });
    }, 1500);

    // 确保加载动画至少显示 600ms，避免闪烁
    const minTimer = setTimeout(() => {
      setIsReady(true);
    }, 600);

    return () => clearTimeout(minTimer);
  }, []);

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
    const handleError = (e: ErrorEvent) => {
      console.error('[Global Error]', e.message, e.filename, e.lineno);
      try {
        if (window.electronAPI?.send) {
          window.electronAPI.send('error:report', {
            source: 'GlobalError',
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {}
    };

    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      console.error('[Unhandled Rejection]', e.reason);
      try {
        if (window.electronAPI?.send) {
          window.electronAPI.send('error:report', {
            source: 'UnhandledRejection',
            message: e.reason?.message || String(e.reason),
            stack: e.reason?.stack,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {}
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Web Vitals 性能监控
  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;

    const reportMetric = (name: string, value: number) => {
      console.log(`[Perf] ${name}: ${value.toFixed(2)}`);
      try {
        if (window.electronAPI?.send) {
          window.electronAPI.send('perf:metric', { name, value, timestamp: Date.now() });
        }
      } catch {}
    };

    try {
      // LCP (Largest Contentful Paint)
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) reportMetric('LCP', entries[entries.length - 1].startTime);
      });
      lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });

      // FID (First Input Delay) → 使用 'first-input'
      const fidObs = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0] as any;
        if (entry) reportMetric('FID', entry.processingStart - entry.startTime);
      });
      fidObs.observe({ type: 'first-input', buffered: true });

      // CLS (Cumulative Layout Shift)
      let clsValue = 0;
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) clsValue += entry.value;
        }
        reportMetric('CLS', clsValue);
      });
      clsObs.observe({ type: 'layout-shift', buffered: true });

      // FCP (First Contentful Paint)
      const fcpObs = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0];
        if (entry) reportMetric('FCP', entry.startTime);
      });
      fcpObs.observe({ type: 'paint', buffered: true });

      return () => {
        lcpObs.disconnect();
        fidObs.disconnect();
        clsObs.disconnect();
        fcpObs.disconnect();
      };
    } catch { /* PerformanceObserver not available for some types */ }
  }, []);

  // 应用主题到 document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  // 监听托盘图标的播放/暂停事件
  useEffect(() => {
    const cleanup = window.electronAPI.on('tray:toggle-play', () => {
      const { isPlaying, pause, resume, currentSampleId } = usePlayerStore.getState();
      if (currentSampleId) {
        if (isPlaying) pause();
        else resume();
      }
    });
    return cleanup;
  }, []);

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
      <AppLoader
        visible={!isReady}
        onFadeOut={() => setLoaderDone(true)}
      />
      {(isReady || loaderDone) && (
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
        {isToolWindow ? (
          <Suspense fallback={null}>
            {toolType === 'pad' && <PadPage />}
            {toolType === 'sequencer' && <SequencerPage />}
          </Suspense>
        ) : (
          <Layout>
            <LibraryPage />
          </Layout>
        )}
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
      )}
    </ErrorBoundary>
  );
};

export default App;