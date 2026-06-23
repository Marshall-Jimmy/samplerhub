# BPM & Key 细化结构分析文档

> **用途**：本文档供 AI 参考，用于优化采样管理工具的 BPM/Key 解析、匹配和查询规则。
> **生成日期**：2026-06-04
> **采样库路径**：`d:\Samples`

---

## 一、总体摘要

| 指标 | 数值 |
|------|------|
| 总音频文件数 | 8,521 |
| 含 BPM 标注的文件数 | 222 |
| 含 Key 标注的文件数 | 787 |
| 唯一 BPM 值数量 | 56 |
| 唯一 Key 值数量 | 39 |
| **BPM 覆盖率** | **2.61%** |
| **Key 覆盖率** | **9.18%** |

---

## 二、BPM + Key 共存关系分析

| 类型 | 文件数 | 占比 | 说明 |
|------|--------|------|------|
| 同时含 BPM + Key | 54 | 0.63% | 主要为 Black Octopus 的 Loops 类文件 |
| 仅含 BPM | 168 | 1.97% | 主要为 Drum Fills、Risers、Shaker Loops |
| 仅含 Key | 728 | 8.54% | 主要为 One Shots、Bass、Synth |
| **两者都不含** | **7,571** | **88.85%** | 绝大多数文件无标注 |

> ⚠️ **核心发现**：近 89% 的音频文件完全没有 BPM 或 Key 标注，采样管理工具必须支持**音频分析提取 BPM/Key** 作为文件名解析的 fallback。

---

## 三、BPM 分布统计

### 3.1 BPM 值分布（Top 30）

| BPM 值 | 出现次数 | 常见风格关联 |
|--------|----------|-------------|
| 140 | 36 | Dubstep / Riddim / Trap |
| 150 | 22 | Dubstep / Hardstyle |
| 123 | 17 | Techno / House |
| 126 | 14 | Techno / Trance |
| 128 | 13 | Trance / House |
| 94 | 10 | Hip-Hop / Breakbeat |
| 120 | 7 | House / Pop |
| 160 | 6 | Drum & Bass / Hardcore |
| 100 | 6 | Hip-Hop / Trip-Hop |
| 95 | 6 | Hip-Hop |
| 170 | 6 | Drum & Bass |
| 147 | 5 | Hardstyle |
| 165 | 5 | Hardcore / Gabber |
| 105 | 4 | Hip-Hop |
| 121 | 4 | Techno |
| 110 | 3 | Hip-Hop |
| 124 | 3 | Techno |
| 137 | 3 | Trap |
| 139 | 3 | Trap |
| 145 | 3 | Dubstep |

### 3.2 BPM 按采样包分布

| 采样包 | 总文件数 | BPM 数 | BPM 率 | 主要 BPM 值 |
|--------|----------|--------|--------|------------|
| Black Octopus Sound - Free Samples Bundle | 523 | 111 | **21.22%** | 140(27), 123(17), 150(14), 126(14) |
| [Free]Guozipeng Collection Multi Kit | 7,771 | 111 | **1.43%** | 140(9), 150(8), 170(6), 147(5) |
| @wolley stash | 103 | 0 | 0.0% | — |
| Osaka Sound Forgotten LoFi Anime Vocals WAV | 98 | 0 | 0.0% | — |
| Nujabes Drum Kit | 26 | 0 | 0.0% | — |

### 3.3 BPM 按分类分布（标注率 Top 15）

| 分类 | 总文件数 | BPM 数 | BPM 率 | 说明 |
|------|----------|--------|--------|------|
| Drum - Fills | 10 | 10 | **100.0%** | 全部含 BPM |
| Drum - Shaker Loops | 5 | 5 | **100.0%** | 全部含 BPM |
| FX - Risers & Fallers | 26 | 22 | **84.62%** | Riser/Faller 必须匹配 BPM |
| Bass - Loops | 16 | 10 | **62.5%** | Loop 类需 BPM 匹配 |
| Synth - Loops | 50 | 28 | **56.0%** | Loop 类需 BPM 匹配 |
| Drum - Loops | 31 | 14 | **45.16%** | Loop 类需 BPM 匹配 |
| Live Instrument - Loops | 27 | 7 | **25.93%** | Loop 类需 BPM 匹配 |
| Vocal - Atmospheres | 19 | 5 | **26.32%** | 氛围类含 BPM |
| Drum - Top Loops | 16 | 5 | **31.25%** | Loop 类需 BPM 匹配 |
| BNYX Multi Kit | 216 | 36 | **16.67%** | Guozipeng 子套件中标注率最高 |
| Void Drum Kit | 107 | 12 | **11.21%** | 含 Loop 文件夹 |
| Afro African Conga Kit | 112 | 5 | **4.46%** | 打击乐 Loop |
| Supertrap Multi Kit | 219 | 10 | **4.57%** | 少量 Loop 含 BPM |
| DNB Dreamcore Drum Kit | 649 | 25 | **3.85%** | DnB 风格 Loop |
| ILLKA Multi Kit | 335 | 12 | **3.58%** | 少量 Loop 含 BPM |

> 📌 **规律**：**Loop 类素材的 BPM 标注率远高于 One Shot 类**。Drum Fills、Shaker Loops、Risers 等必须匹配工程 BPM 的类型，标注率接近 100%。

### 3.4 无 BPM 标注的分类（标注率 = 0%）

以下分类完全没有 BPM 标注：

| 分类 | 总文件数 | 类型 |
|------|----------|------|
| 808s | 11 | One Shot |
| Claps | 26 | One Shot |
| FX (One Shots) | 12 | One Shot |
| Hi-Hats | 31 | One Shot |
| Kicks | 5 | One Shot |
| Open Hats | 13 | One Shot |
| Snares | 13 | One Shot |
| Bass - One Shots | 57 | One Shot |
| Synth - One Shots | 26 | One Shot |
| Synth - Chord One Shots | 15 | One Shot |
| Drum - One Shots | 81 | One Shot |
| Drum - Percussion One Shots | 16 | One Shot |
| FX - Foley One Shots | 12 | One Shot |
| FX - Glitch One Shots | 17 | One Shot |
| FX - Impacts | 11 | One Shot / Impact |
| Vocal - One Shots | 4 | One Shot |
| Bass - Sub Hits & Drops | 13 | One Shot |
| 民族采样音色 | 109 | One Shot |
| JERK Drum Kit | 163 | 综合 |
| TylerTheCreator Sound Kit | 150 | 综合 |
| New Jazz Multi Kit | 127 | 综合 |
| Shinju Drum Kit | 94 | 综合 |
| Osaka Sound Vocals | 98 | Loop（无标注） |
| Nujabes Drum Kit | 26 | One Shot |

> 📌 **规律**：**所有 One Shot 类素材（鼓组单发、FX 单发、Bass One Shot 等）均不含 BPM 标注**，这是合理的，因为 One Shot 不需要匹配工程速度。

---

## 四、Key（调性）分布统计

### 4.1 Key 值分布（Top 30）

| Key 值 | 出现次数 | 类型 | 说明 |
|--------|----------|------|------|
| E | 130 | 自然大调 | 最常见 |
| C | 110 | 自然大调 | 第二常见 |
| D | 96 | 自然大调 | 第三常见 |
| G | 93 | 自然大调 | 第四常见 |
| B | 83 | 自然大调 | 第五常见 |
| F | 75 | 自然大调 | 第六常见 |
| F# | 25 | 升号调 | 电子音乐常用 |
| G# | 22 | 升号调 | Trap 常用 |
| D# | 18 | 降号调 | 电子音乐常用 |
| A# | 17 | 降号调 | 电子音乐常用 |
| Dmin | 16 | 小调 | 情感/氛围类 |
| C# | 14 | 升号调 | 电子音乐常用 |
| Gmin | 14 | 小调 | 情感/氛围类 |
| Fmin | 13 | 小调 | 情感/氛围类 |
| Amin | 12 | 小调 | 情感/氛围类 |
| Bmin | 6 | 小调 | 情感/氛围类 |
| C#min | 6 | 小调 | 情感/氛围类 |
| Cmin | 6 | 小调 | 情感/氛围类 |
| Emin | 4 | 小调 | 情感/氛围类 |
| Abmin | 3 | 降号小调 | 爵士/氛围类 |

### 4.2 Key 按采样包分布

| 采样包 | 总文件数 | Key 数 | Key 率 | 主要 Key |
|--------|----------|--------|--------|----------|
| Black Octopus Sound - Free Samples Bundle | 523 | 294 | **56.21%** | G(35), D(32), F(28), E(24) |
| [Free]Guozipeng Collection Multi Kit | 7,771 | 488 | **6.28%** | E(106), C(87), B(73), D(64) |
| @wolley stash | 103 | 0 | 0.0% | — |
| Osaka Sound Forgotten LoFi Anime Vocals WAV | 98 | 0 | 0.0% | — |
| Nujabes Drum Kit | 26 | 0 | 0.0% | — |

### 4.3 Key 按分类分布（标注率 Top 20）

| 分类 | 总文件数 | Key 数 | Key 率 | 说明 |
|------|----------|--------|--------|------|
| Vocal - Atmospheres | 19 | 18 | **94.74%** | 氛围人声需调性匹配 |
| Synth - Chord One Shots | 15 | 14 | **93.33%** | 和弦采样需调性匹配 |
| Drum - Percussion Loops | 24 | 22 | **91.67%** | 打击乐 Loop 含调性 |
| Synth - Loops | 50 | 44 | **88.0%** | 合成器 Loop 需调性匹配 |
| Bass - One Shots | 57 | 49 | **85.96%** | Bass One Shot 含调性 |
| Synth - One Shots | 26 | 22 | **84.62%** | 合成器 One Shot 含调性 |
| Live Instrument - One Shots | 15 | 12 | **80.0%** | 乐器 One Shot 含调性 |
| Bass - Loops | 16 | 12 | **75.0%** | Bass Loop 需调性匹配 |
| Vocal - Loops | 29 | 20 | **68.97%** | 人声 Loop 需调性匹配 |
| Bass - Sub Hits & Drops | 13 | 8 | **61.54%** | Sub 类含调性 |
| Live Instrument - Loops | 27 | 21 | **77.78%** | 乐器 Loop 需调性匹配 |
| Drum - One Shots | 81 | 38 | **46.91%** | 部分鼓组 One Shot 含调性 |
| Classcial Trap Multi Kit | 103 | 23 | **22.33%** | 少量含调性 |
| Techno Multi Kit | 1,415 | 397 | **28.06%** | 大量含调性 |
| Drum - Loops | 31 | 9 | **29.03%** | 部分含调性 |
| Drum - Top Loops | 16 | 3 | **18.75%** | 少量含调性 |
| FX - Impacts | 11 | 2 | **18.18%** | 少量含调性 |
| Void Drum Kit | 107 | 7 | **6.54%** | 少量含调性 |
| Afro African Conga Kit | 112 | 6 | **5.36%** | 少量含调性 |
| BNYX Multi Kit | 216 | 3 | **1.39%** | 少量含调性 |

> 📌 **规律**：**含调性的素材以 Loop 类和有音高的 One Shot（Bass、Synth、Vocal）为主**。纯打击乐 One Shot（Kick、Snare、Clap、Hi-Hat）几乎不含调性标注。

### 4.4 无 Key 标注的分类

以下分类完全没有 Key 标注：

| 分类 | 总文件数 | 类型 | 原因 |
|------|----------|------|------|
| 808s | 11 | One Shot | 808 为打击乐，调性不固定 |
| Claps | 26 | One Shot | 打击乐无固定音高 |
| FX (One Shots) | 12 | One Shot | 音效无固定音高 |
| Hi-Hats | 31 | One Shot | 打击乐无固定音高 |
| Kicks | 5 | One Shot | 打击乐无固定音高 |
| Open Hats | 13 | One Shot | 打击乐无固定音高 |
| Snares | 13 | One Shot | 打击乐无固定音高 |
| Drum - Percussion One Shots | 16 | One Shot | 打击乐无固定音高 |
| FX - Foley One Shots | 12 | One Shot | 音效无固定音高 |
| FX - Glitch One Shots | 17 | One Shot | 音效无固定音高 |
| FX - Risers & Fallers | 26 | Loop | Riser 为过渡音效，无固定调性 |
| Drum - Fills | 10 | Loop | Drum Fill 为过渡，无固定调性 |
| Drum - Shaker Loops | 5 | Loop | Shaker 为打击乐，无固定音高 |
| 民族采样音色 | 109 | One Shot | 民族打击乐无固定音高 |
| JERK Drum Kit | 163 | 综合 | 未标注 |
| TylerTheCreator Sound Kit | 150 | 综合 | 未标注 |
| New Jazz Multi Kit | 127 | 综合 | 未标注 |
| Shinju Drum Kit | 94 | 综合 | 未标注 |
| Osaka Sound Vocals | 98 | Loop | 未标注 |
| Nujabes Drum Kit | 26 | One Shot | 未标注 |

> 📌 **规律**：**纯打击乐类素材（Kick、Snare、Clap、Hi-Hat、Percussion、Shaker）和纯音效类素材（Riser、Impact、Foley、Glitch）不需要也不含调性标注**。

---

## 五、BPM + Key 共存模式分析

### 5.1 同时含 BPM + Key 的文件特征

**总计 54 个文件同时含 BPM 和 Key**

| 所属分类 | 数量 | 占比 | 典型示例 |
|----------|------|------|----------|
| Synth - Loops | 23 | 42.6% | `Leviathan4_Musicloop_Amin_105bpm_SolidSoulArpChordMelody.wav` |
| Bass - Loops | 6 | 11.1% | `AmenOG_FannyPacking_Bassloop_94bpm_Fm_30.wav` |
| Live Instrument - Loops | 6 | 11.1% | `Leviathan4_Piano_Loop_C#min_126bpm.wav` |
| Vocal - Atmospheres | 4 | 7.4% | `FemaleVoxAtmos_Hugetexture_Dmin_128bpm.wav` |
| Drum - Loops | 4 | 7.4% | `AmenOG_Basic_Drumloop_94bpm_Eb_09.wav` |
| FX - Impacts | 2 | 3.7% | `Leviathan4_Impact_DistortedBraams_D_150bpm_01.wav` |
| Guozipeng Void Kit Loops | 3 | 5.6% | `3 [kolaloibeat] Winter 160 BPM C#Minor.mp3` |
| Guozipeng DNB Kit | 1 | 1.9% | `wet-lo-fi-shaker_120bpm_C#_major.wav` |
| Guozipeng Benjicold Kit | 1 | 1.9% | `jazz 130bpm fmin.mp3` |

### 5.2 BPM + Key 共存文件名模式

```
[系列名]_[类型]_[Key]_[BPM]bpm_[描述].[ext]
[系列名]_[类型]_[BPM]bpm_[编号]_[Key].[ext]
[系列名]_[类型]_[Key]_[BPM]bpm_[描述]_[编号].[ext]
[制作人]_[类型]_[BPM]_[Key].[ext]
```

**典型示例**：
- `Leviathan4_Musicloop_Amin_105bpm_SolidSoulArpChordMelody.wav` → Key 在前，BPM 在后
- `AmenOG_FannyPacking_Bassloop_94bpm_Fm_30.wav` → BPM 在前，Key 在后
- `Leviathan4_Piano_Loop_C#min_126bpm.wav` → Key 在前，BPM 在后
- `FemaleVoxAtmos_Hugetexture_Dmin_128bpm.wav` → Key 在前，BPM 在后
- `3 [kolaloibeat] Winter 160 BPM C#Minor.mp3` → BPM 在中间，Key 在末尾
- `wet-lo-fi-shaker_120bpm_C#_major.wav` → BPM 在前，Key 在后

> 📌 **规律**：BPM 和 Key 的相对位置**不固定**，可能在文件名中任意位置出现。解析时必须使用全局正则匹配，不能依赖固定位置。

---

## 六、无 BPM/Key 标注的文件分析

### 6.1 无标注文件的分类特征

**总计 7,571 个文件（88.85%）无 BPM 和 Key 标注**

| 类型 | 文件数 | 占比 | 说明 |
|------|--------|------|------|
| 鼓组 One Shot（Kick/Snare/Clap/Hat） | ~5,000+ | ~66% | 打击乐不需要 BPM/Key |
| 综合 Multi Kit（Guozipeng 未标注部分） | ~1,500 | ~20% | 命名不规范 |
| 个人收藏（@wolley stash） | 103 | ~1.4% | 未标注 |
| 人声采样（Osaka Sound） | 98 | ~1.3% | 未标注 |
| Nujabes Drum Kit | 26 | ~0.3% | 极简命名 |

### 6.2 需要音频分析提取 BPM/Key 的场景

| 场景 | 建议处理方式 |
|------|-------------|
| Loop 类文件无 BPM | 使用音频 BPM 检测算法（如 aubio、librosa） |
| 有音高素材无 Key | 使用音频 Key 检测算法（如 librosa key detection） |
| One Shot 类文件 | 不需要 BPM；Key 可选（Bass/Synth One Shot 可检测） |
| 纯打击乐 One Shot | 不需要 BPM/Key |

---

## 七、AI 解析规则建议

### 7.1 BPM 提取规则

```
正则模式 1: (\d{2,3})\s*[Bb][Pp][Mm]      → 匹配 "140bpm", "140 BPM", "140Bpm"
正则模式 2: (\d{2,3})\s*[Bb][Pp][Mm]        → 匹配 "140 bpm"
正则模式 3: (?<![\d])(70|75|80|85|90|95|100|105|110|115|120|123|124|125|126|127|128|130|135|137|138|139|140|141|143|144|145|146|147|150|151|154|155|158|160|161|163|164|165|166|167|170|171|172|174|178|180|200)(?![\d])  → 常见 BPM 白名单匹配
```

> ⚠️ **重要**：圆括号内的纯数字（如 `(113)`）**不是 BPM**，是变体编号。必须排除 `\(\d+\)` 模式。

### 7.2 Key 提取规则

```
正则模式 1: [_\s\-]([A-G][#b]?)\s*(min|maj|m|major|minor|M|dim|sus|7|maj7|min7|m7)?[_\s\.\)\]]
           → 匹配 "_A_", "_C#min_", "_Fmaj7_", "_G#m_"

正则模式 2: (?<![A-Za-z])([A-G][#b]?)\s*(min|maj|m|major|minor|M|dim|sus|7|maj7|min7|m7)?(?![A-Za-z])
           → 匹配独立出现的调性

常见 Key 白名单:
- 大调: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
- 小调: Cmin, C#min, Dmin, D#min, Emin, Fmin, F#min, Gmin, G#min, Amin, A#min, Bmin
- 扩展: Cmaj7, Cmin7, Dsus4, Fmin9th, Abdim, etc.
```

### 7.3 BPM + Key 共存解析策略

```python
# 伪代码示例
def parse_bpm_key(filename):
    bpm = None
    key = None
    
    # 1. 提取 BPM（全局匹配，不依赖位置）
    bpm_match = re.search(r'(\d{2,3})\s*[Bb][Pp][Mm]', filename)
    if bpm_match:
        bpm = int(bpm_match.group(1))
    
    # 2. 提取 Key（全局匹配，不依赖位置）
    # 先匹配带后缀的（min/maj/7等），再匹配纯字母
    key_match = re.search(r'[_\s\-]([A-G][#b]?)\s*(min|maj|m|major|minor|M|dim|sus|7|maj7|min7|m7)?[_\s\.\)\]]', filename)
    if key_match:
        key = key_match.group(1)
        if key_match.group(2):
            key += key_match.group(2)
    
    return bpm, key
```

### 7.4 按分类的 BPM/Key 需求矩阵

| 分类 | 是否需要 BPM | 是否需要 Key | 标注率 | 建议处理方式 |
|------|-------------|-------------|--------|-------------|
| **Loop 类** | | | | |
| Bass - Loops | ✅ 必须 | ✅ 必须 | BPM 62.5%, Key 75% | 优先文件名解析，fallback 音频分析 |
| Synth - Loops | ✅ 必须 | ✅ 必须 | BPM 56%, Key 88% | 优先文件名解析，fallback 音频分析 |
| Drum - Loops | ✅ 必须 | ⚪ 可选 | BPM 45%, Key 29% | 优先文件名解析 BPM |
| Vocal - Loops | ✅ 必须 | ✅ 必须 | BPM 0%, Key 69% | 必须音频分析 BPM |
| Top Loops | ✅ 必须 | ⚪ 可选 | BPM 31%, Key 19% | 优先文件名解析 BPM |
| Drum Fills | ✅ 必须 | ❌ 不需要 | BPM 100%, Key 0% | 文件名解析 BPM |
| Shaker Loops | ✅ 必须 | ❌ 不需要 | BPM 100%, Key 0% | 文件名解析 BPM |
| Risers & Fallers | ✅ 必须 | ❌ 不需要 | BPM 85%, Key 0% | 文件名解析 BPM |
| **One Shot 类** | | | | |
| Bass - One Shots | ❌ 不需要 | ✅ 必须 | BPM 0%, Key 86% | 文件名解析 Key |
| Synth - One Shots | ❌ 不需要 | ✅ 必须 | BPM 0%, Key 85% | 文件名解析 Key |
| Drum - One Shots | ❌ 不需要 | ⚪ 可选 | BPM 0%, Key 47% | 文件名解析 Key（部分含） |
| Kick / Snare / Clap / Hat | ❌ 不需要 | ❌ 不需要 | BPM 0%, Key 0% | 不需要 |
| FX - Impacts | ❌ 不需要 | ⚪ 可选 | BPM 18%, Key 18% | 不需要 |
| **其他** | | | | |
| Vocal - Atmospheres | ✅ 必须 | ✅ 必须 | BPM 26%, Key 95% | 优先文件名解析 |
| Live Instrument | ✅ 必须 | ✅ 必须 | BPM 26%, Key 78% | 优先文件名解析 |
| MIDI 文件 | ✅ 必须 | ✅ 必须 | — | 解析 MIDI 元数据 |

---

## 八、已知问题和边缘情况

### 8.1 BPM 解析陷阱

| 陷阱 | 示例 | 正确处理 |
|------|------|----------|
| 圆括号编号 ≠ BPM | `808 (113).wav` | 排除 `\(\d+\)` 模式 |
| 三位数可能是编号 | `OSFO_Vocal_100.wav` | 必须含 "bpm" 字样 |
| BPM 大小写混用 | `140bpm`, `140BPM`, `140Bpm` | 正则忽略大小写 |
| BPM 前后有空格 | `140 bpm`, `140_bpm` | 正则允许空格/下划线 |
| 非标准 BPM | `200 BPM`（Void Kit） | 扩展 BPM 范围到 60-220 |

### 8.2 Key 解析陷阱

| 陷阱 | 示例 | 正确处理 |
|------|------|----------|
| 字母可能是单词的一部分 | `Bass`, `Best`, `Band` | 使用边界匹配 `\b[A-G][#b]?\b` |
| 大小调后缀多样 | `min`, `m`, `minor`, `maj`, `major`, `M` | 统一归一化为 `min`/`maj` |
| 和弦扩展 | `Dsus4`, `Fmin9th`, `Abdim` | 支持常见扩展后缀 |
| 降号 vs 升号 | `Eb` vs `D#` | 统一归一化（可选） |
| 大小写不一致 | `Cmin`, `cmin`, `CMIN` | 正则忽略大小写 |

### 8.3 特殊文件名格式

| 格式 | 示例 | 解析策略 |
|------|------|----------|
| BPM 在 Key 之前 | `94bpm_Fm_30` | 全局正则，不依赖顺序 |
| Key 在 BPM 之前 | `Amin_105bpm` | 全局正则，不依赖顺序 |
| BPM 和 Key 被其他文本隔开 | `Winter 160 BPM C#Minor` | 全局正则，不依赖顺序 |
| 无分隔符 | `140E`（极少见） | 使用边界匹配 |

---

## 九、建议的数据库/索引结构

```
sample_metadata 表结构建议:
├── id (主键)
├── filepath (完整路径)
├── filename (文件名)
├── package (所属采样包)
├── category (分类)
├── type (Loop / One Shot / Fill / MIDI / Preset)
├── format (.wav / .mp3 / .aif / .mid)
├── bpm_source (filename / audio_analysis / null)
├── bpm_value (整数，null 表示未知)
├── key_source (filename / audio_analysis / null)
├── key_value (字符串，如 "Cmin", "F#maj", null 表示未知)
├── key_normalized (归一化调性，如 "C#min" → "Dbmin")
├── duration_ms (时长，用于区分 Loop/One Shot)
├── producer_tag (制作人标签，如 "@kolaloibeat")
├── style_tags (风格标签数组)
└── custom_tags (用户自定义标签数组)

索引建议:
├── idx_bpm (bpm_value)
├── idx_key (key_value)
├── idx_package (package)
├── idx_category (category)
├── idx_type (type)
└── idx_style_tags (style_tags，使用 GIN 索引)
```

---

## 十、BPM/Key 查询功能建议

### 10.1 按 BPM 查询

| 查询模式 | 说明 |
|----------|------|
| 精确匹配 | `BPM = 140` |
| 范围匹配 | `BPM BETWEEN 135 AND 145` |
| 近似匹配 | `BPM ± 5%`（考虑工程速度微调） |
| 半速/倍速 | `BPM / 2` 或 `BPM * 2`（如 70 BPM 可匹配 140 BPM 工程） |

### 10.2 按 Key 查询

| 查询模式 | 说明 |
|----------|------|
| 精确匹配 | `Key = "Cmin"` |
| 关系调匹配 | `Cmin` 的平行大调 `Ebmaj`，关系小调 `Cmin` |
| 五度圈匹配 | 相邻调性（如 `Cmin` → `Gmin` 或 `Fmin`） |
| 调性兼容 | 同一调号内的所有调性 |

### 10.3 BPM + Key 联合查询

```sql
-- 示例：查找与当前工程匹配的 Loop
SELECT * FROM sample_metadata
WHERE type = 'Loop'
  AND bpm_value BETWEEN 135 AND 145
  AND key_value = 'Cmin'
  AND category IN ('Bass - Loops', 'Synth - Loops', 'Vocal - Loops')
ORDER BY 
  CASE WHEN bpm_source = 'filename' THEN 0 ELSE 1 END,  -- 优先文件名解析的
  ABS(bpm_value - 140);  -- 按 BPM 差值排序
```

---

## 十一、总结

1. **标注率极低**：仅 2.61% 的文件含 BPM，9.18% 含 Key，88.85% 完全无标注
2. **Loop 类优先标注**：Loop 类素材（Bass Loop、Synth Loop、Drum Loop）的 BPM/Key 标注率显著高于 One Shot 类
3. **One Shot 不需要 BPM**：所有 One Shot 类素材均不含 BPM 标注，这是合理的
4. **打击乐不需要 Key**：Kick、Snare、Clap、Hi-Hat 等纯打击乐不含 Key 标注，这是合理的
5. **解析必须全局匹配**：BPM 和 Key 在文件名中的位置不固定，必须使用全局正则匹配
6. **必须支持音频分析**：对于无标注的文件，需要 fallback 到音频 BPM/Key 检测算法
7. **采样包差异巨大**：Black Octopus 标注率最高（BPM 21%, Key 56%），Guozipeng 标注率很低（BPM 1.4%, Key 6.3%）
