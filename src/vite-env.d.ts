/// <reference types="vite/client" />

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  electronAPI: {
    invoke: (channel: string, ...args: any[]) => Promise<any>
    on: (channel: string, listener: (...args: any[]) => void) => () => void
    off: (channel: string, listener?: (...args: any[]) => void) => void
    send: (channel: string, ...args: any[]) => void
  }
}