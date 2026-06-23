/**
 * AnalysisPlanDialog - 分析方案选择对话框
 *
 * 在用户导入新文件后弹出，让用户选择分析方案。
 * 提供 4 种预设方案（快速 / 均衡 / 全面 / 自定义），
 * 选择自定义时可逐项开关 CLAP、PANNs、Essentia 并调整并发数。
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Radio, Card, Typography, Slider, Switch } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation, Trans } from 'react-i18next';
import { ClockCircleOutlined, ThunderboltOutlined, ExperimentOutlined, SettingOutlined } from '@ant-design/icons';
import { ipcClient } from '../../services/ipcClient';
import type { AnalysisConfig } from '../../services/ipcClient';
import s from '../../styles/components/analysis-plan-dialog.module.css';

const { Text } = Typography;

/* ── Props 接口 ── */
interface AnalysisPlanDialogProps {
  open: boolean;
  fileCount: number;
  sampleIds: number[];
  onConfirm: (config: AnalysisConfig) => void;
  onSkip: () => void;
  onCancel: () => void;
}

/* ── 预设方案类型 ── */
type PresetKey = 'quick' | 'balanced' | 'thorough' | 'custom';

/* ── 各预设方案对应的配置 ── */
const PRESET_CONFIGS: Record<PresetKey, AnalysisConfig> = {
  quick: { enableCLAP: true, enablePANNs: false, enableEssentia: false, concurrency: 2 },
  balanced: { enableCLAP: true, enablePANNs: true, enableEssentia: false, concurrency: 2 },
  thorough: { enableCLAP: true, enablePANNs: true, enableEssentia: true, concurrency: 2 },
  custom: { enableCLAP: true, enablePANNs: true, enableEssentia: true, concurrency: 2 },
};

/* ── 预设方案图标映射 ── */
const PRESET_ICONS: Record<PresetKey, React.ReactNode> = {
  quick: <ThunderboltOutlined />,
  balanced: <ExperimentOutlined />,
  thorough: <ClockCircleOutlined />,
  custom: <SettingOutlined />,
};

/* ── 动画配置 ── */
const panelVariants = {
  hidden: { opacity: 0, height: 0, marginTop: 0 },
  visible: { opacity: 1, height: 'auto', marginTop: 16, transition: { duration: 0.25, ease: 'easeInOut' as const } },
  exit: { opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.2, ease: 'easeInOut' as const } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.3, ease: 'easeOut' as const },
  }),
};

const AnalysisPlanDialog: React.FC<AnalysisPlanDialogProps> = ({
  open,
  fileCount,
  sampleIds,
  onConfirm,
  onSkip,
  onCancel,
}) => {
  const { t } = useTranslation('analysis');

  /* ── 当前选中的预设方案 ── */
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>('balanced');

  /* ── 自定义配置状态 ── */
  const [customConfig, setCustomConfig] = useState<AnalysisConfig>(PRESET_CONFIGS.custom);

  /* ── 各方案的预估时间缓存 ── */
  const [estimatedTimes, setEstimatedTimes] = useState<Record<PresetKey, string | null>>({
    quick: null,
    balanced: null,
    thorough: null,
    custom: null,
  });

  /* ── 是否正在加载预估时间 ── */
  const [loadingTimes, setLoadingTimes] = useState<Record<PresetKey, boolean>>({
    quick: false,
    balanced: false,
    thorough: false,
    custom: false,
  });

  /* ── 当对话框打开时，重置状态并请求预估时间 ── */
  useEffect(() => {
    if (!open) return;

    // 重置为默认选中均衡方案
    setSelectedPreset('balanced');
    setCustomConfig(PRESET_CONFIGS.custom);
    setEstimatedTimes({ quick: null, balanced: null, thorough: null, custom: null });

    // 请求各预设方案的预估时间
    const presets: PresetKey[] = ['quick', 'balanced', 'thorough'];
    presets.forEach((key) => {
      setLoadingTimes((prev) => ({ ...prev, [key]: true }));
      ipcClient.analysis
        .estimateTime(fileCount, PRESET_CONFIGS[key])
        .then((res) => {
          setEstimatedTimes((prev) => ({ ...prev, [key]: res.formattedTime }));
        })
        .catch(() => {
          setEstimatedTimes((prev) => ({ ...prev, [key]: null }));
        })
        .finally(() => {
          setLoadingTimes((prev) => ({ ...prev, [key]: false }));
        });
    });
  }, [open, fileCount]);

  /* ── 当自定义配置变化时，请求自定义方案的预估时间 ── */
  useEffect(() => {
    if (!open || selectedPreset !== 'custom') return;

    setLoadingTimes((prev) => ({ ...prev, custom: true }));
    const debounceTimer = setTimeout(() => {
      ipcClient.analysis
        .estimateTime(fileCount, customConfig)
        .then((res) => {
          setEstimatedTimes((prev) => ({ ...prev, custom: res.formattedTime }));
        })
        .catch(() => {
          setEstimatedTimes((prev) => ({ ...prev, custom: null }));
        })
        .finally(() => {
          setLoadingTimes((prev) => ({ ...prev, custom: false }));
        });
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [open, selectedPreset, fileCount, customConfig]);

  /* ── 获取当前最终配置 ── */
  const currentConfig = useMemo<AnalysisConfig>(() => {
    if (selectedPreset === 'custom') return customConfig;
    return PRESET_CONFIGS[selectedPreset];
  }, [selectedPreset, customConfig]);

  /* ── 切换预设方案 ── */
  const handlePresetChange = useCallback((key: PresetKey) => {
    setSelectedPreset(key);
  }, []);

  /* ── 更新自定义配置中的开关 ── */
  const handleToggleCustom = useCallback((field: keyof Pick<AnalysisConfig, 'enableCLAP' | 'enablePANNs' | 'enableEssentia'>) => {
    setCustomConfig((prev) => ({ ...prev, [field]: !prev[field] }));
  }, []);

  /* ── 更新自定义配置中的并发数 ── */
  const handleConcurrencyChange = useCallback((value: number) => {
    setCustomConfig((prev) => ({ ...prev, concurrency: value }));
  }, []);

  /* ── 确认开始分析 ── */
  const handleConfirm = useCallback(() => {
    onConfirm(currentConfig);
  }, [onConfirm, currentConfig]);

  /* ── 渲染预估时间标签 ── */
  const renderEstimatedTime = (key: PresetKey) => {
    if (loadingTimes[key]) {
      return (
        <span className={`${s.estimatedTime} ${s.estimatedTimeLoading}`}>
          <ClockCircleOutlined /> ...
        </span>
      );
    }
    if (estimatedTimes[key]) {
      return (
        <span className={s.estimatedTime}>
          <ClockCircleOutlined /> {estimatedTimes[key]}
        </span>
      );
    }
    return null;
  };

  /* ── 预设方案列表 ── */
  const presetKeys: PresetKey[] = ['quick', 'balanced', 'thorough', 'custom'];

  return (
    <Modal
      open={open}
      title={t('planTitle')}
      onCancel={onCancel}
      footer={null}
      width={560}
      centered
      destroyOnClose
      // 覆盖 antd Modal 默认样式以适配暗色主题
      styles={{
        mask: { backdropFilter: 'blur(4px)' },
      }}
    >
      {/* 描述文字 */}
      <div className={s.description}>
        <Trans i18nKey="planDescription" ns="analysis" values={{ count: fileCount }}>
          已导入 <span className={s.fileCount}>{fileCount}</span> 个文件，选择分析方案以获得更好的搜索和分类体验
        </Trans>
      </div>

      {/* 预设方案卡片网格 */}
      <Radio.Group
        value={selectedPreset}
        onChange={(e) => handlePresetChange(e.target.value)}
        style={{ width: '100%' }}
      >
        <div className={s.presetGrid}>
          {presetKeys.map((key, index) => (
            <motion.div
              key={key}
              custom={index}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
              <Radio value={key} style={{ display: 'none' }} />
              <div
                className={`${s.presetCard} ${selectedPreset === key ? s.presetCardSelected : ''}`}
                onClick={() => handlePresetChange(key)}
              >
                {/* 标题行 */}
                <div className={s.presetHeader}>
                  <span style={{ fontSize: 18, color: selectedPreset === key ? 'var(--brand-primary)' : 'var(--text-tertiary)' }}>
                    {PRESET_ICONS[key]}
                  </span>
                  <span className={s.presetTitle}>{t(`preset${key.charAt(0).toUpperCase() + key.slice(1)}`)}</span>
                </div>

                {/* 描述 */}
                <div className={s.presetDesc}>
                  {t(`preset${key.charAt(0).toUpperCase() + key.slice(1)}Desc`)}
                </div>

                {/* 预估时间 */}
                {renderEstimatedTime(key)}
              </div>
            </motion.div>
          ))}
        </div>
      </Radio.Group>

      {/* 自定义配置面板（仅在选择 Custom 时显示） */}
      <AnimatePresence>
        {selectedPreset === 'custom' && (
          <motion.div
            key="custom-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ overflow: 'hidden' }}
          >
            <div className={s.customPanel}>
              <div className={s.customPanelTitle}>{t('presetCustom')}</div>

              {/* CLAP 开关 */}
              <div className={s.customSection}>
                <div className={s.analysisItem}>
                  <Switch
                    checked={customConfig.enableCLAP}
                    onChange={() => handleToggleCustom('enableCLAP')}
                    size="small"
                  />
                  <div className={s.analysisItemInfo}>
                    <div className={s.analysisItemName}>{t('clap')}</div>
                    <div className={s.analysisItemDesc}>{t('clapDesc')}</div>
                  </div>
                </div>
              </div>

              {/* PANNs 开关 */}
              <div className={s.customSection}>
                <div className={s.analysisItem}>
                  <Switch
                    checked={customConfig.enablePANNs}
                    onChange={() => handleToggleCustom('enablePANNs')}
                    size="small"
                  />
                  <div className={s.analysisItemInfo}>
                    <div className={s.analysisItemName}>{t('panns')}</div>
                    <div className={s.analysisItemDesc}>{t('pannsDesc')}</div>
                  </div>
                </div>
              </div>

              {/* Essentia 开关 */}
              <div className={s.customSection}>
                <div className={s.analysisItem}>
                  <Switch
                    checked={customConfig.enableEssentia}
                    onChange={() => handleToggleCustom('enableEssentia')}
                    size="small"
                  />
                  <div className={s.analysisItemInfo}>
                    <div className={s.analysisItemName}>{t('essentia')}</div>
                    <div className={s.analysisItemDesc}>{t('essentiaDesc')}</div>
                  </div>
                </div>
              </div>

              {/* 并发数 Slider */}
              <div className={s.customSection}>
                <div className={s.concurrencySection}>
                  <div className={s.concurrencyHeader}>
                    <span className={s.concurrencyLabel}>{t('concurrency')}</span>
                    <span className={s.concurrencyValue}>{customConfig.concurrency}</span>
                  </div>
                  <Slider
                    min={1}
                    max={4}
                    step={1}
                    value={customConfig.concurrency}
                    onChange={handleConcurrencyChange}
                    tooltip={{ formatter: (v) => `${v}` }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部操作按钮 */}
      <div className={s.footerActions}>
        <button
          className="ant-btn"
          onClick={onSkip}
          style={{ marginRight: 'auto' }}
        >
          {t('skip')}
        </button>
        <button className="ant-btn" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className="ant-btn ant-btn-primary"
          onClick={handleConfirm}
        >
          {t('startAnalysis')}
        </button>
      </div>
    </Modal>
  );
};

export default AnalysisPlanDialog;
