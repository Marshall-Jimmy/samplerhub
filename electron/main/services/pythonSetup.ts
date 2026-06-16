/**
 * Python 环境检测与自动安装服务
 * 首次启动时检测 Python 是否可用，并自动安装 sidecar 依赖
 */

import { app } from 'electron';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);

interface PythonCheckResult {
  available: boolean;
  version?: string;
  path?: string;
  error?: string;
}

interface SetupStatus {
  pythonChecked: boolean;
  pythonAvailable: boolean;
  dependenciesInstalled: boolean;
  lastError?: string;
}

const SETUP_STATUS_KEY = 'python-setup-status';
const SETUP_LOG_FILE = 'python-setup.log';

/**
 * 获取 setup 状态文件路径
 */
function getStatusFilePath(): string {
  return path.join(app.getPath('userData'), `${SETUP_STATUS_KEY}.json`);
}

/**
 * 读取 setup 状态
 */
function readSetupStatus(): SetupStatus {
  try {
    const filePath = getStatusFilePath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {
    pythonChecked: false,
    pythonAvailable: false,
    dependenciesInstalled: false,
  };
}

/**
 * 保存 setup 状态
 */
function saveSetupStatus(status: SetupStatus): void {
  try {
    fs.writeFileSync(getStatusFilePath(), JSON.stringify(status, null, 2));
  } catch {
    // ignore
  }
}

/**
 * 写入 setup 日志
 */
function logSetup(message: string): void {
  const logPath = path.join(app.getPath('userData'), SETUP_LOG_FILE);
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
  console.log(`[PythonSetup] ${message}`);
}

/**
 * 检测 Python 是否可用
 */
export async function checkPython(): Promise<PythonCheckResult> {
  const candidates = os.platform() === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const { stdout } = await execAsync(`${cmd} --version`, { timeout: 5000 });
      const version = stdout.trim();
      // 检查版本是否 >= 3.9
      const match = version.match(/Python (\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1]);
        const minor = parseInt(match[2]);
        if (major > 3 || (major === 3 && minor >= 9)) {
          // 获取 Python 可执行文件完整路径
          const { stdout: pathStdout } = await execAsync(
            os.platform() === 'win32'
              ? `where ${cmd}`
              : `which ${cmd}`,
            { timeout: 5000 }
          );
          return {
            available: true,
            version,
            path: pathStdout.trim().split('\n')[0].trim(),
          };
        }
      }
    } catch {
      // 继续尝试下一个候选
    }
  }

  return {
    available: false,
    error: 'Python 3.9+ not found. Please install Python from https://python.org',
  };
}

/**
 * 获取 sidecar 代码路径（开发环境 vs 生产环境）
 */
function getSidecarCodePath(): string {
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(process.cwd(), 'apps', 'analyzer');
  }
  // 生产环境：extraResources 复制到 resources/analyzer
  return path.join(process.resourcesPath, 'analyzer');
}

/**
 * 安装 Python 依赖
 */
export async function installPythonDependencies(
  pythonPath: string,
  onProgress?: (message: string) => void
): Promise<{ success: boolean; error?: string }> {
  const sidecarPath = getSidecarCodePath();
  const requirementsPath = path.join(sidecarPath, 'requirements.txt');

  if (!fs.existsSync(requirementsPath)) {
    return {
      success: false,
      error: `requirements.txt not found at ${requirementsPath}`,
    };
  }

  logSetup(`Installing dependencies from ${requirementsPath}`);
  onProgress?.('正在安装 Python 依赖，这可能需要几分钟...');

  return new Promise((resolve) => {
    const pipArgs = [
      '-m', 'pip', 'install',
      '-r', requirementsPath,
      '--user',
      '--no-warn-script-location',
      '--no-cache-dir',
    ];

    // Windows 上可能需要使用 python -m pip
    const spawnCmd = os.platform() === 'win32' ? pythonPath : pythonPath;

    const child = spawn(spawnCmd, pipArgs, {
      cwd: sidecarPath,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const line = data.toString();
      stdout += line;
      logSetup(`[pip stdout] ${line.trim()}`);
      onProgress?.(line.trim());
    });

    child.stderr.on('data', (data) => {
      const line = data.toString();
      stderr += line;
      logSetup(`[pip stderr] ${line.trim()}`);
      // stderr 不一定是错误，pip 会把进度信息输出到 stderr
      onProgress?.(line.trim());
    });

    child.on('close', (code) => {
      if (code === 0) {
        logSetup('Dependencies installed successfully');
        resolve({ success: true });
      } else {
        const error = `pip install failed with code ${code}. stderr: ${stderr.slice(-500)}`;
        logSetup(error);
        resolve({ success: false, error });
      }
    });

    child.on('error', (err) => {
      const error = `Failed to spawn pip: ${err.message}`;
      logSetup(error);
      resolve({ success: false, error });
    });
  });
}

/**
 * 验证关键依赖是否已安装
 */
export async function verifyDependencies(pythonPath: string): Promise<boolean> {
  const packages = ['fastapi', 'uvicorn', 'torch', 'numpy', 'librosa'];
  try {
    const { stdout } = await execAsync(
      `"${pythonPath}" -c "${packages.map(p => `import ${p.replace('-', '_')}`).join('; ')}; print('OK')"`,
      { timeout: 30000 }
    );
    return stdout.trim() === 'OK';
  } catch {
    return false;
  }
}

/**
 * 主入口：运行完整的 Python 环境设置流程
 */
export async function runPythonSetup(
  onProgress?: (message: string) => void
): Promise<{
  success: boolean;
  pythonAvailable: boolean;
  dependenciesInstalled: boolean;
  error?: string;
}> {
  const status = readSetupStatus();

  // 如果已经检查过且都成功，直接返回
  if (status.pythonChecked && status.pythonAvailable && status.dependenciesInstalled) {
    logSetup('Setup already completed, skipping');
    return {
      success: true,
      pythonAvailable: true,
      dependenciesInstalled: true,
    };
  }

  logSetup('Starting Python environment setup...');
  onProgress?.('正在检测 Python 环境...');

  // 1. 检测 Python
  const pythonCheck = await checkPython();
  status.pythonChecked = true;
  status.pythonAvailable = pythonCheck.available;

  if (!pythonCheck.available) {
    const error = pythonCheck.error || 'Python not available';
    status.lastError = error;
    saveSetupStatus(status);
    logSetup(`Python check failed: ${error}`);
    return {
      success: false,
      pythonAvailable: false,
      dependenciesInstalled: false,
      error,
    };
  }

  logSetup(`Python found: ${pythonCheck.version} at ${pythonCheck.path}`);
  onProgress?.(`检测到 ${pythonCheck.version}`);

  // 2. 验证依赖
  onProgress?.('正在验证依赖...');
  const depsOk = await verifyDependencies(pythonCheck.path!);

  if (depsOk) {
    logSetup('Dependencies already installed');
    status.dependenciesInstalled = true;
    saveSetupStatus(status);
    return {
      success: true,
      pythonAvailable: true,
      dependenciesInstalled: true,
    };
  }

  // 3. 安装依赖
  const installResult = await installPythonDependencies(pythonCheck.path!, onProgress);

  if (installResult.success) {
    // 再次验证
    const verifyOk = await verifyDependencies(pythonCheck.path!);
    status.dependenciesInstalled = verifyOk;
    saveSetupStatus(status);

    if (verifyOk) {
      logSetup('Setup completed successfully');
      return {
        success: true,
        pythonAvailable: true,
        dependenciesInstalled: true,
      };
    } else {
      const error = 'Dependencies installed but verification failed';
      status.lastError = error;
      saveSetupStatus(status);
      return {
        success: false,
        pythonAvailable: true,
        dependenciesInstalled: false,
        error,
      };
    }
  } else {
    status.dependenciesInstalled = false;
    status.lastError = installResult.error;
    saveSetupStatus(status);
    return {
      success: false,
      pythonAvailable: true,
      dependenciesInstalled: false,
      error: installResult.error,
    };
  }
}

/**
 * 获取 Python 可执行文件路径（如果可用）
 */
export async function getPythonPath(): Promise<string | null> {
  const status = readSetupStatus();
  if (status.pythonAvailable && status.dependenciesInstalled) {
    const check = await checkPython();
    return check.available ? check.path || 'python' : null;
  }
  return null;
}

/**
 * 重置 setup 状态（用于重新检测）
 */
export function resetSetupStatus(): void {
  saveSetupStatus({
    pythonChecked: false,
    pythonAvailable: false,
    dependenciesInstalled: false,
  });
}
