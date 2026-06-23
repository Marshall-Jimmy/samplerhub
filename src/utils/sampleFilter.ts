/**
 * Sample Filter Utils - 共享的采样筛选工具
 *
 * 用于打击垫和音序器的采样选择，基于分类系统筛选。
 * 所有查询都使用 searchSamples（有 limit），避免加载全表。
 */

import { ipcClient } from '../services/ipcClient';

/** 打击垫类型到分类名称的映射 */
export const PAD_TYPE_TO_CATEGORY: Record<string, string> = {
  'Kick': 'Kick',
  'Snare': 'Snare',
  'Hi-Hat C': 'Hi-Hat',
  'Hi-Hat O': 'Hi-Hat',
  'Crash': 'Cymbal',
  'Ride': 'Cymbal',
  'Tom Hi': 'Tom',
  'Tom Mid': 'Tom',
  'Tom Lo': 'Tom',
};

/** 分类名称缓存 */
let categoryCache: Map<string, number> | null = null;

/** 获取分类名称到 ID 的映射 */
async function getCategoryMap(): Promise<Map<string, number>> {
  if (categoryCache) return categoryCache;

  const result = await ipcClient.getCategories();
  const map = new Map<string, number>();
  result.forEach((cat) => {
    map.set(cat.name.toLowerCase(), cat.id);
    map.set(cat.name, cat.id);
  });
  categoryCache = map;
  return map;
}

/**
 * 根据打击垫类型获取筛选后的采样列表
 * 使用 searchSamples 接口（有 limit），避免加载全表
 */
export async function getSamplesForPad(padName: string): Promise<Array<{ id: number; fileName: string; filePath: string }>> {
  try {
    const categoryName = PAD_TYPE_TO_CATEGORY[padName];

    if (categoryName) {
      const categoryMap = await getCategoryMap();
      const categoryId = categoryMap.get(categoryName.toLowerCase()) || categoryMap.get(categoryName);

      if (categoryId) {
        const searchResult = await ipcClient.searchSamples({
          categoryId,
          fileType: 'audio',
          limit: 200,
        });
        return searchResult.items.map((s) => ({ id: s.id, fileName: s.fileName, filePath: s.filePath }));
      }
    }

    // 没有分类映射，使用分页接口获取音频采样
    return await getAllAudioSamples();
  } catch (err) {
    console.error('[sampleFilter] Failed to get samples for pad:', padName, err);
    return [];
  }
}

/**
 * 获取所有音频采样（使用分页接口，避免加载全表）
 * 最多返回 500 条，对打击垫/音序器来说足够
 */
export async function getAllAudioSamples(): Promise<Array<{ id: number; fileName: string; filePath: string }>> {
  try {
    const result = await ipcClient.searchSamples({
      fileType: 'audio',
      limit: 500,
    });
    return result.items.map((s) => ({ id: s.id, fileName: s.fileName, filePath: s.filePath }));
  } catch (err) {
    console.error('[sampleFilter] Failed to get all audio samples:', err);
    return [];
  }
}

/**
 * 清除分类缓存（在分类数据变更时调用）
 */
export function clearCategoryCache(): void {
  categoryCache = null;
}
