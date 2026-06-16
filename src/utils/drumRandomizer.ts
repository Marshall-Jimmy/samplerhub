/**
 * Drum Pattern Randomizer - 鼓点节拍伪随机生成器
 *
 * 基于真实鼓点编排逻辑，为每个轨道按概率随机点亮格子。
 * 不是完全随机，而是遵循音乐性约束，生成听起来像真实节拍的 pattern。
 * 支持 8/16/32 步数，概率规则会自动缩放。
 */

export interface RandomizerConfig {
  steps: number; // 总步数 (8/16/32)
}

/** 轨道类型对应的随机概率规则（基于 16 步的参考位置） */
const TRACK_RULES_16: Record<string, {
  /** 必中的步位置 (0-based, 基于16步) */
  mustHit: number[];
  /** 高概率步位置及概率 (0-1) */
  highProb: { steps: number[]; prob: number };
  /** 中概率步位置及概率 */
  midProb: { steps: number[]; prob: number };
  /** 其他位置的基础概率 */
  baseProb: number;
}> = {
  kick: {
    mustHit: [0],           // 小节第一拍必中
    highProb: { steps: [8], prob: 0.7 },           // 反拍高概率
    midProb: { steps: [4, 12], prob: 0.3 },        // 2、4拍中等概率
    baseProb: 0.15,         // 其他位置低概率
  },
  snare: {
    mustHit: [],
    highProb: { steps: [4, 12], prob: 0.85 },      // 2、4拍高概率
    midProb: { steps: [2, 6, 10, 14], prob: 0.2 }, // 切分音中等概率
    baseProb: 0.08,
  },
  hihat: {
    mustHit: [],
    highProb: { steps: [0, 4, 8, 12], prob: 0.7 }, // 每拍高概率
    midProb: { steps: [2, 6, 10, 14], prob: 0.4 }, // 八分音符中等概率
    baseProb: 0.25,         // 其他位置也较高，形成密集节奏
  },
  clap: {
    mustHit: [],
    highProb: { steps: [4, 12], prob: 0.6 },       // 2、4拍
    midProb: { steps: [8], prob: 0.3 },             // 反拍
    baseProb: 0.05,
  },
  tom: {
    mustHit: [],
    highProb: { steps: [], prob: 0 },
    midProb: { steps: [10, 11, 12, 13, 14, 15], prob: 0.2 }, // 后半小节加花
    baseProb: 0.05,
  },
  crash: {
    mustHit: [],
    highProb: { steps: [0], prob: 0.25 },           // 小节开头偶尔
    midProb: { steps: [], prob: 0 },
    baseProb: 0.02,
  },
};

/** 将 16 步参考位置映射到目标步数 */
function mapStepsToTarget(steps: number[], targetSteps: number): number[] {
  if (targetSteps === 16) return steps;
  const ratio = targetSteps / 16;
  return steps.map((s) => Math.round(s * ratio));
}

/** 获取轨道对应的规则，未知轨道使用默认规则 */
function getRule(trackId: string, steps: number) {
  const key = Object.keys(TRACK_RULES_16).find(k => trackId.toLowerCase().includes(k));
  if (!key) {
    return {
      mustHit: [] as number[],
      highProb: { steps: [] as number[], prob: 0 },
      midProb: { steps: [] as number[], prob: 0 },
      baseProb: 0.2,
    };
  }

  const rule16 = TRACK_RULES_16[key];
  return {
    mustHit: mapStepsToTarget(rule16.mustHit, steps),
    highProb: {
      steps: mapStepsToTarget(rule16.highProb.steps, steps),
      prob: rule16.highProb.prob,
    },
    midProb: {
      steps: mapStepsToTarget(rule16.midProb.steps, steps),
      prob: rule16.midProb.prob,
    },
    baseProb: rule16.baseProb,
  };
}

/**
 * 为单个轨道生成随机 steps
 * @param trackId 轨道ID（用于匹配规则）
 * @param steps 总步数
 * @returns boolean[] 每个 step 是否激活
 */
export function randomizeTrack(trackId: string, steps: number): boolean[] {
  const rule = getRule(trackId, steps);
  const result: boolean[] = Array(steps).fill(false);

  for (let i = 0; i < steps; i++) {
    // 必中
    if (rule.mustHit.includes(i)) {
      result[i] = true;
      continue;
    }

    // 高概率
    if (rule.highProb.steps.includes(i)) {
      result[i] = Math.random() < rule.highProb.prob;
      continue;
    }

    // 中概率
    if (rule.midProb.steps.includes(i)) {
      result[i] = Math.random() < rule.midProb.prob;
      continue;
    }

    // 基础概率
    result[i] = Math.random() < rule.baseProb;
  }

  return result;
}

/**
 * Loop 轨道的随机生成 — 只在开头点亮（loop 持续播放）
 * @param steps 总步数
 * @returns boolean[] 只有第 0 步为 true
 */
export function randomizeLoopTrack(steps: number): boolean[] {
  const result: boolean[] = Array(steps).fill(false);
  result[0] = true; // Loop 轨道只需要在开头触发一次
  return result;
}

/**
 * 为所有轨道生成随机 pattern
 * @param tracks 轨道列表（包含 id 和 type）
 * @returns Record<trackId, boolean[]> 每个轨道的 steps
 */
export function randomizePattern(
  tracks: Array<{ id: string; type?: string; stepCount?: number }>
): Record<string, boolean[]> {
  const result: Record<string, boolean[]> = {};
  for (const track of tracks) {
    const steps = track.stepCount || 16;
    if (track.type === 'loop') {
      result[track.id] = randomizeLoopTrack(steps);
    } else {
      result[track.id] = randomizeTrack(track.id, steps);
    }
  }
  return result;
}
