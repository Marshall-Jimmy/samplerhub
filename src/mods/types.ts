/**
 * 模组系统类型定义
 */

/**
 * 当前应用支持的 Mod API 版本
 * 格式：major.minor.patch
 * - major: 不兼容变更（旧模组可能无法运行）
 * - minor: 向后兼容的新功能
 * - patch: bug 修复
 */
export const CURRENT_API_VERSION = '1.0.0';

/**
 * API 版本兼容性检查
 */
export function isApiCompatible(modApiVersion: string | undefined): {
  compatible: boolean;
  reason?: string;
  appVersion: string;
} {
  if (!modApiVersion) {
    // 未声明 apiVersion 的模组使用 legacy 模式（兼容 1.0.0 的基础 API）
    return { compatible: true, appVersion: CURRENT_API_VERSION };
  }

  const [modMajor] = modApiVersion.split('.').map(Number);
  const [appMajor] = CURRENT_API_VERSION.split('.').map(Number);

  if (modMajor > appMajor) {
    return {
      compatible: false,
      reason: `模组需要 API v${modApiVersion}，但当前应用只支持 v${CURRENT_API_VERSION}。请更新应用。`,
      appVersion: CURRENT_API_VERSION,
    };
  }

  if (modMajor < appMajor) {
    // 旧主版本：尝试向后兼容，但标记为 deprecated
    return {
      compatible: true,
      reason: `模组使用旧版 API v${modApiVersion}，部分新功能可能不可用。`,
      appVersion: CURRENT_API_VERSION,
    };
  }

  return { compatible: true, appVersion: CURRENT_API_VERSION };
}

export interface ModManifest {
  id: string;
  name: string;
  version: string;
  apiVersion?: string;  // 模组声明兼容的 API 版本
  author: string;
  description: string;
  homepage?: string;
  minAppVersion?: string;
  permissions: ModPermission[];
  entry?: {
    main?: string;
    renderer?: string;
  };
  hooks?: Record<string, boolean>;
}

export type ModPermission =
  | 'audio:engine'
  | 'audio:mixer'
  | 'audio:midi'
  | 'ui:inject'
  | 'ui:theme'
  | 'storage:read'
  | 'storage:write'
  | 'ipc:invoke'
  | 'library:read'
  | 'library:write'
  | 'network';

export interface ModInstance {
  manifest: ModManifest;
  enabled: boolean;
  code?: string;
  activate?: (api: ModAPI) => void | Promise<void>;
  deactivate?: (api: ModAPI) => void | Promise<void>;
}

export interface ModAPI {
  // 基础
  logger: ModLogger;
  notifications: ModNotifications;
  storage: ModStorage;

  // UI
  ui: ModUI;

  // 音频
  audio: ModAudio;

  // 状态
  stores: ModStores;

  // 钩子
  hooks: ModHooks;

  // 网络
  network: ModNetwork;

  // IPC（主进程）
  ipc?: ModIPC;

  // 数据库（主进程）
  db?: ModDB;
}

export interface ModLogger {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export interface ModNotifications {
  show: (title: string, options?: string | { body?: string; type?: 'info' | 'success' | 'warning' | 'error' }) => void;
}

export interface ModStorage {
  get: <T = any>(key: string) => T | undefined;
  set: <T = any>(key: string, value: T) => void;
  remove: (key: string) => void;
}

export interface ModUI {
  toolbar: {
    addButton: (config: { id: string; icon: string; tooltip: string; onClick: () => void }) => void;
    removeButton: (id: string) => void;
  };
  panel: {
    register: (config: { id: string; title: string; component: React.ComponentType; position?: 'sidebar' | 'modal' | 'floating' }) => void;
    unregister: (id: string) => void;
    open: (id: string) => void;
    close: (id: string) => void;
  };
  settings: {
    addTab: (config: { id: string; title: string; component: React.ComponentType }) => void;
    removeTab: (id: string) => void;
  };
  theme: {
    register: (theme: { id: string; name: string; variables: Record<string, string> }) => void;
    unregister: (id: string) => void;
    activate: (id: string) => void;
  };
  mixer: {
    addKnob: (config: { id: string; label: string; min: number; max: number; value: number; onChange: (value: number) => void }) => void;
    removeKnob: (id: string) => void;
  };
  /** @deprecated Use panel.register instead */
  inject?: (config: { id: string; title: string; component: React.ComponentType; position?: 'sidebar' | 'modal' | 'floating' }) => void;
}

export interface ModAudio {
  getContext: () => AudioContext | null;
  insertEffect: (id: string, node: AudioNode) => void;
  removeEffect: (id: string) => void;
  onPadTrigger: (callback: (padId: string, options: any) => void) => () => void;
  getParam: (path: string) => any;
  setParam: (path: string, value: any) => void;
  /** MIDI 预览控制 */
  midi: {
    /** 播放指定 MIDI 文件（无缝切换：同一首 toggle，不同首先停旧的） */
    play: (filePath: string) => Promise<void>;
    /** 停止当前 MIDI 播放 */
    stop: () => void;
    /** 查询指定文件是否正在播放 */
    isPlaying: (filePath: string) => boolean;
    /** 监听 MIDI 播放状态变化 */
    onStateChange: (callback: (filePath: string | null, playing: boolean) => void) => () => void;
  };
}

export interface ModStores {
  [storeName: string]: {
    getState: () => any;
    subscribe: (callback: (state: any) => void) => () => void;
  };
}

export interface ModHooks {
  register: (name: string, callback: (...args: any[]) => any) => () => void;
  unregister: (name: string, callback: (...args: any[]) => any) => void;
  emit: (name: string, ...args: any[]) => void;
}

export interface ModIPC {
  handle: (channel: string, handler: (...args: any[]) => any) => void;
  invoke: (channel: string, ...args: any[]) => Promise<any>;
}

export interface ModDB {
  query: (sql: string, params?: any[]) => Promise<any[]>;
  insert: (table: string, data: Record<string, any>) => Promise<void>;
}

export interface ModNetwork {
  get: (url: string, options?: ModRequestOptions) => Promise<ModResponse>;
  post: (url: string, data?: any, options?: ModRequestOptions) => Promise<ModResponse>;
  put: (url: string, data?: any, options?: ModRequestOptions) => Promise<ModResponse>;
  delete: (url: string, options?: ModRequestOptions) => Promise<ModResponse>;
  fetch: (url: string, init?: RequestInit) => Promise<ModResponse>;
  jsonp: (url: string, callbackParam?: string, timeout?: number) => Promise<any>;
}

export interface ModRequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  timeout?: number;
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
}

export interface ModResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  url: string;
}
