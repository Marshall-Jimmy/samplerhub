# Contributing to SamplerHub

感谢你对 SamplerHub 的兴趣！以下是参与项目的指南。

## 开发环境

### 前置要求

- Node.js 20+
- pnpm 8+
- Python 3.10+（可选，用于 AI 分析功能）

### 本地启动

```bash
# 克隆仓库
git clone https://github.com/Marshall-Jimmy/samplerhub.git
cd samplerhub

# 安装依赖
pnpm install

# 启动开发模式
pnpm dev

# 运行测试
pnpm test

# 构建生产版本
pnpm build
```

## 项目结构

```
samplerhub/
├── src/              # 前端 React 代码
├── electron/         # Electron 主进程和预加载脚本
│   ├── main/         # 主进程（Node.js）
│   └── preload/      # 预加载脚本（安全桥接）
├── shared/           # 前后端共享类型定义
├── apps/analyzer/    # Python sidecar（AI 分析引擎）
├── drizzle/          # 数据库 schema 和迁移
├── test/             # 测试文件
└── docs/             # 文档
```

## 代码规范

- TypeScript 严格模式
- 使用 ESLint 和 Prettier
- 提交前运行 `pnpm lint` 和 `pnpm test`

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `style:` 格式调整
- `refactor:` 重构
- `test:` 测试
- `chore:` 构建/工具

## 提交 PR 流程

1. Fork 仓库
2. 创建功能分支：`git checkout -b feat/your-feature`
3. 提交更改：`git commit -m "feat: add something"`
4. 推送到你的 Fork：`git push origin feat/your-feature`
5. 在 GitHub 上创建 Pull Request

PR 会自动触发 CI（typecheck / test / build），全部通过后方可合并。

## 报告问题

使用 [Issue Template](https://github.com/Marshall-Jimmy/samplerhub/issues/new/choose) 提交 bug 或功能请求。

## 安全漏洞

请查看 [SECURITY.md](SECURITY.md) 了解如何报告安全问题。
