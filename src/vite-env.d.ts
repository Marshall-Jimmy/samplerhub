/// <reference types="vite/client" />

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  electronAPI: {
    invoke: (channel: string, ...args: any[]) => Promise<any>
    on: (channel: string, listener: (...args: any[]) => void) => () => void
    off: (channel: string, listener?: (...args: any[]) => void) => void
    send: (channel: string, ...args: any[]) => void
    minimize: () => void
    maximize: () => void
    close: () => void
    createPadWindow: () => Promise<{ success: boolean; data?: boolean; error?: string }>
    createSequencerWindow: () => Promise<{ success: boolean; data?: boolean; error?: string }>
    setAlwaysOnTop: (flag: boolean) => Promise<{ success: boolean; data?: boolean; error?: string }>
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => void
    removeMaximizeListener: () => void
  }
}