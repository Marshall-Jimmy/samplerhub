/**
 * AppLoader - 应用启动加载动画
 * 在应用初始化完成前展示，完成后淡出
 */

import React, { useState, useEffect } from 'react';

interface AppLoaderProps {
  /** 是否可见 */
  visible: boolean;
  /** 淡出完成后回调 */
  onFadeOut?: () => void;
}

const AppLoader: React.FC<AppLoaderProps> = ({ visible, onFadeOut }) => {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (!visible && mounted) {
      // 触发淡出动画，400ms 后从 DOM 移除
      const timer = setTimeout(() => {
        setMounted(false);
        onFadeOut?.();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [visible, mounted, onFadeOut]);

  if (!mounted) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary, #141417)',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.4s ease-out',
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      <LoaderContent />
    </div>
  );
};

const LoaderContent: React.FC = () => (
  <>
    {/* Logo 脉冲动画 */}
    <div style={{
      width: 64,
      height: 64,
      borderRadius: 16,
      background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
      animation: 'apploader-pulse 2s ease-in-out infinite',
      boxShadow: '0 0 32px rgba(99, 102, 241, 0.3)',
    }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    </div>

    {/* 标题 */}
    <div style={{
      fontSize: 20,
      fontWeight: 700,
      color: 'var(--text-primary, #F0F0F3)',
      marginBottom: 8,
      letterSpacing: '-0.02em',
    }}>
      Sampler Hub
    </div>

    {/* 加载指示器 */}
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
    }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: '#6366F1',
            animation: `apploader-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>

    <style>{`
      @keyframes apploader-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes apploader-dot {
        0%, 80%, 100% { opacity: 0.4; transform: scale(1); }
        40% { opacity: 1; transform: scale(1.3); }
      }
    `}</style>
  </>
);

export default AppLoader;