import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Progress, Button, Tooltip, Tag } from 'antd';
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ipcClient } from '../../services/ipcClient';
import type { AnalysisProgress } from '../../services/ipcClient';
import s from '../../styles/components/analysis-progress-panel.module.css';

/** 分析进度面板 Props */
interface AnalysisProgressPanelProps {
  /** 当前分析会话 ID，为 null 时不渲染 */
  sessionId: number | null;
  /** 关闭面板回调 */
  onClose: () => void;
}

/** 格式化剩余毫秒为 "Xm Xs" 格式 */
function formatRemainingTime(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/** 进度条渐变色配置 */
const progressGradient = {
  '0%': '#6366f1',
  '50%': '#8b5cf6',
  '100%': '#a78bfa',
};

/** 状态对应颜色映射 */
const statusColorMap: Record<string, string> = {
  running: 'blue',
  paused: 'orange',
  completed: 'green',
  cancelled: 'default',
};

/** 状态对应图标映射 */
const statusIconMap: Record<string, React.ReactNode> = {
  running: <ClockCircleOutlined />,
  paused: <PauseCircleOutlined />,
  completed: <CheckCircleOutlined />,
  cancelled: <CloseCircleOutlined />,
};

const AnalysisProgressPanel: React.FC<AnalysisProgressPanelProps> = ({
  sessionId,
  onClose,
}) => {
  const { t } = useTranslation();

  // 进度数据状态
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [loading, setLoading] = useState(false);

  // 轮询定时器引用
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 获取最新进度数据 */
  const fetchProgress = useCallback(async () => {
    if (sessionId === null) return;
    try {
      setLoading(true);
      const data = await ipcClient.analysis.getProgress(sessionId);
      setProgress(data);
    } catch (err) {
      console.error('[AnalysisProgressPanel] 获取进度失败:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  /** 启动轮询定时器 */
  const startPolling = useCallback(() => {
    // 清除旧定时器
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }
    // 立即获取一次
    fetchProgress();
    // 每 2 秒轮询一次
    pollTimerRef.current = setInterval(fetchProgress, 2000);
  }, [fetchProgress]);

  /** 停止轮询定时器 */
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // 监听 sessionId 变化，启动/停止轮询
  useEffect(() => {
    if (sessionId !== null) {
      startPolling();
    } else {
      stopPolling();
      setProgress(null);
    }
    return () => {
      stopPolling();
    };
  }, [sessionId, startPolling, stopPolling]);

  // 监听 IPC 进度事件，实时更新
  useEffect(() => {
    if (sessionId === null) return;
    const unsub = ipcClient.analysis.onProgress((data) => {
      // 只处理当前会话的进度事件
      if (data.sessionId === sessionId) {
        fetchProgress();
      }
    });
    return () => {
      unsub();
    };
  }, [sessionId, fetchProgress]);

  /** 暂停分析 */
  const handlePause = useCallback(async () => {
    if (sessionId === null) return;
    try {
      await ipcClient.analysis.pauseSession(sessionId);
      fetchProgress();
    } catch (err) {
      console.error('[AnalysisProgressPanel] 暂停失败:', err);
    }
  }, [sessionId, fetchProgress]);

  /** 继续分析 */
  const handleResume = useCallback(async () => {
    if (sessionId === null) return;
    try {
      await ipcClient.analysis.resumeSession(sessionId);
      fetchProgress();
    } catch (err) {
      console.error('[AnalysisProgressPanel] 继续失败:', err);
    }
  }, [sessionId, fetchProgress]);

  /** 取消分析 */
  const handleCancel = useCallback(async () => {
    if (sessionId === null) return;
    try {
      await ipcClient.analysis.cancelSession(sessionId);
      fetchProgress();
    } catch (err) {
      console.error('[AnalysisProgressPanel] 取消失败:', err);
    }
  }, [sessionId, fetchProgress]);

  // sessionId 为 null 时不渲染
  if (sessionId === null) return null;

  // 计算进度百分比
  const percent = progress
    ? progress.totalFiles > 0
      ? Math.round((progress.completedFiles / progress.totalFiles) * 100)
      : 0
    : 0;

  // 计算预估剩余时间
  const remainingMs =
    progress && progress.estimatedTimeMs !== null
      ? Math.max(0, progress.estimatedTimeMs - progress.elapsedTimeMs)
      : null;

  // 当前状态
  const status = progress?.status ?? 'running';

  // 判断是否为终态（已完成或已取消）
  const isFinished = status === 'completed' || status === 'cancelled';

  return (
    <AnimatePresence>
      <motion.div
        className={s.panel}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        {/* 顶部：状态标签 + 当前文件名 */}
        <div className={s.header}>
          <div className={s.statusArea}>
            <Tag
              color={statusColorMap[status] || 'default'}
              icon={statusIconMap[status]}
              className={s.statusTag}
            >
              {t(`analysis.${status}`)}
            </Tag>
            {progress?.currentFile && (
              <Tooltip title={progress.currentFile} placement="topLeft">
                <span className={s.currentFileLabel}>
                  <FileOutlined className={s.fileIcon} />
                  {t('analysis.currentFile')}: {progress.currentFile}
                </span>
              </Tooltip>
            )}
          </div>
        </div>

        {/* 中间：进度条 */}
        <div className={s.progressArea}>
          <Progress
            percent={percent}
            strokeColor={progressGradient}
            trailColor="rgba(255, 255, 255, 0.08)"
            size="small"
            className={s.progressBar}
          />
          <span className={s.progressText}>
            {progress
              ? `${progress.completedFiles} / ${progress.totalFiles}`
              : '-- / --'}
          </span>
        </div>

        {/* 下方三列统计 */}
        <div className={s.statsRow}>
          <div className={s.statItem}>
            <CheckCircleOutlined className={`${s.statIcon} ${s.statIconSuccess}`} />
            <span className={s.statLabel}>{t('analysis.completedCount')}</span>
            <span className={s.statValue}>
              {progress?.completedFiles ?? 0}
            </span>
          </div>
          <div className={s.statItem}>
            <WarningOutlined className={`${s.statIcon} ${s.statIconError}`} />
            <span className={s.statLabel}>{t('analysis.failedCount')}</span>
            <span className={s.statValue}>
              {progress?.failedFiles ?? 0}
            </span>
          </div>
          <div className={s.statItem}>
            <ClockCircleOutlined className={`${s.statIcon} ${s.statIconTime}`} />
            <span className={s.statLabel}>{t('analysis.remainingTime')}</span>
            <span className={s.statValue}>
              {remainingMs !== null
                ? formatRemainingTime(remainingMs)
                : '--'}
            </span>
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className={s.actions}>
          {status === 'running' && (
            <>
              <Button
                size="small"
                icon={<PauseCircleOutlined />}
                onClick={handlePause}
                className={s.actionBtn}
              >
                {t('analysis.pause')}
              </Button>
              <Button
                size="small"
                icon={<CloseCircleOutlined />}
                onClick={handleCancel}
                danger
                className={s.actionBtn}
              >
                {t('analysis.cancel')}
              </Button>
            </>
          )}
          {status === 'paused' && (
            <>
              <Button
                size="small"
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleResume}
                className={s.actionBtn}
              >
                {t('analysis.resume')}
              </Button>
              <Button
                size="small"
                icon={<CloseCircleOutlined />}
                onClick={handleCancel}
                danger
                className={s.actionBtn}
              >
                {t('analysis.cancel')}
              </Button>
            </>
          )}
          {isFinished && (
            <Button
              size="small"
              onClick={onClose}
              className={s.actionBtn}
            >
              {t('analysis.close')}
            </Button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AnalysisProgressPanel;
