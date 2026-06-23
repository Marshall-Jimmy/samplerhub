import log from 'electron-log';

/**
 * 事件循环阻塞监测器
 * 
 * 原理：每 CHECK_INTERVAL_MS 执行一次 tick，记录当前时间与预期时间的差值。
 * 如果差值超过 WARN_THRESHOLD_MS，说明主进程被某个同步操作阻塞。
 * 
 * 同时提供 traceBlockingOperation / endBlockingOperation 追踪 API，
 * 用于标记正在执行的重型同步操作，方便定位阻塞源。
 */

const CHECK_INTERVAL_MS = 500;
const WARN_THRESHOLD_MS = 100;
const SEVERE_THRESHOLD_MS = 500;
const VERY_SEVERE_THRESHOLD_MS = 2000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastTick: number = Date.now();

// 正在执行的阻塞操作栈（最新的在末尾）
interface BlockingOperation {
  name: string;
  startAt: number;
}
const currentOperations: BlockingOperation[] = [];

export function startEventLoopMonitor(): void {
  if (intervalHandle !== null) return;
  lastTick = Date.now();
  intervalHandle = setInterval(() => {
    const now = Date.now();
    const lag = now - lastTick - CHECK_INTERVAL_MS;
    lastTick = now;

    if (lag > WARN_THRESHOLD_MS) {
      // 收集当前正在执行的操作（用于定位阻塞源）
      const activeOp = currentOperations.length > 0
        ? currentOperations[currentOperations.length - 1]
        : null;

      const severity = lag > VERY_SEVERE_THRESHOLD_MS ? 'CRITICAL' :
                       lag > SEVERE_THRESHOLD_MS ? 'SEVERE' : 'WARN';

      const lagMsg = `[EventLoop] ${severity}: event loop blocked for ${Math.round(lag)}ms`;

      if (activeOp) {
        const duration = Date.now() - activeOp.startAt;
        log.error(`${lagMsg} | Current blocking operation: "${activeOp.name}" (started ${duration}ms ago)`);
      } else {
        log.error(`${lagMsg} | No tracked blocking operation — possibly IPC/network/paint`);
      }
    }
  }, CHECK_INTERVAL_MS);

  // 不阻塞进程退出
  if (intervalHandle && typeof intervalHandle.unref === 'function') {
    try { (intervalHandle as any).unref(); } catch {}
  }
  log.info('[EventLoop] Monitor started (threshold: 100ms warn, 500ms severe)');
}

export function stopEventLoopMonitor(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    log.info('[EventLoop] Monitor stopped');
  }
}

/**
 * 追踪一个可能阻塞事件循环的同步操作。
 * 用法：
 *   const op = traceBlockingOperation('big-sql-query');
 *   try { ... heavy work ... } finally { op.end(); }
 */
export function traceBlockingOperation(name: string): { end: () => void } {
  const op: BlockingOperation = { name, startAt: Date.now() };
  currentOperations.push(op);
  return {
    end: () => {
      const idx = currentOperations.indexOf(op);
      if (idx >= 0) currentOperations.splice(idx, 1);
    }
  };
}

/**
 * 便捷辅助：异步让步（setImmediate 包装为 Promise）
 * 用于在长循环之间让出事件循环。
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}
