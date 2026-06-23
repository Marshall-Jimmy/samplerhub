import { getDatabase, getSqlite } from './database';
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

// ============ 预编译分类规则缓存 ============

interface CompiledRule {
  rule: ClassificationRule;
  compiledRegex?: RegExp;
  keywords?: string[];
  folderPatterns?: string[];
}

let compiledRulesCache: CompiledRule[] | null = null;
let cachedRulesRaw: ClassificationRule[] | null = null;

/**
 * 预编译分类规则：正则只编译一次，规则只排序过滤一次
 * 当传入的 rules 引用变化时重新编译
 */
function getCompiledRules(rules: ClassificationRule[]): CompiledRule[] {
  // 引用相同则复用缓存
  if (rules === cachedRulesRaw && compiledRulesCache) {
    return compiledRulesCache;
  }

  cachedRulesRaw = rules;
  compiledRulesCache = [...rules]
    .filter(r => r.isActive)
    .sort((a, b) => b.priority - a.priority)
    .map(rule => {
      const compiled: CompiledRule = { rule };
      switch (rule.ruleType) {
        case 'regex':
          try {
            compiled.compiledRegex = new RegExp(rule.pattern, 'i');
          } catch {
            // invalid regex, compiledRegex 保持 undefined → 跳过
          }
          break;
        case 'keyword':
          compiled.keywords = rule.pattern.split('|').map(k => k.trim());
          break;
        case 'folder':
          compiled.folderPatterns = rule.pattern.split('|').map(f => f.trim().toLowerCase());
          break;
      }
      return compiled;
    });

  return compiledRulesCache;
}

/**
 * 对单个采样文件进行分类，返回所有匹配的分类 ID（第一个为主分类）
 * 返回格式：{ primary: number, secondary: number[] }
 */
export function classifySample(
  fileName: string,
  filePath: string,
  rules: ClassificationRule[]
): { primary: number; secondary: number[] } {
  const lowerName = fileName.toLowerCase();
  const lowerPath = filePath.toLowerCase();

  // 提取方括号/圆括号中的类型标注，作为额外匹配源
  const bracketTypes = extractBracketTypes(fileName);
  const extendedName = bracketTypes.length > 0
    ? `${lowerName} ${bracketTypes.join(' ')}`
    : lowerName;

  // 使用预编译规则
  const compiledRules = getCompiledRules(rules);

  const matched: number[] = [];

  for (const { rule, compiledRegex, keywords, folderPatterns } of compiledRules) {
    let ruleMatched = false;

    switch (rule.ruleType) {
      case 'keyword': {
        ruleMatched = keywords!.some(kw => keywordMatches(extendedName, kw));
        break;
      }
      case 'regex': {
        if (compiledRegex) {
          ruleMatched = compiledRegex.test(extendedName);
        }
        break;
      }
      case 'folder': {
        ruleMatched = folderPatterns!.some(fp =>
          lowerPath.includes(`/${fp}/`) ||
          lowerPath.includes(`\\${fp}\\`) ||
          lowerPath.includes(`/${fp} `) ||
          lowerPath.includes(`\\${fp} `)
        );
        break;
      }
    }

    if (ruleMatched) {
      // 避免重复添加同一分类
      if (!matched.includes(rule.targetCategoryId)) {
        matched.push(rule.targetCategoryId);
      }
    }
  }

  if (matched.length === 0) {
    return { primary: 106, secondary: [] };
  }

  return { primary: matched[0], secondary: matched.slice(1) };
}

/**
 * 简化版：只返回主分类 ID（兼容旧调用方）
 */
export function classifySamplePrimary(
  fileName: string,
  filePath: string,
  rules: ClassificationRule[]
): number {
  return classifySample(fileName, filePath, rules).primary;
}

/**
 * 对所有未分类的采样进行批量分类（支持多标签）
 */
export async function classifyAllSamples(): Promise<number> {
  const db = getDatabase();
  const sqlite = getSqlite();

  const rules = await db.select().from(classificationRules) as ClassificationRule[];
  const uncategorized = await db.select().from(samples)
    .where(isNull(samples.categoryId))
    .limit(500);

  const insertTagStmt = sqlite.prepare(
    'INSERT OR IGNORE INTO sample_categories (sample_id, category_id, is_primary) VALUES (?, ?, ?)'
  );

  let classified = 0;
  sqlite.exec('BEGIN TRANSACTION');
  for (const sample of uncategorized) {
    const result = classifySample(sample.fileName, sample.filePath, rules);
    await db.update(samples)
      .set({ categoryId: result.primary })
      .where(eq(samples.id, sample.id));
    insertTagStmt.run(sample.id, result.primary, 1);
    for (const catId of result.secondary) {
      insertTagStmt.run(sample.id, catId, 0);
    }
    classified++;
  }
  sqlite.exec('COMMIT');

  return classified;
}

/**
 * 对指定采样进行分类（支持多标签）
 */
export async function classifySampleById(sampleId: number): Promise<number | null> {
  const db = getDatabase();
  const sqlite = getSqlite();

  const sample = await db.select().from(samples).where(eq(samples.id, sampleId)).get();
  if (!sample) return null;

  const rules = await db.select().from(classificationRules) as ClassificationRule[];
  const result = classifySample(sample.fileName, sample.filePath, rules);

  await db.update(samples)
    .set({ categoryId: result.primary })
    .where(eq(samples.id, sample.id));

  // 更新多标签
  sqlite.prepare('DELETE FROM sample_categories WHERE sample_id = ?').run(sampleId);
  const insertTagStmt = sqlite.prepare(
    'INSERT OR IGNORE INTO sample_categories (sample_id, category_id, is_primary) VALUES (?, ?, ?)'
  );
  insertTagStmt.run(sampleId, result.primary, 1);
  for (const catId of result.secondary) {
    insertTagStmt.run(sampleId, catId, 0);
  }

  return result.primary;
}
