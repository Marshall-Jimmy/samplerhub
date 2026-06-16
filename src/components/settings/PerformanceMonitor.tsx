import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ipcClient } from '../../services/ipcClient';

const PerformanceMonitor: React.FC = () => {
  const { t } = useTranslation();
  const { data: perfData, isLoading } = useQuery({
    queryKey: ['performanceMetrics'],
    queryFn: () => ipcClient.getPerformanceMetrics(),
    refetchInterval: 10000,
  });

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const memory = perfData?.memory;

  return (
    <div style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('settings.startupTime')}</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
          {isLoading ? '...' : `${perfData?.startupTime || 0}ms`}
        </span>
      </div>
      {memory && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('settings.memoryUsage')}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{memory.rss} MB</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('settings.databaseSize')}</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
          {isLoading ? '...' : formatBytes(perfData?.databaseSize || 0)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('settings.sampleCount')}</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
          {isLoading ? '...' : (perfData?.sampleCount || 0).toLocaleString()}
        </span>
      </div>
    </div>
  );
};

export default PerformanceMonitor;
