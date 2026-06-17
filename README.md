# Jima's SamplerHub

> 音乐制作人智能采样管理工作站

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 简介

Jima's SamplerHub 是一款专为音乐制作人设计的智能采样管理工具。它可以帮你：

- 自动扫描和索引本地采样库（支持 WAV、MP3、FLAC、MIDI 等格式）
- AI 智能分类（Drums、Bass、Synths、FX 等 40+ 类别）
- 实时波形预览和音频播放
- BPM/Key 自动检测
- 全文搜索 + 语义搜索
- 在线采样库浏览和下载
- 鼓垫演奏和步进音序器
- 多语言支持（11 种语言）

## 功能特性

### 采样管理
- 自动监控文件夹变化，实时同步
- 智能分类体系（UCS 标准 + 自定义规则）
- 标签系统 + 收藏/最近播放
- 批量导入/导出
- 重复文件检测

### 音频分析
- BPM 检测
- 音乐调性识别
- 音频指纹去重
- CLAP 语义嵌入（AI 相似度搜索）
- 波形可视化

### 创作工具
- 16 格鼓垫演奏
- 步进音序器
- 钢琴卷帘
- 混音台

### 在线资源
- 集成 Freesound、Pixabay、SND.dev 等免费采样库
- 一键下载到本地

## 系统要求

- **Windows**: Windows 10/11 (64-bit)
- **macOS**: macOS 12+ (Intel/Apple Silicon)
- **内存**: 4GB+ (推荐 8GB)
- **存储**: 500MB+ 可用空间

## 安装

### 从 Release 下载

1. 访问 [Releases 页面](https://github.com/Marshall-Jimmy/samplerhub/releases)
2. 下载对应平台的安装包：
   - Windows: `Jima's SamplerHub_1.0.0_Setup.exe`
   - macOS: `Jima's SamplerHub_1.0.0.dmg`
3. 运行安装程序

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/Marshall-Jimmy/samplerhub.git
cd samplerhub

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建生产版本
pnpm build
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Space` | 播放/暂停 |
| `→` | 下一个采样 |
| `←` | 上一个采样 |
| `F` | 收藏/取消收藏 |
| `Ctrl + F` | 聚焦搜索框 |
| `Ctrl + 1~5` | 切换视图模式 |
| `Ctrl + ,` | 打开设置 |
| `Ctrl + Q` | 退出应用 |

## 技术栈

- **前端**: React 18 + TypeScript + TailwindCSS + Ant Design
- **桌面**: Electron 31
- **数据库**: SQLite (better-sqlite3) + Drizzle ORM
- **音频**: Howler.js + Tone.js + Web Audio API
- **构建**: Vite + electron-builder

## 开源协议

[MIT](LICENSE)

---

Made with ❤️ by Marshall-Jimmy
