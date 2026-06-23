/** 分类颜色映射 — 全局唯一来源 */

const CATEGORY_COLORS: Record<string, string> = {
  kick: '#EF4444',
  snare: '#F59E0B',
  hihat: '#EAB308',
  'open hat': '#FBBF24',
  '808 bass': '#22D3EE',
  bass: '#22D3EE',
  perc: '#A78BFA',
  vocal: '#FB7185',
  fx: '#34D399',
  'drum loop': '#F472B6',
  'top loop': '#EC4899',
  shaker: '#A3E635',
  pad: '#818CF8',
  synth: '#C084FC',
  loop: '#F472B6',
  'one shot': '#FB923C',
  rim: '#F97316',
  uncategorized: '#6B7280',
};

const FALLBACK_COLOR = '#818CF8';

/** 获取分类颜色，未匹配时返回 fallback */
export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category.toLowerCase()] || FALLBACK_COLOR;
}

export { CATEGORY_COLORS, FALLBACK_COLOR };
