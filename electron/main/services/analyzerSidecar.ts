/**
 * Python Sidecar 管理器
 *
 * 负责启动/停止/监控 CLAP/PANNs 分析 sidecar 进程
 * 通过 HTTP 与 FastAPI 服务通信
 */

import { spawn, ChildProcess, execFile } from 'child_process';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { getPythonPath } from './pythonSetup';

const SIDECAR_PORT = 7890;
const SIDECAR_HOST = '127.0.0.1';
const HEALTH_CHECK_INTERVAL = 5000;
const HEALTH_CHECK_TIMEOUT = 3000;

interface SidecarConfig {
  port?: number;
  host?: string;
  enableFusion?: boolean;
  useCuda?: boolean;
}

class AnalyzerSidecarManager {
  private process: ChildProcess | null = null;
  private isStarting = false;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private isAvailable = false;

  /** sidecar 可执行文件路径 */
  private getSidecarPath(): string {
    // 开发环境：直接使用 Python 解释器运行 main.py
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
      // 尝试找项目根目录下的 apps/analyzer/main.py
      const devPath = path.join(process.cwd(), 'apps', 'analyzer', 'main.py');
      if (fs.existsSync(devPath)) {
        return devPath;
      }
      // fallback: 相对于 electron 目录
      const fallbackPath = path.join(__dirname, '..', '..', '..', 'apps', 'analyzer', 'main.py');
      if (fs.existsSync(fallbackPath)) {
        return fallbackPath;
      }
    }

    // 生产环境：从 extraResources 复制出来的 analyzer 目录
    const prodPath = path.join(process.resourcesPath, 'analyzer', 'main.py');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }

    // 最后尝试 app.getAppPath()
    const appPath = path.join(app.getAppPath(), 'analyzer', 'main.py');
    return appPath;
  }

  /** 检测 Python 是否可用（优先使用 pythonSetup 服务） */
  private async findPython(): Promise<string | null> {
    // 优先使用 pythonSetup 服务获取已验证的 Python 路径
    const setupPythonPath = await getPythonPath();
    if (setupPythonPath) {
      return setupPythonPath;
    }

    // fallback: 自行检测
    const candidates = process.platform === 'win32'
      ? ['python.exe', 'python3.exe', 'py.exe']
      : ['python3', 'python'];

    for (const cmd of candidates) {
      try {
        const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          execFile(cmd, ['--version'], { timeout: 3000 }, (err: any, stdout: string, stderr: string) => {
            if (err) reject(err);
            else resolve({ stdout, stderr });
          });
        });
        if (result.stdout.includes('Python') || result.stderr.includes('Python')) {
          return cmd;
        }
      } catch { /* 尝试下一个 */ }
    }
    return null;
  }

  /** 启动 sidecar */
  async start(config: SidecarConfig = {}): Promise<boolean> {
    if (this.process || this.isStarting) {
      return this.isAvailable;
    }

    this.isStarting = true;

    try {
      const sidecarPath = this.getSidecarPath();
      const port = config.port ?? SIDECAR_PORT;
      const host = config.host ?? SIDECAR_HOST;

      // 检查是否已存在运行的 sidecar
      const isAlreadyRunning = await this._checkHealth(host, port);
      if (isAlreadyRunning) {
        console.log('[Sidecar] 检测到已运行的 sidecar');
        this.isAvailable = true;
        this._startHealthCheck(host, port);
        return true;
      }

      // 判断是 Python 脚本还是打包后的 exe
      const isPythonScript = sidecarPath.endsWith('.py');

      if (isPythonScript) {
        // 开发模式：用 Python 解释器运行
        const pythonCmd = await this.findPython();
        if (!pythonCmd) {
          console.warn('[Sidecar] 未找到 Python 解释器，sidecar 不可用');
          this.isAvailable = false;
          return false;
        }

        const env = { ...process.env };
        if (config.enableFusion) env.CLAP_FUSION = 'true';
        if (config.useCuda) env.CLAP_CUDA = 'true';

        this.process = spawn(pythonCmd, [sidecarPath, '--port', String(port), '--host', host], {
          env,
          detached: false,
          windowsHide: true,
        });
      } else {
        // 生产模式：直接运行打包后的 exe
        this.process = spawn(sidecarPath, ['--port', String(port), '--host', host], {
          detached: false,
          windowsHide: true,
        });
      }

      // 监听输出
      this.process.stdout?.on('data', (data) => {
        console.log(`[Sidecar] ${data.toString().trim()}`);
      });
      this.process.stderr?.on('data', (data) => {
        console.error(`[Sidecar] ${data.toString().trim()}`);
      });

      this.process.on('exit', (code) => {
        console.log(`[Sidecar] 进程退出，代码: ${code}`);
        this.process = null;
        this.isAvailable = false;
      });

      // 等待 sidecar 启动完成
      await this._waitForStartup(host, port);
      this.isAvailable = true;
      this._startHealthCheck(host, port);
      return true;

    } catch (err) {
      console.error('[Sidecar] 启动失败:', err);
      this.isAvailable = false;
      return false;
    } finally {
      this.isStarting = false;
    }
  }

  /** 停止 sidecar */
  async stop(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.process) {
      try {
        // 先尝试优雅关闭
        await fetch(`http://${SIDECAR_HOST}:${SIDECAR_PORT}/shutdown`, {
          method: 'POST',
          signal: AbortSignal.timeout(2000),
        });
      } catch { /* 忽略 */ }

      // 强制终止
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 3000);

      this.process = null;
    }

    this.isAvailable = false;
  }

  /** 检查 sidecar 是否可用 */
  get isReady(): boolean {
    return this.isAvailable;
  }

  /** HTTP 调用：分析音频文件 → CLAP embedding */
  async analyzeClap(filePath: string): Promise<{ success: boolean; embedding_b64?: string; dimension?: number; error?: string }> {
    if (!this.isAvailable) {
      return { success: false, error: 'Sidecar 未启动' };
    }

    const res = await fetch(`http://${SIDECAR_HOST}:${SIDECAR_PORT}/analyze/clap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath }),
      signal: AbortSignal.timeout(30000),
    });

    return await res.json();
  }

  /** HTTP 调用：文本 → CLAP embedding */
  async analyzeText(text: string): Promise<{ success: boolean; embedding_b64?: string; dimension?: number; error?: string }> {
    if (!this.isAvailable) {
      return { success: false, error: 'Sidecar 未启动' };
    }

    const res = await fetch(`http://${SIDECAR_HOST}:${SIDECAR_PORT}/analyze/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10000),
    });

    return await res.json();
  }

  /** HTTP 调用：PANNs SED 事件检测 */
  async analyzePanns(
    filePath: string,
    options?: { threshold?: number; minDuration?: number; maxSegments?: number }
  ): Promise<{
    success: boolean;
    segments?: Array<{
      label: string;
      display_label: string;
      start_time: number;
      end_time: number;
      peak_prob: number;
    }>;
    error?: string;
  }> {
    if (!this.isAvailable) {
      return { success: false, error: 'Sidecar 未启动' };
    }

    const res = await fetch(`http://${SIDECAR_HOST}:${SIDECAR_PORT}/analyze/panns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_path: filePath,
        threshold: options?.threshold ?? 0.3,
        min_duration: options?.minDuration ?? 0.25,
        max_segments: options?.maxSegments ?? 20,
      }),
      signal: AbortSignal.timeout(60000),
    });

    return await res.json();
  }

  /** HTTP 调用：健康检查 */
  async checkHealth(): Promise<{ status: string; clap_loaded: boolean; panns_loaded: boolean }> {
    const res = await fetch(`http://${SIDECAR_HOST}:${SIDECAR_PORT}/health`, {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
    });
    return await res.json();
  }

  // ── 私有方法 ────────────────────────────────────────────────────────

  private async _checkHealth(host: string, port: number): Promise<boolean> {
    try {
      const res = await fetch(`http://${host}:${port}/health`, {
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async _waitForStartup(host: string, port: number, maxWaitMs = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (await this._checkHealth(host, port)) {
        return;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Sidecar 启动超时');
  }

  private _startHealthCheck(host: string, port: number): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(async () => {
      const ok = await this._checkHealth(host, port);
      if (!ok && this.isAvailable) {
        console.warn('[Sidecar] 健康检查失败，标记为不可用');
        this.isAvailable = false;
      } else if (ok && !this.isAvailable) {
        console.log('[Sidecar] 健康检查恢复');
        this.isAvailable = true;
      }
    }, HEALTH_CHECK_INTERVAL);
  }
}

export const analyzerSidecar = new AnalyzerSidecarManager();
