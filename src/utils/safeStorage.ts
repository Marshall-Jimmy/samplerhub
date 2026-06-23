/**
 * safeStorage — 主进程 JSON 文件持久化存储的渲染进程代理
 *
 * localStorage 在 Electron app:// 协议下被安全策略禁用（"Access is denied"）。
 * 改用 IPC 调用主进程的 storeService，将数据持久化到 userData/store/*.json 文件。
 *
 * 与 zustand persist 的 createJSONStorage(() => safeStorage) 兼容。
 */

const safeStorage = {
  getItem: (name: string): string | null => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.storeGet) {
        return (window as any).electronAPI.storeGet(name)
      }
      return null
    } catch {
      return null
    }
  },

  setItem: (name: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.storeSet) {
        ;(window as any).electronAPI.storeSet(name, value)
      }
    } catch {
      // 静默忽略写入失败
    }
  },

  removeItem: (name: string): void => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.storeRemove) {
        ;(window as any).electronAPI.storeRemove(name)
      }
    } catch {
      // 静默忽略
    }
  },
}

export default safeStorage
