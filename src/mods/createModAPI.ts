/**
 * 创建完整的 ModAPI 实例
 * 将应用的核心功能暴露给模组系统
 */

import { modUIRegistry } from './modUIRegistry';
import { createModNetwork } from './ModNetwork';
import { usePlayerStore } from '../stores/playerStore';
import { useLibraryStore } from '../stores/libraryStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePadStore } from '../stores/padStore';
import { useProfileStore } from '../stores/profileStore';
import { ipcClient } from '../services/ipcClient';
import { toast } from 'sonner';
import { midiPlay, midiStop, midiIsPlaying } from '../hooks/useMidiPreview';
import type { ModAPI, ModLogger, ModStorage } from './types';
import { CURRENT_API_VERSION, isApiCompatible } from './types';

const MOD_STORAGE_PREFIX = 'mod:data:';

function createModStorage(): ModStorage {
  return {
    get: <T = any>(key: string): T | undefined => {
      try {
        const data = localStorage.getItem(`${MOD_STORAGE_PREFIX}${key}`);
        return data ? JSON.parse(data) : undefined;
      } catch {
        return undefined;
      }
    },
    set: <T = any>(key: string, value: T): void => {
      localStorage.setItem(`${MOD_STORAGE_PREFIX}${key}`, JSON.stringify(value));
    },
    remove: (key: string): void => {
      localStorage.removeItem(`${MOD_STORAGE_PREFIX}${key}`);
    },
  };
}

function createModLogger(modId: string): ModLogger {
  const prefix = `[Mod:${modId}]`;
  return {
    info: (...args: any[]) => console.log(prefix, ...args),
    warn: (...args: any[]) => console.warn(prefix, ...args),
    error: (...args: any[]) => console.error(prefix, ...args),
  };
}

// ── Audio Effect Chain ──
// 模组可以通过此接口在 Howl 和扬声器之间插入 Web Audio 效果器
let globalAudioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
const effectNodes = new Map<string, AudioNode>();

function getOrCreateAudioContext(): AudioContext | null {
  if (!globalAudioContext) {
    try {
      globalAudioContext = new AudioContext();
      masterGain = globalAudioContext.createGain();
      masterGain.connect(globalAudioContext.destination);
    } catch {
      return null;
    }
  }
  return globalAudioContext;
}

// 全局事件总线（用于 hooks 系统）
const globalEventBus = new Map<string, Set<(...args: any[]) => any>>();

function emitGlobalEvent(name: string, ...args: any[]) {
  const listeners = globalEventBus.get(name);
  if (listeners) {
    listeners.forEach(cb => {
      try { cb(...args); } catch (e) { console.error(`[ModHook] ${name} error:`, e); }
    });
  }
}

// 将事件总线暴露给应用代码，供其在关键位置发射事件
if (typeof window !== 'undefined') {
  (window as any).__modEventBus = {
    emit: emitGlobalEvent,
  };
}

// ── Stores 包装器 ──
// 只暴露 getState 和 subscribe，不暴露 setState（防止模组直接修改状态）
function createStoreProxy<T extends Record<string, any>>(
  name: string,
  store: { getState: () => T; subscribe: (cb: (state: T) => void) => () => void },
  allowedKeys?: string[]
): { getState: () => Partial<T>; subscribe: (cb: (state: Partial<T>) => void) => () => void } {
  const filterState = (state: T): Partial<T> => {
    if (!allowedKeys) return state;
    const filtered: Partial<T> = {};
    for (const key of allowedKeys) {
      if (key in state) (filtered as any)[key] = state[key];
    }
    return filtered;
  };

  return {
    getState: () => filterState(store.getState()),
    subscribe: (cb) => store.subscribe((state) => cb(filterState(state))),
  };
}

/**
 * API 版本注册表
 * 每个版本定义该版本暴露的 API 子集
 * 新增 API 字段时，只在 >= 该版本的注册表中添加
 */
const API_VERSION_REGISTRY: Record<string, (baseApi: ModAPI) => Partial<ModAPI>> = {
  '1.0.0': (baseApi) => ({
    // v1.0.0 基础 API（当前全部功能）
    ...baseApi,
  }),
  // 未来版本示例：
  // '1.1.0': (baseApi) => ({
  //   ...baseApi,
  //   db: { query: ..., insert: ... }, // 新增 db 实现
  // }),
};

/**
 * 根据模组声明的 apiVersion 创建对应版本的 API
 */
export function createVersionedApi(modId: string, targetApiVersion?: string): ModAPI {
  const baseApi = createModAPI(modId);
  const compat = isApiCompatible(targetApiVersion);

  if (!compat.compatible) {
    // 不兼容时返回一个受限的 API，只暴露 logger 和错误提示
    return {
      ...baseApi,
      logger: {
        ...baseApi.logger,
        info: (...args: any[]) => baseApi.logger.info(...args),
        warn: (...args: any[]) => baseApi.logger.warn('[INCOMPATIBLE]', ...args),
        error: (...args: any[]) => baseApi.logger.error('[INCOMPATIBLE]', ...args),
      },
      ui: {
        ...baseApi.ui,
        toolbar: {
          addButton: () => {
            baseApi.logger.error(`[Mod:${modId}] API incompatible: ${compat.reason}`);
          },
          removeButton: () => {},
        },
        panel: {
          register: () => {
            baseApi.logger.error(`[Mod:${modId}] API incompatible: ${compat.reason}`);
          },
          unregister: () => {},
          open: () => {},
          close: () => {},
        },
        settings: baseApi.ui.settings,
        theme: baseApi.ui.theme,
        mixer: baseApi.ui.mixer,
      },
    };
  }

  // 确定实际使用的 API 版本
  const effectiveVersion = targetApiVersion || CURRENT_API_VERSION;
  const versionKeys = Object.keys(API_VERSION_REGISTRY)
    .filter(v => v <= effectiveVersion)
    .sort();

  if (versionKeys.length === 0) {
    return baseApi;
  }

  // 应用最高兼容版本的 API 覆盖
  let finalApi = baseApi;
  for (const v of versionKeys) {
    const override = API_VERSION_REGISTRY[v](baseApi);
    finalApi = { ...finalApi, ...override };
  }

  return finalApi;
}

/**
 * 创建 ModAPI 实例
 * @param modId 模组 ID，用于日志前缀和权限控制
 */
export function createModAPI(modId: string): ModAPI {
  const storage = createModStorage();
  const logger = createModLogger(modId);

  // Player store - 只暴露只读状态和播放控制
  const playerStoreProxy = createStoreProxy('player', usePlayerStore, [
    'currentSampleId',
    'currentSampleName',
    'currentSamplePath',
    'isPlaying',
    'duration',
    'currentTime',
    'progress',
    'volume',
    'isLooping',
    'playbackRate',
    'loopStart',
    'loopEnd',
    'isABLooping',
  ]);

  // Library store - 只暴露 UI 状态
  const libraryStoreProxy = createStoreProxy('library', useLibraryStore, [
    'activeCategoryId',
    'activeFolderPath',
    'activeSection',
    'selectedSampleId',
    'searchQuery',
    'viewMode',
    'sortField',
    'sortDirection',
    'isScanning',
    'activeSmartFolderId',
    'selectedIds',
    'isMultiSelectMode',
  ]);

  // Settings store - 只暴露主题和语言
  const settingsStoreProxy = createStoreProxy('settings', useSettingsStore, [
    'theme',
    'language',
    'audioDevice',
    'bufferSize',
  ]);

  // Profile store - 暴露工作模式
  const profileStoreProxy = createStoreProxy('profile', useProfileStore, [
    'appMode',
    'config',
  ]);

  return {
    logger,
    notifications: {
      show: (title, options) => {
        const opts = typeof options === 'string' ? { description: options } : (options || {});
        const desc = 'body' in opts ? opts.body : ('description' in opts ? (opts as any).description : undefined);
        toast(title, {
          description: desc,
          ...((opts as any)?.type ? { type: (opts as any).type } : {}),
        });
      },
    },
    storage,

    ui: {
      toolbar: {
        addButton: (config) => modUIRegistry.addButton(config),
        removeButton: (id) => modUIRegistry.removeButton(id),
      },
      panel: {
        register: (config) => modUIRegistry.registerPanel(config),
        unregister: (id) => modUIRegistry.unregisterPanel(id),
        open: (id) => modUIRegistry.openPanel(id),
        close: (id) => modUIRegistry.closePanel(id),
      },
      settings: {
        addTab: (config) => {
          // TODO: 实现设置页注册
          logger.warn('settings.addTab not yet implemented');
        },
        removeTab: (id) => {
          logger.warn('settings.removeTab not yet implemented');
        },
      },
      theme: {
        register: (theme) => {
          // TODO: 实现主题注册
          logger.warn('theme.register not yet implemented');
        },
        unregister: (id) => {
          logger.warn('theme.unregister not yet implemented');
        },
        activate: (id) => {
          logger.warn('theme.activate not yet implemented');
        },
      },
      mixer: {
        addKnob: (config) => {
          // TODO: 实现混音器旋钮注册
          logger.warn('mixer.addKnob not yet implemented');
        },
        removeKnob: (id) => {
          logger.warn('mixer.removeKnob not yet implemented');
        },
      },
    },

    audio: {
      getContext: () => getOrCreateAudioContext(),
      insertEffect: (id, node) => {
        const ctx = getOrCreateAudioContext();
        if (!ctx || !masterGain) {
          logger.error('AudioContext not available');
          return;
        }
        if (effectNodes.has(id)) {
          logger.warn(`Effect ${id} already exists, removing old one`);
          const oldNode = effectNodes.get(id);
          if (oldNode) {
            try { oldNode.disconnect(); } catch { /* ignore */ }
          }
          effectNodes.delete(id);
        }
        effectNodes.set(id, node);
        // 简单链式连接：所有效果器并联到 masterGain
        node.connect(masterGain);
        logger.info(`Audio effect inserted: ${id}`);
      },
      removeEffect: (id) => {
        const node = effectNodes.get(id);
        if (node) {
          try {
            node.disconnect();
          } catch { /* ignore */ }
          effectNodes.delete(id);
          logger.info(`Audio effect removed: ${id}`);
        }
      },
      onPadTrigger: (callback) => {
        const unsub = usePadStore.subscribe((state) => {
          // 监听 pad 触发事件
          // 这是一个简化实现，实际可以通过事件总线
        });
        // 返回取消订阅函数
        return () => unsub();
      },
      getParam: (path) => {
        const state = usePlayerStore.getState();
        return (state as any)[path];
      },
      setParam: (path, value) => {
        const state = usePlayerStore.getState();
        const setter = (state as any)[`set${path.charAt(0).toUpperCase()}${path.slice(1)}`];
        if (typeof setter === 'function') {
          setter(value);
        } else {
          logger.warn(`No setter found for param: ${path}`);
        }
      },
      midi: {
        play: (filePath: string) => {
          return midiPlay(filePath);
        },
        stop: () => {
          midiStop();
        },
        isPlaying: (filePath: string) => {
          return midiIsPlaying(filePath);
        },
        onStateChange: (callback) => {
          // 通过 playerStore 的 isPlaying + currentSamplePath 监听变化
          const unsub = usePlayerStore.subscribe((state) => {
            const filePath = state.currentSamplePath;
            const playing = state.isPlaying;
            const isMidi = filePath.toLowerCase().endsWith('.mid') || filePath.toLowerCase().endsWith('.midi');
            if (isMidi) {
              callback(playing ? filePath : null, playing);
            }
          });
          return unsub;
        },
      },
    },

    stores: {
      player: playerStoreProxy,
      library: libraryStoreProxy,
      settings: settingsStoreProxy,
      profile: profileStoreProxy,
    },

    hooks: {
      register: (name: string, callback: (...args: any[]) => any) => {
        if (!globalEventBus.has(name)) {
          globalEventBus.set(name, new Set());
        }
        globalEventBus.get(name)!.add(callback);
        logger.info(`Hook registered: ${name}`);
        // 返回取消订阅函数
        return () => {
          globalEventBus.get(name)?.delete(callback);
        };
      },
      unregister: (name: string, callback: (...args: any[]) => any) => {
        globalEventBus.get(name)?.delete(callback);
      },
      emit: (name: string, ...args: any[]) => {
        emitGlobalEvent(name, ...args);
      },
    },

    network: createModNetwork(),

    ipc: {
      handle: (channel, handler) => {
        logger.warn('ipc.handle is only available in main process mods');
      },
      invoke: async (channel, ...args) => {
        // 按权限分组的白名单
        const channelPermissions: Record<string, string[]> = {
          // library:read - 只读查询
          'samples:get': ['library:read'],
          'samples:getPaginated': ['library:read'],
          'samples:search': ['library:read'],
          'categories:get': ['library:read'],
          'tags:get': ['library:read'],
          'playlists:get': ['library:read'],
          'favorites:get': ['library:read'],
          'recent:get': ['library:read'],
          'folders:get': ['library:read'],
          'folders:getTree': ['library:read'],
          'smartFolders:get': ['library:read'],
          'usage:getStats': ['library:read'],
          'usage:mostPlayed': ['library:read'],
          'usage:leastPlayed': ['library:read'],
          'recommend:similar': ['library:read'],
          'samples:findSimilarByFeatures': ['library:read'],
          'samples:semanticSearch': ['library:read'],
          'files:duplicates': ['library:read'],
          // library:write - 写入操作
          'favorites:toggle': ['library:write'],
          'recent:add': ['library:write'],
          'tags:create': ['library:write'],
          'tags:delete': ['library:write'],
          'tags:addToSample': ['library:write'],
          'tags:removeFromSample': ['library:write'],
          'playlists:create': ['library:write'],
          'playlists:update': ['library:write'],
          'playlists:delete': ['library:write'],
          'playlists:addItem': ['library:write'],
          'playlists:removeItem': ['library:write'],
          'playlists:reorder': ['library:write'],
          'smartFolders:create': ['library:write'],
          'smartFolders:update': ['library:write'],
          'smartFolders:delete': ['library:write'],
          'samples:updateCategory': ['library:write'],
          'samples:batchAddTag': ['library:write'],
          'samples:updateRatingNotes': ['library:write'],
          'files:deleteSamples': ['library:write'],
          'files:cleanCorrupted': ['library:write'],
          // audio - 音频分析
          'audio:analyzeFile': ['audio:engine'],
          'audio:analyzeBatch': ['audio:engine'],
          'audio:detectSilence': ['audio:engine'],
          'audio:getPeakEnvelope': ['audio:engine'],
          'waveform:get': ['audio:engine'],
          'waveform:save': ['audio:engine'],
          // classify - 分类规则
          'classify:rules': ['library:read'],
          'rules:get': ['library:read'],
          'rules:create': ['library:write'],
          'rules:update': ['library:write'],
          'rules:delete': ['library:write'],
          'classify:all': ['library:write'],
          'classify:sample': ['library:write'],
          // UCS - 游戏音效分类
          'ucs:getCategories': ['library:read'],
          'ucs:getSubcategories': ['library:read'],
          // delivery QA - 交付质检
          'delivery:runQA': ['library:read'],
          'delivery:getRules': ['library:read'],
          // export - 引擎导出
          'export:toEngine': ['library:read'],
          'export:json': ['library:read'],
          'export:csv': ['library:read'],
          // smart rename - 智能重命名
          'smartRename:suggestions': ['library:read'],
          'smartRename:apply': ['library:write'],
          'samples:generateBatchRename': ['library:write'],
          // online - 在线采样（需要 network 权限）
          'online:search': ['network'],
          'online:download': ['network'],
          'online:snddevCategories': ['network'],
          'online:cachePreview': ['network'],
          'online:selectDownloadFolder': ['network'],
          // folders - 扫描
          'folders:add': ['library:write'],
          'folders:remove': ['library:write'],
          'folders:scan': ['library:write'],
          'scan:start': ['library:write'],
          // backup
          'backup:create': ['library:write'],
          'backup:restore': ['library:write'],
          'backup:list': ['library:read'],
          // config
          'config:export': ['library:read'],
          'config:import': ['library:write'],
          // midi
          'midi:parse': ['audio:engine'],
          'midi:getPreview': ['audio:engine'],
          // sequencer
          'sequencer:exportMidi': ['audio:engine'],
          // analysis
          'analysis:createSession': ['library:write'],
          'analysis:startSession': ['library:write'],
          'analysis:pauseSession': ['library:write'],
          'analysis:resumeSession': ['library:write'],
          'analysis:cancelSession': ['library:write'],
          'analysis:getSessionStatus': ['library:read'],
          'analysis:getSessionResults': ['library:read'],
          // other
          'resetDatabase': ['library:write'],
          'importFiles': ['library:write'],
          'getAudioSegments': ['audio:engine'],
          'getAudioBuffer': ['audio:engine'],
          'showItemInFolder': ['library:read'],
        };

        const requiredPerms = channelPermissions[channel];
        if (!requiredPerms) {
          throw new Error(`IPC channel '${channel}' is not allowed for mods`);
        }

        // 检查模组是否有任一所需权限
        // 注意：实际权限检查在 createRestrictedApi 中处理，这里只做通道级白名单
        // @ts-ignore
        return ipcClient[channel.replace(/:/g, '_')]?.(...args);
      },
    },

    db: {
      query: async (sql: string, params?: any[]) => {
        try {
          // 通过 IPC 调用主进程的数据库查询
          // @ts-ignore
          return await ipcClient.queryDatabase?.(sql, params) ?? [];
        } catch (err) {
          logger.error('db.query failed:', err);
          return [];
        }
      },
      insert: async (table: string, data: Record<string, any>) => {
        try {
          // @ts-ignore
          return await ipcClient.insertDatabase?.(table, data);
        } catch (err) {
          logger.error('db.insert failed:', err);
        }
      },
    },
  };
}
