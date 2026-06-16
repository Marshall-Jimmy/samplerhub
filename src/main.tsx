import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './index.css'

// 异步加载 i18n 和 App，避免同步 import 阻塞脚本解析
Promise.all([
  import('./i18n'),
  import('./App'),
]).then(([_, { default: App }]) => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})

// 异步加载 Tone.js，不阻塞渲染
import('tone').then(Tone => {
  (window as any).Tone = Tone
})