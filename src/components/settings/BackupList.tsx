import React from 'react';
import { Button, Popconfirm } from 'antd';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CloudDownloadOutlined } from '@ant-design/icons';
import { handleIpcError } from '../../utils/ipcError';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ipcClient } from '../../services/ipcClient';

const BackupList: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: backups = [], isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => ipcClient.listBackups(),
    refetchOnMount: true,
  });

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (isoStr: string): string => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString();
    } catch {
      return isoStr;
    }
  };

  if (isLoading) {
    return <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>{t('settings.loading')}</span>;
  }

  if (backups.length === 0) {
    return <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>{t('settings.noBackups')}</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {backups.map((backup: { name: string; size: number; createdAt: string }) => (
        <div
          key={backup.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {formatDate(backup.createdAt)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {formatSize(backup.size)}
            </span>
          </div>
          <Popconfirm
            title={t('settings.restoreConfirm')}
            onConfirm={async () => {
              try {
                const result = await ipcClient.restoreBackup(backup.name);
                if (result.success) {
                  toast.success(t('settings.restoreSuccess'));
                } else {
                  toast.error(result.error || t('settings.restoreFailed'));
                }
              } catch (err) {
                handleIpcError(err, t('settings.restoreFailed'));
              }
            }}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button
              type="text"
              size="small"
              icon={<CloudDownloadOutlined />}
              title={t('settings.restore')}
              style={{ fontSize: 11, flexShrink: 0, marginLeft: 8 }}
            />
          </Popconfirm>
        </div>
      ))}
    </div>
  );
};

export default BackupList;
