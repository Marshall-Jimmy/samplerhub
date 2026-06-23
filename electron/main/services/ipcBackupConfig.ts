import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import type { IpcContext } from './ipcTypes';
import fs from 'node:fs';
import path from 'node:path';
import { createBackup, restoreBackup, listBackups } from './backupService';

export function registerBackupConfigHandlers(ctx: IpcContext): void {
  // ===== 备份/恢复 =====

  ipcMain.handle(IPC_CHANNELS.BACKUP_CREATE, async () => {
    try {
      const result = createBackup();
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_RESTORE, async (_event, data: { fileName: string }) => {
    try {
      const result = restoreBackup(data.fileName);
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_LIST, async () => {
    try {
      const backups = listBackups();
      return { success: true, data: backups };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 配置导入/导出 =====
  const CONFIG_FILE_NAMES = ['samplerhub-settings', 'samplerhub-shortcuts', 'samplerhub-library', 'samplerhub-playlist'];

  ipcMain.handle(IPC_CHANNELS.CONFIG_EXPORT, async () => {
    try {
      const { app } = await import('electron');
      const userDataPath = app.getPath('userData');
      const configData: Record<string, unknown> = {};

      for (const name of CONFIG_FILE_NAMES) {
        const filePath = path.join(userDataPath, `${name}.json`);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          try {
            configData[name] = JSON.parse(content);
          } catch {
            configData[name] = content;
          }
        }
      }

      const exportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        configs: configData,
      };

      const saveResult = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow()!, {
        title: '导出配置',
        defaultPath: `samplerhub-config-${Date.now()}.json`,
        filters: [{ name: 'JSON 配置', extensions: ['json'] }],
      });

      if (!saveResult.filePath) {
        return { success: true, data: null };
      }

      fs.writeFileSync(saveResult.filePath, JSON.stringify(exportPayload, null, 2), 'utf-8');
      return { success: true, data: { path: saveResult.filePath } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_IMPORT, async () => {
    try {
      const { app } = await import('electron');
      const userDataPath = app.getPath('userData');

      const openResult = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
        title: '导入配置',
        properties: ['openFile'],
        filters: [{ name: 'JSON 配置', extensions: ['json'] }],
      });

      if (openResult.canceled || openResult.filePaths.length === 0) {
        return { success: true, data: { imported: false } };
      }

      const filePath = openResult.filePaths[0];
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      if (!data.configs || typeof data.configs !== 'object') {
        return { success: false, error: 'Invalid config format' };
      }

      let importedCount = 0;
      for (const name of CONFIG_FILE_NAMES) {
        if (data.configs[name] !== undefined) {
          const targetPath = path.join(userDataPath, `${name}.json`);
          const writeContent = typeof data.configs[name] === 'string'
            ? data.configs[name]
            : JSON.stringify(data.configs[name], null, 2);
          fs.writeFileSync(targetPath, writeContent, 'utf-8');
          importedCount++;
        }
      }

      return { success: true, data: { imported: true, count: importedCount } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
