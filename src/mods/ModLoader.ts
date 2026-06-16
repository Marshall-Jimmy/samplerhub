/**
 * ModLoader - 模组加载器
 * 负责加载、解析、激活和卸载模组
 */

import React from 'react';
import { ModManifest, ModInstance, ModAPI, ModLogger, ModStorage, ModPermission, isApiCompatible, CURRENT_API_VERSION } from './types';
import { createModNetwork } from './ModNetwork';
import { createVersionedApi } from './createModAPI';

const MOD_STORAGE_KEY = 'samplerhub-mods';
const MOD_DATA_KEY = 'samplerhub-mod-data';

export class ModLoader {
  private mods: Map<string, ModInstance> = new Map();
  private api: ModAPI;
  private storage: ModStorage;

  constructor(api: ModAPI) {
    this.api = api;
    this.storage = this.createModStorage();
  }

  private createModStorage(): ModStorage {
    const prefix = 'mod:';
    return {
      get: <T = any>(key: string): T | undefined => {
        try {
          const data = localStorage.getItem(`${prefix}${key}`);
          return data ? JSON.parse(data) : undefined;
        } catch {
          return undefined;
        }
      },
      set: <T = any>(key: string, value: T): void => {
        localStorage.setItem(`${prefix}${key}`, JSON.stringify(value));
      },
      remove: (key: string): void => {
        localStorage.removeItem(`${prefix}${key}`);
      },
    };
  }

  /**
   * 从 localStorage 加载已保存的模组列表
   */
  async loadSavedMods(): Promise<void> {
    try {
      const saved = localStorage.getItem(MOD_STORAGE_KEY);
      if (!saved) return;

      const modList: Array<{ id: string; code: string; enabled: boolean }> = JSON.parse(saved);
      for (const modInfo of modList) {
        try {
          await this.loadModFromCode(modInfo.code, modInfo.enabled);
        } catch (err) {
          this.api.logger.error(`[ModLoader] Failed to load mod ${modInfo.id}:`, err);
        }
      }
    } catch (err) {
      this.api.logger.error('[ModLoader] Failed to load saved mods:', err);
    }
  }

  /**
   * 从代码字符串加载模组
   */
  async loadModFromCode(code: string, enabled: boolean = true): Promise<ModInstance> {
    // 解析 manifest（从代码中提取）
    const manifest = this.extractManifest(code);
    if (!manifest) {
      throw new Error('Invalid mod: manifest not found');
    }

    // 验证 manifest
    this.validateManifest(manifest);

    // 检查是否已存在
    if (this.mods.has(manifest.id)) {
      throw new Error(`Mod ${manifest.id} already loaded`);
    }

    // 创建模组实例
    const mod: ModInstance = {
      manifest,
      enabled: false,
      code,
    };

    // 解析激活/停用函数
    this.parseModFunctions(mod, code);

    this.mods.set(manifest.id, mod);

    // 如果启用，激活模组
    if (enabled) {
      await this.enableMod(manifest.id);
    }

    this.saveModList();
    return mod;
  }

  /**
   * 从文件加载模组
   */
  async loadModFromFile(file: File): Promise<ModInstance> {
    const code = await file.text();
    return this.loadModFromCode(code, true);
  }

  /**
   * 从 ZIP 加载模组
   */
  async loadModFromZip(zipFile: File): Promise<ModInstance> {
    // 使用 JSZip 解压
    const JSZip = await import('jszip');
    const zip = await JSZip.default.loadAsync(zipFile);

    // 读取 manifest
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      throw new Error('Invalid mod zip: manifest.json not found');
    }

    const manifest: ModManifest = JSON.parse(await manifestFile.async('text'));

    // 读取入口文件
    const entryFile = manifest.entry?.renderer || 'renderer.js';
    const codeFile = zip.file(entryFile);
    if (!codeFile) {
      throw new Error(`Entry file ${entryFile} not found`);
    }

    const code = await codeFile.async('text');
    return this.loadModFromCode(code, true);
  }

  /**
   * 启用模组
   */
  async enableMod(id: string): Promise<void> {
    const mod = this.mods.get(id);
    if (!mod) throw new Error(`Mod ${id} not found`);
    if (mod.enabled) return;

    // API 版本兼容性检查
    const compat = isApiCompatible(mod.manifest.apiVersion);
    if (!compat.compatible) {
      throw new Error(`API incompatible: ${compat.reason}`);
    }
    if (compat.reason) {
      this.api.logger.warn(`[ModLoader] Mod ${id}: ${compat.reason}`);
    }

    try {
      // 创建带版本和权限控制的 API
      const versionedApi = createVersionedApi(id, mod.manifest.apiVersion);
      const restrictedApi = this.createRestrictedApi(versionedApi, mod.manifest.permissions);

      // 注入 React 到全局，供模组代码中 window.React 使用
      window.React = React;

      if (mod.activate) {
        await mod.activate(restrictedApi);
      }

      mod.enabled = true;
      this.api.logger.info(`[ModLoader] Mod ${id} enabled (API v${mod.manifest.apiVersion || 'legacy'})`);
    } catch (err) {
      this.api.logger.error(`[ModLoader] Failed to enable mod ${id}:`, err);
      throw err;
    }

    this.saveModList();
  }

  /**
   * 禁用模组
   */
  async disableMod(id: string): Promise<void> {
    const mod = this.mods.get(id);
    if (!mod) throw new Error(`Mod ${id} not found`);
    if (!mod.enabled) return;

    try {
      const versionedApi = createVersionedApi(id, mod.manifest.apiVersion);
      const restrictedApi = this.createRestrictedApi(versionedApi, mod.manifest.permissions);

      if (mod.deactivate) {
        await mod.deactivate(restrictedApi);
      }
    } catch (err) {
      // deactivate 可能因模组内部变量作用域问题而失败，但仍需清理 UI
      this.api.logger.warn(`[ModLoader] Mod ${id} deactivate warning:`, err);
    }

    // 无论 deactivate 是否成功，都强制清理 UI 和状态
    try {
      const versionedApi = createVersionedApi(id, mod.manifest.apiVersion);
      const restrictedApi = this.createRestrictedApi(versionedApi, mod.manifest.permissions);
      restrictedApi.ui?.toolbar?.removeButton?.(`${id}`);
      restrictedApi.ui?.panel?.unregister?.(`${id}`);
    } catch (e) {
      console.warn('[ModLoader] cleanup error:', e);
    }

    mod.enabled = false;
    this.api.logger.info(`[ModLoader] Mod ${id} disabled`);
    this.saveModList();
  }

  /**
   * 卸载模组
   */
  async unloadMod(id: string): Promise<void> {
    const mod = this.mods.get(id);
    if (!mod) return;

    if (mod.enabled) {
      await this.disableMod(id);
    }

    this.mods.delete(id);
    this.saveModList();
    this.api.logger.info(`[ModLoader] Mod ${id} unloaded`);
  }

  /**
   * 获取所有模组
   */
  getMods(): ModInstance[] {
    return Array.from(this.mods.values());
  }

  /**
   * 获取单个模组
   */
  getMod(id: string): ModInstance | undefined {
    return this.mods.get(id);
  }

  /**
   * 从代码文本中用正则提取字符串值（支持单引号、双引号、反引号）
   */
  private extractStringValue(code: string, key: string): string | null {
    // 匹配 key: 'value' 或 key: "value" 或 key: `value`
    const patterns = [
      new RegExp(`${key}\\s*:\\s*'([^']*?)'`, 's'),
      new RegExp(`${key}\\s*:\\s*"([^"]*?)"`, 's'),
      new RegExp(`${key}\\s*:\\s*\`([^\`]*?)\``, 's'),
    ];
    for (const pattern of patterns) {
      const match = code.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * 从代码文本中用正则提取数组值
   */
  private extractArrayValue(code: string, key: string): string[] {
    const match = code.match(new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`, ''));
    if (!match) return [];
    // 提取数组中的字符串元素
    const items: string[] = [];
    const itemRegex = /['"]([^'"]*?)['"]/g;
    let item;
    while ((item = itemRegex.exec(match[1])) !== null) {
      items.push(item[1]);
    }
    return items;
  }

  /**
   * 提取 manifest
   */
  private extractManifest(code: string): ModManifest | null {
    // 方式一：从 @manifest 注释中提取 JSON
    const manifestMatch = code.match(/\/\*\*\s*@manifest\s*([\s\S]*?)\*\//);
    if (manifestMatch) {
      try {
        return JSON.parse(manifestMatch[1]);
      } catch (e) { /* JSON parse failed, trying alternative */ }
    }

    // 方式二：从 export default { ... } 中用正则提取字段（不依赖 eval/Function）
    const exportStart = code.match(/export\s+default\s*\{/);
    if (exportStart && exportStart.index !== undefined) {
      // 只提取 export default 之后到文件末尾的部分，缩小搜索范围
      const codeAfterExport = code.substring(exportStart.index);

      const id = this.extractStringValue(codeAfterExport, 'id');
      const name = this.extractStringValue(codeAfterExport, 'name');
      const version = this.extractStringValue(codeAfterExport, 'version');

      if (id && name && version) {
        return {
          id,
          name,
          version,
          author: this.extractStringValue(codeAfterExport, 'author') || 'Unknown',
          description: this.extractStringValue(codeAfterExport, 'description') || '',
          permissions: this.extractArrayValue(codeAfterExport, 'permissions') as ModPermission[],
        };
      }
    }

    return null;
  }

  /**
   * 从指定位置的 { 开始，通过括号计数提取完整的花括号内容（含外层 {}）
   */
  private extractBalancedBraces(code: string, start: number): string {
    let depth = 0;
    let inString: string | null = null;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = start; i < code.length; i++) {
      const ch = code[i];
      const next = i + 1 < code.length ? code[i + 1] : '';

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }

      // 处理注释
      if (!inString) {
        if (inLineComment) {
          if (ch === '\n') inLineComment = false;
          continue;
        }
        if (inBlockComment) {
          if (ch === '*' && next === '/') {
            inBlockComment = false;
            i++; // skip /
          }
          continue;
        }
        if (ch === '/' && next === '/') {
          inLineComment = true;
          i++; // skip second /
          continue;
        }
        if (ch === '/' && next === '*') {
          inBlockComment = true;
          i++; // skip *
          continue;
        }
      }

      // 处理字符串
      if (inString) {
        if (ch === inString) {
          inString = null;
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        continue;
      }

      // 计算括号深度
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return code.substring(start, i + 1);
        }
      }
    }

    return code.substring(start);
  }

  /**
   * 验证 manifest
   */
  private validateManifest(manifest: ModManifest): void {
    if (!manifest.id) throw new Error('Manifest missing "id"');
    if (!manifest.name) throw new Error('Manifest missing "name"');
    if (!manifest.version) throw new Error('Manifest missing "version"');
    if (!manifest.author) throw new Error('Manifest missing "author"');
    if (!Array.isArray(manifest.permissions)) {
      manifest.permissions = [];
    }
  }

  /**
   * 解析模组的 activate/deactivate 函数
   * 使用 requestIdleCallback/setTimeout 避免大文件解析阻塞主线程
   */
  private parseModFunctions(mod: ModInstance, code: string): void {
    try {
      // 去掉 export default，将代码包裹在对象中以便 Function 构造函数执行
      let executableCode = code;
      const exportDefaultMatch = code.match(/export\s+default\s*\{/);
      if (exportDefaultMatch && exportDefaultMatch.index !== undefined) {
        const braceStart = code.indexOf('{', exportDefaultMatch.index);
        if (braceStart !== -1) {
          const objStr = this.extractBalancedBraces(code, braceStart);
          executableCode = `return (${objStr})`;
        }
      }

      // 将解析推迟到空闲时段，避免阻塞 UI
      const doParse = () => {
        try {
          const modFactory = new Function('window', 'document', 'globalThis', 'self', 'Tone', 'React', executableCode)(
            window, document, globalThis, self, (window as any).Tone, (window as any).React
          );

          if (modFactory && typeof modFactory === 'object') {
            const activateFn = modFactory.activate || modFactory.default?.activate;
            const deactivateFn = modFactory.deactivate || modFactory.default?.deactivate;
            if (activateFn) mod.activate = activateFn.bind(modFactory);
            if (deactivateFn) mod.deactivate = deactivateFn.bind(modFactory);
          }
        } catch (err) {
          this.api.logger.warn(`[ModLoader] Failed to parse mod functions for ${mod.manifest.id}:`, err);
        }
      };

      // 优先使用 requestIdleCallback，回退到 setTimeout
      if (typeof (window as any).requestIdleCallback === 'function') {
        (window as any).requestIdleCallback(doParse, { timeout: 500 });
      } else {
        setTimeout(doParse, 0);
      }
    } catch (err) {
      this.api.logger.warn(`[ModLoader] Failed to parse mod functions for ${mod.manifest.id}:`, err);
    }
  }

  /**
   * 创建带权限控制的 API
   */
  private createRestrictedApi(baseApi: ModAPI, permissions: string[]): ModAPI {
    const hasPermission = (perm: string) => permissions.includes(perm);

    return {
      ...baseApi,
      // 覆盖需要权限检查的 API
      audio: hasPermission('audio:engine') ? baseApi.audio : {
        getContext: () => null,
        insertEffect: () => { throw new Error('Permission denied: audio:engine'); },
        removeEffect: () => { throw new Error('Permission denied: audio:engine'); },
        onPadTrigger: () => () => {},
        getParam: () => undefined,
        setParam: () => { throw new Error('Permission denied: audio:engine'); },
        midi: {
          play: () => { throw new Error('Permission denied: audio:engine'); },
          stop: () => {},
          isPlaying: () => false,
          onStateChange: () => () => {},
        },
      },
      ui: {
        ...baseApi.ui,
        inject: hasPermission('ui:inject') ? baseApi.ui.panel.register : () => { throw new Error('Permission denied: ui:inject'); },
        theme: hasPermission('ui:theme') ? baseApi.ui.theme : {
          register: () => { throw new Error('Permission denied: ui:theme'); },
          unregister: () => { throw new Error('Permission denied: ui:theme'); },
          activate: () => { throw new Error('Permission denied: ui:theme'); },
        },
      },
      storage: hasPermission('storage:read') || hasPermission('storage:write')
        ? this.storage
        : {
            get: () => undefined,
            set: () => { throw new Error('Permission denied: storage'); },
            remove: () => { throw new Error('Permission denied: storage'); },
          },
      ipc: hasPermission('ipc:invoke') ? baseApi.ipc : undefined,
      db: hasPermission('library:write') ? baseApi.db : undefined,
      network: hasPermission('network')
        ? baseApi.network
        : {
            get: () => Promise.reject(new Error('Permission denied: network')),
            post: () => Promise.reject(new Error('Permission denied: network')),
            put: () => Promise.reject(new Error('Permission denied: network')),
            delete: () => Promise.reject(new Error('Permission denied: network')),
            fetch: () => Promise.reject(new Error('Permission denied: network')),
            jsonp: () => Promise.reject(new Error('Permission denied: network')),
          },
    };
  }

  /**
   * 保存模组列表到 localStorage
   */
  private saveModList(): void {
    const modList = Array.from(this.mods.values()).map((mod) => ({
      id: mod.manifest.id,
      code: mod.code,
      enabled: mod.enabled,
      apiVersion: mod.manifest.apiVersion,
    }));
    localStorage.setItem(MOD_STORAGE_KEY, JSON.stringify(modList));
  }

  /**
   * 安全的 eval 替代方案
   * 先尝试 JSON.parse，失败则用 Function 构造函数解析（支持函数值）
   */
  private safeEval(code: string): any {
    try {
      return JSON.parse(code);
    } catch {
      try {
        return new Function('return ' + code)();
      } catch (e) {
        console.warn('[ModLoader] safeEval failed:', e);
        return {};
      }
    }
  }
}
