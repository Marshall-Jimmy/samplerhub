import React, { useState } from 'react';
import { Modal, Divider } from 'antd';
import {
  BookOutlined,
  AppstoreOutlined,
  SoundOutlined,
  CustomerServiceOutlined,
  ControlOutlined,
  ApiOutlined,
  CodeOutlined,
  SafetyOutlined,
  GlobalOutlined,
  DatabaseOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface DocsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: string;
}

type DocSection = 'tutorial' | 'mod-api' | 'mod-examples' | 'mod-permissions';

const DocsModal: React.FC<DocsModalProps> = ({ open, onClose, initialTab = 'tutorial' }) => {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<DocSection>(initialTab as DocSection);

  const sections: { key: DocSection; icon: React.ReactNode; label: string }[] = [
    { key: 'tutorial', icon: <BookOutlined />, label: t('docs.tutorial') },
    { key: 'mod-api', icon: <ApiOutlined />, label: t('docs.modApi') },
    { key: 'mod-examples', icon: <CodeOutlined />, label: t('docs.modExamples') },
    { key: 'mod-permissions', icon: <SafetyOutlined />, label: t('docs.modPermissions') },
  ];

  const headingStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, marginTop: 16,
  };

  const codeStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 12,
    fontFamily: 'monospace',
    color: 'var(--text-secondary)',
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    margin: '4px 0',
  };

  const descStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.6,
  };

  const apiTableStyle: React.CSSProperties = {
    width: '100%', borderCollapse: 'collapse', fontSize: 12,
  };

  const renderTutorial = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
      <h3 style={{ ...headingStyle, marginTop: 0 }}>{t('docs.gettingStarted')}</h3>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--brand-primary)', fontSize: 16, marginTop: 2 }}><SoundOutlined /></span>
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t('docs.tutAddFolder')}</p>
          <p style={descStyle}>{t('docs.tutAddFolderDesc')}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--brand-primary)', fontSize: 16, marginTop: 2 }}><AppstoreOutlined /></span>
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t('docs.tutPadWindow')}</p>
          <p style={descStyle}>{t('docs.tutPadWindowDesc')}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--brand-primary)', fontSize: 16, marginTop: 2 }}><CustomerServiceOutlined /></span>
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t('docs.tutSequencer')}</p>
          <p style={descStyle}>{t('docs.tutSequencerDesc')}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--brand-primary)', fontSize: 16, marginTop: 2 }}><ControlOutlined /></span>
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t('docs.tutMixer')}</p>
          <p style={descStyle}>{t('docs.tutMixerDesc')}</p>
        </div>
      </div>

      <Divider style={{ margin: '12px 0', borderColor: 'var(--border-subtle)' }} />

      <h3 style={headingStyle}>{t('docs.tutEffects')}</h3>
      <p style={descStyle}>{t('docs.tutEffectsDesc')}</p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--brand-primary)', fontSize: 14, marginTop: 2 }}>🎵</span>
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t('docs.tutDelay')}</p>
          <p style={descStyle}>{t('docs.tutDelayDesc')}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--brand-primary)', fontSize: 14, marginTop: 2 }}>🌊</span>
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t('docs.tutReverb')}</p>
          <p style={descStyle}>{t('docs.tutReverbDesc')}</p>
        </div>
      </div>

      <Divider style={{ margin: '12px 0', borderColor: 'var(--border-subtle)' }} />

      <h3 style={headingStyle}>{t('docs.tutMods')}</h3>
      <p style={descStyle}>{t('docs.tutModsDesc')}</p>
    </div>
  );

  const renderModApi = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
      <h3 style={{ ...headingStyle, marginTop: 0 }}>{t('docs.apiLifecycle')}</h3>
      <div style={codeStyle}>{`export default {
  id: 'com.example.mymod',
  name: 'My Mod',
  version: '1.0.0',
  author: 'Author',
  description: 'Description',
  permissions: ['network'],

  activate(api) {
    // 模组激活时调用
  },

  deactivate(api) {
    // 模组禁用时调用
  }
};`}</div>

      <Divider style={{ margin: '12px 0', borderColor: 'var(--border-subtle)' }} />

      <h3 style={headingStyle}>{t('docs.apiLogger')}</h3>
      <div style={codeStyle}>{`api.logger.info('message')
api.logger.warn('message')
api.logger.error('message')`}</div>

      <h3 style={headingStyle}>{t('docs.apiNotifications')}</h3>
      <div style={codeStyle}>{`api.notifications.show('Title', 'Content')
api.notifications.show('Title', { body: 'Content', type: 'success' })`}</div>

      <h3 style={headingStyle}>{t('docs.apiStorage')}</h3>
      <div style={codeStyle}>{`api.storage.get('key')
api.storage.set('key', value)
api.storage.remove('key')`}</div>

      <h3 style={headingStyle}>{t('docs.apiAudio')}</h3>
      <div style={codeStyle}>{`const ctx = api.audio.getContext()
api.audio.insertEffect('master', audioNode)
api.audio.removeEffect('master')
api.audio.onPadTrigger((padId, options) => { })
api.audio.getParam('master.volume')
api.audio.setParam('master.volume', 0.8)`}</div>

      <h3 style={headingStyle}>{t('docs.apiStores')}</h3>
      <div style={codeStyle}>{`const state = api.stores.pad.getState()
const unsubscribe = api.stores.library.subscribe((s) => { })`}</div>

      <h3 style={headingStyle}>{t('docs.apiHooks')}</h3>
      <div style={codeStyle}>{`const unsub = api.hooks.register('pad:beforeTrigger', (padId, opts) => {
  opts.velocity *= 1.2
  return opts
})`}</div>

      <h3 style={headingStyle}>{t('docs.apiNetwork')}</h3>
      <div style={codeStyle}>{`// GET
const res = await api.network.get('https://api.example.com/data')
console.log(res.data, res.status)

// GET with params & timeout
const res2 = await api.network.get('https://api.example.com/search', {
  params: { q: 'kick' },
  timeout: 10000,
  responseType: 'json' // 'json' | 'text' | 'blob' | 'arraybuffer'
})

// POST
await api.network.post('https://api.example.com/save', { name: 'test' })

// PUT
await api.network.put('https://api.example.com/update/1', { name: 'updated' })

// DELETE
await api.network.delete('https://api.example.com/delete/1')

// Raw fetch
const res3 = await api.network.fetch('https://example.com/api', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer token' }
})

// JSONP (for CORS-limited APIs)
const data = await api.network.jsonp('https://api.example.com/callback')`}</div>

      <h3 style={headingStyle}>{t('docs.apiUI')}</h3>
      <div style={codeStyle}>{`// Toolbar button
api.ui.toolbar.addButton({
  id: 'my-btn', icon: '🎹', tooltip: 'My Tool',
  onClick: () => { }
})

// Custom panel
api.ui.panel.register({
  id: 'my-panel', title: 'My Panel',
  component: MyReactComponent,
  position: 'sidebar' // 'sidebar' | 'modal' | 'floating'
})

// Settings tab
api.ui.settings.addTab({
  id: 'my-settings', title: 'My Settings',
  component: MySettingsComponent
})

// Custom theme
api.ui.theme.register({
  id: 'my-theme', name: 'My Theme',
  variables: { '--brand-primary': '#ff00ff' }
})`}</div>

      <h3 style={headingStyle}>{t('docs.apiHooksList')}</h3>
      <table style={apiTableStyle}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <th style={{ ...{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-tertiary)', fontWeight: 600 } }}>{t('docs.hookName')}</th>
            <th style={{ ...{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-tertiary)', fontWeight: 600 } }}>{t('docs.hookParams')}</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['pad:beforeTrigger', 'padId, options'],
            ['library:afterScan', 'result'],
            ['player:beforePlay', 'sampleId'],
          ].map(([name, params]) => (
            <tr key={name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: 'var(--brand-primary)', fontSize: 11 }}>{name}</td>
              <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: 11 }}>{params}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderModExamples = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
      <h3 style={{ ...headingStyle, marginTop: 0 }}>{t('docs.exampleHelloWorld')}</h3>
      <div style={codeStyle}>{`export default {
  id: 'com.example.hello',
  name: 'Hello World',
  version: '1.0.0',
  author: 'Your Name',
  permissions: [],
  activate(api) {
    api.notifications.show('Hello!', 'Mod activated!')
    api.shortcuts?.register('Ctrl+Shift+H', () => {
      api.notifications.show('Hello from Mod!')
    })
  }
};`}</div>

      <Divider style={{ margin: '12px 0', borderColor: 'var(--border-subtle)' }} />

      <h3 style={headingStyle}>{t('docs.exampleDelayEffect')}</h3>
      <div style={codeStyle}>{`export default {
  id: 'com.example.dub-delay',
  name: 'Dub Delay',
  version: '1.0.0',
  permissions: ['audio:engine', 'ui:inject'],
  activate(api) {
    const ctx = api.audio.getContext()
    const delay = ctx.createDelay(2.0)
    const feedback = ctx.createGain()
    delay.delayTime.value = 0.375
    feedback.gain.value = 0.6
    delay.connect(feedback)
    feedback.connect(delay)
    api.audio.insertEffect('send:delay', delay)
  },
  deactivate(api) {
    api.audio.removeEffect('send:delay')
  }
};`}</div>

      <Divider style={{ margin: '12px 0', borderColor: 'var(--border-subtle)' }} />

      <h3 style={headingStyle}>{t('docs.exampleTheme')}</h3>
      <div style={codeStyle}>{`export default {
  id: 'com.example.neon-theme',
  name: 'Neon Nights',
  version: '1.0.0',
  permissions: ['ui:theme'],
  activate(api) {
    api.ui.theme.register({
      id: 'neon', name: 'Neon Nights',
      variables: {
        '--brand-primary': '#ff00ff',
        '--bg-primary': '#0a0a1a',
        '--text-primary': '#e0e0ff',
      }
    })
    api.ui.theme.activate('neon')
  },
  deactivate(api) {
    api.ui.theme.unregister('neon')
  }
};`}</div>

      <Divider style={{ margin: '12px 0', borderColor: 'var(--border-subtle)' }} />

      <h3 style={headingStyle}>{t('docs.exampleNetwork')}</h3>
      <div style={codeStyle}>{`export default {
  id: 'com.example.online-fetch',
  name: 'Online Fetch',
  version: '1.0.0',
  permissions: ['network'],
  async activate(api) {
    try {
      const res = await api.network.get('https://api.example.com/samples', {
        params: { category: 'kick' },
        timeout: 10000,
      })
      if (res.ok) {
        api.notifications.show('Success', \`Found \${res.data.length} samples\`)
      }
    } catch (err) {
      api.logger.error('Fetch failed:', err)
    }
  }
};`}</div>
    </div>
  );

  const renderModPermissions = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
      <h3 style={{ ...headingStyle, marginTop: 0 }}>{t('docs.permissionsList')}</h3>
      <table style={apiTableStyle}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-tertiary)', fontWeight: 600, width: '30%' }}>{t('docs.permName')}</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{t('docs.permDesc')}</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['audio:engine', t('docs.permAudioEngine'), <SoundOutlined />],
            ['audio:mixer', t('docs.permAudioMixer'), <ControlOutlined />],
            ['ui:inject', t('docs.permUiInject'), <AppstoreOutlined />],
            ['ui:theme', t('docs.permUiTheme'), <BulbOutlined />],
            ['storage:read', t('docs.permStorageRead'), <DatabaseOutlined />],
            ['storage:write', t('docs.permStorageWrite'), <DatabaseOutlined />],
            ['ipc:invoke', t('docs.permIpc'), <ApiOutlined />],
            ['library:read', t('docs.permLibraryRead'), <GlobalOutlined />],
            ['library:write', t('docs.permLibraryWrite'), <GlobalOutlined />],
            ['network', t('docs.permNetwork'), <GlobalOutlined />],
          ].map(([name, desc, icon]) => (
            <tr key={name as string} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '6px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--brand-primary)', fontSize: 13 }}>{icon}</span>
                  <code style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--brand-primary)', background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 3 }}>{name as string}</code>
                </div>
              </td>
              <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontSize: 12 }}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Divider style={{ margin: '12px 0', borderColor: 'var(--border-subtle)' }} />

      <h3 style={headingStyle}>{t('docs.permNetworkDetail')}</h3>
      <p style={descStyle}>{t('docs.permNetworkDesc')}</p>

      <h3 style={headingStyle}>{t('docs.permNetworkResponse')}</h3>
      <div style={codeStyle}>{`interface ModResponse {
  ok: boolean         // 请求是否成功
  status: number      // HTTP 状态码
  statusText: string  // 状态文本
  headers: Record<string, string>  // 响应头
  data: any           // 响应数据
  url: string         // 最终 URL
}`}</div>

      <h3 style={headingStyle}>{t('docs.permNetworkOptions')}</h3>
      <div style={codeStyle}>{`interface ModRequestOptions {
  headers?: Record<string, string>     // 自定义请求头
  params?: Record<string, string>      // URL 查询参数
  timeout?: number                     // 超时时间（ms，默认 30000）
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer'  // 响应数据格式
}`}</div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'tutorial': return renderTutorial();
      case 'mod-api': return renderModApi();
      case 'mod-examples': return renderModExamples();
      case 'mod-permissions': return renderModPermissions();
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOutlined style={{ color: 'var(--brand-primary)' }} />
          <span>{t('docs.title')}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      styles={{
        content: {
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
        },
        header: {
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        },
        body: {
          background: 'var(--bg-surface)',
          maxHeight: '70vh',
          overflowY: 'auto',
        },
      }}
    >
      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-active)', borderRadius: 8, padding: 2 }}>
        {sections.map((section) => (
          <button
            key={section.key}
            onClick={() => setActiveSection(section.key)}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6,
              border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              background: activeSection === section.key ? 'var(--bg-elevated)' : 'transparent',
              color: activeSection === section.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: activeSection === section.key ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              transition: 'all 0.15s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            {section.icon}
            {section.label}
          </button>
        ))}
      </div>

      {renderContent()}
    </Modal>
  );
};

export default DocsModal;
