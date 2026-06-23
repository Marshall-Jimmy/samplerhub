/**
 * 前端统一日志模块
 *
 * 通过 IPC 转发到主进程统一落盘，开发环境同时输出浏览器 console
 */

const isDev = import.meta.env?.DEV ?? false;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 创建带模块标签的前端 logger
 *
 * @example
 * const logger = createLogger('LibraryPage');
 * logger.info('Loaded 1000 samples');
 * logger.error('Failed to fetch', err);
 */
export function createLogger(module: string) {
  const tag = `[${module}]`;

  const formatMessage = (args: unknown[]): string => {
    return args.map(a => {
      if (a instanceof Error) return `${a.message}\n${a.stack}`;
      if (typeof a === 'object') {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    }).join(' ');
  };

  const forward = (level: LogLevel, args: unknown[]) => {
    const message = formatMessage(args);
    const timestamp = new Date().toISOString();

    // 开发环境输出到浏览器 console
    if (isDev) {
      const consoleMethod = level === 'debug' ? console.debug : level === 'warn' ? console.warn : level === 'error' ? console.error : console.log;
      consoleMethod(`${tag}`, ...args);
    }

    // 转发到主进程落盘（静默失败，不影响业务）
    try {
      window.electronAPI?.invoke?.('log:forward', { level, module, message, timestamp });
    } catch {
      // IPC 未就绪时静默忽略
    }
  };

  return {
    debug: (...args: unknown[]) => forward('debug', args),
    info: (...args: unknown[]) => forward('info', args),
    warn: (...args: unknown[]) => forward('warn', args),
    error: (...args: unknown[]) => forward('error', args),

    /**
     * 性能计时器
     */
    timer: (label: string) => {
      const start = performance.now();
      return {
        end: () => {
          const elapsed = Math.round(performance.now() - start);
          forward('info', [`[Perf] ${label} took ${elapsed}ms`]);
          return elapsed;
        },
      };
    },

    /** 兼容 console.log */
    log: (...args: unknown[]) => forward('info', args),
  };
}

export const logger = createLogger('renderer');
