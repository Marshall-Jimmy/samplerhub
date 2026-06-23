# SamplerHub 模组开发指南

> 让你的创意扩展 SamplerHub 的边界

## 快速开始

### 1. 最简单的模组（Hello World）

创建一个 `hello.mod.js` 文件：

```javascript
// hello.mod.js
export default {
  id: 'com.example.hello',
  name: 'Hello Mod',
  version: '1.0.0',
  author: 'Your Name',
  description: '我的第一个 SamplerHub 模组',

  // 模组入口
  activate(api) {
    // 在控制台输出欢迎信息
    api.logger.info('Hello, SamplerHub!');

    // 注册一个自定义快捷键
    api.shortcuts.register('Ctrl+Shift+H', () => {
      api.notifications.show('Hello from Mod!');
    });
  },

  deactivate(api) {
    api.logger.info('Goodbye!');
  }
};
```

### 2. 安装模组

**方式一：拖拽安装**
直接将 `.mod.js` 或 `.zip` 文件拖入 SamplerHub 窗口。

**方式二：通过模组管理器**
1. 打开设置 → 模组
2. 点击"安装模组"
3. 选择你的模组文件

### 3. 模组文件结构

```
my-mod/
├── manifest.json      # 模组元数据
├── main.js            # 主入口（可选，用于主进程逻辑）
├── renderer.js        # 渲染进程入口（UI 逻辑）
├── styles.css         # 自定义样式（可选）
└── assets/            # 资源文件（可选）
    └── icon.png
```

打包为 `my-mod.zip` 即可安装。

---

## 模组清单（Manifest）

```json
{
  "id": "com.example.mymod",
  "name": "My Awesome Mod",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "模组描述",
  "homepage": "https://example.com/mymod",
  "minAppVersion": "1.0.0",
  "permissions": [
    "audio:engine",
    "ui:inject",
    "storage:read"
  ],
  "entry": {
    "main": "main.js",
    "renderer": "renderer.js"
  },
  "hooks": {
    "pad:beforeTrigger": true,
    "library:afterScan": true
  }
}
```

### 权限说明

| 权限 | 说明 |
|------|------|
| `audio:engine` | 访问音频引擎（插入 AudioNode） |
| `audio:mixer` | 访问混音台通道 |
| `ui:inject` | 在 UI 中注入自定义组件 |
| `ui:theme` | 注册自定义主题 |
| `storage:read` | 读取应用数据 |
| `storage:write` | 写入应用数据（沙箱内） |
| `ipc:invoke` | 调用主进程 IPC |
| `library:read` | 读取采样库数据 |
| `library:write` | 修改采样库数据 |
| `network` | 发起网络请求 |

---

## 渲染进程 API

渲染进程模组运行在浏览器环境中，可以访问 UI 和音频引擎。

### 基础 API

```javascript
export default {
  activate(api) {
    // 日志
    api.logger.info('信息');
    api.logger.warn('警告');
    api.logger.error('错误');

    // 通知
    api.notifications.show('标题', '内容');
    api.notifications.show('标题', { body: '内容', type: 'success' });

    // 存储（隔离在模组沙箱内）
    api.storage.get('key');
    api.storage.set('key', value);
    api.storage.remove('key');
  }
};
```

### UI 注入

```javascript
export default {
  activate(api) {
    // 在工具栏添加按钮
    api.ui.toolbar.addButton({
      id: 'my-button',
      icon: '🎹',
      tooltip: '打开我的面板',
      onClick: () => api.ui.panel.open('my-panel')
    });

    // 注册自定义面板
    api.ui.panel.register({
      id: 'my-panel',
      title: '我的面板',
      component: MyPanelComponent,  // React 组件
      position: 'sidebar'  // 或 'modal', 'floating'
    });

    // 在设置页面添加选项卡
    api.ui.settings.addTab({
      id: 'my-settings',
      title: '我的设置',
      component: MySettingsComponent
    });
  }
};
```

### 音频引擎

```javascript
export default {
  activate(api) {
    // 获取音频上下文
    const audioContext = api.audio.getContext();

    // 创建自定义效果器
    const myEffect = audioContext.createBiquadFilter();
    myEffect.type = 'lowpass';
    myEffect.frequency.value = 1000;

    // 插入到主输出链
    api.audio.insertEffect('master', myEffect);

    // 监听 Pad 触发
    api.audio.onPadTrigger((padId, options) => {
      api.logger.info(`Pad ${padId} triggered!`);
    });

    // 获取/设置参数
    api.audio.getParam('master.volume');
    api.audio.setParam('master.volume', 0.8);
  }
};
```

### 状态管理

```javascript
export default {
  activate(api) {
    // 订阅 Store 变化
    const unsubscribe = api.stores.library.subscribe((state) => {
      api.logger.info(`当前选中: ${state.selectedSampleIds.length} 个采样`);
    });

    // 获取当前状态
    const pads = api.stores.pad.getState().pads;

    // 派发 Action
    api.stores.pad.getState().setMasterVolume(0.9);
  }
};
```

### 钩子系统

```javascript
export default {
  activate(api) {
    // Pad 触发前钩子
    api.hooks.register('pad:beforeTrigger', (padId, options) => {
      // 可以修改 options
      options.velocity *= 1.2; // 增加 20% 力度
      return options;
    });

    // 扫描完成后钩子
    api.hooks.register('library:afterScan', (result) => {
      api.notifications.show('扫描完成', `新增 ${result.added} 个采样`);
    });

    // 播放前钩子
    api.hooks.register('player:beforePlay', (sampleId) => {
      api.logger.info(`即将播放: ${sampleId}`);
    });
  }
};
```

---

## 主进程 API

主进程模组拥有更多权限，可以访问文件系统和数据库。

```javascript
// main.js
export default {
  activate(api) {
    // 注册自定义 IPC 处理器
    api.ipc.handle('my-mod:process', async (data) => {
      // 处理数据
      return { success: true };
    });

    // 访问数据库
    api.db.query('SELECT * FROM samples WHERE name LIKE ?', ['%kick%']);

    // 文件系统（限制在用户数据目录）
    api.fs.readFile('/mods/my-mod/config.json');
    api.fs.writeFile('/mods/my-mod/config.json', data);

    // 注册分类器规则
    api.classifier.registerRule({
      type: 'custom',
      name: 'My Classifier',
      match: (sample) => sample.fileName.includes('custom'),
      category: 'Custom'
    });
  }
};
```

---

## 完整示例：自定义效果器模组

```javascript
// dub-delay.mod.js
export default {
  id: 'com.example.dub-delay',
  name: 'Dub Delay',
  version: '1.0.0',
  author: 'Dub Master',
  description: '经典的 Dub 风格延迟效果器',
  permissions: ['audio:engine', 'ui:inject'],

  activate(api) {
    const ctx = api.audio.getContext();

    // 创建效果链
    const delay = ctx.createDelay(2.0);
    const feedback = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    delay.delayTime.value = 0.375; // 三连音
    feedback.gain.value = 0.6;
    filter.type = 'lowpass';
    filter.frequency.value = 2000;

    // 连接：delay -> filter -> feedback -> delay
    delay.connect(filter);
    filter.connect(feedback);
    feedback.connect(delay);

    // 插入到主输出
    api.audio.insertEffect('send:delay', delay);

    // 在混音台添加控制
    api.ui.mixer.addKnob({
      id: 'dub-delay-time',
      label: 'Delay Time',
      min: 0.01,
      max: 2.0,
      value: 0.375,
      onChange: (v) => { delay.delayTime.value = v; }
    });

    api.ui.mixer.addKnob({
      id: 'dub-feedback',
      label: 'Feedback',
      min: 0,
      max: 0.95,
      value: 0.6,
      onChange: (v) => { feedback.gain.value = v; }
    });
  },

  deactivate(api) {
    // 清理效果器
    api.audio.removeEffect('send:delay');
    api.ui.mixer.removeKnob('dub-delay-time');
    api.ui.mixer.removeKnob('dub-feedback');
  }
};
```

---

## 完整示例：自定义主题模组

```javascript
// neon-theme.mod.js
export default {
  id: 'com.example.neon-theme',
  name: 'Neon Nights',
  version: '1.0.0',
  author: 'Cyber Designer',
  description: '赛博朋克霓虹主题',
  permissions: ['ui:theme'],

  activate(api) {
    api.ui.theme.register({
      id: 'neon-nights',
      name: 'Neon Nights',
      variables: {
        '--brand-primary': '#ff00ff',
        '--brand-primary-hover': '#ff44ff',
        '--bg-primary': '#0a0a1a',
        '--bg-surface': '#12122a',
        '--bg-elevated': '#1a1a3e',
        '--text-primary': '#e0e0ff',
        '--text-secondary': '#a0a0cc',
        '--border-default': '#2a2a5e'
      }
    });

    // 自动激活主题
    api.ui.theme.activate('neon-nights');
  },

  deactivate(api) {
    api.ui.theme.unregister('neon-nights');
  }
};
```

---

## 完整示例：智能分类模组

```javascript
// smart-classify.mod.js
export default {
  id: 'com.example.smart-classify',
  name: 'Smart Classifier',
  version: '1.0.0',
  permissions: ['library:read', 'library:write'],

  activate(api) {
    // 扫描完成后自动分类
    api.hooks.register('library:afterScan', async (result) => {
      const samples = await api.stores.library.getState().queryClient
        .fetchQuery({ queryKey: ['samples', { recent: true }] });

      for (const sample of samples) {
        const category = await classifyByAI(sample);
        await api.ipc.invoke('samples:update', sample.id, { categoryId: category.id });
      }
    });

    async function classifyByAI(sample) {
      // 简单的基于文件名关键词的分类
      const name = sample.fileName.toLowerCase();
      if (name.includes('kick') || name.includes('bd')) return { id: 'drums-kick' };
      if (name.includes('snare') || name.includes('sd')) return { id: 'drums-snare' };
      if (name.includes('hat') || name.includes('hihat')) return { id: 'drums-hat' };
      return { id: 'uncategorized' };
    }
  }
};
```

---

## 调试技巧

### 1. 查看模组日志

打开开发者工具（Ctrl+Shift+I），在 Console 中查看：

```
[Mod:com.example.mymod] Hello, SamplerHub!
```

### 2. 热重载开发

在设置 → 模组中开启"开发者模式"：
- 模组代码修改后自动重载
- 显示详细的 API 调用日志
- 暴露 `window.modAPI` 供调试

### 3. 错误处理

```javascript
export default {
  activate(api) {
    try {
      // 可能出错的操作
      riskyOperation();
    } catch (err) {
      api.logger.error('模组初始化失败:', err.message);
      api.notifications.show('错误', '模组加载失败，请检查配置');
    }
  }
};
```

---

## 发布模组

### 打包

```bash
# 将模组文件打包为 .mod.zip
zip -r my-mod.mod.zip manifest.json main.js renderer.js styles.css assets/
```

### 分发

- **GitHub Releases**: 上传 `.mod.zip` 文件
- **模组市场**（未来）: 提交到官方模组仓库
- **直接分享**: 用户通过文件或链接安装

### 版本规范

遵循 [SemVer](https://semver.org/lang/zh-CN/)：
- `1.0.0` - 初始版本
- `1.1.0` - 新增功能（向后兼容）
- `1.1.1` - 修复 Bug
- `2.0.0` - 破坏性更新

---

## API 参考速查

### 生命周期

| 方法 | 说明 |
|------|------|
| `activate(api)` | 模组激活时调用 |
| `deactivate(api)` | 模组禁用时调用 |

### 常用 API

```javascript
// 日志
api.logger.info(msg)
api.logger.warn(msg)
api.logger.error(msg)

// 通知
api.notifications.show(title, options)

// 存储
api.storage.get(key)
api.storage.set(key, value)
api.storage.remove(key)

// UI
api.ui.toolbar.addButton(config)
api.ui.panel.register(config)
api.ui.settings.addTab(config)
api.ui.theme.register(theme)

// 音频
api.audio.getContext()
api.audio.insertEffect(id, node)
api.audio.removeEffect(id)
api.audio.onPadTrigger(callback)

// 状态
api.stores.{storeName}.getState()
api.stores.{storeName}.subscribe(callback)

// 钩子
api.hooks.register(name, callback)
api.hooks.unregister(name, callback)

// IPC（主进程）
api.ipc.handle(channel, handler)
api.ipc.invoke(channel, ...args)

// 数据库（主进程）
api.db.query(sql, params)
api.db.insert(table, data)
```

---

## 常见问题

**Q: 模组可以访问 Node.js API 吗？**
A: 渲染进程模组不能，主进程模组可以（但受权限控制）。

**Q: 多个模组冲突怎么办？**
A: 模组按加载顺序执行，后加载的模组可以覆盖先加载的。建议通过 `api.hooks` 协作。

**Q: 如何更新已安装的模组？**
A: 重新安装同名模组即可覆盖。建议保留配置在 `api.storage` 中。

**Q: 模组会导致性能问题吗？**
A: 开启"开发者模式"可查看每个模组的 CPU/内存占用。异常模组会被自动禁用。

---

> 祝你开发愉快！如有问题，欢迎在 GitHub Discussions 中交流。
