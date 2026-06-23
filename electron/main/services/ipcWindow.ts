import { ipcMain, BrowserWindow } from 'electron';

// 工具窗口管理（模块级变量，由 index.ts 注入）
var toolWindowsMap: Map<string, BrowserWindow> | null = null;
var createPadWindowFn: (() => BrowserWindow) | null = null;
var createSequencerWindowFn: (() => BrowserWindow) | null = null;

export function setToolWindowsMap(map: Map<string, BrowserWindow>) {
  toolWindowsMap = map;
}

export function setWindowCreators(padFn: () => BrowserWindow, seqFn: () => BrowserWindow) {
  createPadWindowFn = padFn;
  createSequencerWindowFn = seqFn;
}

export function registerWindowHandlers(mainWindow: BrowserWindow): void {
  // 窗口控制
  ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  // 工具窗口
  ipcMain.handle('window:createPad', async () => {
    if (!toolWindowsMap) return { success: false, error: 'Not initialized' };
    const existing = toolWindowsMap.get('pad');
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return { success: true, data: true };
    }
    if (createPadWindowFn) {
      createPadWindowFn();
      return { success: true, data: true };
    }
    return { success: false, error: 'Window creator not set' };
  });

  ipcMain.handle('window:createSequencer', async () => {
    if (!toolWindowsMap) return { success: false, error: 'Not initialized' };
    const existing = toolWindowsMap.get('sequencer');
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return { success: true, data: true };
    }
    if (createSequencerWindowFn) {
      createSequencerWindowFn();
      return { success: true, data: true };
    }
    return { success: false, error: 'Window creator not set' };
  });

  ipcMain.handle('window:setAlwaysOnTop', async (_event, { flag }: { flag: boolean }) => {
    const sender = BrowserWindow.fromWebContents(_event.sender);
    if (sender && !sender.isDestroyed()) {
      sender.setAlwaysOnTop(flag, 'floating');
      return { success: true, data: flag };
    }
    return { success: false, error: 'Window not found' };
  });
}
