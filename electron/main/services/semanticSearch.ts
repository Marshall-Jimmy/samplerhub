/**
 * 同义词扩展搜索引擎（方案 A 增强）
 *
 * 功能：
 * 1. 中英文同义词双向映射（60+ 组）
 * 2. 拼音首字母搜索（输入 "gz" → 匹配 "鼓组/kick/snare"）
 * 3. 分类名映射（输入 "鼓" → 匹配分类 "Drums" 下的所有采样）
 * 4. 模糊子串匹配（输入 "atm" → 匹配 "atmosphere/atmospheric/ambient"）
 *
 * 方案 B 预留：TextEmbeddingSearcher 接口
 * 方案 C 预留：ClapAudioSearcher 接口
 */

// ── 简易拼音引擎 ──────────────────────────────────────────────────────

/**
 * 常用汉字 → 拼音首字母映射（覆盖音乐术语高频字）
 * 使用 Map 避免重复属性名错误
 */
const PINYIN_MAP = new Map<string, string>([
  // 乐器
  ['鼓', 'g'], ['底', 'd'], ['军', 'j'], ['踩', 'c'], ['镲', 'c'], ['通', 't'],
  ['贝', 'b'], ['斯', 's'], ['钢', 'g'], ['琴', 'q'], ['吉', 'j'], ['他', 't'],
  ['小', 'x'], ['提', 't'], ['大', 'd'], ['中', 'z'], ['古', 'g'], ['筝', 'z'],
  ['琵', 'p'], ['琶', 'p'], ['笛', 'd'], ['子', 'z'], ['号', 'h'], ['喇', 'l'],
  ['叭', 'b'], ['萨', 's'], ['克', 'k'], ['风', 'f'], ['手', 's'], ['风琴', 'fq'],
  ['管', 'g'], ['弦', 'x'], ['乐', 'y'], ['器', 'q'],
  // 人声
  ['人', 'r'], ['声', 's'], ['唱', 'c'], ['歌', 'g'], ['合', 'h'], ['和', 'h'],
  ['吟', 'y'], ['叹', 't'], ['呼', 'h'], ['吸', 'x'],
  // 效果
  ['效', 'x'], ['混', 'h'], ['响', 'x'], ['延', 'y'], ['迟', 'c'], ['回', 'h'],
  ['失', 's'], ['真', 'z'], ['滤', 'l'], ['波', 'b'], ['压', 'y'], ['缩', 's'],
  ['镶', 'x'], ['边', 'b'], ['镶边', 'xb'],
  // 氛围/情绪
  ['氛', 'f'], ['围', 'w'], ['暗', 'a'], ['色', 's'], ['黑', 'h'], ['明', 'm'],
  ['亮', 'l'], ['温', 'w'], ['暖', 'n'], ['柔', 'r'], ['软', 'r'],
  ['硬', 'y'], ['重', 'z'], ['轻', 'q'], ['快', 'k'], ['慢', 'm'], ['激', 'j'],
  ['烈', 'l'], ['平', 'p'], ['静', 'j'], ['安', 'a'], ['宁', 'n'], ['紧', 'j'],
  ['张', 'z'], ['放', 'f'], ['松', 's'], ['悲', 'b'], ['伤', 's'], ['欢', 'h'],
  ['乐', 'l'], ['史', 's'], ['诗', 's'], ['电', 'd'], ['影', 'y'], ['电音', 'dy'],
  // 风格
  ['爵', 'j'], ['士', 's'], ['摇', 'y'], ['滚', 'g'], ['嘻', 'x'], ['哈', 'h'],
  ['说', 's'], ['唱', 'c'], ['雷', 'l'], ['鬼', 'g'], ['拉', 'l'], ['丁', 'd'],
  ['民', 'm'], ['族', 'z'], ['世', 's'], ['界', 'j'], ['典', 'd'],
  ['子', 'z'], ['舞', 'w'], ['曲', 'q'], ['流', 'l'],
  ['行', 'x'], ['蓝', 'l'], ['调', 'd'], ['节', 'j'], ['奏', 'z'], ['套', 't'],
  ['路', 'l'],
  // 节奏
  ['循', 'x'], ['环', 'h'], ['拍', 'p'], ['速', 's'],
  ['度', 'd'], ['半', 'b'], ['三', 's'], ['连', 'l'], ['音', 'y'],
  ['符', 'f'], ['切', 'q'], ['分', 'f'],
  // 空间/场景
  ['水', 's'], ['下', 'x'], ['太', 't'], ['空', 'k'], ['宇', 'y'], ['宙', 'z'],
  ['城', 'c'], ['市', 's'], ['街', 'j'], ['道', 'd'], ['工', 'g'], ['业', 'y'],
  ['机', 'j'], ['械', 'x'], ['自', 'z'], ['然', 'r'], ['雨', 'y'],
  ['海', 'h'], ['浪', 'l'], ['森', 's'], ['林', 'l'], ['鸟', 'n'],
  ['叫', 'j'], ['虫', 'c'], ['鸣', 'm'],
  // 其他
  ['铺', 'p'], ['底', 'd'], ['主', 'z'], ['旋', 'x'], ['律', 'l'],
  ['拨', 'b'], ['转', 'z'], ['场', 'c'], ['过', 'g'], ['渡', 'd'], ['上', 's'], ['升', 's'],
  ['降', 'j'], ['冲', 'c'], ['击', 'j'], ['噪', 'z'], ['声', 's'],
  ['白', 'b'], ['粉', 'f'], ['保', 'b'], ['低', 'd'], ['原', 'y'], ['塑', 's'],
  ['胶', 'j'],
]);

/**
 * 获取汉字的拼音首字母
 * @param char 单个汉字
 * @returns 拼音首字母（小写），非汉字返回原字符小写
 */
function getPinyinInitial(char: string): string {
  return PINYIN_MAP.get(char) || char.toLowerCase();
}

/**
 * 将中文文本转换为拼音首字母缩写
 * @param text 中文文本
 * @returns 拼音首字母字符串，例如 "底鼓" → "dg"，"踩镲" → "cc"
 */
function toPinyinInitials(text: string): string {
  return Array.from(text)
    .map(char => getPinyinInitial(char))
    .join('');
}

// ── 同义词词典 ──────────────────────────────────────────────────────────

const SYNONYM_GROUPS: string[][] = [
  // ── 鼓组 ──
  ['kick', '底鼓', '大鼓', 'bass drum', 'bd', 'kik', 'kick drum'],
  ['snare', '军鼓', '小军鼓', 'snr', 'clap', 'snare drum', 'rimshot'],
  ['hihat', 'hi-hat', '踩镲', 'hat', 'hh', 'hats', 'closed hihat', 'open hihat'],
  ['cymbal', '镲片', 'crash', 'ride', 'splash', 'china'],
  ['tom', '通鼓', 'tomtom', 'rack tom', 'floor tom'],
  ['percussion', '打击乐', 'perc', 'conga', 'bongo', 'timbale', 'timpani'],
  ['rim', '边击', 'rimshot', 'rim shot', 'cross stick'],
  ['shaker', '沙锤', 'tambourine', '铃鼓', 'maraca', 'cowbell', '三角铁', 'triangle'],
  ['clap', '拍手', '拍掌', 'handclap'],

  // ── 贝斯 ──
  ['bass', '贝斯', '低音', 'sub bass', '808', 'sub', 'bassline', 'bass line'],
  ['808', 'trap bass', '808 bass', 'tr808', '808 kick', '808 drum'],
  ['sub bass', '次低音', 'sub', 'lows', 'low end'],

  // ── 旋律/和声 ──
  ['pad', '铺底', 'pad音色', 'atmosphere', 'atmospheric', 'ambient pad', 'synth pad'],
  ['lead', '主音', 'lead音色', '旋律', 'melody', 'synth lead'],
  ['chord', '和弦', 'chords', 'progression', 'chord stab'],
  ['arp', 'arpeggio', '琶音', 'arpeggiator', 'arp synth'],
  ['pluck', '拨弦', 'plucked', 'pizzicato', 'pluck synth'],
  ['stab', '切片', 'chord stab', 'hit', 'stab hit'],
  ['piano', '钢琴', 'keys', 'keyboard', 'epiano', 'electric piano', 'rhodes', 'wurlitzer', 'clavinet'],
  ['guitar', '吉他', 'gtr', 'acoustic guitar', 'electric guitar', 'guitar lick', 'guitar riff'],
  ['strings', '弦乐', 'string', 'violin', 'cello', 'viola', 'orchestral strings', 'string section'],
  ['brass', '铜管', 'horn', 'trumpet', 'sax', 'saxophone', 'trombone', 'brass section'],
  ['flute', '长笛', 'woodwind', 'recorder', 'piccolo', 'ocarina'],
  ['organ', '风琴', 'hammond', 'b3', 'church organ', 'pipe organ'],
  ['synth', '合成器', 'synthesizer', 'synthesiser', 'synthwave', 'analog synth', 'digital synth'],
  ['bell', '铃声', 'bells', 'glockenspiel', 'marimba', 'vibraphone', 'xylophone', 'tubular bells', 'chime'],
  ['mallet', '打击键盘', 'mallets', 'marimba', 'vibraphone', 'glockenspiel'],

  // ── 人声 ──
  ['vocal', '人声', 'vocals', 'voice', 'singing', 'choir', '合唱', 'vocal chop', 'vocal sample'],
  ['adlib', 'ad-lib', '即兴', 'backup vocal', '和声', 'backing vocal', 'harmony vocal'],
  ['breath', '呼吸声', 'breath noise', 'inhale', 'exhale'],
  ['chant', '吟唱', '呐喊', 'shout', 'crowd chant'],
  ['spoken', '口语', '说话', 'spoken word', 'voiceover', 'narration'],

  // ── FX/效果 ──
  ['fx', 'effects', '音效', 'sound effect', 'sfx', 'sound design'],
  ['riser', '上升', 'rise', 'sweep up', 'buildup', 'build up', '过渡', 'transition fx'],
  ['fall', '下降', 'downfall', 'sweep down', 'drop', 'impact fx'],
  ['impact', '冲击', 'hit', 'boom', 'bang', 'whack', 'slam', 'punch'],
  ['transition', '转场', '过渡', 'sweep', 'fill', '过渡音效', 'bridge'],
  ['reverse', '反转', 'reversed', 'backwards'],
  ['reverb', '混响', 'delay', '延迟', 'echo', '回声', 'space'],
  ['distortion', '失真', 'overdrive', 'crunch', 'fuzz'],
  ['filter', '滤波', 'filtered', 'sweep filter', 'resonance'],
  ['noise', '噪声', '白噪声', 'white noise', 'pink noise', 'hiss', 'crackle'],
  ['lofi', 'lo-fi', '低保真', 'lofi hip hop', 'tape noise', 'vinyl noise'],
  ['vinyl', '黑胶', 'vinyl crackle', 'crackle', 'tape'],
  ['glitch', '故障', 'glitchy', 'digital artifact', 'stutter'],
  ['granular', '粒子', 'granular synthesis', 'grain'],
  ['tape', '磁带', 'tape stop', 'tape start', 'tape echo'],

  // ── 氛围/情绪 ──
  ['ambient', '氛围', '环境音', 'atmosphere', 'atmospheric', 'mood', 'soundscape', 'drone'],
  ['dark', '暗色', '黑暗', 'dark ambient', 'grim', 'ominous', 'sinister', 'eerie'],
  ['bright', '明亮', 'light', 'clear', 'shimmer', 'sparkle'],
  ['warm', '温暖', 'soft', '柔和', 'mellow', 'smooth', 'lush'],
  ['hard', '硬', 'heavy', 'aggressive', 'harsh', 'intense', 'brutal'],
  ['chill', '放松', 'relaxed', 'mellow', 'smooth', 'laid back', 'laid-back'],
  ['epic', '史诗', 'cinematic', '电影感', 'dramatic', 'grand', 'powerful'],
  ['happy', '快乐', 'upbeat', 'cheerful', 'positive', 'joyful', 'fun'],
  ['sad', '悲伤', 'melancholic', 'melancholy', 'emotional', 'sorrowful', 'nostalgic'],
  ['ethereal', '空灵', 'ethereal', 'dreamy', 'floating', 'celestial'],
  ['mysterious', '神秘', 'mystery', 'enigmatic', 'suspenseful'],
  ['tense', '紧张', 'tension', 'anxious', 'suspense'],
  ['hopeful', '希望', 'inspiring', 'uplifting', 'triumphant'],
  ['romantic', '浪漫', 'love', 'tender', 'gentle'],

  // ── 风格/流派 ──
  ['ethnic', '民族', 'world', 'exotic', '世界音乐', 'traditional', 'folk'],
  ['electronic', '电子', 'edm', 'techno', 'house', 'electro'],
  ['acoustic', '原声', 'organic', 'natural', 'live'],
  ['trap', 'trap', 'hip hop', 'hiphop', 'rap', 'trap soul'],
  ['r&b', 'rnb', 'soul', 'neo soul', 'motown'],
  ['jazz', '爵士', 'jazz fusion', 'smooth jazz', 'bebop'],
  ['rock', '摇滚', 'rock guitar', 'indie rock', 'alternative rock', 'punk'],
  ['reggae', '雷鬼', 'dub', 'dubstep', 'dancehall', 'ragga'],
  ['latin', '拉丁', 'reggaeton', 'bossa nova', 'samba', 'salsa', 'cumbia'],
  ['orchestral', '管弦乐', 'orchestra', 'symphonic', 'symphony', 'classical', '古典'],
  ['cinematic', '电影', 'film', 'movie', 'soundtrack', '配乐', 'score'],
  ['pop', '流行', 'pop music', 'kpop', 'k-pop', 'jpop'],
  ['funk', '放克', 'groove', 'disco', 'boogie'],
  ['blues', '蓝调', 'blues guitar', 'delta blues'],
  ['country', '乡村', 'country music', 'western'],
  ['metal', '金属', 'heavy metal', 'death metal', 'metalcore'],
  ['dnb', 'drum and bass', 'drum n bass', 'jungle', 'breakbeat'],
  ['garage', 'uk garage', 'garage house', '2step', 'grime'],
  ['deep house', 'deep house', 'tech house', 'melodic house'],
  ['future bass', 'future bass', 'future house', 'future bounce'],
  ['lofi hip hop', 'lofi hip hop', 'chillhop', 'study beats', 'lofi beats'],
  ['ambient music', 'ambient music', 'new age', 'meditation', '冥想'],

  // ── 节奏/速度 ──
  ['loop', '循环', 'loopable', 'seamless loop', 'top loop'],
  ['one shot', 'oneshot', '单次', 'one-shot', 'hit'],
  ['breakbeat', '碎拍', 'break', 'drum break', 'amen break'],
  ['trap beat', 'trap beat', 'trap hi hat', 'trap roll', 'hi hat roll'],
  ['fill', '加花', 'drum fill', 'transition fill', 'break fill'],
  ['half time', 'half time', 'half tempo', ' halftime'],
  ['double time', 'double time', 'double tempo', 'doubled'],

  // ── 空间/场景 ──
  ['underwater', '水下', 'submerged', 'deep sea'],
  ['space', '太空', 'cosmic', 'sci-fi', '科幻', 'interstellar', 'galactic'],
  ['nature', '自然', 'rain', '雨声', 'thunder', '雷声', 'wind', '风声', 'ocean', '海浪', 'forest', '森林', 'bird', '鸟叫', 'insect', '虫鸣'],
  ['urban', '城市', 'street', '街道', 'city', 'traffic', '交通'],
  ['industrial', '工业', 'factory', 'mechanical', '机械', 'machine'],
  ['war', '战争', 'battle', '战场', 'explosion', '爆炸', 'gunshot', '枪声'],
  ['horror', '恐怖', 'scary', 'creepy', 'haunted', 'ghost', '鬼'],
  ['retro', '复古', 'vintage', '80s', '90s', 'old school', 'oldschool'],
  ['futuristic', '未来', 'futuristic', 'cyberpunk', '赛博朋克'],

  // ── 音乐理论 ──
  ['major', '大调', 'happy scale'],
  ['minor', '小调', 'sad scale'],
  ['pentatonic', '五声音阶', 'pentatonic scale'],
  ['chromatic', '半音阶'],
  ['harmonic', '和声', 'harmony', 'harmonic minor'],
  ['melodic', '旋律', 'melody', 'melodic minor'],
];

// ── 分类名 → 同义词映射（搜索分类名时也能匹配到采样）───────────────────

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  'Drums': ['鼓', '鼓组', '底鼓', '军鼓', '踩镲', 'drum', 'drums', 'percussion', '打击乐'],
  'Bass': ['贝斯', '低音', 'bass', '808', 'sub bass'],
  'Pads': ['铺底', 'pad', '氛围', 'ambient', 'atmosphere'],
  'Leads': ['主音', 'lead', '旋律', 'melody'],
  'Keys': ['键盘', '钢琴', 'piano', 'keys', 'keyboard', 'epiano'],
  'Guitars': ['吉他', 'guitar', 'gtr', 'acoustic guitar'],
  'Strings': ['弦乐', 'strings', 'violin', 'cello', '管弦'],
  'Brass': ['铜管', 'brass', 'trumpet', 'sax', 'horn'],
  'Vocals': ['人声', 'vocal', 'voice', 'choir', '合唱'],
  'FX': ['音效', 'fx', 'effects', 'sfx', 'sound effect', 'transition'],
  'Loops': ['循环', 'loop', 'loops'],
  'One Shots': ['单次', 'one shot', 'oneshot', 'hit'],
  '808': ['808', 'trap bass', '808 kick', '808 drum'],
  'Hi-Hats': ['踩镲', 'hihat', 'hi-hat', 'hat', 'hh'],
  'Snares': ['军鼓', 'snare', 'snare drum'],
  'Claps': ['拍手', 'clap', 'handclap'],
  'Percussion': ['打击乐', 'percussion', 'perc', 'conga', 'bongo'],
  'Chords': ['和弦', 'chord', 'chords', 'progression'],
  'Arps': ['琶音', 'arp', 'arpeggio'],
  'Plucks': ['拨弦', 'pluck', 'plucked', 'pizzicato'],
  'Stabs': ['切片', 'stab', 'chord stab'],
  'Bells': ['铃声', 'bell', 'bells', 'glockenspiel', 'marimba'],
  'Flutes': ['长笛', 'flute', 'woodwind'],
  'Organ': ['风琴', 'organ', 'hammond'],
  'Synths': ['合成器', 'synth', 'synthesizer'],
  'Ambient': ['氛围', 'ambient', 'atmosphere', '环境音'],
  'Cinematic': ['电影', 'cinematic', 'film', '配乐', 'soundtrack'],
  'Orchestral': ['管弦乐', 'orchestral', 'orchestra', '古典'],
};

// ── 预编译索引 ──────────────────────────────────────────────────────────

/** 小写词 → 所属同义词组的所有词（包含自身） */
const synonymIndex = new Map<string, string[]>();

// 索引同义词组
for (const group of SYNONYM_GROUPS) {
  const allLower = group.map(w => w.toLowerCase());
  for (const word of allLower) {
    // 合并已有条目
    const existing = synonymIndex.get(word);
    if (existing) {
      for (const w of allLower) {
        if (!existing.includes(w)) existing.push(w);
      }
    } else {
      synonymIndex.set(word, [...allLower]);
    }
  }
}

// 索引分类名同义词
for (const [catName, syns] of Object.entries(CATEGORY_SYNONYMS)) {
  const allLower = [catName.toLowerCase(), ...syns.map(s => s.toLowerCase())];
  for (const word of allLower) {
    const existing = synonymIndex.get(word);
    if (existing) {
      for (const w of allLower) {
        if (!existing.includes(w)) existing.push(w);
      }
    } else {
      synonymIndex.set(word, [...allLower]);
    }
  }
}

// 构建拼音索引：拼音首字母 → 对应的同义词组
const pinyinIndex = new Map<string, string[]>();
for (const [word, group] of synonymIndex) {
  // 对中文词生成拼音首字母
  const initials = toPinyinInitials(word);
  if (initials !== word && initials.length >= 2) {
    const existing = pinyinIndex.get(initials);
    if (existing) {
      for (const w of group) {
        if (!existing.includes(w)) existing.push(w);
      }
    } else {
      pinyinIndex.set(initials, [...group]);
    }
  }
}

// ── 方案 A：同义词扩展搜索 ──────────────────────────────────────────────

/**
 * 将用户输入的查询词扩展为同义词列表
 *
 * 支持三种扩展方式：
 * 1. 精确匹配：输入 "kick" → 扩展为 kick/底鼓/大鼓/bass drum/bd/kik
 * 2. 拼音匹配：输入 "dg" → 匹配 "底鼓" 的拼音首字母 → 扩展为对应组
 * 3. 模糊匹配：输入 "atm" → 匹配 "atmosphere/atmospheric/ambient"
 *
 * @param query 用户原始搜索词
 * @returns 扩展后的所有同义词（去重）
 */
export function expandQueryWithSynonyms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/[\s,，、;；]+/)
    .filter(Boolean);

  const expanded = new Set<string>();

  for (const term of terms) {
    // 添加原始词
    expanded.add(term);

    // 1. 精确同义词匹配
    const exactSynonyms = synonymIndex.get(term);
    if (exactSynonyms) {
      for (const syn of exactSynonyms) {
        expanded.add(syn);
      }
    }

    // 2. 拼音首字母匹配
    const pinyinSynonyms = pinyinIndex.get(term);
    if (pinyinSynonyms) {
      for (const syn of pinyinSynonyms) {
        expanded.add(syn);
      }
    }

    // 3. 模糊子串匹配（term >= 2 字符时）
    if (term.length >= 2) {
      for (const [key, group] of synonymIndex) {
        if (key !== term && (key.includes(term) || term.includes(key))) {
          for (const syn of group) {
            expanded.add(syn);
          }
        }
      }
    }

    // 4. 拼音首字母子串匹配（term >= 2 字符时）
    if (term.length >= 2) {
      for (const [py, group] of pinyinIndex) {
        if (py !== term && (py.includes(term) || term.includes(py))) {
          for (const syn of group) {
            expanded.add(syn);
          }
        }
      }
    }
  }

  return Array.from(expanded);
}

/**
 * 将扩展后的同义词列表转换为 FTS5 查询字符串
 *
 * @param query 用户原始搜索词
 * @returns FTS5 MATCH 查询字符串，使用 OR 连接所有同义词
 */
export function buildSynonymFtsQuery(query: string): string {
  const expanded = expandQueryWithSynonyms(query);
  // 每个词使用前缀匹配 "term"*
  return expanded.map(t => `"${t}"*`).join(' OR ');
}

// ── 方案 B：文本 Embedding 搜索（预留接口）────────────────────────────

/**
 * 文本 Embedding 搜索接口
 *
 * 使用 Transformers.js 的 all-MiniLM-L6-v2 模型，
 * 将文件名+标签编码为 384 维向量，查询时计算余弦相似度。
 *
 * TODO: 实现
 * 1. 安装 @xenova/transformers
 * 2. 在后台加载模型（首次加载 ~2s，后续缓存）
 * 3. 扫描完成时为每个采样生成 embedding（存入 samples.text_embedding 字段）
 * 4. 搜索时：query → embedding → 余弦相似度排序 → 返回 top-K
 * 5. 万级以下可直接 JS 暴力算，万级以上用 sqlite-vec
 */
export interface TextEmbeddingSearcher {
  /** 初始化模型（异步，首次较慢） */
  initialize(): Promise<void>;
  /** 为单个文本生成 embedding 向量 */
  embed(text: string): Promise<number[]>;
  /** 批量生成 embedding */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** 计算两个向量的余弦相似度 */
  cosineSimilarity(a: number[], b: number[]): number;
  /** 释放模型资源 */
  dispose(): void;
}

/**
 * 构建用于 embedding 的文本
 * 将文件名 + 标签 + 分类名拼接为语义丰富的文本
 */
export function buildEmbeddingText(fileName: string, tags: string | null, categoryName: string | null): string {
  const parts: string[] = [];
  parts.push(fileName);
  if (tags) parts.push(tags);
  if (categoryName) parts.push(categoryName);
  return parts.join(' ');
}

// ── 方案 C 预留：CLAP ONNX 音频语义搜索 ────────────────────────────────

/**
 * CLAP ONNX 音频语义搜索接口（预留）
 *
 * 使用 CLAP 模型的 ONNX 版本，直接在 Node.js 中对音频文件进行语义分析。
 * 与文本 Embedding 不同，CLAP 是"听"音频内容，效果更精准。
 *
 * TODO: 实现
 * 1. 将 CLAP 模型转换为 ONNX 格式（~200MB）
 * 2. 安装 onnxruntime-node
 * 3. 实现 CLAP audio encoder 和 text encoder
 * 4. 音频 → CLAP embedding（512维）存入 samples.clap_embedding 字段
 * 5. 查询文本 → CLAP text embedding → 余弦相似度排序
 * 6. 可与 analysisQueue.ts 集成，作为高级分析的一部分
 */
export interface ClapAudioSearcher {
  /** 初始化 CLAP ONNX 模型 */
  initialize(): Promise<void>;
  /** 为音频文件生成 CLAP embedding */
  embedAudio(filePath: string): Promise<number[]>;
  /** 为文本查询生成 CLAP embedding */
  embedText(text: string): Promise<number[]>;
  /** 批量为音频文件生成 embedding */
  embedAudioBatch(filePaths: string[]): Promise<number[][]>;
  /** 计算余弦相似度 */
  cosineSimilarity(a: number[], b: number[]): number;
  /** 释放模型资源 */
  dispose(): void;
}

/**
 * 混合搜索策略枚举（预留）
 */
export type SearchStrategy = 'keyword' | 'synonym' | 'text_embedding' | 'clap' | 'hybrid';

/**
 * 混合搜索结果（预留）
 */
export interface HybridSearchResult {
  sampleId: number;
  ftsScore?: number;
  textEmbeddingScore?: number;
  clapScore?: number;
  finalScore: number;
}
