/**
 * 统一日志模块
 *
 * 基于 electron-log 封装，提供：
 * - 模块标签（方便定位来源）
 * - 毫秒级时间戳
 * - 统一文件落盘 + 控制台输出
 * - 生产/开发环境分级
 * - 性能计时工具
 *
 * 注意：electron-log 的 file transport 需要 app ready 后才能获取日志路径，
 * 因此配置采用懒初始化，在 app ready 后第一次调用日志方法时配置。
 * 使用 createRequire 兼容 ESM 环境下的 require。
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const log = require('electron-log');

let initialized = false;

/**
 * 初始化 electron-log 配置（需要在 app ready 后调用）
 */
export function initLoggerConfig(): void {
  if (initialized) return;

  try {
    const { app } = require('electron');
    if (!app.isReady()) {
      // app 未 ready，electron-log 无法获取日志路径
      return;
    }

    initialized = true;

    const isDev = !app.isPackaged;

    if (log.transports?.file) {
      log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB 轮转
      log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
      log.transports.file.level = isDev ? 'debug' : 'info';
    }
    if (log.transports?.console) {
      log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
      log.transports.console.level = isDev ? 'debug' : 'info';
    }

    log.info('[logger] Initialized', { isDev, logPath: app.getPath('logs') });
  } catch (err) {
    // 配置失败，下次调用时重试
    initialized = false;
  }
}

/** 确保已初始化（每次日志调用前检查） */
function ensureInit(): void {
  if (!initialized) {
    initLoggerConfig();
  }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 创建带模块标签的 logger
 */
export function createLogger(module: string) {
  const tag = `[${module}]`;

  return {
    debug: (...args: unknown[]) => {
      ensureInit();
      log.debug(tag, ...args);
    },
    info: (...args: unknown[]) => {
      ensureInit();
      log.info(tag, ...args);
    },
    warn: (...args: unknown[]) => {
      ensureInit();
      log.warn(tag, ...args);
    },
    error: (...args: unknown[]) => {
      ensureInit();
      log.error(tag, ...args);
    },

    timer: (label: string) => {
      const start = Date.now();
      return {
        end: () => {
          const elapsed = Date.now() - start;
          ensureInit();
          log.info(tag, `[Perf] ${label} took ${elapsed}ms`);
          return elapsed;
        },
      };
    },

    log: (...args: unknown[]) => {
      ensureInit();
      log.info(tag, ...args);
    },
  };
}

export const logger = createLogger('app');

/**
 * 前端日志转发：接收 renderer 进程的日志并落盘
 */
export function handleRendererLog(_event: unknown, data: { level: LogLevel; module: string; message: string; timestamp: string }) {
  ensureInit();
  const tag = `[renderer:${data.module}]`;
  const text = `${tag} ${data.message}`;
  switch (data.level) {
    case 'error':
      log.error(text);
      break;
    case 'warn':
      log.warn(text);
      break;
    case 'debug':
      log.debug(text);
      break;
    default:
      log.info(text);
  }
}

export default log;
