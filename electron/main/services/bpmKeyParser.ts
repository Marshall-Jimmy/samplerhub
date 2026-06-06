/**
 * BPM & Key 文件名解析模块
 * 基于采样库结构分析文档，从文件名中提取 BPM 和 Key 信息
 *
 * 核心规则：
 * 1. BPM 和 Key 在文件名中位置不固定，必须全局正则匹配
 * 2. 圆括号内纯数字是变体编号，不是 BPM
 * 3. 三位数必须带 "bpm" 字样才算 BPM
 * 4. Key 必须排除常见单词（Bass, Best, Band 等）
 * 5. 小调后缀多样：min, m, minor → 统一为 min
 * 6. 大调后缀多样：maj, major, M → 统一为 maj
 */

// ========== BPM 解析 ==========

/**
 * 从文件名中提取 BPM
 * 规则：2-3位数字 + "bpm"（不区分大小写），排除圆括号内的纯数字编号
 */
export function extractBPM(fileName: string): number | null {
  // 排除圆括号内纯数字（变体编号），如 (1), (113), (2)
  const cleaned = fileName.replace(/\(\d+\)/g, '');

  // 匹配 BPM：2-3位数字 + bpm（允许空格/下划线/连字符）
  const bpmMatch = cleaned.match(/(\d{2,3})\s*[Bb][Pp][Mm]/);
  if (bpmMatch) {
    const bpm = parseInt(bpmMatch[1], 10);
    // BPM 合理范围 40-300
    if (bpm >= 40 && bpm <= 300) {
      return bpm;
    }
  }

  return null;
}

// ========== Key 解析 ==========

// 需要排除的常见单词（音名字母可能是这些词的首字母）
const KEY_EXCLUSIONS = new Set([
  'bass', 'best', 'band', 'back', 'beat', 'big', 'bit', 'blue',
  'bar', 'bad', 'bag', 'ban', 'bat', 'bay', 'bed', 'bet', 'bid',
  'bin', 'bug', 'bus', 'but', 'buy',
  'cymbal', 'clean', 'close', 'crash', 'cut', 'cow', 'can', 'cap', 'car', 'cat',
  'deep', 'dark', 'drum', 'dist', 'dry', 'dub',
  'effect', 'electric', 'epic', 'ext',
  'fade', 'fast', 'fine', 'flat', 'flip', 'free', 'full', 'funk',
  'gate', 'glitch', 'growl',
  'hard', 'hat', 'high', 'hit', 'hot', 'huge',
  'kick', 'kit',
  'lead', 'light', 'live', 'loop', 'loud', 'low',
  'main', 'max', 'mid', 'mini', 'mix', 'mod', 'mono', 'mute',
  'new', 'noise', 'normal',
  'open', 'over',
  'pad', 'peak', 'phat', 'pitch', 'play', 'pop', 'pure', 'push',
  'raw', 'real', 'ride', 'ring', 'rise', 'riser', 'roll', 'rough',
  'sample', 'saw', 'shaker', 'sharp', 'shot', 'short', 'side', 'slap',
  'slow', 'snap', 'soft', 'solo', 'solid', 'space', 'stab', 'stem',
  'sub', 'sweet', 'synth',
  'tap', 'thick', 'thin', 'tight', 'tone', 'top', 'trap', 'tune',
  'vocal', 'voice',
  'wet', 'wide', 'wild', 'wood',
]);

/**
 * 归一化 Key 值
 * - min / m / minor → min
 * - maj / major / M → maj
 * - 保留扩展：7, maj7, min7, dim, sus 等
 */
function normalizeKey(root: string, suffix: string | null): string {
  let normalizedRoot = root;

  // 降号统一为升号表示（可选，目前保留原始）
  // Eb → D#, Ab → G#, Bb → A#, Db → C#, Gb → F#

  if (!suffix) return normalizedRoot;

  const lowerSuffix = suffix.toLowerCase().replace(/[._-]/g, '');

  // 小调
  if (lowerSuffix === 'min' || lowerSuffix === 'm' || lowerSuffix === 'minor') {
    return `${normalizedRoot}min`;
  }
  // 大调
  if (lowerSuffix === 'maj' || lowerSuffix === 'major' || lowerSuffix === 'm') {
    // 注意：单独的 "M" 可能是大调，但 "m" 通常是小调
    // 这里 "M" 大写作为大调处理
    return `${normalizedRoot}maj`;
  }
  // 扩展和弦
  if (lowerSuffix === '7' || lowerSuffix === 'maj7' || lowerSuffix === 'min7' ||
      lowerSuffix === 'm7' || lowerSuffix === 'dim' || lowerSuffix === 'sus' ||
      lowerSuffix === 'sus2' || lowerSuffix === 'sus4') {
    return `${normalizedRoot}${lowerSuffix}`;
  }

  return `${normalizedRoot}${suffix}`;
}

/**
 * 从文件名中提取 Key（调性）
 * 规则：
 * 1. 匹配 A-G + 可选升号/降号 + 可选大小调后缀
 * 2. 必须作为独立词出现，不能是其他单词的一部分
 * 3. 排除常见英文单词
 */
export function extractKey(fileName: string): string | null {
  // 去掉扩展名
  const name = fileName.replace(/\.[^.]+$/, '');

  // 策略1：匹配带大小调后缀的 Key（优先，更精确）
  // 如：Amin, C#min, Fmaj, G#m, Dmajor, Bbminor
  const suffixedPattern = /(?:^|[_\s\-\.])([A-G][#b]?)(min|minor|m|maj|major|M|dim|sus\d?|7|maj7|min7|m7)(?:$|[_\s\-\.])/gi;
  let match: RegExpExecArray | null;

  while ((match = suffixedPattern.exec(name)) !== null) {
    const root = match[1];
    const suffix = match[2];
    // 检查 root 是否被排除词覆盖（如 "Bass" 中的 B）
    // 由于匹配了后缀，Bass 不会匹配（因为 "ass" 不是有效后缀）
    return normalizeKey(root, suffix);
  }

  // 策略2：匹配带 bpm 旁边的 Key
  // 如：140bpm_C#, 94bpm_Fm, C#_160bpm
  const bpmKeyPattern1 = /\d{2,3}\s*[Bb][Pp][Mm]\s*[_\-\s]([A-G][#b]?)(min|minor|m|maj|major|M)?/i;
  const bpmKeyMatch1 = bpmKeyPattern1.exec(name);
  if (bpmKeyMatch1) {
    const root = bpmKeyMatch1[1];
    const suffix = bpmKeyMatch1[2] || null;
    // 如果没有后缀，检查后面是否有 "major"/"minor" 等词
    return normalizeKey(root, suffix);
  }

  const bpmKeyPattern2 = /([A-G][#b]?)(min|minor|m|maj|major|M)?\s*[_\-\s]*\d{2,3}\s*[Bb][Pp][Mm]/i;
  const bpmKeyMatch2 = bpmKeyPattern2.exec(name);
  if (bpmKeyMatch2) {
    const root = bpmKeyMatch2[1];
    const suffix = bpmKeyMatch2[2] || null;
    return normalizeKey(root, suffix);
  }

  // 策略3：匹配独立的纯音名字母（无后缀）
  // 如：_E_, _C#, -F, _G#
  // 必须有明确的分隔符，排除常见单词
  const pureNotePattern = /(?:^|[_\s\-\.])([A-G][#b]?)(?:$|[_\s\-\.])/g;
  const candidates: { root: string; position: number }[] = [];

  while ((match = pureNotePattern.exec(name)) !== null) {
    const root = match[1];
    const matchStart = match.index;

    // 检查这个匹配是否是某个排除词的一部分
    // 获取匹配前的字符，确认不是单词的中间部分
    const beforeChar = matchStart > 0 ? name[matchStart - 1] : '';
    const afterMatch = name.slice(matchStart + match[0].length);

    // 如果前面是字母，说明是单词的一部分（如 "Bass" 中的 B）
    if (beforeChar && /[a-zA-Z]/.test(beforeChar)) continue;

    // 如果后面紧跟字母（不是分隔符），也是单词的一部分
    if (afterMatch && /^[a-z]/i.test(afterMatch) && !/^[#b]/.test(afterMatch)) continue;

    // 排除常见单词
    // 获取匹配周围的完整单词
    const contextStart = Math.max(0, matchStart - 10);
    const contextEnd = Math.min(name.length, matchStart + match[0].length + 10);
    const context = name.slice(contextStart, contextEnd).toLowerCase();

    // 检查 root 是否是排除词的一部分
    let isExcluded = false;
    for (const exc of KEY_EXCLUSIONS) {
      if (context.includes(exc) && exc.startsWith(root.toLowerCase())) {
        isExcluded = true;
        break;
      }
    }

    if (!isExcluded) {
      candidates.push({ root, position: matchStart });
    }
  }

  // 如果有多个候选，优先选择带升号/降号的（更可能是调性标注）
  if (candidates.length > 0) {
    const sharpFlat = candidates.find(c => c.root.length > 1);
    if (sharpFlat) return sharpFlat.root;

    // 只有一个候选时直接返回
    if (candidates.length === 1) return candidates[0].root;

    // 多个候选时，优先选择位置靠后的（文件名中后面的字母更可能是调性标注）
    // 但要排除文件名开头的（通常是分类名如 "Bass_"）
    const laterCandidates = candidates.filter(c => c.position > name.length * 0.3);
    if (laterCandidates.length > 0) return laterCandidates[0].root;

    return candidates[candidates.length - 1].root;
  }

  return null;
}

/**
 * 从文件名中同时提取 BPM 和 Key
 */
export function extractBPMAndKey(fileName: string): { bpm: number | null; key: string | null } {
  return {
    bpm: extractBPM(fileName),
    key: extractKey(fileName),
  };
}
