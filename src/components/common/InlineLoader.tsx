/**
 * InlineLoader - 通用内联加载指示器
 * 三点跳动动画，替代 antd Spin 的默认方框旋转图标
 */

import React from 'react';

interface InlineLoaderProps {
  /** 尺寸：small(12px) | medium(18px) | large(24px) */
  size?: 'small' | 'medium' | 'large';
  /** 颜色，默认使用主题色 */
  color?: string;
  /** 额外 className */
  className?: string;
  /** 额外 style */
  style?: React.CSSProperties;
}

const sizeMap = {
  small: { dot: 5, gap: 4 },
  medium: { dot: 7, gap: 5 },
  large: { dot: 9, gap: 6 },
};

const InlineLoader: React.FC<InlineLoaderProps> = ({
  size = 'medium',
  color,
  className,
  style,
}) => {
  const { dot, gap } = sizeMap[size];

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap,
        ...style,
      }}
    >
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: dot,
            height: dot,
            borderRadius: '50%',
            background: color || 'var(--accent-primary, #6366F1)',
            animation: `inlineloader-bounce 1.4s ease-in-out ${i * 0.16}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes inlineloader-bounce {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
};

export default InlineLoader;