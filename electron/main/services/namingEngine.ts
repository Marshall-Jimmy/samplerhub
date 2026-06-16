export interface NamingToken {
  key: string;
  label: string;
  type: 'auto' | 'select' | 'input' | 'number';
  options?: string[];
}

/** 命名模板 Token 定义 */
export const NAMING_TOKENS: NamingToken[] = [
  { key: 'CAT', label: 'UCS 主类', type: 'auto' },
  { key: 'SUB', label: 'UCS 子类', type: 'auto' },
  { key: 'MATERIAL', label: '材质', type: 'select', options: ['METAL','WOOD','STONE','GLASS','WATER','FABRIC','FLESH','PLASTIC','EARTH'] },
  { key: 'ACTION', label: '动作', type: 'input' },
  { key: 'VAR', label: '变体号', type: 'number' },
  { key: 'CHANNEL', label: '声道', type: 'select', options: ['MONO','STEREO'] },
  { key: 'RATE', label: '采样率', type: 'select', options: ['44K','48K','96K'] },
];

/** 默认命名模板 */
export const DEFAULT_NAMING_TEMPLATE = '{CAT}_{SUB}_{VAR}_{CHANNEL}';

/** 编译命名模板 */
export function compileNamingTemplate(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || key);
}

/** 根据 UCS 分类和元数据建议文件名 */
export function suggestName(
  sample: { channels?: number; sampleRate?: number; file_name?: string },
  ucsMatch?: { catCode?: string; subCode?: string } | null
): string {
  const cat = ucsMatch?.catCode || 'SFX';
  const sub = ucsMatch?.subCode
    ? ucsMatch.subCode.replace(cat + '_', '')
    : '';
  const ch = sample.channels === 1 ? 'MONO' : (sample.channels && sample.channels >= 2 ? 'STEREO' : '');
  const rate = sample.sampleRate === 48000 ? '48K'
    : sample.sampleRate === 44100 ? '44K'
    : sample.sampleRate === 96000 ? '96K'
    : '';

  const parts = [cat];
  if (sub) parts.push(sub);
  parts.push('01');
  if (ch) parts.push(ch);
  if (rate) parts.push(rate);

  const ext = (sample.file_name || '').split('.').pop() || 'wav';
  return parts.join('_') + '.' + ext;
}

/** 批量生成重命名建议 */
export async function generateBatchRename(
  db: any, // Database.Database
  sampleIds: number[],
  template: string = DEFAULT_NAMING_TEMPLATE
): Promise<Array<{ sampleId: number; oldName: string; newName: string; ext: string }>> {
  const results: Array<{ sampleId: number; oldName: string; newName: string; ext: string }> = [];

  for (const id of sampleIds) {
    const sample = db.prepare('SELECT id, file_name, channels, sample_rate FROM samples WHERE id = ?').get(id) as any;
    if (!sample) continue;

    const ucsTag = db.prepare(`
      SELECT uc.cat_code, us.code as sub_code
      FROM sample_ucs_tags sut
      JOIN ucs_subcategories us ON sut.ucs_sub_id = us.id
      JOIN ucs_categories uc ON sut.ucs_cat_id = uc.id
      WHERE sut.sample_id = ? AND sut.is_confirmed = 1
      ORDER BY sut.confidence DESC LIMIT 1
    `).get(id) as any;

    const oldExt = sample.file_name.split('.').pop() || 'wav';
    const values: Record<string, string> = {
      CAT: ucsTag?.cat_code || 'SFX',
      SUB: ucsTag?.sub_code?.replace(ucsTag?.cat_code + '_', '') || '',
      CHANNEL: sample.channels === 1 ? 'MONO' : 'STEREO',
      RATE: sample.sample_rate === 48000 ? '48K' : sample.sample_rate === 44100 ? '44K' : '',
      VAR: '01',
      ACTION: '',
      MATERIAL: '',
    };

    const newBase = compileNamingTemplate(template, values).replace(/_{2,}/g, '_').replace(/^_|_$/g, '');
    results.push({
      sampleId: id,
      oldName: sample.file_name,
      newName: `${newBase}.${oldExt}`,
      ext: oldExt,
    });
  }

  return results;
}
