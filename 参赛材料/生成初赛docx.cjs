const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
        LevelFormat, ExternalHyperlink, PageBreak } = require('docx');
const fs = require('fs');

const cjkFont = 'Microsoft YaHei';
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, width, fill, bold) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      children: [new TextRun({ text, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }, size: 22, bold: bold || false })]
    })]
  });
}

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun(text)]
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun(text)]
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun(text)]
  });
}

function para(text, opts) {
  return new Paragraph({
    spacing: opts?.spacing || {},
    shading: opts?.shading,
    children: [new TextRun({
      text,
      font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont },
      size: opts?.size || 24,
      bold: opts?.bold || false,
      color: opts?.color || undefined,
    })]
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [new TextRun({ text, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }, size: 24 })]
  });
}

function bulletBold(boldPart, normalPart) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [
      new TextRun({ text: boldPart, bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }, size: 24 }),
      new TextRun({ text: normalPart, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }, size: 24 }),
    ]
  });
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }, size: 24 }
      }
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, color: "1a1a2e", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0, keepNext: false, keepLines: false } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, color: "312e81", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } },
        paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1, keepNext: false, keepLines: false } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: "4338ca", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2, keepNext: false, keepLines: false } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      // ===== 封面 =====
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 800, after: 200 },
        children: [new TextRun({
          text: "TRAE AI \u521b\u9020\u529b\u5927\u8d5b \u00b7 \u521d\u8d5b Demo \u4f5c\u54c1\u5e16",
          bold: true, size: 44, color: "4f46e5",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [new TextRun({
          text: "Jima's SamplerHub \u2014\u2014 \u97f3\u4e50\u5236\u4f5c\u4eba\u667a\u80fd\u91c7\u6837\u7ba1\u7406\u5de5\u4f5c\u7ad9",
          size: 28, color: "6b7280",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({
          text: "\u751f\u6d3b\u5a31\u4e50\u8d5b\u9053 | v1.0.0",
          size: 22, color: "818cf8",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({
          text: "GitHub: https://github.com/jimmma/samplerhub",
          size: 20, color: "6366f1",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),

      // ===== 第一部分：Demo 简介 =====
      new Paragraph({ children: [new PageBreak()] }),
      heading1("\u4e00\u3001Demo \u7b80\u4ecb"),

      heading2("1. \u662f\u4ec0\u4e48"),
      para("Jima's SamplerHub \u662f\u4e00\u6b3e\u57fa\u4e8e Electron \u7684 桌面端智能采样管理工作站，支持 Windows 和 macOS。它集成了 AI 智能分类、CLAP 语义搜索、波形可视化预览、鼓垫演奏、步进音序器、在线采样库浏览等功能，是音乐制作人管理海量音频素材的一站式解决方案。"),

      heading2("2. \u9762\u5411\u8c01"),
      para("电子音乐制作人、嘻哈 Beat Maker、影视配乐师、游戏音效设计师、DJ，以及任何需要管理大量音频素材的创作者。"),

      heading2("3. \u4e3b\u8981\u529f\u80fd"),

      heading3("\u2460 AI \u667a\u80fd\u5206\u7c7b"),
      para("基于音频内容和文件名自动分类到 Drums、Bass、Synths 等 40+ 类别，支持 UCS（Universal Category System）国际标准。用户添加采样文件夹后，系统自动扫描并分类，无需手动整理。"),

      heading3("\u2461 CLAP \u8bed\u4e49\u641c\u7d22"),
      para("核心创新功能。用户可以用自然语言描述来搜索音频，例如输入\"温暖的钢琴\"或\"沉重的 808\"，系统通过 CLAP（Contrastive Language-Audio Pretraining）语义嵌入模型理解描述意图，返回最匹配的采样。搜索采用三级降级策略：同义词扩展 FTS -> 文本 Embedding -> CLAP 音频 Embedding。"),

      heading3("\u2462 \u9f13\u57ab\u6f14\u594f + \u6b65\u8fdb\u97f3\u5e8f\u5668"),
      para("16 格鼓垫支持键盘和 MIDI 触发，内置步进音序器可快速编排节奏。无需打开 DAW 即可试听和编排，让灵感即时落地。"),

      heading3("\u2463 \u5728\u7ebf\u91c7\u6837\u5e93"),
      para("集成 Freesound、Pixabay、SND.dev 等免费采样源，一键浏览和下载到本地，统一管理。"),

      heading3("\u2464 \u5176\u4ed6\u529f\u80fd"),
      bullet("波形可视化预览 + 实时播放（Web Audio API 驱动）"),
      bullet("BPM/Key 自动检测"),
      bullet("重复文件检测（音频指纹去重）"),
      bullet("标签系统 + 收藏 + 最近播放"),
      bullet("Mod 扩展系统（内置 Wavetable Synth、Scale Keyboard 等）"),
      bullet("12 种语言国际化支持"),
      bullet("GitHub Releases 自动更新"),

      // ===== 第二部分：Demo 创作思路 =====
      new Paragraph({ children: [new PageBreak()] }),
      heading1("\u4e8c\u3001Demo \u521b\u4f5c\u601d\u8def"),

      heading2("1. \u7075\u611f\u6765\u6e90"),
      para("作为一名电子音乐爱好者，我自己有超过 1TB 的采样库，分布在几十个文件夹中。每次做歌时，找合适的声音比实际创作还耗时。市面上的专业采样管理工具（如 Ableton 的浏览器、Native Instruments 的 Komplete Kontrol）要么价格昂贵（数百美元），要么功能单一，且对中文用户不够友好。"),

      heading2("2. \u60f3\u89e3\u51b3\u7684\u95ee\u9898"),
      bulletBold("找采样效率低：", "\u6587\u4ef6\u5939\u5c42\u7ea7\u6df1\u3001\u547d\u540d\u4e0d\u89c4\u8303\uff0c\u9760\u8bb0\u5fc6\u548c\u6587\u4ef6\u540d\u641c\u7d22\u6548\u7387\u6781\u4f4e\uff0c\u5e73\u5747\u627e\u4e00\u4e2a\u91c7\u6837\u9700\u8981 5-10 \u5206\u949f"),
      bulletBold("分类全靠手动：", "\u4e0b\u8f7d\u65b0\u91c7\u6837\u5305\u540e\u9700\u8981\u9010\u4e2a\u542c\u3001\u624b\u52a8\u5206\u7c7b\uff0c\u8017\u65f6\u8017\u529b"),
      bulletBold("重复文件堆积：", "\u4e0d\u540c\u6765\u6e90\u7684\u91c7\u6837\u5305\u5e38\u6709\u91cd\u590d\uff0c\u5360\u7528\u5927\u91cf\u5b58\u50a8\u7a7a\u95f4"),
      bulletBold("在线资源分散：", "\u514d\u8d39\u91c7\u6837\u5206\u5e03\u5728\u591a\u4e2a\u7f51\u7ad9\uff0c\u6ca1\u6709\u7edf\u4e00\u5165\u53e3"),

      heading2("3. \u4e3a\u4ec0\u4e48\u505a\u8fd9\u4e2a\u65b9\u5411"),
      para("我选择\"采样管理\"这个方向，是因为："),
      bulletBold("真实痛点：", "\u8fd9\u662f\u6211\u81ea\u5df1\u6bcf\u5929\u90fd\u4f1a\u9047\u5230\u7684\u95ee\u9898\uff0c\u4e0d\u662f\u505a\u51fa\u6765\u7684\u9700\u6c42"),
      bulletBold("AI \u5dee\u5f02\u5316\u673a\u4f1a\uff1a", "\u73b0\u6709\u5de5\u5177\u51e0\u4e4e\u6ca1\u6709\u7528 AI \u505a\u8bed\u4e49\u641c\u7d22\uff0cCLAP \u6280\u672f\u53ef\u4ee5\u5e26\u6765\u8d28\u7684\u98de\u8dc3"),
      bulletBold("技术可行性\uff1a", "CLAP \u6a21\u578b\u5df2\u5f00\u6e90\uff0c\u53ef\u4ee5\u5728\u672c\u5730\u8fd0\u884c\uff0c\u4e0d\u4f9d\u8d56\u4e91\u670d\u52a1"),
      bulletBold("开源生态\uff1a", "\u7528 Electron + React \u6280\u672f\u6808\u53ef\u4ee5\u5feb\u901f\u539f\u578b\u5f00\u53d1\uff0c\u540e\u7eed\u53ef\u5f00\u6e90\u793e\u533a\u9a71\u52a8"),

      // ===== 第三部分：Demo 体验地址 =====
      new Paragraph({ children: [new PageBreak()] }),
      heading1("\u4e09\u3001Demo \u4f53\u9a8c\u5730\u5740"),

      para("\u672c\u9879\u76ee\u662f\u57fa\u4e8e Electron \u7684 桌面端应用，无法直接在浏览器中运行完整功能。以下提供两种体验方式："),

      heading2("1. \u4ea4\u4e92\u5f0f HTML Demo \u5c55\u793a\u6587\u4ef6"),
      para("\u5305\u542b\u53ef\u4ea4\u4e92\u7684\u529f\u80fd\u6a21\u62df\u754c\u9762\uff0c\u5305\u62ec\uff1a"),
      bullet("\u91c7\u6837\u5e93\u754c\u9762\u6a21\u62df\uff08\u5206\u7c7b\u6811 + \u91c7\u6837\u5361\u7247 + \u6ce2\u5f62\u9884\u89c8\uff09"),
      bullet("16 \u683c\u9f13\u57ab\u6f14\u594f\uff08\u652f\u6301\u9f20\u6807\u70b9\u51fb\u548c\u952e\u76d8\u89e6\u53d1\uff09"),
      bullet("\u6b65\u8fdb\u97f3\u5e8f\u5668\uff08\u53ef\u70b9\u51fb\u5207\u6362\u97f3\u7b26\u5f00\u5173\uff09"),
      bullet("CLAP \u8bed\u4e49\u641c\u7d22\u6a21\u62df\uff08\u8f93\u5165\u201c\u6e29\u6696\u7684\u94a2\u7434\u201d\u201c\u6c89\u91cd\u7684 808\u201d\u7b49\u4f53\u9a8c\uff09"),
      para({
        text: "\u2192 \u8bf7\u5c06\u9644\u4ef6\u4e2d\u7684 Demo\u5c55\u793a.html \u6587\u4ef6\u89e3\u538b\u540e\u7528\u6d4f\u89c8\u5668\u6253\u5f00\u5373\u53ef\u4f53\u9a8c",
        bold: true, color: "4f46e5",
        shading: { fill: "eef2ff", type: ShadingType.CLEAR },
        spacing: { before: 100, after: 100 }
      }),

      heading2("2. \u5b8c\u6574\u5e94\u7528\u4e0b\u8f7d"),
      para("\u5982\u9700\u4f53\u9a8c\u5b8c\u6574\u529f\u80fd\uff0c\u53ef\u4ece GitHub Releases \u4e0b\u8f7d\u5b89\u88c5\u5305\uff1a"),
      para("https://github.com/jimmma/samplerhub/releases"),

      // ===== 第四部分：TRAE 实践过程 =====
      new Paragraph({ children: [new PageBreak()] }),
      heading1("\u56db\u3001TRAE \u5b9e\u8df5\u8fc7\u7a0b"),

      para("\u672c\u9879\u76ee\u4ece 0 \u5230 1 \u5b8c\u5168\u4f7f\u7528 TRAE \u8f85\u52a9\u5f00\u53d1\uff0c\u4ee5\u4e0b\u662f\u5b8c\u6574\u7684\u5f00\u53d1\u6d41\u7a0b\u3002"),

      heading2("\u9636\u6bb5\u4e00\uff1a\u9879\u76ee\u67b6\u6784\u642d\u5efa"),
      para("\u4f7f\u7528 TRAE \u642d\u5efa Electron + React + TypeScript \u57fa\u7840\u6846\u67b6\uff0c\u914d\u7f6e Vite \u6784\u5efa\u5de5\u5177\u3001SQLite \u6570\u636e\u5e93\u548c Drizzle ORM\uff0c\u5efa\u7acb\u524d\u540e\u7aef IPC \u901a\u4fe1\u67b6\u6784\u3002"),
      para("\u5173\u952e\u4efb\u52a1\uff1a"),
      bullet("Electron \u4e3b\u8fdb\u7a0b\u67b6\u6784\u8bbe\u8ba1\uff08main/renderer \u8fdb\u7a0b\u5206\u79bb\uff09"),
      bullet("SQLite \u6570\u636e\u5e93 Schema \u8bbe\u8ba1\uff08samples\u3001categories\u3001tags \u7b49 10+ \u8868\uff09"),
      bullet("IPC \u901a\u9053\u8bbe\u8ba1\uff08\u91c7\u6837\u7ba1\u7406\u3001\u5206\u7c7b\u3001\u6807\u7b7e\u3001\u641c\u7d22\u7b49 20+ \u901a\u9053\uff09"),
      bullet("React \u9875\u9762\u8def\u7531\u548c\u72b6\u6001\u7ba1\u7406\uff08Zustand + React Query\uff09"),

      heading2("\u9636\u6bb5\u4e8c\uff1a\u6838\u5fc3\u529f\u80fd\u5f00\u53d1"),
      para("\u5b9e\u73b0\u91c7\u6837\u6587\u4ef6\u626b\u63cf\u4e0e\u7d22\u5f15\u3001AI \u667a\u80fd\u5206\u7c7b\u3001\u6ce2\u5f62\u53ef\u89c6\u5316\u9884\u89c8\u3001\u5168\u6587\u641c\u7d22\u3001\u6587\u4ef6\u5939\u5b9e\u65f6\u76d1\u63a7\u4e0e\u81ea\u52a8\u540c\u6b65\u3002"),
      para("\u5173\u952e\u4efb\u52a1\uff1a"),
      bullet("\u6587\u4ef6\u626b\u63cf\u5668\uff08fileScanner\uff09\uff1a\u9012\u5f52\u626b\u63cf\u6587\u4ef6\u5939\uff0c\u89e3\u6790\u97f3\u9891\u5143\u6570\u636e"),
      bullet("UCS \u5206\u7c7b\u5668\uff08ucsClassifier\uff09\uff1a\u57fa\u4e8e\u6587\u4ef6\u540d\u548c\u97f3\u9891\u5185\u5bb9\u81ea\u52a8\u5206\u7c7b\u5230 40+ \u7c7b\u522b"),
      bullet("\u6ce2\u5f62\u751f\u6210\u5668\uff08waveformGenerator\uff09\uff1a\u4e3a\u6bcf\u4e2a\u91c7\u6837\u751f\u6210\u6ce2\u5f62\u6570\u636e"),
      bullet("FTS5 \u5168\u6587\u641c\u7d22\uff1aSQLite \u539f\u751f\u5168\u6587\u641c\u7d22\u652f\u6301"),
      bullet("Chokidar \u6587\u4ef6\u76d1\u63a7\uff1a\u5b9e\u65f6\u76d1\u63a7\u6587\u4ef6\u5939\u53d8\u5316"),

      heading2("\u9636\u6bb5\u4e09\uff1aAI \u80fd\u529b\u96c6\u6210"),
      para("\u5f15\u5165 CLAP \u8bed\u4e49\u5d4c\u5165\u6a21\u578b\uff0c\u5b9e\u73b0\u81ea\u7136\u8bed\u8a00\u641c\u7d22\u97f3\u9891\uff1b\u96c6\u6210 Python sidecar \u8fdb\u884c\u97f3\u9891\u7279\u5f81\u63d0\u53d6\uff1b\u6dfb\u52a0 BPM/Key \u81ea\u52a8\u68c0\u6d4b\u3002"),
      para("\u5173\u952e\u4efb\u52a1\uff1a"),
      bullet("CLAP Embedding \u96c6\u6210\uff1a\u901a\u8fc7 @huggingface/transformers \u5728\u672c\u5730\u8fd0\u884c CLAP \u6a21\u578b"),
      bullet("Python Sidecar \u67b6\u6784\uff1a\u7528 Python \u8fdb\u7a0b\u5904\u7406\u97f3\u9891\u5206\u6790\u4efb\u52a1"),
      bullet("\u4e09\u7ea7\u641c\u7d22\u964d\u7ea7\u7b56\u7565\uff1a\u540c\u4e49\u8bcd\u6269\u5c55 FTS -> \u6587\u672c Embedding -> CLAP \u97f3\u9891 Embedding"),
      bullet("BPM/Key \u68c0\u6d4b\uff1a\u57fa\u4e8e essentia.js \u548c\u6587\u4ef6\u540d\u89e3\u6790"),

      heading2("\u9636\u6bb5\u56db\uff1a\u521b\u4f5c\u5de5\u5177\u5f00\u53d1"),
      para("\u5f00\u53d1 16 \u683c\u9f13\u57ab\u6f14\u594f\u5668\u3001\u6b65\u8fdb\u97f3\u5e8f\u5668\u3001\u6df7\u97f3\u53f0\u3001\u5728\u7ebf\u91c7\u6837\u5e93\u6d4f\u89c8\u5668\u3001MIDI \u94a2\u7434\u5377\u5e18\u3002"),
      para("\u5173\u952e\u4efb\u52a1\uff1a"),
      bullet("DrumPad \u7ec4\u4ef6\uff1a16 \u683c\u9f13\u57ab\uff0c\u652f\u6301\u952e\u76d8/MIDI \u89e6\u53d1"),
      bullet("StepSequencer\uff1a\u591a\u8f68\u6b65\u8fdb\u97f3\u5e8f\u5668\uff0c\u652f\u6301\u64ad\u653e/\u6682\u505c"),
      bullet("Mixer\uff1a\u591a\u901a\u9053\u6df7\u97f3\u53f0"),
      bullet("\u5728\u7ebf\u91c7\u6837 API\uff1a\u96c6\u6210 Freesound\u3001Pixabay\u3001SND.dev"),
      bullet("MIDI \u89e3\u6790\u5668 + \u94a2\u7434\u5377\u5e18"),

      heading2("\u9636\u6bb5\u4e94\uff1a\u6027\u80fd\u4f18\u5316 & \u53d1\u5e03\u51c6\u5907"),
      para("\u4f18\u5316 10,000+ \u91c7\u6837\u52a0\u8f7d\u6027\u80fd\uff1b\u6dfb\u52a0 12 \u79cd\u8bed\u8a00\u56fd\u9645\u5316\uff1b\u5b9e\u73b0\u65b0\u624b\u5f15\u5bfc\u6d41\u7a0b\uff1b\u914d\u7f6e\u81ea\u52a8\u66f4\u65b0\u3002"),
      para("\u5173\u952e\u4efb\u52a1\uff1a"),
      bullet("DB \u7d22\u5f15\u4f18\u5316\uff1a\u6dfb\u52a0 idx_samples_created_at\u3001idx_samples_file_name\uff0c\u52a0\u8f7d\u65f6\u95f4\u4ece 45 \u79d2\u964d\u81f3\u79d2\u7ea7"),
      bullet("Schema \u7248\u672c\u7ba1\u7406\uff1a\u652f\u6301\u589e\u91cf\u8fc1\u79fb\uff08v1 -> v2\uff09"),
      bullet("i18n \u56fd\u9645\u5316\uff1a12 \u79cd\u8bed\u8a00\uff08\u4e2d/\u82f1/\u65e5/\u97e9/\u5fb7/\u6cd5/\u897f/\u4fc4/\u8461/\u610f/\u571f\u8033\u5176/\u7ef4\u543e\u5c14\uff09"),
      bullet("Onboarding \u65b0\u624b\u5f15\u5bfc\uff1a4 \u6b65\u5f15\u5bfc\u6d41\u7a0b\uff08\u6b22\u8fce -> \u8bed\u8a00 -> \u6a21\u5f0f -> \u6dfb\u52a0\u6587\u4ef6\u5939\uff09"),
      bullet("electron-updater\uff1a\u57fa\u4e8e GitHub Releases \u7684\u81ea\u52a8\u66f4\u65b0"),
      bullet("Vitest \u5355\u5143\u6d4b\u8bd5 + Playwright E2E \u6d4b\u8bd5"),
      bullet("GitHub Actions CI/CD\uff1a\u77e9\u9635\u6784\u5efa\uff08macOS/Ubuntu/Windows\uff09"),

      // ===== 开发关键数据 =====
      heading2("\u5f00\u53d1\u5173\u952e\u6570\u636e"),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ cantSplit: true, children: [
            cell("\u6307\u6807", 3120, "e0e7ff", true),
            cell("\u6570\u636e", 3120, "e0e7ff", true),
            cell("\u8bf4\u660e", 3120, "e0e7ff", true),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("\u670d\u52a1\u6a21\u5757", 3120, null, false),
            cell("46 \u4e2a", 3120, null, false),
            cell("Electron \u4e3b\u8fdb\u7a0b\u670d\u52a1", 3120, null, false),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("UI \u7ec4\u4ef6", 3120, null, false),
            cell("30+ \u4e2a", 3120, null, false),
            cell("React \u524d\u7aef\u7ec4\u4ef6", 3120, null, false),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("IPC \u901a\u9053", 3120, null, false),
            cell("20+ \u4e2a", 3120, null, false),
            cell("\u524d\u540e\u7aef\u901a\u4fe1\u63a5\u53e3", 3120, null, false),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("\u652f\u6301\u8bed\u8a00", 3120, null, false),
            cell("12 \u79cd", 3120, null, false),
            cell("i18n \u56fd\u9645\u5316", 3120, null, false),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("\u91c7\u6837\u5206\u7c7b", 3120, null, false),
            cell("40+ \u7c7b", 3120, null, false),
            cell("UCS \u6807\u51c6 + \u81ea\u5b9a\u4e49", 3120, null, false),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("\u6027\u80fd\u4f18\u5316", 3120, null, false),
            cell("45s -> <1s", 3120, null, false),
            cell("10K+ \u91c7\u6837\u52a0\u8f7d", 3120, null, false),
          ]}),
        ]
      }),

      // ===== Session ID =====
      new Paragraph({ children: [new PageBreak()] }),
      heading1("\u4e94\u3001Session ID \u8bb0\u5f55"),
      para("\u4ee5\u4e0b\u662f\u5f00\u53d1\u8fc7\u7a0b\u4e2d\u7684\u5173\u952e\u4efb\u52a1\u5bf9\u8bdd Session ID\uff0c\u7528\u4e8e\u8bc1\u660e\u4f5c\u54c1\u7531 TRAE \u5f00\u53d1\u5b8c\u6210\u3002"),
      para({
        text: "\u63d0\u793a\uff1a\u8bf7\u5728 TRAE \u4e2d\u53cc\u51fb\u5bf9\u5e94\u7684\u5bf9\u8bdd\u8bb0\u5f55\u590d\u5236 Session ID\uff0c\u586b\u5199\u5230\u4e0b\u65b9\u8868\u683c\u4e2d\u3002",
        bold: true, color: "dc2626",
        shading: { fill: "fef2f2", type: ShadingType.CLEAR },
        spacing: { before: 100, after: 200 }
      }),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [600, 3600, 2400, 2760],
        rows: [
          new TableRow({ cantSplit: true, children: [
            cell("#", 600, "e0e7ff", true),
            cell("\u5f00\u53d1\u4efb\u52a1", 3600, "e0e7ff", true),
            cell("Session ID", 2400, "e0e7ff", true),
            cell("\u5bf9\u5e94\u9636\u6bb5", 2760, "e0e7ff", true),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("1", 600, null, false),
            cell("\u9879\u76ee\u67b6\u6784\u642d\u5efa + DB Schema \u8bbe\u8ba1", 3600, null, false),
            cell("\u3010\u5f85\u586b\u5199\u3011", 2400, null, false),
            cell("\u9636\u6bb5\u4e00", 2760, null, false),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("2", 600, null, false),
            cell("\u91c7\u6837\u626b\u63cf + AI \u5206\u7c7b + \u641c\u7d22\u529f\u80fd", 3600, null, false),
            cell("\u3010\u5f85\u586b\u5199\u3011", 2400, null, false),
            cell("\u9636\u6bb5\u4e8c", 2760, null, false),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("3", 600, null, false),
            cell("CLAP \u8bed\u4e49\u641c\u7d22 + Python Sidecar \u96c6\u6210", 3600, null, false),
            cell("\u3010\u5f85\u586b\u5199\u3011", 2400, null, false),
            cell("\u9636\u6bb5\u4e09", 2760, null, false),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("4", 600, null, false),
            cell("\u9f13\u57ab + \u97f3\u5e8f\u5668 + \u5728\u7ebf\u91c7\u6837\u5e93", 3600, null, false),
            cell("\u3010\u5f85\u586b\u5199\u3011", 2400, null, false),
            cell("\u9636\u6bb5\u56db", 2760, null, false),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("5", 600, null, false),
            cell("\u6027\u80fd\u4f18\u5316 + i18n + \u53d1\u5e03\u51c6\u5907", 3600, null, false),
            cell("\u3010\u5f85\u586b\u5199\u3011", 2400, null, false),
            cell("\u9636\u6bb5\u4e94", 2760, null, false),
          ]}),
          new TableRow({ cantSplit: true, children: [
            cell("6", 600, null, false),
            cell("\u521d\u8d5b Demo \u5c55\u793a\u6587\u4ef6\u5236\u4f5c", 3600, null, false),
            cell("\u3010\u5f85\u586b\u5199\u3011", 2400, null, false),
            cell("Demo \u5236\u4f5c", 2760, null, false),
          ]}),
        ]
      }),

      // ===== 截图清单 =====
      heading2("\u5f00\u53d1\u5173\u952e\u6b65\u9aa4\u622a\u56fe\u6e05\u5355"),
      para("\u8bf7\u622a\u53d6\u4ee5\u4e0b\u5173\u952e\u6b65\u9aa4\u7684\u622a\u56fe\uff08\u4e0d\u5c11\u4e8e 3 \u5f20\uff09\uff1a"),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({ text: "TRAE \u5bf9\u8bdd\u754c\u9762\uff1a\u5411 TRAE \u63cf\u8ff0\u9700\u6c42\u5e76\u751f\u6210\u4ee3\u7801\u7684\u5bf9\u8bdd\u622a\u56fe", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }, size: 24 })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({ text: "\u5e94\u7528\u8fd0\u884c\u622a\u56fe\uff1aSamplerHub \u5b9e\u9645\u8fd0\u884c\u754c\u9762\uff08\u91c7\u6837\u5e93\u9875\u9762\uff09", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }, size: 24 })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({ text: "\u529f\u80fd\u622a\u56fe\uff1a\u9f13\u57ab\u6f14\u594f / \u97f3\u5e8f\u5668 / \u8bed\u4e49\u641c\u7d22\u7b49\u6838\u5fc3\u529f\u80fd\u754c\u9762", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }, size: 24 })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({ text: "Git \u63d0\u4ea4\u8bb0\u5f55\uff1a\u5c55\u793a\u9879\u76ee\u5f00\u53d1\u5386\u53f2\u548c\u7248\u672c\u6807\u7b7e", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }, size: 24 })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({ text: "HTML Demo \u5c55\u793a\uff1a\u6d4f\u89c8\u5668\u4e2d\u6253\u5f00\u4ea4\u4e92\u5f0f Demo \u7684\u622a\u56fe", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }, size: 24 })]
      }),

      // ===== 报名帖链接 =====
      new Paragraph({ children: [new PageBreak()] }),
      heading1("\u516d\u3001\u62a5\u540d\u5e16\u94fe\u63a5"),
      para({
        text: "\u3010\u5f85\u586b\u5199\u3011\u62a5\u540d\u5ba1\u6838\u901a\u8fc7\u540e\uff0c\u8bf7\u5728\u6b64\u5904\u7c98\u8d34\u62a5\u540d\u5e16\u94fe\u63a5",
        bold: true, color: "dc2626",
        shading: { fill: "fef2f2", type: ShadingType.CLEAR },
        spacing: { before: 200, after: 200 }
      }),
      para("\u62a5\u540d\u5e16\u94fe\u63a5\uff1a______________________________"),

      // ===== 开发心得 =====
      heading1("\u4e03\u3001\u5f00\u53d1\u5fc3\u5f97"),

      heading2("\u8e29\u5751\u4e0e\u89e3\u51b3"),
      heading3("\u542f\u52a8\u6027\u80fd\u95ee\u9898"),
      para("\u6700\u521d\u7248\u672c\u5728\u52a0\u8f7d 10,000+ \u91c7\u6837\u65f6\u4f1a\u51bb\u7ed3 45-60 \u79d2\u3002\u7ecf\u8fc7\u5206\u6790\u53d1\u73b0\u6839\u56e0\u662f SQLite \u7f3a\u5c11\u7d22\u5f15\uff0c\u5bfc\u81f4 ORDER BY \u64cd\u4f5c\u9700\u8981\u5168\u8868\u626b\u63cf\u3002\u901a\u8fc7\u6dfb\u52a0 idx_samples_created_at \u548c idx_samples_file_name \u7d22\u5f15\uff0c\u52a0\u8f7d\u65f6\u95f4\u964d\u81f3\u79d2\u7ea7\u3002\u540c\u65f6\u5f15\u5165\u4e86 Schema \u7248\u672c\u7ba1\u7406\uff08PRAGMA user_version\uff09\uff0c\u652f\u6301\u589e\u91cf\u8fc1\u79fb\u3002"),

      heading3("React Query \u7f13\u5b58\u6c61\u67d3"),
      para("\u5728\u5f00\u53d1\u8fc7\u7a0b\u4e2d\u9047\u5230\u4e00\u4e2a\u96be\u4ee5\u590d\u73b0\u7684 bug\uff1a\u5206\u7c7b\u6811\u4e2d\u7684\u5b50\u5206\u7c7b\u91cd\u590d\u663e\u793a 4 \u6b21\u3002\u6839\u56e0\u662f useMemo \u4e2d\u76f4\u63a5\u4fee\u6539\u4e86 React Query \u8fd4\u56de\u7684\u539f\u59cb\u5bf9\u8c61\uff0c\u5bfc\u81f4\u7f13\u5b58\u88ab\u6c61\u67d3\u3002\u4fee\u590d\u65b9\u6848\uff1a\u4f7f\u7528\u4e0d\u53ef\u53d8\u7684 childrenMap \u66ff\u4ee3\u76f4\u63a5\u4fee\u6539\u539f\u59cb\u5bf9\u8c61\uff0c\u5e76\u8bbe\u7f6e structuralSharing: false\u3002"),

      heading3("CSP \u5b89\u5168\u7b56\u7565"),
      para("Electron \u7684\u5185\u5b89\u5168\u7b56\u7565\u5bfc\u81f4 Google Fonts \u88ab\u5c4f\u853d\uff0c\u4e14 data:audio \u88ab media-src \u62e6\u622a\u3002\u89e3\u51b3\u65b9\u6848\uff1a\u5c06\u5b57\u4f53\u6539\u4e3a\u672c\u5730\u52a0\u8f7d\uff08@fontsource/inter\uff09\uff0c\u5e76\u5728 CSP \u4e2d\u6dfb\u52a0 data: \u5230 media-src\u3002"),

      heading2("TRAE \u4f7f\u7528\u4f53\u9a8c"),
      para("\u6574\u4e2a\u9879\u76ee\u4ece 0 \u5230 1 \u5b8c\u5168\u4f7f\u7528 TRAE \u5f00\u53d1\uff0c\u6700\u5927\u7684\u4f53\u9a8c\u662f\uff1a"),
      bulletBold("AI \u7406\u89e3\u4e0a\u4e0b\u6587\uff1a", "TRAE \u80fd\u591f\u7406\u89e3\u6574\u4e2a\u9879\u76ee\u7684\u67b6\u6784\u548c\u4ee3\u7801\u5173\u7cfb\uff0c\u4e0d\u662f\u7b80\u5355\u7684\u4ee3\u7801\u8865\u5168\uff0c\u800c\u662f\u80fd\u505a\u51fa\u67b6\u6784\u7ea7\u522b\u7684\u51b3\u7b56"),
      bulletBold("\u590d\u6742\u4efb\u52a1\u62c6\u89e3\uff1a", "\u5bf9\u4e8e\u590d\u6742\u529f\u80fd\uff08\u5982 CLAP \u96c6\u6210\u3001\u6027\u80fd\u4f18\u5316\uff09\uff0cTRAE \u80fd\u81ea\u52a8\u62c6\u89e3\u4e3a\u591a\u4e2a\u5b50\u4efb\u52a1\u5e76\u9010\u6b65\u5b9e\u73b0"),
      bulletBold("Debug \u80fd\u529b\uff1a", "\u5f53\u9047\u5230\u96be\u9898\u65f6\uff0cTRAE \u80fd\u5feb\u901f\u5b9a\u4f4d\u95ee\u9898\u5e76\u63d0\u4f9b\u89e3\u51b3\u65b9\u6848\uff08\u5982\u542f\u52a8\u6027\u80fd\u95ee\u9898\u7684\u7d22\u5f15\u4f18\u5316\uff09"),
      bulletBold("\u5168\u6280\u672f\u6808\u8986\u76d6\uff1a", "\u65e0\u8bba\u662f\u524d\u7aef React/TypeScript \u8fd8\u662f\u540e\u7aef Electron/SQLite/Python\uff0cTRAE \u90fd\u80fd\u5f88\u597d\u5730\u5904\u7406"),

      // ===== 尾页 =====
      new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: "\u8ba9\u521b\u4f5c\u56de\u5f52\u521b\u4f5c\u672c\u8eab",
          size: 28, bold: true, color: "4f46e5",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: "Jima's SamplerHub \u2014\u2014 \u97f3\u4e50\u4eba\u7684\u667a\u80fd\u91c7\u6837\u7ba1\u5bb6",
          size: 22, color: "6b7280",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [new TextRun({
          text: "\u7531 TRAE AI \u5168\u7a0b\u8f85\u52a9\u5f00\u53d1",
          size: 18, color: "818cf8",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("TRAE_AI_\u521d\u8d5b_Demo_\u4f5c\u54c1\u5e16_Jimas_SamplerHub.docx", buffer);
  console.log("Docx generated successfully!");
});
