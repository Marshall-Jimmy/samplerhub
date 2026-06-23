# SamplerHub 改进方案

> 基于外部评审反馈与项目现状，按优先级 T0（立即执行）至 T3（长期规划）整理全部改进措施。

---

## 评分总览

| 评审维度 | 宽松分 | 严格分 | 核心问题 |
|---------|--------|--------|---------|
| 产品定位与卖点 | 80 | — | "AI-powered" 偏薄，每模块深度待验证 |
| 技术选型与架构 | 82 | — | HTML 占比 85.6%  Linguist 误判 |
| 工程化 | 72 | 66 | CI 太弱，无 typecheck/test/build 验证 |
| 代码与目录结构 | 74 | — | 临时文件残留，仓库整洁度一般 |
| 产品成熟度 | 70 | — | 0 star / 0 fork，大库表现未知 |
| 差异化竞争力 | 75 | — | 介于采样管理器与轻量 DAW 之间 |
| **综合** | **76** | **66** | 产品感强，但工程可信度和可验证性弱 |

---

## T0：立即执行（本周内）

### T0.1 CI/CD 补强

**问题**：当前 CI 只 lint Markdown，没有跑 typecheck / test / build / e2e，与 README 展示的工程复杂度不匹配。PR 目标写的是 `main` 但仓库默认分支是 `master`。

**措施**：

1. 修正 `.github/workflows/ci.yml`，将 PR 目标从 `main` 改为 `master`
2. 添加完整 CI pipeline：
   - `pnpm typecheck`（TypeScript 类型检查）
   - `pnpm test`（Vitest 单元测试）
   - `pnpm build`（Vite 生产构建）
   - `pnpm test:e2e`（Playwright E2E 测试）
   - `electron-builder`（打包验证，不发布）
3. 添加 CI badge 到 README

### T0.2 仓库整洁度清理

**问题**：`build-log.txt`、`*timestamp*.mjs`、`electron-vite-react.gif` 等临时文件残留在根目录；`electron-dist/` 曾进过 git；IMPROVEMENT 文件名偏随意。

**措施**：

1. 删除根目录下所有临时/构建产物文件
2. 确认 `.gitignore` 已覆盖 `electron-dist/`、`build-log.txt`、`.timestamp-*`
3. 重命名 `IMPROVEMENT_ROADMAP.md` / `IMPROVEMENT_SUGGESTIONS.md` 为更正式的名称，或合并进 `docs/plans/`
4. 添加 `.gitattributes` 修正 Linguist 语言检测：
   ```gitattributes
   *.html linguist-vendored
   public/* linguist-vendored
   ```

### T0.3 Electron 安全边界显式声明

**问题**：`BrowserWindow` 只配置了 `preload`，没有显式声明 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。

**措施**：

1. 在 `createWindow` 中显式添加安全选项：
   ```typescript
   webPreferences: {
     preload: path.join(__dirname, '../preload/index.js'),
     contextIsolation: true,
     nodeIntegration: false,
     sandbox: true,
   }
   ```
2. 在 `SECURITY.md` 中记录安全边界声明

### T0.4 Custom Protocol 路径校验加固

**问题**：`local-audio://` 从 URL 解析路径后直接 `net.fetch(file://...)` 读取本地文件，缺少白名单目录和路径归一化校验。

**措施**：

1. 在 protocol handler 中添加白名单目录检查（只允许读取用户配置的采样库目录）
2. 使用 `path.normalize()` + `path.resolve()` 防止路径遍历
3. 拒绝任何包含 `..` 或绝对路径超出白名单范围的请求

---

## T1：短期优化（1-2 周内）

### T1.1 Python Sidecar 安装方式改进

**问题**：自动检测本机 Python 后 `pip install -r requirements.txt --user`，依赖包含 `torch`、`torchaudio`、`laion-clap`、`librosa` 等重依赖，对普通用户非常重，失败概率高。

**措施**：

1. 优先尝试使用系统已安装的 Python 环境，检测依赖是否已满足
2. 添加 `pip install` 超时和重试机制
3. 在设置面板中增加"AI 分析引擎"开关，允许用户禁用 sidecar（纯管理模式）
4. 长期方向：考虑内置 portable Python 或 PyInstaller 打包的 sidecar 可执行文件

### T1.2 测试可见性增强

**问题**：有 Vitest 和 Playwright，但测试覆盖率和报告对外不可见。

**措施**：

1. 在 CI 中生成测试覆盖率报告（`vitest --coverage`）
2. 将覆盖率报告上传到 Codecov 或作为 artifact 保存
3. 在 README 添加 coverage badge
4. 补充核心模块的单元测试（audioEngine、playerStore、decoderPool）

### T1.3 性能基准测试

**问题**：10 万采样扫描 + CLAP 推理的内存/耗时没有 benchmark，制作人不敢把主库挂上去。

**措施**：

1. 添加性能测试脚本，测量：
   - 1 万 / 5 万 / 10 万采样扫描耗时
   - CLAP 推理单文件耗时和内存占用
   - 波形生成耗时
2. 将结果写入 `docs/benchmarks.md`
3. 在 README 中引用 benchmark 数据

### T1.4 DAW 集成具体化

**问题**：README 只写了一句 "seamless DAW integration"，太虚。拖拽到 DAW 是制作人最关心的点。

**措施**：

1. 在 README 中补充拖拽功能的具体说明：
   - 支持拖拽到 Reaper、Ableton Live、FL Studio、Logic Pro 等主流 DAW
   - 拖拽时保持原始音频格式
   - 支持多选批量拖拽
2. 添加 DAW 拖拽演示 GIF 到 README
3. 在设置中增加"拖拽行为"选项（复制/引用/询问）

---

## T2：中期迭代（1 个月内）

### T2.1 "AI-powered" 实质化

**问题**：当前 "AI" 主要是 CLAP 嵌入 + PANNs 分类 + 40+ 类别，够 demo 但不够"智能"。

**措施**：

1. **自然语言搜索**：支持 "dark trap kick"、"airy pad"、"punchy snare" 等描述性查询
   - 方案 A：基于 CLAP 文本编码器，将自然语言转换为嵌入向量做相似搜索
   - 方案 B：集成轻量级 LLM（如 ONNX Runtime 运行的 Phi-3）做语义理解
2. **智能推荐**：基于播放历史和收藏，推荐相似采样
3. **自动标签补全**：根据音频内容自动建议标签，用户一键确认

### T2.2 大库稳定性验证

**问题**：ROADMAP 自己写了虚拟列表优化待实施，大库（10 万+ 采样）下的表现未知。

**措施**：

1. 完成虚拟列表优化（react-window 已用，但需验证 10 万条数据下的滚动性能）
2. 数据库查询优化：为高频查询添加索引（`fileName`、`categoryId`、`bpm`、`key`）
3. 分页加载 + 无限滚动，避免一次性加载全部数据
4. 内存监控：在性能面板中显示当前内存占用，超过阈值时提示清理缓存

### T2.3 社区冷启动

**问题**：0 star / 0 fork / 0 issue，还没被看见。

**措施**：

1. 在 r/WeAreTheMusicMakers、r/edmproduction、V2EX、知乎等平台发布介绍帖
2. 制作 30 秒功能演示视频（GIF 或短视频）
3. 邀请 5-10 位音乐制作人内测，收集真实反馈
4. 在 README 添加 "如何贡献" 章节，降低参与门槛

### T2.4 文档规范化

**问题**：PR 模板很薄，SECURITY / CONTRIBUTING 不够正式。

**措施**：

1. 补充 `.github/CONTRIBUTING.md`：开发环境搭建、代码规范、PR 流程
2. 补充 `SECURITY.md`：安全边界声明、漏洞报告流程
3. 补充 `.github/ISSUE_TEMPLATE/`：bug 报告、功能请求模板
4. 将 `docs/plans/` 中的 ROADMAP 整理为更正式的格式

---

## T3：长期规划（3 个月内）

### T3.1 模块化深度打磨

**问题**：v1.0 功能堆得多，每样都"够用但不深"。

**措施**：

1. **鼓机**：支持自定义采样映射、力度分层、MIDI 导出
2. **步进音序器**：支持多轨、变奏、MIDI 导出到 DAW
3. **钢琴卷帘**：支持量化、和弦输入、MIDI 导出
4. **Mixer**：支持效果器链（EQ、压缩、混响）、总线输出

### T3.2 插件系统完善

**问题**：`mods/` 目录有 JS 插件系统，但 API 稳定性和文档不足。

**措施**：

1. 定义稳定的 Mod API 版本（v1）
2. 提供官方示例插件 3-5 个
3. 添加 Mod 开发文档（`docs/modding.md`）
4. 在应用内提供 Mod 市场/管理器 UI

### T3.3 跨平台打包成熟化

**问题**：better-sqlite3 跨平台复杂，ROADMAP 中已提及。

**措施**：

1. 为 Windows、macOS（Intel + Apple Silicon）、Linux 提供预构建二进制
2. 在 CI 中添加多平台构建矩阵
3. 使用 `electron-builder` 的 `publish` 配置实现自动更新
4. 考虑代码签名（Windows EV / macOS Developer ID）

### T3.4 商业化探索

**问题**：当前完全免费，长期维护需要可持续模式。

**措施**：

1. 保持核心功能开源免费
2. 探索 Pro 版本：高级 AI 功能、云同步、团队协作
3. 采样市场集成：与付费采样库合作，抽成模式
4. 赞助/捐赠：GitHub Sponsors、爱发电

---

## 执行检查清单

| 编号 | 任务 | 优先级 | 状态 |
|------|------|--------|------|
| T0.1 | CI/CD 补强（typecheck/test/build/e2e） | T0 | 待办 |
| T0.2 | 仓库整洁度清理 | T0 | 待办 |
| T0.3 | Electron 安全边界显式声明 | T0 | 待办 |
| T0.4 | Custom Protocol 路径校验加固 | T0 | 待办 |
| T1.1 | Python Sidecar 安装方式改进 | T1 | 待办 |
| T1.2 | 测试可见性增强 | T1 | 待办 |
| T1.3 | 性能基准测试 | T1 | 待办 |
| T1.4 | DAW 集成具体化 | T1 | 待办 |
| T2.1 | "AI-powered" 实质化（自然语言搜索） | T2 | 待办 |
| T2.2 | 大库稳定性验证 | T2 | 待办 |
| T2.3 | 社区冷启动 | T2 | 待办 |
| T2.4 | 文档规范化 | T2 | 待办 |
| T3.1 | 模块化深度打磨 | T3 | 待办 |
| T3.2 | 插件系统完善 | T3 | 待办 |
| T3.3 | 跨平台打包成熟化 | T3 | 待办 |
| T3.4 | 商业化探索 | T3 | 待办 |

---

## 参考对比

| 项目 | 严格分 | 主要强项 | 主要弱项 |
|------|--------|---------|---------|
| **TraceSeal** | **72** | 工程闭环、测试报告、release 验证、文档可信度强 | 产品 UI 弱，安全能力边界窄 |
| **SamplerHub** | **66** | 产品门面、UI/功能想象力、音乐场景明确 | CI 弱、测试可见性弱、sidecar/打包复杂、工程可信度不够 |

SamplerHub 看起来更像一个"产品"，但 TraceSeal 更像一个"严谨工程"。如果面试官看 UI 和产品想象力，SamplerHub 第一眼更亮；如果看测试、CI、发布可信度、边界说明、工程闭环，TraceSeal 更稳。
