import React from 'react';

/**
 * 高亮搜索关键词
 * 将文本中匹配关键词的部分用高亮样式包裹
 */
export function highlightText(
  text: string,
  query: string,
  highlightStyle: React.CSSProperties = {
    background: 'rgba(99, 102, 241, 0.25)',
    color: 'var(--text-primary)',
    borderRadius: 2,
    padding: '0 1px',
  }
): React.ReactNode {
  if (!query || !query.trim()) return text;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);

  if (parts.length <= 1) return text;

  return React.createElement(
    React.Fragment,
    null,
    ...parts.map((part, i) =>
      regex.test(part)
        ? React.createElement('span', { key: i, style: highlightStyle }, part)
        : part
    )
  );
}
