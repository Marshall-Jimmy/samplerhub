/**
 * 智能重命名建议生成器
 * 根据采样元数据（分类、BPM、Key、标签）生成规范文件名
 *
 * 命名规范: {Category} - {Name} - {BPM}bpm - {Key}.{ext}
 * 例如: Kick - Hard Punch - 140bpm - Cm.wav
 */

import path from 'node:path';

export interface RenameSuggestion {
  original: string;
  suggested: string;
  confidence: number; // 0-1，建议的可信度
}

/** 清理文件名中的非法字符 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 从原始文件名提取核心名称（去除常见前缀/后缀/编号） */
function extractCoreName(fileName: string): string {
  let name = fileName;

  // 去除扩展名
  name = name.replace(/\.[^.]+$/, '');

  // 去除常见编号前缀: 001_, 01-, (1), [1] 等
  name = name.replace(/^\d{1,3}[\s_\-.)\]]+\s*/, '');

  // 去除末尾编号: _1, -2, (3)
  name = name.replace(/[\s_\-]+?\d{1,3}$/, '');

  // 去除方括号/圆括号中的 BPM/Key 信息
  name = name.replace(/[\[(]\s*\d{2,3}\s*(bpm|BPM)?\s*[\])]/g, '');
  name = name.replace(/[\[(]\s*[A-Ga-g][#b]?\s*(m|Maj|major|minor)?\s*[\])]/g, '');

  // 去除多余分隔符
  name = name.replace(/[-_]{2,}/g, '-');
  name = name.replace(/\s{2,}/g, ' ');

  return sanitizeFileName(name).trim();
}

/** 生成规范文件名建议 */
export function generateRenameSuggestion(sample: {
  fileName: string;
  category?: string | null;
  bpm?: number | null;
  key?: string | null;
  tags?: string[];
}): RenameSuggestion {
  const { fileName, category, bpm, key, tags } = sample;
  const ext = path.extname(fileName);
  const coreName = extractCoreName(fileName);

  const parts: string[] = [];

  // 分类前缀
  if (category && category !== 'Uncategorized') {
    parts.push(category);
  }

  // 核心名称
  if (coreName) {
    parts.push(coreName);
  }

  // BPM
  if (bpm && bpm > 0) {
    parts.push(`${bpm}bpm`);
  }

  // Key
  if (key) {
    parts.push(key);
  }

  const suggested = parts.length > 0
    ? sanitizeFileName(parts.join(' - ')) + ext
    : fileName;

  // 计算置信度
  let confidence = 0;
  if (category && category !== 'Uncategorized') confidence += 0.3;
  if (bpm && bpm > 0) confidence += 0.25;
  if (key) confidence += 0.25;
  if (tags && tags.length > 0) confidence += 0.1;
  if (coreName !== extractCoreName(fileName) || suggested !== fileName) confidence += 0.1;

  return {
    original: fileName,
    suggested,
    confidence: Math.min(1, confidence),
  };
}

/** 批量生成重命名建议 */
export function generateRenameSuggestions(
  samples: Array<{
    fileName: string;
    category?: string | null;
    bpm?: number | null;
    key?: string | null;
    tags?: string[];
  }>
): RenameSuggestion[] {
  return samples.map(generateRenameSuggestion);
}
