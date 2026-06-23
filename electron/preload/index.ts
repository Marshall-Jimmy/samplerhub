import { ipcRenderer, contextBridge } from 'electron'
import { IPC_CHANNELS } from '../../shared/types/ipc.types'

// 合法的 IPC 通道白名单
const ALLOWED_INVOKE_CHANNELS = new Set<string>([
  IPC_CHANNELS.GET_SAMPLES,
  IPC_CHANNELS.GET_SAMPLES_PAGINATED,
  IPC_CHANNELS.GET_SAMPLE_BY_ID,
  IPC_CHANNELS.SEARCH_SAMPLES,
  IPC_CHANNELS.UPDATE_SAMPLE,
  IPC_CHANNELS.DELETE_SAMPLE,
  IPC_CHANNELS.GET_CATEGORIES,
  IPC_CHANNELS.CREATE_CATEGORY,
  IPC_CHANNELS.UPDATE_CATEGORY,
  IPC_CHANNELS.DELETE_CATEGORY,
  IPC_CHANNELS.ADD_WATCHED_FOLDER,
  IPC_CHANNELS.REMOVE_WATCHED_FOLDER,
  IPC_CHANNELS.GET_WATCHED_FOLDERS,
  IPC_CHANNELS.GET_FOLDER_TREE,
  IPC_CHANNELS.SCAN_FOLDER,
  IPC_CHANNELS.GET_TAGS,
  IPC_CHANNELS.CREATE_TAG,
  IPC_CHANNELS.UPDATE_TAG,
  IPC_CHANNELS.DELETE_TAG,
  IPC_CHANNELS.GET_RULES,
  IPC_CHANNELS.CREATE_RULE,
  IPC_CHANNELS.UPDATE_RULE,
  IPC_CHANNELS.DELETE_RULE,
  IPC_CHANNELS.TOGGLE_FAVORITE,
  IPC_CHANNELS.GET_FAVORITES,
  IPC_CHANNELS.GET_RECENT,
  IPC_CHANNELS.ADD_RECENT,
  IPC_CHANNELS.START_SCAN,
  IPC_CHANNELS.STOP_SCAN,
  IPC_CHANNELS.CLASSIFY_SAMPLE,
  IPC_CHANNELS.CLASSIFY_ALL,
  IPC_CHANNELS.GET_CLASSIFICATION_RULES,
  IPC_CHANNELS.DIALOG_OPEN_FOLDER,
  IPC_CHANNELS.DIALOG_OPEN_FOLDERS,
  IPC_CHANNELS.GET_WAVEFORM,
  IPC_CHANNELS.SAVE_WAVEFORM,
  IPC_CHANNELS.GET_PLAYLISTS,
  IPC_CHANNELS.CREATE_PLAYLIST,
  IPC_CHANNELS.UPDATE_PLAYLIST,
  IPC_CHANNELS.DELETE_PLAYLIST,
  IPC_CHANNELS.GET_PLAYLIST_ITEMS,
  IPC_CHANNELS.ADD_TO_PLAYLIST,
  IPC_CHANNELS.REMOVE_FROM_PLAYLIST,
  IPC_CHANNELS.REORDER_PLAYLIST,
  IPC_CHANNELS.EXPORT_PLAYLIST,
  IPC_CHANNELS.GET_SMART_FOLDERS,
  IPC_CHANNELS.CREATE_SMART_FOLDER,
  IPC_CHANNELS.UPDATE_SMART_FOLDER,
  IPC_CHANNELS.DELETE_SMART_FOLDER,
  IPC_CHANNELS.QUERY_SMART_FOLDER,
  IPC_CHANNELS.RECORD_PLAY,
  IPC_CHANNELS.GET_USAGE_STATS,
  IPC_CHANNELS.GET_MOST_PLAYED,
  IPC_CHANNELS.GET_LEAST_PLAYED,
  IPC_CHANNELS.DETECT_SILENCE,
  IPC_CHANNELS.GET_RENAME_SUGGESTIONS,
  IPC_CHANNELS.APPLY_RENAME,
  IPC_CHANNELS.EXPORT_SAMPLES_PACKAGE,
  IPC_CHANNELS.ONLINE_SEARCH,
  IPC_CHANNELS.ONLINE_DOWNLOAD,
  IPC_CHANNELS.ONLINE_GET_SNDDEV_CATEGORIES,
  IPC_CHANNELS.ONLINE_CACHE_PREVIEW,
  IPC_CHANNELS.SELECT_ONLINE_DOWNLOAD_FOLDER,
  IPC_CHANNELS.GET_SIMILAR_SAMPLES,
  IPC_CHANNELS.TEXT_SIMILARITY_SEARCH,
  IPC_CHANNELS.GET_DUPLICATES,
  IPC_CHANNELS.CLEAN_CORRUPTED,
  IPC_CHANNELS.DELETE_SAMPLES,
  IPC_CHANNELS.UPDATE_SAMPLES_CATEGORY,
  IPC_CHANNELS.BATCH_ADD_TAG,
  IPC_CHANNELS.EXPORT_SELECTION,
  IPC_CHANNELS.EXPORT_SAMPLES_JSON,
  IPC_CHANNELS.EXPORT_SAMPLES_CSV,
  // 标签和音频通道（已有常量）
  IPC_CHANNELS.ADD_TAG_TO_SAMPLE,
  IPC_CHANNELS.REMOVE_TAG_FROM_SAMPLE,
  IPC_CHANNELS.GET_PEAK_ENVELOPE,
  IPC_CHANNELS.PARSE_MIDI,
  IPC_CHANNELS.GET_MIDI_PREVIEW,
  IPC_CHANNELS.EXPORT_SEQUENCER_MIDI,
  // 音频分析
  IPC_CHANNELS.AUDIO_ANALYZE_FILE,
  IPC_CHANNELS.AUDIO_ANALYZE_BATCH,
  // 备份/恢复
  IPC_CHANNELS.BACKUP_CREATE,
  IPC_CHANNELS.BACKUP_RESTORE,
  IPC_CHANNELS.BACKUP_LIST,
  // 配置导入/导出
  IPC_CHANNELS.CONFIG_EXPORT,
  IPC_CHANNELS.CONFIG_IMPORT,
  // 批量重命名 + 引擎导出
  IPC_CHANNELS.GENERATE_BATCH_RENAME,
  IPC_CHANNELS.EXPORT_TO_ENGINE,
  IPC_CHANNELS.RUN_DELIVERY_QA,
  IPC_CHANNELS.GET_QA_RULES,
  // UCS 分类
  IPC_CHANNELS.GET_UCS_CATEGORIES,
  IPC_CHANNELS.GET_UCS_SUBCATEGORIES,
  'fs:readFile',
  'audio:getBuffer',
  'samples:getAudioBuffer',
])

const ALLOWED_ON_CHANNELS = new Set<string>([
  IPC_CHANNELS.SCAN_PROGRESS,
  IPC_CHANNELS.LIBRARY_CHANGED,
  'tray:toggle-play',
  'window:close-requested',
  'metadata-job:progress',
  'metadata-job:complete',
])

const ALLOWED_SEND_CHANNELS = new Set<string>([
  'drag:start',
  'show-item-in-folder',
  'window:minimize-to-tray',
  'window:force-quit',
  'perf:metric',
])

// --------- Expose electronAPI to the Renderer process ---------
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      console.warn(`[Preload] Blocked invoke on disallowed channel: ${channel}`)
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_ON_CHANNELS.has(channel)) {
      console.warn(`[Preload] Blocked on for disallowed channel: ${channel}`)
      return () => {}
    }
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  off: (channel: string, callback?: (...args: unknown[]) => void) => {
    if (callback) {
      ipcRenderer.removeListener(channel, callback as (...args: unknown[]) => void)
    } else {
      ipcRenderer.removeAllListeners(channel)
    }
  },
  send: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_SEND_CHANNELS.has(channel)) {
      console.warn(`[Preload] Blocked send on disallowed channel: ${channel}`)
      return
    }
    ipcRenderer.send(channel, ...args)
  },
  sendSync: (channel: string, ...args: unknown[]) => {
    console.warn(`[Preload] sendSync is blocked for security: ${channel}`)
    return undefined
  },
  // 窗口控制
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  createPadWindow: () => ipcRenderer.invoke('window:createPad'),
  createSequencerWindow: () => ipcRenderer.invoke('window:createSequencer'),
  setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:setAlwaysOnTop', { flag }),
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => ipcRenderer.on('window:maximizeChange', (_event, value) => callback(value)),
  removeMaximizeListener: () => ipcRenderer.removeAllListeners('window:maximizeChange'),
})

// --------- Preload scripts loading ---------
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child)
    }
  },
}

function useLoading() {
  const className = `loaders-css__square-spin`
  const styleContent = `
@keyframes square-spin {
  0% { transform: perspective(100px) rotateX(0) rotateY(0); }
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }
}

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)
