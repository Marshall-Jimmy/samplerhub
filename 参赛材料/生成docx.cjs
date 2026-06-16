const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
        LevelFormat, ExternalHyperlink, PageBreak } = require('docx');
const fs = require('fs');

const cjkFont = 'Microsoft YaHei';

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, width, fill) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      children: [new TextRun({ text, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }, size: 22 })]
    })]
  });
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont },
          size: 24
        }
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
        spacing: { before: 600, after: 200 },
        children: [new TextRun({
          text: "Jima's SamplerHub",
          bold: true,
          size: 56,
          color: "4f46e5",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({
          text: "音乐制作人智能采样管理工作站",
          size: 28,
          color: "6b7280",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({
          text: "TRAE AI 创造力大赛 报名材料",
          size: 24,
          color: "818cf8",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [new TextRun({
          text: "生活娱乐赛道",
          size: 22,
          color: "a78bfa",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),

      // ===== 第一部分：创意介绍 =====
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("一、创意介绍")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("1. 创意名称")]
      }),
      new Paragraph({
        children: [new TextRun({
          text: "Jima's SamplerHub —— 音乐制作人智能采样管理工作站",
          bold: true,
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("2. 想解决什么问题")]
      }),
      new Paragraph({
        children: [new TextRun("音乐制作人、DJ 和声音设计师的电脑里通常存有几千甚至上万个音频采样文件（WAV、MP3、FLAC 等），但现有的文件管理方式（文件夹层级、文件名搜索）效率极低。找一个\"适合当前曲风的 Kick 鼓\"可能需要翻几十个子文件夹，严重打断创作灵感。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("3. 为什么会想到做这个")]
      }),
      new Paragraph({
        children: [new TextRun("作为一名电子音乐爱好者，我自己有超过 1TB 的采样库，分布在几十个文件夹中。每次做歌时，找合适的声音比实际创作还耗时。市面上的专业采样管理工具（如 Ableton 的浏览器、Native Instruments 的 Komplete Kontrol）要么价格昂贵，要么功能单一，且对中文用户不够友好。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("4. 产品形态")]
      }),
      new Paragraph({
        children: [new TextRun("Jima's SamplerHub 是一款基于 Electron 的桌面端智能采样管理工作站，支持 Windows 和 macOS。它像\"音乐版的 Everything + 智能相册\"，让采样文件的管理、搜索、预览和创作一气呵成。")]
      }),
      new Paragraph({
        shading: { fill: "eef2ff", type: ShadingType.CLEAR },
        spacing: { before: 200, after: 200 },
        children: [new TextRun({
          text: "核心创新点：",
          bold: true,
          color: "4f46e5",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        }), new TextRun({
          text: "将 CLAP（Contrastive Language-Audio Pretraining）音频语义嵌入技术首次引入采样管理领域，用户可以用自然语言描述（如\"温暖的 Lo-Fi 鼓点\"）来搜索音频，而不必记住文件名。",
          color: "4338ca",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),

      // ===== 第二部分：目标用户及痛点 =====
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("二、目标用户及痛点")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("1. 面向哪些用户")]
      }),
      new Paragraph({
        children: [new TextRun("电子音乐制作人、嘻哈 Beat Maker、影视配乐师、游戏音效设计师、DJ，以及任何需要管理大量音频素材的创作者。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("2. 使用场景")]
      }),
      new Paragraph({
        children: [new TextRun("在 DAW（数字音频工作站）中制作音乐时，需要快速找到合适的采样；整理从各处下载/购买的采样包；浏览在线免费采样库并一键下载；在即兴创作时用鼓垫快速触发采样。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("3. 当前痛点")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "找采样像大海捞针：", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun("文件夹层级深、命名不规范，靠记忆和文件名搜索效率低下")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "分类全靠手动：", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun("下载新采样包后需要逐个听、手动分类，耗时耗力")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "重复文件堆积：", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun("不同来源的采样包常有重复，占用大量存储空间")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "在线资源分散：", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun("免费采样分布在多个网站，没有统一入口")]
      }),

      // ===== 第三部分：价值与意义 =====
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("三、价值与意义")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("1. 效率提升")]
      }),
      new Paragraph({
        children: [new TextRun("通过 AI 自动分类和语义搜索，将\"找采样\"的时间从平均 5-10 分钟缩短到 30 秒内。支持 10,000+ 采样文件的毫秒级检索，让创作者把精力集中在音乐本身。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("2. 社会价值")]
      }),
      new Paragraph({
        children: [new TextRun("降低音乐创作的门槛。新手制作人无需购买昂贵的采样管理工具，也无需学习复杂的文件组织规范，即可拥有专业级的采样库管理能力。支持 11 种语言，让全球创作者都能无障碍使用。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("3. 商业价值")]
      }),
      new Paragraph({
        children: [new TextRun("开源免费的基础版本 + 付费 Pro 版本（云端同步、高级 AI 分析、独家采样包）。可拓展为采样市场的流量入口，连接创作者与采样供应商。")]
      }),

      // 数据表格
      new Paragraph({ spacing: { before: 300, after: 200 }, children: [new TextRun({ text: "核心数据指标", bold: true, size: 24, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } })] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [2340, 2340, 2340, 2340],
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              cell("40+", 2340, "e0e7ff"),
              cell("11", 2340, "e0e7ff"),
              cell("3", 2340, "e0e7ff"),
              cell("0ms", 2340, "e0e7ff"),
            ]
          }),
          new TableRow({
            cantSplit: true,
            children: [
              cell("AI 智能分类", 2340, null),
              cell("语言支持", 2340, null),
              cell("在线采样源", 2340, null),
              cell("波形预览延迟", 2340, null),
            ]
          }),
        ]
      }),

      // ===== 第四部分：核心功能 =====
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("四、核心功能")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("1. AI 智能分类")]
      }),
      new Paragraph({
        children: [new TextRun("基于音频内容和文件名自动分类到 Drums、Bass、Synths 等 40+ 类别，支持 UCS（Universal Category System）国际标准。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("2. 语义搜索")]
      }),
      new Paragraph({
        children: [new TextRun("输入\"温暖的钢琴\"或\"沉重的 808\"，CLAP AI 理解你的描述，找到最匹配的采样。这是传统关键词搜索无法实现的体验。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("3. 鼓垫演奏 & 步进音序器")]
      }),
      new Paragraph({
        children: [new TextRun("16 格鼓垫 + 步进音序器，无需打开 DAW 即可快速试听和编排节奏，让灵感即时落地。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("4. 波形可视化 & 实时预览")]
      }),
      new Paragraph({
        children: [new TextRun("实时波形预览，支持播放、循环、变速，直观判断采样是否合适。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("5. 在线采样库")]
      }),
      new Paragraph({
        children: [new TextRun("集成 Freesound、Pixabay、SND.dev 等免费采样库，一键浏览和下载。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("6. BPM/Key 自动检测")]
      }),
      new Paragraph({
        children: [new TextRun("自动分析音频的 BPM 和音乐调性，方便与现有工程匹配。")]
      }),

      // ===== 第五部分：技术栈 =====
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("五、技术栈")]
      }),
      new Paragraph({
        children: [new TextRun("本项目完全使用 TRAE 辅助开发，基于以下技术栈构建：")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "桌面端：", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun("Electron 31")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "前端框架：", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun("React 18 + TypeScript + TailwindCSS + Ant Design")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "数据库：", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun("SQLite (better-sqlite3) + Drizzle ORM")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "音频处理：", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun("Howler.js + Tone.js + Web Audio API + wavesurfer.js")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "AI 能力：", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun("CLAP 语义嵌入（@huggingface/transformers）+ 音频特征提取（essentia.js + meyda）")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "构建工具：", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun("Vite + electron-builder")]
      }),

      // ===== 第六部分：开发历程 =====
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("六、开发历程")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("阶段一：项目启动")]
      }),
      new Paragraph({
        children: [new TextRun("确定产品定位和技术架构，搭建 Electron + React + TypeScript 基础框架，配置 SQLite 数据库和 Drizzle ORM。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("阶段二：核心功能开发")]
      }),
      new Paragraph({
        children: [new TextRun("实现采样扫描、AI 分类、波形预览、搜索等核心功能，集成 SQLite 数据库，支持文件夹监控和自动同步。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("阶段三：AI 能力增强")]
      }),
      new Paragraph({
        children: [new TextRun("引入 CLAP 语义嵌入，实现自然语言搜索音频；添加 BPM/Key 自动检测；集成音频指纹去重功能。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("阶段四：创作工具集成")]
      }),
      new Paragraph({
        children: [new TextRun("开发鼓垫演奏器、步进音序器、在线采样库浏览等创作辅助功能，让工具从\"管理\"延伸到\"创作\"。")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("阶段五：性能优化 & 上线准备")]
      }),
      new Paragraph({
        children: [new TextRun("优化 10,000+ 采样加载性能（从 45 秒缩短到秒级），添加多语言支持（11 种语言）、自动更新、CI/CD 流程、单元测试和 E2E 测试。")]
      }),

      // ===== 第七部分：参赛信息 =====
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("七、参赛信息")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("报名帖格式参考")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "【标签】", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun(" 生活娱乐")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "【标题】", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun(" 【生活娱乐赛道】Jima's SamplerHub —— AI 驱动的音乐采样智能管理工作站")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "【正文】", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun(" 详见上文各部分内容")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "【附件】", bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont } }), new TextRun(" 创意产物 HTML 文件（已生成）")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("项目链接")]
      }),
      new Paragraph({
        children: [new TextRun("GitHub: "), new ExternalHyperlink({
          children: [new TextRun({ text: "https://github.com/jimmma/samplerhub", color: "4f46e5" })],
          link: "https://github.com/jimmma/samplerhub"
        })]
      }),

      new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: "让创作回归创作本身",
          size: 28,
          bold: true,
          color: "4f46e5",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: "Jima's SamplerHub —— 音乐人的智能采样管家",
          size: 22,
          color: "6b7280",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont }
        })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("TRAE_AI_创造力大赛_报名材料_Jimas_SamplerHub.docx", buffer);
  console.log("Docx generated successfully!");
});
