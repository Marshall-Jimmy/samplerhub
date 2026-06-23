export interface QARule {
  id: string;
  label: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  check: (sample: any, meta: any) => QAIssue | null;
}

export interface QAIssue {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  sampleId: number;
  fileName: string;
}

/** 交付质检规则集 */
export const QA_RULES: QARule[] = [
  {
    id: 'sample-rate-48k',
    label: '采样率应为 48kHz',
    description: '专业游戏音频交付要求 48kHz',
    severity: 'warning',
    check: (sample) => {
      if (sample.sample_rate && sample.sample_rate !== 48000 && sample.file_type === 'audio') {
        return {
          ruleId: 'sample-rate-48k', severity: 'warning',
          message: `采样率 ${sample.sample_rate}Hz → 建议转换为 48kHz`,
          sampleId: sample.id, fileName: sample.file_name,
        };
      }
      return null;
    },
  },
  {
    id: 'bit-depth-24',
    label: '位深应为 24bit',
    description: '专业交付要求 24bit',
    severity: 'warning',
    check: (_, meta) => {
      if (meta?.bit_depth && meta.bit_depth < 24 && meta.bit_depth > 0) {
        return {
          ruleId: 'bit-depth-24', severity: 'warning',
          message: `位深 ${meta.bit_depth}bit → 建议使用 24bit`,
          sampleId: meta.sample_id, fileName: '',
        };
      }
      return null;
    },
  },
  {
    id: 'stereo-short',
    label: '短音效应为 Mono',
    description: '1.2s 以内的 oneshot 用 Stereo 浪费运行时内存',
    severity: 'warning',
    check: (sample) => {
      if (sample.channels > 1 && sample.duration > 0 && sample.duration < 1.2 && sample.file_type === 'audio') {
        return {
          ruleId: 'stereo-short', severity: 'warning',
          message: `立体声但时长仅 ${sample.duration.toFixed(1)}s → 建议转换为 Mono`,
          sampleId: sample.id, fileName: sample.file_name,
        };
      }
      return null;
    },
  },
  {
    id: 'dc-offset',
    label: 'DC Offset 检测',
    description: '直流偏移 > 0.01 会导致削波和扬声器损伤',
    severity: 'error',
    check: (_, meta) => {
      if (meta?.dc_offset != null && meta.dc_offset > 0.01) {
        return {
          ruleId: 'dc-offset', severity: 'error',
          message: `检测到 DC offset = ${meta.dc_offset.toFixed(4)} → 需移除直流偏移`,
          sampleId: meta.sample_id, fileName: '',
        };
      }
      return null;
    },
  },
  {
    id: 'tail-silence',
    label: '尾部静音过长',
    description: '尾部静音 > 500ms 浪费内存和加载时间',
    severity: 'info',
    check: (_, meta) => {
      if (meta?.trailing_silence_sec != null && meta.trailing_silence_sec > 0.5) {
        return {
          ruleId: 'tail-silence', severity: 'info',
          message: `尾部静音 ${meta.trailing_silence_sec.toFixed(1)}s → 建议裁剪`,
          sampleId: meta.sample_id, fileName: '',
        };
      }
      return null;
    },
  },
  {
    id: 'leading-silence',
    label: '前导静音过长',
    description: '前导静音 > 100ms 增加加载延迟',
    severity: 'info',
    check: (_, meta) => {
      if (meta?.leading_silence_sec != null && meta.leading_silence_sec > 0.1) {
        return {
          ruleId: 'leading-silence', severity: 'info',
          message: `前导静音 ${meta.leading_silence_sec.toFixed(1)}s → 建议裁剪`,
          sampleId: meta.sample_id, fileName: '',
        };
      }
      return null;
    },
  },
  {
    id: 'naming-final',
    label: '命名含 FINAL',
    description: '文件名含 "FINAL" 通常意味着版本管理不规范',
    severity: 'info',
    check: (sample) => {
      if (sample.file_name && /FINAL|final/i.test(sample.file_name)) {
        return {
          ruleId: 'naming-final', severity: 'info',
          message: `文件名含 "FINAL" → 建议使用版本号代替`,
          sampleId: sample.id, fileName: sample.file_name,
        };
      }
      return null;
    },
  },
  {
    id: 'lufs-consistency',
    label: '响度一致性检查',
    description: 'LUFS 偏离 -18dB 超过 6dB 建议归一化',
    severity: 'info',
    check: (_, meta) => {
      if (meta?.lufs_integrated != null) {
        const deviation = Math.abs(meta.lufs_integrated - (-18));
        if (deviation > 6) {
          return {
            ruleId: 'lufs-consistency', severity: 'info',
            message: `LUFS = ${meta.lufs_integrated.toFixed(1)} (偏离-18dB 约 ${deviation.toFixed(1)}dB) → 建议响度归一化`,
            sampleId: meta.sample_id, fileName: '',
          };
        }
      }
      return null;
    },
  },
];

/** 对指定采样列表运行质检 */
export function runQACheck(db: any, sampleIds: number[]): QAIssue[] {
  const issues: QAIssue[] = [];

  for (const id of sampleIds) {
    const sample = db.prepare(
      'SELECT id, file_name, file_type, duration, channels, sample_rate FROM samples WHERE id = ?'
    ).get(id) as any;

    if (!sample) continue;

    const meta = db.prepare(
      'SELECT * FROM game_metadata WHERE sample_id = ?'
    ).get(id) as any;

    for (const rule of QA_RULES) {
      const issue = rule.check(sample, meta);
      if (issue) {
        if (!issue.fileName) issue.fileName = sample.file_name || `sample_${id}`;
        issues.push(issue);
      }
    }
  }

  return issues;
}

/** 获取质检问题汇总 */
export function getQASummary(issues: QAIssue[]) {
  return {
    total: issues.length,
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
    infos: issues.filter(i => i.severity === 'info').length,
  };
}
