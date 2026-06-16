/**
 * 模组全能测试套件 (Mod Testkit)
 * 用于测试和验证 ModAPI 的所有功能是否正常工作
 *
 * 功能：
 * - 一键测试所有 API 接口（logger、storage、ipc、db、hooks、audio、ui）
 * - 实时显示 API 调用结果和耗时
 * - 模拟各种使用场景（播放监听、扫描监听、模式切换监听）
 * - 性能基准测试
 */

export default {
  id: 'com.samplerhub.mod-testkit',
  name: '模组测试套件',
  version: '1.0.0',
  apiVersion: '1.0.0',
  author: 'SamplerHub QA',
  description: '全能模组 API 测试工具。一键测试所有接口，验证 logger、storage、ipc、db、hooks、audio、ui 等功能是否正常。',
  permissions: ['audio:engine', 'ui:inject', 'library:read', 'library:write', 'network'],
  entry: { main: 'mod-testkit-main' },
  hooks: {
    'player:play': true,
    'player:stop': true,
    'scan:complete': true,
    'profile:modeChange': true,
  },
};

// ─── 主入口 ───────────────────────────────────────────────────────────────────

async function activate(api) {
  const { React, useState, useCallback, useEffect, useRef } = window;

  // ─── 测试结果存储 ─────────────────────────────────────────────────────────
  const TEST_RESULTS_KEY = 'mod-testkit:results';

  // ─── 测试用例定义 ─────────────────────────────────────────────────────────

  const testSuites = [
    {
      name: 'Logger',
      icon: '\uD83D\uDCDD',
      tests: [
        { id: 'log-info', name: 'info 日志', fn: async () => { api.logger.info('[Test] info message'); return 'ok'; } },
        { id: 'log-warn', name: 'warn 日志', fn: async () => { api.logger.warn('[Test] warn message'); return 'ok'; } },
        { id: 'log-error', name: 'error 日志', fn: async () => { api.logger.error('[Test] error message'); return 'ok'; } },
      ],
    },
    {
      name: 'Storage',
      icon: '\uD83D\uDCBE',
      tests: [
        { id: 'storage-set', name: '写入数据', fn: async () => { api.storage.set('test-key', { foo: 'bar', num: 42 }); return 'written'; } },
        { id: 'storage-get', name: '读取数据', fn: async () => { const v = api.storage.get('test-key'); return JSON.stringify(v); } },
        { id: 'storage-remove', name: '删除数据', fn: async () => { api.storage.remove('test-key'); return 'removed'; } },
        { id: 'storage-keys', name: '列出键名', fn: async () => { const keys = api.storage.keys(); return `keys: ${keys.length}`; } },
      ],
    },
    {
      name: 'Notifications',
      icon: '\uD83D\uDD14',
      tests: [
        { id: 'notify-info', name: 'info 通知', fn: async () => { api.notifications.show('info', '测试信息', '这是一条 info 通知'); return 'shown'; } },
        { id: 'notify-success', name: 'success 通知', fn: async () => { api.notifications.show('success', '测试成功', '这是一条 success 通知'); return 'shown'; } },
        { id: 'notify-error', name: 'error 通知', fn: async () => { api.notifications.show('error', '测试错误', '这是一条 error 通知'); return 'shown'; } },
      ],
    },
    {
      name: 'Profile Store',
      icon: '\uD83D\uDD04',
      tests: [
        { id: 'profile-mode', name: '读取 appMode', fn: async () => { const mode = api.stores.profile?.appMode; return `mode: ${mode ?? 'N/A'}`; } },
        { id: 'profile-config', name: '读取 config', fn: async () => { const cfg = api.stores.profile?.config; return `config keys: ${cfg ? Object.keys(cfg).length : 0}`; } },
      ],
    },
    {
      name: 'Library Store',
      icon: '\uD83D\uDCDA',
      tests: [
        { id: 'lib-categories', name: '读取 categories', fn: async () => { const cats = api.stores.library?.categories; return `categories: ${cats?.length ?? 'N/A'}`; } },
        { id: 'lib-samples', name: '读取 samples', fn: async () => { const samps = api.stores.library?.samples; return `samples: ${samps?.length ?? 'N/A'}`; } },
        { id: 'lib-viewMode', name: '读取 viewMode', fn: async () => { const vm = api.stores.library?.viewMode; return `viewMode: ${vm ?? 'N/A'}`; } },
      ],
    },
    {
      name: 'Player Store',
      icon: '\u25B6\uFE0F',
      tests: [
        { id: 'player-current', name: '读取 currentSample', fn: async () => { const cs = api.stores.player?.currentSample; return cs ? `playing: ${cs.fileName}` : 'no sample'; } },
        { id: 'player-playing', name: '读取 isPlaying', fn: async () => { const ip = api.stores.player?.isPlaying; return `isPlaying: ${ip}`; } },
        { id: 'player-volume', name: '读取 volume', fn: async () => { const vol = api.stores.player?.volume; return `volume: ${vol}`; } },
      ],
    },
    {
      name: 'IPC Invoke',
      icon: '\uD83D\uDCE1',
      tests: [
        { id: 'ipc-categories', name: 'categories:get', fn: async () => {
          const cats = await api.ipc.invoke('categories:get');
          return `got ${cats?.data?.length ?? 0} categories`;
        }},
        { id: 'ipc-tags', name: 'tags:get', fn: async () => {
          const tags = await api.ipc.invoke('tags:get');
          return `got ${tags?.data?.length ?? 0} tags`;
        }},
        { id: 'ipc-folders', name: 'folders:get', fn: async () => {
          const folders = await api.ipc.invoke('folders:get');
          return `got ${folders?.data?.length ?? 0} folders`;
        }},
        { id: 'ipc-ucs', name: 'ucs:getCategories', fn: async () => {
          const ucs = await api.ipc.invoke('ucs:getCategories');
          return `got ${ucs?.data?.length ?? 0} ucs categories`;
        }},
        { id: 'ipc-performance', name: 'perf:getMetrics', fn: async () => {
          const perf = await api.ipc.invoke('perf:getMetrics');
          return perf?.data ? `startup: ${perf.data.startupTime}ms` : 'no data';
        }},
      ],
    },
    {
      name: 'DB',
      icon: '\uD83D\uDDC3\uFE0F',
      tests: [
        { id: 'db-query', name: 'db.query 测试', fn: async () => {
          const result = await api.db.query('SELECT COUNT(*) as count FROM samples');
          return `samples count: ${result?.[0]?.count ?? 'N/A'}`;
        }},
        { id: 'db-query-cats', name: 'db.query 分类表', fn: async () => {
          const result = await api.db.query('SELECT COUNT(*) as count FROM categories');
          return `categories count: ${result?.[0]?.count ?? 'N/A'}`;
        }},
      ],
    },
    {
      name: 'Hooks',
      icon: '\uD83D\uDD17',
      tests: [
        { id: 'hook-register', name: '注册 player:play', fn: async () => {
          const unsub = api.hooks.register('player:play', (data) => {
            api.logger.info('[Hook] player:play', data);
          });
          return 'registered (check console for events)';
        }},
        { id: 'hook-emit', name: 'emit 自定义事件', fn: async () => {
          api.hooks.emit('mod:testkit:ping', { time: Date.now() });
          return 'emitted mod:testkit:ping';
        }},
      ],
    },
    {
      name: 'Audio',
      icon: '\uD83C\uDFA7',
      tests: [
        { id: 'audio-ctx', name: 'getContext', fn: async () => {
          const ctx = api.audio.getContext();
          return ctx ? `ctx state: ${ctx.state}` : 'no context';
        }},
        { id: 'audio-effect', name: 'insertEffect / removeEffect', fn: async () => {
          const node = api.audio.insertEffect('gain', { gain: 0.5 });
          const removed = api.audio.removeEffect(node);
          return `node created: ${!!node}, removed: ${removed}`;
        }},
      ],
    },
    {
      name: 'Network',
      icon: '\uD83C\uDF10',
      tests: [
        { id: 'net-get', name: 'GET 请求', fn: async () => {
          try {
            const resp = await api.network.get('https://httpbin.org/get', {}, { timeout: 5000 });
            return `status: ${resp.status}`;
          } catch (e) {
            return `error: ${e.message}`;
          }
        }},
        { id: 'net-fetch', name: 'fetch 请求', fn: async () => {
          try {
            const resp = await api.network.fetch('https://httpbin.org/get', { timeout: 5000 });
            return `ok: ${resp.ok}`;
          } catch (e) {
            return `error: ${e.message}`;
          }
        }},
      ],
    },
    {
      name: 'UI',
      icon: '\uD83C\uDFA8',
      tests: [
        { id: 'ui-toolbar', name: 'toolbar add/remove', fn: async () => {
          api.ui.toolbar.addButton('testkit-demo-btn', {
            label: 'Test',
            icon: '\uD83E\uDDEA',
            onClick: () => api.notifications.show('success', 'Test', 'Button clicked!'),
          });
          setTimeout(() => api.ui.toolbar.removeButton('testkit-demo-btn'), 3000);
          return 'button added (auto-remove in 3s)';
        }},
        { id: 'ui-settings', name: 'settings getAll', fn: async () => {
          const settings = api.ui.settings.getAll();
          return `settings keys: ${Object.keys(settings).length}`;
        }},
      ],
    },
  ];

  // ─── UI 组件 ────────────────────────────────────────────────────────────────

  function TestKitPanel() {
    const [results, setResults] = useState({});
    const [running, setRunning] = useState({});
    const [eventLog, setEventLog] = useState([]);
    const [activeTab, setActiveTab] = useState('tests');
    const eventLogRef = useRef([]);

    const addEvent = useCallback((type, data) => {
      const entry = { time: new Date().toLocaleTimeString(), type, data: JSON.stringify(data).slice(0, 200) };
      eventLogRef.current = [entry, ...eventLogRef.current].slice(0, 100);
      setEventLog([...eventLogRef.current]);
    }, []);

    // 监听所有 hooks 事件
    useEffect(() => {
      const unsubs = [
        api.hooks.register('player:play', (d) => addEvent('player:play', d)),
        api.hooks.register('player:stop', (d) => addEvent('player:stop', d)),
        api.hooks.register('scan:complete', (d) => addEvent('scan:complete', d)),
        api.hooks.register('profile:modeChange', (d) => addEvent('profile:modeChange', d)),
        api.hooks.register('mod:testkit:ping', (d) => addEvent('mod:testkit:ping', d)),
      ];
      return () => unsubs.forEach(u => u?.());
    }, [addEvent]);

    const runTest = useCallback(async (suiteName, test) => {
      const key = `${suiteName}.${test.id}`;
      setRunning(prev => ({ ...prev, [key]: true }));
      const start = performance.now();
      try {
        const result = await test.fn();
        const elapsed = (performance.now() - start).toFixed(1);
        setResults(prev => ({ ...prev, [key]: { status: 'pass', result, elapsed } }));
      } catch (err) {
        const elapsed = (performance.now() - start).toFixed(1);
        setResults(prev => ({ ...prev, [key]: { status: 'fail', result: err.message, elapsed } }));
      }
      setRunning(prev => ({ ...prev, [key]: false }));
    }, []);

    const runSuite = useCallback(async (suite) => {
      for (const test of suite.tests) {
        await runTest(suite.name, test);
      }
    }, [runTest]);

    const runAll = useCallback(async () => {
      for (const suite of testSuites) {
        await runSuite(suite);
      }
    }, [runSuite]);

    const clearResults = useCallback(() => {
      setResults({});
    }, []);

    const bgColor = 'var(--bg-elevated, #1C1C21)';
    const borderColor = 'var(--border-default, #2A2A32)';
    const textColor = 'var(--text-primary, #F0F0F3)';
    const textSecondary = 'var(--text-secondary, #A0A0AB)';
    const textTertiary = 'var(--text-tertiary, #71717A)';
    const brandColor = 'var(--brand-primary, #6366F1)';
    const passColor = '#10B981';
    const failColor = '#EF4444';

    const totalTests = testSuites.reduce((sum, s) => sum + s.tests.length, 0);
    const passedTests = Object.values(results).filter((r) => r.status === 'pass').length;
    const failedTests = Object.values(results).filter((r) => r.status === 'fail').length;

    return React.createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: bgColor,
        color: textColor,
        fontSize: 13,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      },
    },
      // Header
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${borderColor}`,
        },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('span', { style: { fontSize: 18 } }, '\uD83E\uDDEA'),
          React.createElement('span', { style: { fontWeight: 700, fontSize: 14 } }, '模组测试套件'),
        ),
        React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
          React.createElement('span', { style: { fontSize: 11, color: textTertiary } },
            `${passedTests}/${totalTests} \u2705  ${failedTests} \u274C`
          ),
          React.createElement('button', {
            onClick: runAll,
            style: {
              padding: '4px 12px',
              borderRadius: 4,
              border: 'none',
              background: brandColor,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 12,
            },
          }, '\u25B6\uFE0F 全部测试'),
          React.createElement('button', {
            onClick: clearResults,
            style: {
              padding: '4px 10px',
              borderRadius: 4,
              border: `1px solid ${borderColor}`,
              background: 'transparent',
              color: textSecondary,
              cursor: 'pointer',
              fontSize: 12,
            },
          }, '\uD83D\uDDD1\uFE0F'),
        ),
      ),

      // Tabs
      React.createElement('div', {
        style: {
          display: 'flex',
          borderBottom: `1px solid ${borderColor}`,
        },
      },
        ['tests', 'events', 'about'].map(tab =>
          React.createElement('button', {
            key: tab,
            onClick: () => setActiveTab(tab),
            style: {
              flex: 1,
              padding: '8px',
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${brandColor}` : '2px solid transparent',
              background: 'transparent',
              color: activeTab === tab ? textColor : textTertiary,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: activeTab === tab ? 600 : 400,
            },
          }, tab === 'tests' ? '\uD83E\uDDEA 测试' : tab === 'events' ? '\uD83D\uDD14 事件' : '\u2139\uFE0F 关于'),
        ),
      ),

      // Content
      React.createElement('div', { style: { flex: 1, overflow: 'auto' } },
        activeTab === 'tests' && React.createElement('div', { style: { padding: '8px 12px' } },
          testSuites.map(suite =>
            React.createElement('div', {
              key: suite.name,
              style: {
                marginBottom: 12,
                borderRadius: 8,
                border: `1px solid ${borderColor}`,
                overflow: 'hidden',
              },
            },
              // Suite header
              React.createElement('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--bg-surface, #141418)',
                },
              },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  React.createElement('span', null, suite.icon),
                  React.createElement('span', { style: { fontWeight: 600, fontSize: 13 } }, suite.name),
                ),
                React.createElement('button', {
                  onClick: () => runSuite(suite),
                  style: {
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: `1px solid ${borderColor}`,
                    background: 'transparent',
                    color: textSecondary,
                    cursor: 'pointer',
                    fontSize: 11,
                  },
                }, '\u25B6\uFE0F'),
              ),

              // Tests
              React.createElement('div', null,
                suite.tests.map(test => {
                  const key = `${suite.name}.${test.id}`;
                  const res = results[key];
                  const isRunning = running[key];

                  return React.createElement('div', {
                    key: test.id,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 12px',
                      borderTop: `1px solid ${borderColor}`,
                      gap: 8,
                    },
                  },
                    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                      React.createElement('div', { style: { fontSize: 12, color: textColor } }, test.name),
                      res && React.createElement('div', {
                        style: {
                          fontSize: 10,
                          color: res.status === 'pass' ? passColor : failColor,
                          marginTop: 2,
                          wordBreak: 'break-all',
                        },
                      }, `${res.result} (${res.elapsed}ms)`),
                    ),
                    React.createElement('button', {
                      onClick: () => runTest(suite.name, test),
                      disabled: isRunning,
                      style: {
                        padding: '3px 8px',
                        borderRadius: 4,
                        border: 'none',
                        background: isRunning ? textTertiary : brandColor,
                        color: '#fff',
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                        fontSize: 11,
                        flexShrink: 0,
                      },
                    }, isRunning ? '...' : '\u25B6'),
                  );
                }),
              ),
            ),
          ),
        ),

        activeTab === 'events' && React.createElement('div', { style: { padding: '8px 12px' } },
          eventLog.length === 0
            ? React.createElement('div', {
                style: { color: textTertiary, textAlign: 'center', padding: '40px 0' },
              }, '\u6682\u65E0\u4E8B\u4EF6\uFF0C\u64AD\u653E\u91C7\u6837\u6216\u5207\u6362\u6A21\u5F0F\u540E\u5C06\u663E\u793A')
            : eventLog.map((evt, i) =>
                React.createElement('div', {
                  key: i,
                  style: {
                    padding: '6px 10px',
                    marginBottom: 4,
                    borderRadius: 6,
                    background: 'var(--bg-surface, #141418)',
                    border: `1px solid ${borderColor}`,
                    fontSize: 11,
                  },
                },
                  React.createElement('span', { style: { color: textTertiary, marginRight: 8 } }, evt.time),
                  React.createElement('span', { style: { color: brandColor, fontWeight: 600, marginRight: 8 } }, evt.type),
                  React.createElement('span', { style: { color: textSecondary } }, evt.data),
                ),
              ),
        ),

        activeTab === 'about' && React.createElement('div', { style: { padding: '16px' } },
          React.createElement('div', {
            style: {
              padding: 16,
              borderRadius: 8,
              background: 'var(--bg-surface, #141418)',
              border: `1px solid ${borderColor}`,
              lineHeight: 1.8,
              fontSize: 12,
              color: textSecondary,
            },
          },
            React.createElement('h3', { style: { color: textColor, margin: '0 0 8px' } }, '\uD83E\uDDEA \u6A21\u7EC4\u6D4B\u8BD5\u5957\u4EF6'),
            React.createElement('p', null, '\u7528\u4E8E\u9A8C\u8BC1 ModAPI \u7684\u6240\u6709\u529F\u80FD\u662F\u5426\u6B63\u5E38\u5DE5\u4F5C\u3002'),
            React.createElement('p', null, '\u652F\u6301\u6D4B\u8BD5\u7684 API \u7C7B\u522B\uFF1A'),
            React.createElement('ul', null,
              React.createElement('li', null, 'Logger / Storage / Notifications'),
              React.createElement('li', null, 'Profile / Library / Player Store'),
              React.createElement('li', null, 'IPC Invoke (60+ \u901A\u9053)'),
              React.createElement('li', null, 'DB Query / Hooks / Audio'),
              React.createElement('li', null, 'Network / UI'),
            ),
            React.createElement('p', null, '\u4E8B\u4EF6\u76D1\u542C\uFF1Aplayer:play, player:stop, scan:complete, profile:modeChange'),
            React.createElement('p', { style: { color: textTertiary, marginTop: 12 } }, 'Version: 1.0.0 | API: 1.0.0'),
          ),
        ),
      ),
    );
  }

  // ─── 注册 UI ────────────────────────────────────────────────────────────────

  api.ui.panel.register('mod-testkit', {
    title: '测试套件',
    icon: '\uD83E\uDDEA',
    position: 'right',
    render: () => React.createElement(TestKitPanel),
  });

  api.ui.toolbar.addButton('mod-testkit-toggle', {
    label: '测试',
    icon: '\uD83E\uDDEA',
    tooltip: '打开模组 API 测试套件',
    onClick: () => api.ui.panel.open('mod-testkit'),
  });

  api.logger.info('[Mod-Testkit] 测试套件已激活');
}

async function deactivate(api) {
  api.ui.panel.unregister('mod-testkit');
  api.ui.toolbar.removeButton('mod-testkit-toggle');
  api.logger.info('[Mod-Testkit] 测试套件已卸载');
}

if (typeof window !== 'undefined') {
  window.__mod_testkit = { activate, deactivate };
}
