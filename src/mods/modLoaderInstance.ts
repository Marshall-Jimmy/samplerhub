/**
 * ModLoader 全局单例
 * 在应用启动时创建，但延迟加载已保存的 Mod 到浏览器空闲时，
 * 避免阻塞首屏渲染
 */

import { createModAPI } from './createModAPI';
import { ModLoader } from './ModLoader';

// 将常用库挂载到全局，供 Mod 的 Function 沙箱访问
// Tone 和 React 由 main.tsx 异步加载后挂载到 window，此处不重复导入

const modAPI = createModAPI('core');
export const modLoader = new ModLoader(modAPI);

// 延迟到浏览器空闲时加载已保存的 Mod，避免阻塞首屏
export function initModLoader(): void {
  const doLoad = () => {
    modLoader.loadSavedMods().catch(err => {
      console.warn('[ModLoader] Failed to load saved mods on startup:', err);
    });
  };

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(doLoad, { timeout: 3000 });
  } else {
    // 降级：延迟 1 秒执行
    setTimeout(doLoad, 1000);
  }
}