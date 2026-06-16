import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ipcClient } from '../../services/ipcClient';

interface QAIssue {
  ruleId: string;
  severity: string;
  message: string;
  sampleId: number;
  fileName: string;
}

const DeliveryQAPanel: React.FC = () => {
  const { t } = useTranslation();
  const [issues, setIssues] = useState<QAIssue[]>([]);
  const [running, setRunning] = useState(false);

  const runCheck = async () => {
    setRunning(true);
    try {
      const result = await ipcClient.runDeliveryQA([]);
      setIssues(result.issues || []);
      toast.success(`质检完成: ${result.summary.total} 个问题`);
    } catch (err: any) {
      toast.error(err.message || '质检失败');
    } finally {
      setRunning(false);
    }
  };

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  const severityColors: Record<string, string> = {
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  };

  return (
    <div style={{ padding: 16, color: 'var(--text-primary)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>交付质检</h3>
        <button
          onClick={runCheck}
          disabled={running}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: 'none',
            background: running ? 'var(--bg-active)' : 'var(--brand-primary)',
            color: running ? 'var(--text-tertiary)' : '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: running ? 'not-allowed' : 'pointer',
          }}
        >
          {running ? '检查中...' : '运行质检'}
        </button>
      </div>

      {issues.length > 0 && (
        <>
          <div style={{
            display: 'flex', gap: 16, marginBottom: 16,
            padding: '12px 16px', borderRadius: 8,
            background: 'var(--bg-active)',
          }}>
            <span style={{ color: '#ef4444' }}>❌ {errors.length}</span>
            <span style={{ color: '#f59e0b' }}>⚠️ {warnings.length}</span>
            <span style={{ color: '#3b82f6' }}>ℹ️ {infos.length}</span>
            <span style={{ color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
              共 {issues.length} 项 / 8 规则
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {issues.map((issue, idx) => (
              <div
                key={`${issue.ruleId}-${issue.sampleId}-${idx}`}
                style={{
                  display: 'flex', gap: 8, padding: '8px 12px',
                  borderBottom: '1px solid var(--border-subtle)',
                  fontSize: 12, lineHeight: 1.5,
                }}
              >
                <span style={{ color: severityColors[issue.severity], flexShrink: 0 }}>
                  {issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>{issue.message}</span>
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {issue.fileName}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {!running && issues.length === 0 && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-tertiary)', fontSize: 13,
        }}>
          点击"运行质检"检查选中采样的交付规范
        </div>
      )}
    </div>
  );
};

export default DeliveryQAPanel;
