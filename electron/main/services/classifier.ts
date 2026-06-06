import { getDatabase } from './database';
import { samples, classificationRules } from '../../../drizzle/schema';
import { eq, isNull } from 'drizzle-orm';
import type { ClassificationRule } from '../../../shared/types/sample.types';

/**
 * 从文件名中提取方括号/圆括号内的类型标注
 * 例如: "Wheezy [ Clap ].wav" → ["clap"]
 *       "(HH) Zaytoven Hat.wav" → ["hh"]
 *       "808 [Playboi Carti].wav" → [] (人名不算类型)
 */
function extractBracketTypes(fileName: string): string[] {
  const types: string[] = [];

  // 方括号内容: [Clap], [Kick], [808], [HH]
  const bracketMatches = fileName.match(/\[([^\]]+)\]/g) || [];
  for (const m of bracketMatches) {
    const inner = m.slice(1, -1).trim().toLowerCase();
    // 只保留看起来像乐器类型的标注，排除人名（含空格且长度>12的通常是人名）
    if (inner.length <= 12 && !inner.includes('©') && !inner.includes('™')) {
      types.push(inner);
    }
  }

  // 圆括号内的类型标注: (Clap), (HH), (EQ)
  const parenMatches = fileName.match(/\(([^\)]+)\)/g) || [];
  for (const m of parenMatches) {
    const inner = m.slice(1, -1).trim().toLowerCase();
    // 排除纯数字（变体编号）、处理标注等
    if (!/^\d+$/.test(inner) && inner.length <= 12) {
      types.push(inner);
    }
  }

  return types;
}

/**
 * 检查关键词是否作为独立词匹配（而非子串）
 * 例如: "hat" 应匹配 "hi-hat" 但不应匹配 "that"
 *       "rim" 应匹配 "rim shot" 但不应匹配 "primary"
 */
function keywordMatches(text: string, keyword: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerKw = keyword.toLowerCase();

  // 短关键词（<=3字符）需要边界检查，避免误匹配
  if (lowerKw.length <= 3) {
    // 用正则检查单词边界
    const escaped = lowerKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[_\\s\\-\\[\\(])${escaped}(?:$|[_\\s\\-\\]\\)])`, 'i');
    if (regex.test(lowerText)) return true;
    // 也检查连字符连接: hi-hat 中的 hat
    const hyphenRegex = new RegExp(`-${escaped}`, 'i');
    if (hyphenRegex.test(lowerText)) return true;
    return false;
  }

  return lowerText.includes(lowerKw);
}

/**
 * 对单个采样文件进行分类，返回目标分类 ID
 * 解耦设计：纯函数，不依赖数据库写入
 */
export function classifySample(
  fileName: string,
  filePath: string,
  rules: ClassificationRule[]
): number | null {
  const lowerName = fileName.toLowerCase();
  const lowerPath = filePath.toLowerCase();

  // 提取方括号/圆括号中的类型标注，作为额外匹配源
  const bracketTypes = extractBracketTypes(fileName);
  const extendedName = bracketTypes.length > 0
    ? `${lowerName} ${bracketTypes.join(' ')}`
    : lowerName;

  // 按 priority 降序排列
  const sortedRules = [...rules]
    .filter(r => r.isActive)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    let matched = false;

    switch (rule.ruleType) {
      case 'keyword': {
        const keywords = rule.pattern.split('|').map(k => k.trim());
        matched = keywords.some(kw => keywordMatches(extendedName, kw));
        break;
      }
      case 'regex': {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          matched = regex.test(extendedName);
        } catch {
          // invalid regex, skip
        }
        break;
      }
      case 'folder': {
        const folderPatterns = rule.pattern.split('|').map(f => f.trim().toLowerCase());
        matched = folderPatterns.some(fp =>
          lowerPath.includes(`/${fp}/`) ||
          lowerPath.includes(`\\${fp}\\`) ||
          lowerPath.includes(`/${fp} `) ||
          lowerPath.includes(`\\${fp} `)
        );
        break;
      }
    }

    if (matched) {
      return rule.targetCategoryId;
    }
  }

  // 未匹配任何规则，返回 "Uncategorized" (id=19)
  return 19;
}

/**
 * 对所有未分类的采样进行批量分类
 */
export async function classifyAllSamples(): Promise<number> {
  const db = getDatabase();

  const rules = await db.select().from(classificationRules) as ClassificationRule[];
  const uncategorized = await db.select().from(samples)
    .where(isNull(samples.categoryId))
    .limit(500);

  let classified = 0;
  for (const sample of uncategorized) {
    const categoryId = classifySample(sample.fileName, sample.filePath, rules);
    if (categoryId !== null) {
      await db.update(samples)
        .set({ categoryId })
        .where(eq(samples.id, sample.id));
      classified++;
    }
  }

  return classified;
}

/**
 * 对指定采样进行分类
 */
export async function classifySampleById(sampleId: number): Promise<number | null> {
  const db = getDatabase();

  const sample = await db.select().from(samples).where(eq(samples.id, sampleId)).get();
  if (!sample) return null;

  const rules = await db.select().from(classificationRules) as ClassificationRule[];
  const categoryId = classifySample(sample.fileName, sample.filePath, rules);

  if (categoryId !== null) {
    await db.update(samples)
      .set({ categoryId })
      .where(eq(samples.id, sample.id));
  }

  return categoryId;
}
