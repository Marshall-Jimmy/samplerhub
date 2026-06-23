import React from 'react';
import { Divider } from 'antd';
import { useTranslation } from 'react-i18next';
import { DashboardOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { ipcClient } from '../../services/ipcClient';

const PerformancePanel: React.FC = () => {
  const { t } = useTranslation();
  const { data: perfData, isLoading } = useQuery({
    queryKey: ['performanceMetrics'],
    queryFn: () => ipcClient.getPerformanceMetrics(),
    refetchInterval: 5000,
  });

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const metrics = perfData?.metrics || {};
  const memory = perfData?.memory;

  return (
    <div id="tabpanel-performance" role="tabpanel" aria-labelledby="tab-performance" style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0' }}>
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <DashboardOutlined style={{ color: 'var(--brand-primary)', fontSize: 14 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.performance')}</span>
        </div>

        <div style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 启动时间 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.startupTime')}</span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
              {isLoading ? t('common.loading') : `${perfData?.startupTime || 0}ms`}
            </span>
          </div>

          {/* 内存占用 */}
          {memory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.memoryUsage')}</span>
                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{memory.rss} MB (RSS)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <span>Heap Used: {memory.heapUsed} MB</span>
                  <span>Heap Total: {memory.heapTotal} MB</span>
                </div>
                <div style={{ width: '100%', height: 4, background: 'var(--bg-active)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min((memory.heapUsed / memory.heapTotal) * 100, 100)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #6366f1, #22d3ee)',
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            </div>
          )}

          {/* 数据库大小 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.databaseSize')}</span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
              {isLoading ? t('common.loading') : formatBytes(perfData?.databaseSize || 0)}
            </span>
          </div>

          {/* 采样数量 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.sampleCount')}</span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
              {isLoading ? t('common.loading') : (perfData?.sampleCount || 0).toLocaleString()}
            </span>
          </div>

          {/* 详细指标 */}
          {Object.keys(metrics).length > 0 && (
            <>
              <Divider style={{ margin: '8px 0', borderColor: 'var(--border-subtle)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>{t('settings.detailedMetrics')}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(metrics).map(([key, value]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-active)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{key}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{value as number}ms</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

    </div>
  );
};

export default PerformancePanel;
