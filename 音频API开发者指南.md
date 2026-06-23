# 免费音频样本 API 开发者完全指南

> 本文档涵盖 **AI 生成音频 API**（Drumloop AI、Mubert）和 **音频样本库 API**（Pixabay、Freesound、Lotsofsounds、SND.dev、RapidAPI Stock SFX）以及 **免费下载资源**（BBC Sound Effects、Mixkit、Zapsplat、OpenGameArt 等）的详细接口说明、认证方式、代码示例和最佳实践。

---

## 目录

1. [快速对比](#快速对比)
2. [AI 生成音频 API](#ai-生成音频-api)
   - [Drumloop AI](#drumloop-ai)
   - [Mubert API](#mubert-api)
3. [音频样本库 API](#音频样本库-api)
   - [Pixabay API](#pixabay-api)
   - [Freesound API](#freesound-api)
   - [Lotsofsounds API](#lotsofsounds-api)
   - [SND.dev / snd-lib](#snddev--snd-lib)
   - [RapidAPI Stock SFX](#rapidapi-stock-sfx)
4. [免费素材下载资源](#免费素材下载资源)
   - [BBC Sound Effects](#bbc-sound-effects)
   - [Mixkit](#mixkit)
   - [Zapsplat](#zapsplat)
   - [OpenGameArt](#opengameart)
   - [其他资源](#其他免费资源)
5. [综合使用示例](#综合使用示例)
6. [常见问题](#常见问题)

---

## 快速对比

### AI 生成音频 API

| 特性 | Drumloop AI | Mubert |
|------|-------------|--------|
| **类型** | AI 生成鼓循环 | AI 生成完整音乐/循环 |
| **生成方式** | 文本提示 + 风格选择 | 文本/图像/BPM/风格 |
| **免费额度** | 每天 3 个循环 | Trial $49/月（100 次生成）|
| **输出格式** | WAV / MP3 | MP3 / WAV |
| **授权** | 100% 免版税商用 | 免版税商用 |
| **特色** | 专注鼓节奏、多轨道编辑 | 150+ 风格、实时流式播放 |

### 音频样本库 API

| 特性 | Pixabay | Freesound | Lotsofsounds | SND.dev | RapidAPI Stock SFX |
|------|---------|-----------|--------------|---------|-------------------|
| **类型** | 图片+视频+音效+音乐 | 通用音效/音乐 | 免版税音效 | UI 交互音效 | 通用音效/音乐 |
| **免费额度** | 100 req/min | 60 req/min, 2000 req/day | `/sample` 完全免费 | 完全免费 | RapidAPI BASIC 套餐 |
| **认证** | API Key（免费注册）| API Key / OAuth2 | 无需认证 (sample) | 无需认证 | RapidAPI Key |
| **授权** | Pixabay License（免版税商用）| Creative Commons | CC0 / 免版税 | 商用免费 | 免版税 |
| **搜索** | 文本+分类+颜色 | 文本+内容分析+相似度 | 自然语言 | 按分类筛选 | 参数筛选 |
| **下载** | 直接URL（需下载到本地）| 需 OAuth2 | 直接 URL | CDN 直链 | 需订阅 |
| **特色** | 海量资源、多类型、中文支持 | 音频特征分析、相似搜索 | AI 优化、即开即用 | UI 组件自动绑定 | 高质量素材 |

---

## AI 生成音频 API

---

## Drumloop AI

### 概述

Drumloop AI 是专注于鼓循环生成的 AI 工具，使用音频神经合成技术，通过文本提示生成原创鼓节奏。支持多种流派选择、BPM 调节和多轨道编辑。

- **官网**: https://drumloopai.com/
- **类型**: AI 音频生成（鼓循环专用）
- **授权**: 生成的循环 100% 免版税，可商用

### 核心功能

| 功能 | 说明 |
|------|------|
| **流派选择** | 嘻哈、电子、摇滚、流行、爵士等多种风格 |
| **BPM 调节** | 自定义节奏速度 |
| **智能匹配** | 导入旋律自动分析并生成匹配的鼓点 |
| **多轨道编辑** | 底鼓、军鼓、镲片单独调节 |
| **预览回听** | 下载前预览生成的循环 |
| **导出格式** | WAV / MIDI |

### 免费额度

- **免费计划**: 每天可生成 **3 个鼓循环**
- **付费计划**: 解锁更多生成次数和高级功能

### 使用流程

1. 访问 https://drumloopai.com/ 注册账号
2. 选择音乐风格（如 Deep House、Techno、Hip Hop）
3. 设置 BPM 和节奏复杂度
4. 点击生成，AI 创建鼓循环
5. 预览并下载 WAV 或 MIDI 文件

### 提示词示例

```
"energetic pop punk drum beat in 130 bpm"
"deep house kick with groovy hi-hats, 124 bpm"
"lo-fi hip hop chill drum pattern, 85 bpm"
"hard techno industrial drums, 140 bpm"
```

### 在 DAW 中使用

```
1. 生成鼓循环并导出 MIDI 文件
2. 导入 Ableton Live / Logic Pro / FL Studio
3. 替换为自定义鼓组采样
4. 微调力度和时值
```

---

## Mubert API

### 概述

Mubert 是领先的 AI 音乐生成平台，提供完整的 API 支持文本转音乐、图像转音乐、实时流式播放等功能。适合为 App、游戏、直播、视频等内容生成免版税背景音乐。

- **API 文档**: https://mubert.com/api/docs
- **基础 URL**: `https://music-api.mubert.com/api/v3/`
- **流式 URL**: `https://stream.mubert.com/b2b/v3/`

### 定价方案

| 方案 | 价格 | 生成额度 | 流式额度 |
|------|------|----------|----------|
| **Trial** | $49/月 | 100 次/月 | 100 分钟/月 |
| **Startup** | $199/月 | 5,000 次/月 | 5,000 分钟/月 |
| **Startup+** | $499/月 | 30,000 次/月 | 30,000 分钟/月 |
| **Custom** | 定制 | 无限 | 无限 |

### 认证方式

```
# 服务端（管理用户和许可证）
company-id: COMPANY_ID
license-token: LICENSE_TOKEN

# 客户端（生成和流式播放）
customer-id: CUSTOMER_ID
access-token: ACCESS_TOKEN
```

### 核心接口

#### 1. 获取音乐频道列表

```http
GET /api/v3/public/playlists
```

返回所有可用的音乐分类、分组、频道和播放列表索引。

**示例响应：**

```json
{
  "data": [
    {
      "playlist_index": "3.0.0",
      "category": "Calm",
      "group": "Ambient",
      "channel": "Meditation",
      "params": {
        "bpm": { "gt": 45, "lt": 83 },
        "keys": ["Cm", "C", "C#m", "C#", "Dm", "D", ...]
      }
    }
  ]
}
```

#### 2. 生成音轨

```http
POST /api/v3/public/tracks
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `playlist_index` | string | 频道索引（必填）|
| `duration` | int | 时长（秒），最大 1500 |
| `bitrate` | int | 音质: 32, 96, 128, 192, 256, 320 |
| `format` | string | `mp3` 或 `wav` |
| `intensity` | string | `low`, `medium`, `high` |
| `mode` | string | `track`, `jingle`, `loop`, `mix` |

**示例请求：**

```bash
curl -X POST "https://music-api.mubert.com/api/v3/public/tracks" \
-H "customer-id: CUSTOMER_ID" \
-H "access-token: ACCESS_TOKEN" \
-H "Content-Type: application/json" \
-d '{
  "playlist_index": "1.0.0",
  "duration": 60,
  "bitrate": 128,
  "format": "wav",
  "intensity": "high",
  "mode": "loop"
}'
```

#### 3. 文本转音乐 (TTM)

```http
POST /api/v3/public/tracks
```

**示例：**

```bash
curl -X POST "https://music-api.mubert.com/api/v3/public/tracks" \
-H "customer-id: CUSTOMER_ID" \
-H "access-token: ACCESS_TOKEN" \
-H "Content-Type: application/json" \
-d '{
  "prompt": "energetic drum and bass with heavy breakbeats",
  "duration": 120,
  "bitrate": 320,
  "format": "wav",
  "mode": "track"
}'
```

#### 4. 获取流式播放链接

```http
GET /api/v3/public/streaming/get-link
```

**示例：**

```bash
curl -X GET "https://music-api.mubert.com/api/v3/public/streaming/get-link" \
-H "Content-Type: application/json" \
-H "customer-id: CUSTOMER_ID" \
-H "access-token: ACCESS_TOKEN" \
-d '{
  "playlist_index": "1.0.0",
  "bitrate": 320,
  "intensity": "medium",
  "type": "http"
}'
```

**响应：**

```json
{
  "data": {
    "link": "https://stream.mubert.com/b2b/v3?customer_id=...&playlist=1.0.0&bitrate=320"
  }
}
```

#### 5. 循环模式控制

```http
POST /api/v3/public/streaming/set-loop-state
```

```bash
curl -X POST "https://music-api.mubert.com/api/v3/public/streaming/set-loop-state" \
-H "customer-id: CUSTOMER_ID" \
-H "access-token: ACCESS_TOKEN" \
-H "Content-Type: application/json" \
-d '{
  "loop": "on",
  "time": 0
}'
```

### 用户注册接口

为每个终端用户创建独立的访问令牌：

```bash
curl -X POST "https://music-api.mubert.com/api/v3/service/customers" \
-H "Content-Type: application/json" \
-H "company-id: COMPANY_ID" \
-H "license-token: LICENSE_TOKEN" \
-d '{
  "custom_id": "user_12345"
}'
```

**响应：**

```json
{
  "data": {
    "id": "CUSTOMER_ID",
    "access": {
      "token": "ACCESS_TOKEN",
      "expired_at": "2025-02-01T00:00:00.000000Z"
    }
  }
}
```

### JavaScript/TypeScript 示例

```typescript
const MUBERT_BASE = 'https://music-api.mubert.com/api/v3';

class MubertClient {
  private customerId: string;
  private accessToken: string;

  constructor(customerId: string, accessToken: string) {
    this.customerId = customerId;
    this.accessToken = accessToken;
  }

  private async request(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'customer-id': this.customerId,
        'access-token': this.accessToken,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${MUBERT_BASE}${endpoint}`, options);
    if (!response.ok) {
      throw new Error(`Mubert API error: ${response.status}`);
    }
    return response.json();
  }

  // 获取频道列表
  async getPlaylists(): Promise<any> {
    return this.request('/public/playlists');
  }

  // 生成音轨
  async generateTrack(options: {
    playlist_index?: string;
    prompt?: string;
    duration: number;
    bitrate?: number;
    format?: 'mp3' | 'wav';
    intensity?: 'low' | 'medium' | 'high';
    mode?: 'track' | 'jingle' | 'loop' | 'mix';
  }): Promise<any> {
    return this.request('/public/tracks', 'POST', options);
  }

  // 获取流式链接
  async getStreamingLink(playlistIndex: string, options: {
    bitrate?: number;
    intensity?: 'low' | 'medium' | 'high';
    type?: 'http' | 'webrtc';
  } = {}): Promise<string> {
    const response = await this.request('/public/streaming/get-link', 'GET', {
      playlist_index: playlistIndex,
      bitrate: options.bitrate || 128,
      intensity: options.intensity || 'medium',
      type: options.type || 'http',
    });
    return response.data.link;
  }

  // 设置循环状态
  async setLoopState(loop: 'on' | 'off', time?: number): Promise<void> {
    await this.request('/public/streaming/set-loop-state', 'POST', {
      loop,
      time: time || 0,
    });
  }
}

// 使用示例
const client = new MubertClient('your-customer-id', 'your-access-token');

// 生成鼓循环
const track = await client.generateTrack({
  prompt: "heavy drum and bass breakbeat, energetic",
  duration: 60,
  format: 'wav',
  intensity: 'high',
  mode: 'loop',
});

console.log('生成完成:', track);
```

### Webhook 通知

Mubert 支持通过 webhook 接收音轨生成状态通知：

```json
{
  "id": "TRACK_ID",
  "playlist_index": "1.0.0",
  "duration": 61,
  "intensity": "high",
  "mode": "track",
  "key": "A#",
  "bpm": 120,
  "generations": [
    {
      "session_id": "GENERATION_SESSION_ID",
      "format": "mp3",
      "bitrate": 128,
      "status": "done",
      "url": "YOUR_TRACK_LINK"
    }
  ]
}
```

---

## 音频样本库 API

---

## Pixabay API

### 概述

Pixabay 是全球最大的免费素材平台之一，提供超过 **数百万** 张图片、视频、**音效和音乐**。所有素材遵循 Pixabay Content License，可免费商用，无需署名。API 支持搜索图片、视频和音频。

- **API 文档**: https://pixabay.com/api/docs/
- **基础 URL**: `https://pixabay.com/api/`
- **音频搜索**: `https://pixabay.com/api/videos/`（视频/音频共用端点）
- **授权**: Pixabay Content License（免版税，可商用，可修改，无需署名）

### 免费额度

- **100 请求 / 60 秒**
- 每次查询最多返回 **500 条** 结果
- 结果需缓存 **24 小时**
- 不允许系统化批量下载

### 认证方式

注册 Pixabay 账号后获取免费 API Key，通过 URL 参数传递：

```
?key=YOUR_API_KEY
```

### 核心接口

#### 1. 搜索音效和音乐

Pixabay 的音频搜索通过 **视频搜索端点** 实现（音频和视频共用同一端点）：

```http
GET https://pixabay.com/api/videos/?key=YOUR_KEY&q=kick+drum
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `key` | string | API Key（必填）|
| `q` | string | 搜索关键词（URL编码，最长100字符）|
| `lang` | string | 语言: `zh`, `en`, `ja`, `ko` 等 |
| `category` | string | 分类: `music`, `animals`, `nature`, `transport` 等 |
| `id` | string | 按 ID 获取单个结果 |
| `safesearch` | bool | 安全搜索: `true`, `false` |
| `order` | string | 排序: `popular`, `latest` |
| `page` | int | 页码，默认 1 |
| `per_page` | int | 每页数量，3-200，默认 20 |

**示例请求：**

```bash
# 搜索鼓声音效
curl "https://pixabay.com/api/videos/?key=YOUR_KEY&q=drum+beat&category=music&per_page=10"

# 搜索钢琴音乐
curl "https://pixabay.com/api/videos/?key=YOUR_KEY&q=piano&category=music&order=popular"

# 中文搜索
curl "https://pixabay.com/api/videos/?key=YOUR_KEY&q=鼓声&lang=zh&per_page=10"
```

**响应格式：**

```json
{
  "total": 1250,
  "totalHits": 500,
  "hits": [
    {
      "id": 12345,
      "pageURL": "https://pixabay.com/videos/id-12345/",
      "type": "film",
      "tags": "drum, beat, kick",
      "duration": 12,
      "videos": {
        "large": {
          "url": "https://cdn.pixabay.com/video/.../large.mp4",
          "width": 1920,
          "height": 1080,
          "size": 6615235
        },
        "medium": {
          "url": "https://cdn.pixabay.com/video/.../medium.mp4",
          "width": 1280,
          "height": 720,
          "size": 3562083
        },
        "small": {
          "url": "https://cdn.pixabay.com/video/.../small.mp4",
          "width": 640,
          "height": 360,
          "size": 1030736
        },
        "tiny": {
          "url": "https://cdn.pixabay.com/video/.../tiny.mp4",
          "width": 480,
          "height": 270,
          "size": 426799
        }
      },
      "views": 4462,
      "downloads": 1464,
      "likes": 18,
      "user": "username"
    }
  ]
}
```

> **注意**：Pixabay 的音频素材 URL 有效期为 **24 小时**，且不允许永久热链接。需下载到本地服务器或存储后使用。视频 URL 添加 `?download=1` 参数可直接触发浏览器下载。

### JavaScript/TypeScript 示例

```typescript
const PIXABAY_API_KEY = 'your-api-key';
const PIXABAY_BASE = 'https://pixabay.com/api';

interface PixabayHit {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  duration: number;
  videos: {
    large: VideoInfo;
    medium: VideoInfo;
    small: VideoInfo;
    tiny: VideoInfo;
  };
  views: number;
  downloads: number;
  likes: number;
  user: string;
}

interface VideoInfo {
  url: string;
  width: number;
  height: number;
  size: number;
}

class PixabayClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchAudio(query: string, options: {
    lang?: string;
    category?: string;
    order?: 'popular' | 'latest';
    page?: number;
    perPage?: number;
  } = {}): Promise<{ total: number; hits: PixabayHit[] }> {
    const params = new URLSearchParams({
      key: this.apiKey,
      q: query,
      category: options.category || 'music',
      lang: options.lang || 'en',
      order: options.order || 'popular',
      page: String(options.page || 1),
      per_page: String(options.perPage || 20),
    });

    const response = await fetch(`${PIXABAY_BASE}/videos/?${params}`);
    if (!response.ok) throw new Error(`Pixabay error: ${response.status}`);
    
    const data = await response.json();
    return { total: data.totalHits, hits: data.hits };
  }

  // 获取试听URL（小文件）
  getPreviewUrl(hit: PixabayHit): string {
    return hit.videos.tiny.url;
  }

  // 获取下载URL（添加download=1触发下载）
  getDownloadUrl(hit: PixabayHit): string {
    return `${hit.videos.medium.url}?download=1`;
  }
}

// 使用示例
const client = new PixabayClient('your-api-key');

const results = await client.searchAudio('drum beat', {
  category: 'music',
  lang: 'en',
  perPage: 10,
});

console.log(`找到 ${results.total} 个结果`);
for (const hit of results.hits) {
  console.log(`- [${hit.tags}] ${hit.duration}s`);
  console.log(`  试听: ${client.getPreviewUrl(hit)}`);
  console.log(`  下载: ${client.getDownloadUrl(hit)}`);
}
```

### 关键注意事项

1. **URL 有效期**：返回的 URL 24 小时后失效，必须下载到本地
2. **禁止热链接**：不允许在应用中直接使用 Pixabay CDN URL
3. **署名要求**：虽然 Pixabay License 不要求署名，但 API 使用时建议显示来源
4. **中文支持**：`lang=zh` 支持中文搜索
5. **音频分类**：`category=music` 筛选音频类内容

---

## Freesound API

### 概述

Freesound 是全球最大的 Creative Commons 音频社区，提供 RESTful API 访问超过 50 万个用户上传的音频文件。支持文本搜索、基于音频内容的搜索、相似度搜索、音频特征分析等高级功能。

- **基础 URL**: `https://freesound.org/apiv2`
- **文档**: https://freesound.org/docs/api/
- **速率限制**: 60 请求/分钟，2000 请求/天

### 认证方式

#### 1. Token 认证（只读操作）

适用于搜索、获取元数据等只读操作：

```
Authorization: Token YOUR_API_KEY
```

#### 2. OAuth2 认证（需要写权限）

下载原始文件、上传、评论等操作需要 OAuth2：

1. 在 https://freesound.org/apiv2/apply/ 申请 API 凭证
2. 获取 `client_id` 和 `client_secret`
3. 实现 OAuth2 授权流程

### 核心接口

#### 1. 文本搜索

```http
GET /apiv2/search/
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | string | 搜索关键词，支持 `+` (必须包含) `-` (排除) `"短语"` |
| `filter` | string | 过滤条件，Solr 语法 |
| `sort` | string | 排序: `score`, `duration_desc`, `created_desc`, `downloads_desc`, `rating_desc` |
| `fields` | string | 返回字段，逗号分隔 |
| `page` | int | 页码，默认 1 |
| `page_size` | int | 每页数量，默认 15，最大 150 |
| `similar_to` | int | 相似声音 ID |
| `group_by_pack` | bool | 按采样包分组 |

**示例请求：**

```bash
# 基础搜索
curl -H "Authorization: Token YOUR_API_KEY" \
  "https://freesound.org/apiv2/search/?query=kick+drum&page_size=10"

# 高级搜索：排除 "snare"，按下载量排序，只返回指定字段
curl -H "Authorization: Token YOUR_API_KEY" \
  "https://freesound.org/apiv2/search/?query=drum+-snare&sort=downloads_desc&fields=id,name,duration,previews&page_size=5"

# 内容过滤：时长 0-2 秒的 WAV 文件
curl -H "Authorization: Token YOUR_API_KEY" \
  "https://freesound.org/apiv2/search/?query=impact&filter=duration:[0%20TO%202]%20type:wav"

# 相似声音搜索
curl -H "Authorization: Token YOUR_API_KEY" \
  "https://freesound.org/apiv2/search/?similar_to=12345&page_size=10"
```

**响应格式：**

```json
{
  "count": 1250,
  "next": "https://freesound.org/apiv2/search/?query=drum&page=2",
  "previous": null,
  "results": [
    {
      "id": 12345,
      "name": "Kick Drum Hard",
      "tags": ["kick", "drum", "bass"],
      "license": "http://creativecommons.org/licenses/by/3.0/",
      "duration": 0.5,
      "username": "user123",
      "previews": {
        "preview-lq-ogg": "https://.../preview-lq.ogg",
        "preview-lq-mp3": "https://.../preview-lq.mp3",
        "preview-hq-ogg": "https://.../preview-hq.ogg",
        "preview-hq-mp3": "https://.../preview-hq.mp3"
      }
    }
  ]
}
```

#### 2. 获取声音详情

```http
GET /apiv2/sounds/{sound_id}/
```

**示例：**

```bash
curl -H "Authorization: Token YOUR_API_KEY" \
  "https://freesound.org/apiv2/sounds/12345/?fields=id,name,tags,duration,license,previews,download"
```

#### 3. 获取音频分析数据

```http
GET /apiv2/sounds/{sound_id}/analysis/
```

返回音频的低级特征（频谱质心、过零率、RMS 等）和高级特征。

**示例响应：**

```json
{
  "lowlevel": {
    "average_loudness": 0.85,
    "dissonance": {
      "mean": 0.45
    },
    "dynamic_complexity": 8.2,
    "spectral_centroid": {
      "mean": 2450.5
    }
  },
  "rhythm": {
    "bpm": 128.5
  },
  "tonal": {
    "chords_key": "A",
    "chords_scale": "minor"
  }
}
```

#### 4. 获取相似声音

```http
GET /apiv2/sounds/{sound_id}/similar/
```

基于音频内容分析返回相似声音。

#### 5. 下载声音（需 OAuth2）

```http
GET /apiv2/sounds/{sound_id}/download/
```

### 可用字段列表

| 字段名 | 说明 |
|--------|------|
| `id` | 声音 ID |
| `name` | 名称 |
| `tags` | 标签数组 |
| `description` | 描述 |
| `license` | 许可证 URL |
| `duration` | 时长（秒）|
| `samplerate` | 采样率 |
| `bitrate` | 比特率 |
| `channels` | 声道数 |
| `type` | 文件格式 |
| `filesize` | 文件大小 |
| `username` | 上传者 |
| `previews` | 预览音频 URL |
| `download` | 下载 URL |
| `num_downloads` | 下载次数 |
| `avg_rating` | 平均评分 |
| `geotag` | 地理位置 |

### 过滤条件语法

```
# 时长范围
filter=duration:[0 TO 2]

# 文件类型
filter=type:wav OR type:aiff

# 采样率
filter=samplerate:44100

# 组合条件
filter=duration:[0 TO 1] type:wav tags:drum

# 日期范围
filter=created:[2024-01-01T00:00:00Z TO NOW]

# 地理位置（距离某点 10km 内）
filter={!geofilt sfield=geotag pt=35.6762,139.6503 d=10}
```

### JavaScript/TypeScript 示例

```typescript
const FREESOUND_API_KEY = 'your-api-key';
const BASE_URL = 'https://freesound.org/apiv2';

interface FreesoundSearchResult {
  count: number;
  next: string | null;
  previous: string | null;
  results: FreesoundSound[];
}

interface FreesoundSound {
  id: number;
  name: string;
  tags: string[];
  license: string;
  duration: number;
  previews: {
    'preview-lq-mp3': string;
    'preview-hq-mp3': string;
  };
}

class FreesoundClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(
    query: string,
    options: {
      filter?: string;
      sort?: string;
      fields?: string;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<FreesoundSearchResult> {
    const params = new URLSearchParams();
    params.append('query', query);
    if (options.filter) params.append('filter', options.filter);
    if (options.sort) params.append('sort', options.sort);
    params.append('fields', options.fields || 'id,name,tags,duration,license,previews');
    params.append('page', String(options.page || 1));
    params.append('page_size', String(options.pageSize || 15));

    const response = await fetch(`${BASE_URL}/search/?${params}`, {
      headers: {
        'Authorization': `Token ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Freesound API error: ${response.status}`);
    }

    return response.json();
  }

  async getSound(soundId: number): Promise<FreesoundSound> {
    const response = await fetch(`${BASE_URL}/sounds/${soundId}/`, {
      headers: {
        'Authorization': `Token ${this.apiKey}`
      }
    });
    return response.json();
  }

  async getAnalysis(soundId: number): Promise<any> {
    const response = await fetch(`${BASE_URL}/sounds/${soundId}/analysis/`, {
      headers: {
        'Authorization': `Token ${this.apiKey}`
      }
    });
    return response.json();
  }

  async findSimilar(soundId: number, pageSize: number = 10): Promise<FreesoundSearchResult> {
    return this.search('', {
      fields: 'id,name,duration,previews',
      pageSize,
    });
  }
}

// 使用示例
const client = new FreesoundClient('your-api-key');

// 搜索鼓声
const results = await client.search('kick drum', {
  filter: 'duration:[0 TO 1] type:wav',
  sort: 'downloads_desc',
  pageSize: 10
});

console.log(`找到 ${results.count} 个结果`);
for (const sound of results.results) {
  console.log(`- ${sound.name} (${sound.duration}s)`);
  console.log(`  预览: ${sound.previews['preview-lq-mp3']}`);
}
```

### Python 示例

```python
import requests

API_KEY = 'your-api-key'
BASE_URL = 'https://freesound.org/apiv2'

def search_sounds(query, **kwargs):
    params = {
        'query': query,
        'fields': 'id,name,duration,previews',
        **kwargs
    }
    response = requests.get(
        f'{BASE_URL}/search/',
        params=params,
        headers={'Authorization': f'Token {API_KEY}'}
    )
    response.raise_for_status()
    return response.json()

# 搜索并过滤
results = search_sounds(
    'snare drum',
    filter='duration:[0 TO 2] type:wav',
    sort='downloads_desc',
    page_size=5
)

for sound in results['results']:
    print(f"{sound['name']}: {sound['previews']['preview-lq-mp3']}")
```

---

## Lotsofsounds API

### 概述

Lotsofsounds 是专为开发者和 AI 代理设计的音效 API，所有声音均为 CC0（公共领域）或免版税授权。提供自然语言搜索、标签筛选和直接下载链接。

- **基础 URL**: `https://api.lotsofsounds.com/api/v1`
- **文档**: 提供 `llms.txt` 和 `openapi.yaml`
- **特色**: 无需注册即可试用 `/sample` 端点

### 认证

| 端点 | 认证要求 |
|------|----------|
| `GET /sounds/sample` | **无需认证** |
| 其他端点 | 需 Pro 订阅 ($15/月起) 获取 API Key |

### 核心接口

#### 1. 获取免费样本（无需认证）

```http
GET /sounds/sample
```

**示例请求：**

```bash
curl "https://api.lotsofsounds.com/api/v1/sounds/sample"
```

**响应格式：**

```json
{
  "data": [
    {
      "id": "fs-104183",
      "name": "Punch Impact",
      "description": "Single heavy punch impact sound effect",
      "tags": ["boom", "jab", "punch", "strong"],
      "duration": 1.18823,
      "stream_url": "/api/v1/sounds/sample/fs-104183/stream"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 12,
    "total": 12,
    "totalPages": 1
  },
  "meta": {
    "message": "These are sample sounds. Sign up for full catalog access.",
    "upgrade_url": "https://www.lotsofsounds.com/pricing"
  }
}
```

#### 2. 流式播放样本

```http
GET /sounds/sample/{id}/stream
```

返回音频流，可直接用于 `<audio>` 标签或 Web Audio API。

### JavaScript/TypeScript 示例

```typescript
const LOTSOFSOUNDS_BASE = 'https://api.lotsofsounds.com/api/v1';

interface LotsofsoundsSample {
  id: string;
  name: string;
  description: string;
  tags: string[];
  duration: number;
  stream_url: string;
}

interface LotsofsoundsResponse {
  data: LotsofsoundsSample[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class LotsofsoundsClient {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  // 获取免费样本（无需 API Key）
  async getFreeSamples(): Promise<LotsofsoundsResponse> {
    const response = await fetch(`${LOTSOFSOUNDS_BASE}/sounds/sample`);
    if (!response.ok) {
      throw new Error(`Lotsofsounds API error: ${response.status}`);
    }
    return response.json();
  }

  // 获取流式音频 URL
  getStreamUrl(sampleId: string): string {
    return `${LOTSOFSOUNDS_BASE}/sounds/sample/${sampleId}/stream`;
  }

  // 播放样本（使用 HTML5 Audio）
  playSample(sampleId: string): HTMLAudioElement {
    const audio = new Audio(this.getStreamUrl(sampleId));
    audio.play();
    return audio;
  }

  // 获取特定标签的样本（Pro 功能）
  async searchByTag(tag: string): Promise<LotsofsoundsResponse> {
    if (!this.apiKey) {
      throw new Error('API Key required for search');
    }
    const response = await fetch(
      `${LOTSOFSOUNDS_BASE}/sounds?tag=${encodeURIComponent(tag)}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      }
    );
    return response.json();
  }
}

// 使用示例（完全免费，无需注册）
const client = new LotsofsoundsClient();

async function demo() {
  const samples = await client.getFreeSamples();
  console.log(`获取到 ${samples.data.length} 个免费样本`);

  for (const sample of samples.data) {
    console.log(`- ${sample.name} (${sample.duration.toFixed(2)}s)`);
    console.log(`  标签: ${sample.tags.join(', ')}`);
    console.log(`  播放: ${client.getStreamUrl(sample.id)}`);
  }

  // 播放第一个样本
  if (samples.data.length > 0) {
    client.playSample(samples.data[0].id);
  }
}

demo();
```

---

## SND.dev / snd-lib

### 概述

SND 是由日本电通（Dentsu）开发的免费 UI 音效库，专注于交互设计中的声音体验。提供 3 套不同风格的音效包，所有音效均可免费商用。

- **官网**: https://snd.dev/
- **GitHub**: https://github.com/snd-lib/snd-lib
- **授权**: 免费商用，无需署名

### 三套音效包

| 套件 | 风格 | 作者 |
|------|------|------|
| **SND01 "sine"** | 正弦波基础音效，简洁轻量 | 土屋泰洋 |
| **SND02 "piano"** | 斯坦威钢琴演奏，丰富优雅 | 谷口彩子 |
| **SND03 "industrial"** | 工厂机械声再编辑，工业质感 | INDUSTRIAL JP |

### 音效类型

| 音效键 | 触发场景 | 事件 |
|--------|----------|------|
| `tap` | 点击/触摸反馈 | mousedown, touchstart |
| `button` | 按钮按下确认 | click |
| `disabled` | 禁用按钮点击 | click |
| `toggle_on` / `toggle_off` | 开关切换 | change |
| `select` | 选择框/单选按钮 | change |
| `swipe` | 横向滑动/翻页 | swipe |
| `transition_up` / `transition_down` | 层级切换（模态框） | click |
| `type` | 键盘输入 | keydown |
| `notification` | 通知提醒 | - |
| `caution` | 警告提示 | - |
| `celebration` | 庆祝/完成 | - |
| `progress_loop` | 加载/处理中（循环） | - |
| `ringtone_loop` | 铃声/闹钟（循环） | - |

### 使用方式

#### 方式一：HTML 自动绑定（最简单）

```html
<!DOCTYPE html>
<html>
<head>
  <!-- 加载 snd-lib，kit=01 指定音效包 -->
  <script src="https://cdn.jsdelivr.net/gh/snd-lib/snd-lib@v1.2.4/dist/browser/snd.js?kit=01"></script>
</head>
<body>
  <!-- 点击播放 button 音效 -->
  <button class="snd__button">提交</button>

  <!-- 点击播放 celebration 音效 -->
  <button class="snd__celebration">完成任务</button>

  <!-- 输入时播放 type 音效 -->
  <input type="text" class="snd__type" placeholder="输入文字..." />

  <!-- 切换时播放 toggle 音效 -->
  <input type="checkbox" class="snd__toggle" />

  <!-- 点击播放 caution 音效 -->
  <button class="snd__caution">删除</button>
</body>
</html>
```

**支持的 CSS 类：**

| 类名 | 兼容元素 | 触发事件 |
|------|----------|----------|
| `snd__button` | 任意 | click |
| `snd__tap` | 任意 | mousedown, touchstart |
| `snd__disabled` | 任意 | click |
| `snd__select` | select, input[type="radio"] | change |
| `snd__toggle` | input[type="checkbox"] | change |
| `snd__type` | textarea, input[type="text", "email", "number", "password", "search", "tel", "url"] | keydown |
| `snd__notification` | 任意 | click |
| `snd__caution` | 任意 | click |
| `snd__celebration` | 任意 | click |
| `snd__transition_up` | 任意 | click |
| `snd__transition_down` | 任意 | click |

#### 方式二：JavaScript 编程控制

```bash
# 安装
npm install snd-lib
```

```typescript
import Snd from 'snd-lib';

// 创建实例
const snd = new Snd({
  easySetup: true,        // 自动绑定 CSS 类
  muteOnWindowBlur: true, // 窗口失焦时静音
  preloadSoundKit: null,  // 手动控制加载
});

// 加载音效包
await snd.load(Snd.KITS.SND01);  // 正弦波
// await snd.load(Snd.KITS.SND02);  // 钢琴
// await snd.load(Snd.KITS.SND03);  // 工业

// 播放音效
snd.play(Snd.SOUNDS.TAP);
snd.play(Snd.SOUNDS.BUTTON);
snd.play(Snd.SOUNDS.CELEBRATION);

// 带选项播放
snd.play(Snd.SOUNDS.NOTIFICATION, {
  volume: 0.8,
  delay: 0.1,
  callback: (id) => console.log('播放完成', id)
});

// 循环播放
snd.play(Snd.SOUNDS.PROGRESS_LOOP, { loop: true });

// 停止特定音效
snd.stop(Snd.SOUNDS.PROGRESS_LOOP);

// 静音/取消静音
snd.mute();
snd.unmute();

// 切换音效包
await snd.load(Snd.KITS.SND02);

// 监听音效包切换事件
snd.on(Snd.CHANGE_SOUND_KIT, (kit) => {
  console.log('切换到音效包:', kit);
});
```

#### 方式三：React 组件集成

```tsx
import { useEffect, useRef } from 'react';
import Snd from 'snd-lib';

export function useSnd(kit: string = Snd.KITS.SND01) {
  const sndRef = useRef<Snd | null>(null);

  useEffect(() => {
    const snd = new Snd({
      easySetup: false,  // 手动控制
      preloadSoundKit: null,
    });
    sndRef.current = snd;

    snd.load(kit).then(() => {
      console.log('音效包加载完成');
    });

    return () => {
      // 清理
    };
  }, [kit]);

  const play = (sound: string) => {
    sndRef.current?.play(sound);
  };

  return { play, snd: sndRef.current };
}

// 使用
function App() {
  const { play } = useSnd(Snd.KITS.SND01);

  return (
    <button onClick={() => play(Snd.SOUNDS.BUTTON)}>
      点击我
    </button>
  );
}
```

### API 参考

#### Snd 类构造函数选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `easySetup` | boolean | true | 自动绑定 CSS 类 |
| `muteOnWindowBlur` | boolean | true | 窗口失焦时静音 |
| `preloadSoundKit` | string \| null | null | 预加载的音效包 |

#### PlayOptions

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `index` | number \| null | null | 播放编号（随机变体）|
| `loop` | boolean | false | 是否循环 |
| `volume` | number | 1 | 音量 0-1 |
| `delay` | number | 0 | 延迟（秒）|
| `duration` | number | -1 | 播放时长，-1 为完整时长 |
| `callback` | function | () => {} | 播放完成回调 |

#### 静态属性

```typescript
Snd.SOUNDS = {
  BUTTON: 'button',
  TAP: 'tap',
  DISABLED: 'disabled',
  TOGGLE_ON: 'toggle_on',
  TOGGLE_OFF: 'toggle_off',
  SELECT: 'select',
  SWIPE: 'swipe',
  TRANSITION_UP: 'transition_up',
  TRANSITION_DOWN: 'transition_down',
  TYPE: 'type',
  NOTIFICATION: 'notification',
  CAUTION: 'caution',
  CELEBRATION: 'celebration',
  PROGRESS_LOOP: 'progress_loop',
  RINGTONE_LOOP: 'ringtone_loop',
};

Snd.KITS = {
  SND01: '01',  // sine
  SND02: '02',  // piano
  SND03: '03',  // industrial
};
```

---

## RapidAPI Stock SFX

### 概述

VidLab 提供的音效和音乐 API，通过 RapidAPI 平台访问。支持按节奏、情绪、强度、时长等参数筛选。

- **平台**: https://rapidapi.com/ptwebsolution/api/stock-sfx-and-music
- **认证**: RapidAPI Key
- **免费套餐**: BASIC ($0/月)，有调用限制

### 认证

```
X-RapidAPI-Key: YOUR_RAPIDAPI_KEY
X-RapidAPI-Host: stock-sfx-and-music.p.rapidapi.com
```

### 核心接口

#### 1. 搜索音效

```http
GET /sfx/search
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `q` | string | 搜索关键词 |
| `mood` | string | 情绪: happy, sad, tense, calm 等 |
| `tempo` | string | 节奏: slow, medium, fast |
| `duration` | number | 最大时长（秒）|
| `page` | number | 页码 |

**示例请求：**

```bash
curl --request GET \
  --url 'https://stock-sfx-and-music.p.rapidapi.com/sfx/search?q=explosion&mood=tense' \
  --header 'X-RapidAPI-Key: YOUR_KEY' \
  --header 'X-RapidAPI-Host: stock-sfx-and-music.p.rapidapi.com'
```

#### 2. 搜索音乐

```http
GET /music/search
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `q` | string | 搜索关键词 |
| `genre` | string | 流派 |
| `mood` | string | 情绪 |
| `bpm` | number | BPM 范围 |

#### 3. 获取音效详情

```http
GET /sfx/{id}
```

#### 4. 下载音效

```http
GET /sfx/{id}/download
```

### JavaScript 示例

```typescript
const RAPIDAPI_KEY = 'your-rapidapi-key';
const BASE_URL = 'https://stock-sfx-and-music.p.rapidapi.com';

class StockSfxClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request(endpoint: string, params?: Record<string, string>): Promise<any> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': 'stock-sfx-and-music.p.rapidapi.com',
      }
    });

    if (!response.ok) {
      throw new Error(`Stock SFX API error: ${response.status}`);
    }

    return response.json();
  }

  async searchSfx(query: string, options: {
    mood?: string;
    tempo?: string;
    duration?: number;
    page?: number;
  } = {}): Promise<any> {
    const params: Record<string, string> = { q: query };
    if (options.mood) params.mood = options.mood;
    if (options.tempo) params.tempo = options.tempo;
    if (options.duration) params.duration = String(options.duration);
    if (options.page) params.page = String(options.page);

    return this.request('/sfx/search', params);
  }

  async searchMusic(query: string, options: {
    genre?: string;
    mood?: string;
    bpm?: number;
  } = {}): Promise<any> {
    const params: Record<string, string> = { q: query };
    if (options.genre) params.genre = options.genre;
    if (options.mood) params.mood = options.mood;
    if (options.bpm) params.bpm = String(options.bpm);

    return this.request('/music/search', params);
  }

  async getSfx(id: string): Promise<any> {
    return this.request(`/sfx/${id}`);
  }

  async downloadSfx(id: string): Promise<any> {
    return this.request(`/sfx/${id}/download`);
  }
}

// 使用示例
const client = new StockSfxClient('your-rapidapi-key');

const results = await client.searchSfx('explosion', {
  mood: 'tense',
  duration: 5
});
```

---

## 综合使用示例

### 场景：构建一个音效浏览器应用

```typescript
// 统一音频客户端
class AudioAPIClient {
  private freesoundKey?: string;
  private rapidApiKey?: string;

  constructor(options: {
    freesoundKey?: string;
    rapidApiKey?: string;
  } = {}) {
    this.freesoundKey = options.freesoundKey;
    this.rapidApiKey = options.rapidApiKey;
  }

  // 搜索音效（聚合多个源）
  async search(query: string): Promise<UnifiedSound[]> {
    const results: UnifiedSound[] = [];

    // 1. Freesound 搜索
    if (this.freesoundKey) {
      try {
        const fsResults = await this.searchFreesound(query);
        results.push(...fsResults);
      } catch (e) {
        console.warn('Freesound search failed:', e);
      }
    }

    // 2. Lotsofsounds 免费样本
    try {
      const lsResults = await this.searchLotsofsounds(query);
      results.push(...lsResults);
    } catch (e) {
      console.warn('Lotsofsounds search failed:', e);
    }

    // 3. RapidAPI Stock SFX
    if (this.rapidApiKey) {
      try {
        const rsResults = await this.searchRapidSfx(query);
        results.push(...rsResults);
      } catch (e) {
        console.warn('RapidAPI search failed:', e);
      }
    }

    return results;
  }

  private async searchFreesound(query: string): Promise<UnifiedSound[]> {
    const response = await fetch(
      `https://freesound.org/apiv2/search/?query=${encodeURIComponent(query)}&fields=id,name,duration,previews,tags,license&page_size=10`,
      {
        headers: { 'Authorization': `Token ${this.freesoundKey}` }
      }
    );
    const data = await response.json();

    return data.results.map((s: any) => ({
      id: `fs-${s.id}`,
      name: s.name,
      source: 'freesound',
      duration: s.duration,
      previewUrl: s.previews?.['preview-lq-mp3'],
      tags: s.tags,
      license: s.license,
    }));
  }

  private async searchLotsofsounds(_query: string): Promise<UnifiedSound[]> {
    const response = await fetch('https://api.lotsofsounds.com/api/v1/sounds/sample');
    const data = await response.json();

    return data.data.map((s: any) => ({
      id: s.id,
      name: s.name,
      source: 'lotsofsounds',
      duration: s.duration,
      previewUrl: `https://api.lotsofsounds.com${s.stream_url}`,
      tags: s.tags,
      license: 'CC0',
    }));
  }

  private async searchRapidSfx(query: string): Promise<UnifiedSound[]> {
    const response = await fetch(
      `https://stock-sfx-and-music.p.rapidapi.com/sfx/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'X-RapidAPI-Key': this.rapidApiKey!,
          'X-RapidAPI-Host': 'stock-sfx-and-music.p.rapidapi.com',
        }
      }
    );
    const data = await response.json();

    return (data.results || []).map((s: any) => ({
      id: `rs-${s.id}`,
      name: s.title,
      source: 'rapidapi',
      duration: s.duration,
      previewUrl: s.preview_url,
      tags: s.tags || [],
      license: 'royalty-free',
    }));
  }
}

interface UnifiedSound {
  id: string;
  name: string;
  source: string;
  duration: number;
  previewUrl: string;
  tags: string[];
  license: string;
}

// 使用
const client = new AudioAPIClient({
  freesoundKey: 'your-freesound-key',
  rapidApiKey: 'your-rapidapi-key'
});

const sounds = await client.search('kick drum');
console.log(`找到 ${sounds.length} 个音效`);
```

---

## 免费素材下载资源

以下网站提供大量免费音频素材下载，适合不需要编程接口、直接获取音频文件的场景。

### BBC Sound Effects

- **官网**: https://sound-effects.bbcrewind.co.uk/
- **类型**: 英国广播公司官方音效库
- **内容**: 超过 **33,000+** 个专业音效，涵盖自然、交通、机械、日常、军事、动物、时钟、运动、脚步、航空、电子、人群等 16 大分类
- **授权**: CC0（完全免版权，可商用）
- **特色**: 大量珍贵历史录音，具有年代质感的经典音效
- **注意**: 无公开 API，需通过网站手动搜索下载
- **使用方式**: 网站搜索 → 预览 → 下载 WAV 文件

**分类概览：**

| 分类 | 数量 | 典型内容 |
|------|------|----------|
| Nature | 17,630 | 鸟鸣、风声、雨声、流水 |
| Transport | 3,930 | 汽车引擎、火车、船只 |
| Machines | 2,963 | 工厂、打印机、机械运转 |
| Daily Life | 2,094 | 门铃、厨房、街道 |
| Military | 1,097 | 枪声、爆炸、军号 |
| Animals | 984 | 狗叫、猫叫、昆虫 |
| Electronics | 590 | 电话铃声、电脑蜂鸣 |
| Aircraft | 601 | 飞机引擎、直升机 |

### Mixkit

- **官网**: https://mixkit.co/free-sound-effects/
- **类型**: 免费音效 + 音乐 + 视频素材
- **内容**: 高质量音效和音乐，由 Envato 团队开发维护
- **授权**: Mixkit License（免费商用，无需署名）
- **特色**: 界面简洁，资源质量高，一站式素材平台
- **注意**: 无公开 API，通过网站直接下载
- **使用方式**: 浏览分类 → 试听 → 免费下载

### Zapsplat

- **官网**: https://www.zapsplat.com/
- **类型**: 专业音效库
- **内容**: 海量高质量音效，覆盖影视、游戏、UI 等场景
- **授权**: 免费版需署名（Gold 会员免署名）
- **特色**: 免费注册即可下载，音效质量高，分类详细
- **注意**: 无公开 API，需注册账号后下载
- **使用方式**: 注册 → 搜索 → 下载（免费版需标注来源）

### OpenGameArt

- **官网**: https://opengameart.org/
- **类型**: 开源游戏素材平台
- **内容**: 游戏音效、音乐、美术素材，遵循 GPL/CC 协议
- **授权**: GPL/CC 授权，可免费商用
- **特色**: 专注游戏开发，音效分类涵盖角色、界面、环境、魔法、武器等
- **注意**: 无公开 API，通过网站下载
- **使用方式**: 浏览分类 → 下载素材包

### 其他免费资源

| 网站 | 内容 | 授权 | 链接 |
|------|------|------|------|
| **99Sounds** | 免费音效采样包 | 免版税 | https://99sounds.org/ |
| **FreeSFX** | 老牌免费音效，含史诗/悬疑等电影风格 | 各异 | https://www.freesfx.co.uk/ |
| **SampleSwap** | 免费音频采样 | CC 授权 | https://www.sampleswap.org/ |
| **Looperman** | 免费循环和采样 | 免费使用 | https://www.looperman.com/ |
| **SoundBible** | 免费音效，适合短视频 | 免费使用 | https://soundbible.com/ |
| **Partners In Rhyme** | 游戏开发音效 | 免费使用 | https://www.partnersinrhyme.com/ |
| **Foil Imprints** | IDM/电子鼓循环采样包 | 免费下载 | 定期发布 |
| **PlayOnLoop** | 免费背景音乐循环 | CC BY 4.0 | https://www.playonloop.com/ |
| **Sampld** | 海量免版税音乐与音效 | 免版税商用 | https://sampld.app/ |

### 资源选择建议

| 需求 | 推荐资源 | 原因 |
|------|----------|------|
| **高质量通用音效** | BBC Sound Effects | 33,000+ CC0 音效，专业品质 |
| **影视/视频音效** | Mixkit + Zapsplat | 分类清晰，质量高 |
| **游戏音效** | OpenGameArt + Partners In Rhyme | 专为游戏设计 |
| **UI 交互音效** | SND.dev（见上文） | npm 集成，编程友好 |
| **鼓循环/采样包** | Foil Imprints + Looperman | 电子音乐专用 |
| **一站式免费素材** | Pixabay（API） | 图片+视频+音效+音乐 |

---

## 常见问题

### Q1: Freesound 的 Creative Commons 授权有什么区别？

| 许可证 | 要求 |
|--------|------|
| CC0 | 无限制，可任意使用 |
| CC BY | 需署名原作者 |
| CC BY-NC | 需署名，非商业使用 |
| Sampling+ | 可重混，需署名 |

**建议**：始终检查每个声音的 `license` 字段，确保合规使用。

### Q2: 如何避免触发速率限制？

```typescript
// 使用请求队列和缓存
class RateLimitedClient {
  private queue: (() => Promise<any>)[] = [];
  private lastRequestTime = 0;
  private minInterval = 1000; // 1 秒间隔

  async enqueue<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.queue.length === 0) return;

    const now = Date.now();
    const waitTime = Math.max(0, this.minInterval - (now - this.lastRequestTime));

    await new Promise(r => setTimeout(r, waitTime));

    const request = this.queue.shift();
    if (request) {
      this.lastRequestTime = Date.now();
      await request();
    }

    if (this.queue.length > 0) {
      this.processQueue();
    }
  }
}
```

### Q3: SND.dev 的音频文件可以直接下载使用吗？

可以。SND 提供：
1. **npm 包**：`npm install snd-lib`（包含音频文件）
2. **官网下载**：https://snd.dev/ 直接下载音效包
3. **GitHub**：源码仓库包含所有音频资源

所有音频均为免费商用授权。

### Q4: 如何在 Electron 应用中使用这些 API？

```typescript
// Electron 主进程下载，渲染进程播放
// main.ts
ipcMain.handle('download-audio', async (_event, url: string) => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const tempPath = path.join(app.getPath('temp'), `audio-${Date.now()}.mp3`);
  fs.writeFileSync(tempPath, Buffer.from(buffer));
  return tempPath;
});

// renderer.ts
const tempPath = await ipcRenderer.invoke('download-audio', previewUrl);
const audio = new Audio(`file://${tempPath}`);
audio.play();
```

### Q5: 哪个 API 最适合我的场景？

| 场景 | 推荐 API | 原因 |
|------|----------|------|
| **AI 生成鼓循环** | Drumloop AI | 专注鼓节奏，每天免费 3 次 |
| **AI 生成完整音乐** | Mubert | 文本/图像生成，150+ 风格 |
| **实时流式背景音乐** | Mubert | WebRTC 流式， sub-second 延迟 |
| **需要海量多样化素材** | Freesound | 50万+ 音频，内容分析 |
| **快速原型开发，零配置** | Lotsofsounds `/sample` | 无需注册，一行代码 |
| **UI/UX 交互音效** | SND.dev | CSS 类自动绑定，3 行代码 |
| **商业项目，需明确授权** | Lotsofsounds (CC0) / SND.dev | 公共领域或免费商用 |
| **高质量音乐曲目** | RapidAPI Stock SFX | 参数筛选，专业素材 |
| **音频分析/相似度搜索** | Freesound | 频谱特征、AI 相似度 |
| **仅需下载免费采样包** | Foil Imprints / Sampld | 直接下载，无需 API |

### Q6: Drumloop AI 和 Mubert 有什么区别？

| 对比项 | Drumloop AI | Mubert |
|--------|-------------|--------|
| **专注领域** | 仅鼓循环 | 完整音乐（含鼓） |
| **生成方式** | 网页界面操作 | 完整 REST API |
| **免费额度** | 每天 3 次 | Trial $49/月起 |
| **输出格式** | WAV / MIDI | MP3 / WAV |
| **集成难度** | 手动下载后使用 | API 直接集成 |
| **适用场景** | 制作人快速获取灵感 | App/游戏/平台内置音乐 |

**建议**：
- 如果你是音乐制作人，需要鼓循环素材 → **Drumloop AI**
- 如果你是开发者，需要为产品集成音乐生成 → **Mubert API**

### Q7: Mubert 的 Trial 计划值得尝试吗？

Mubert Trial ($49/月) 包含：
- 100 次音轨生成
- 100 分钟流式播放
- 文本转音乐、图像转音乐
- 高质量输出
- 商用授权

**适合**：
- 产品原型验证
- 小规模应用
- 需要测试 API 集成

**注意**：Trial 计划不可退款，建议先通过官网的免费演示体验效果。

### Q8: 如何获取免费的鼓循环采样包？

不需要 API 的免费获取途径：

1. **Foil Imprints** — 关注其免费采样包发布
2. **Sampld** — 网站直接下载海量免费素材
3. **99Sounds** — 专业免费音效采样包
4. **Bedroom Producers Blog** — 定期更新免费采样包合集
5. **Looperman** — 社区上传的免费循环

这些资源适合一次性获取素材，不需要编程集成。

---

## Electron 应用集成实战指南

> 本章节指导如何将上述 API 集成到 Electron 桌面应用中，实现用户直接试听和下载外部采样的功能。

### 集成可行性总览

| API | 试听 | 下载 | 认证要求 | 集成难度 | 推荐度 |
|-----|------|------|----------|----------|--------|
| **Freesound** | ✅ 预览URL直链 | ⚠️ 需OAuth2 | API Key | 中 | ⭐⭐⭐⭐ |
| **Lotsofsounds** | ✅ `/sample` 免认证 | ✅ 流URL直链 | 无需 | 低 | ⭐⭐⭐⭐⭐ |
| **SND.dev** | ✅ CDN直链 | ✅ npm含音频 | 无需 | 低 | ⭐⭐⭐⭐ |
| **Drumloop AI** | ❌ 无API | ❌ 网页操作 | N/A | 无法集成 | ⭐ |
| **Mubert** | ✅ 流式链接 | ✅ 生成后下载 | 付费$49/月起 | 高 | ⭐⭐⭐ |
| **RapidAPI** | ✅ 预览URL | ⚠️ 需订阅 | RapidAPI Key | 中 | ⭐⭐⭐ |

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    渲染进程 (Renderer)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  搜索界面    │  │  试听播放器  │  │   下载管理器         │  │
│  │  React UI   │  │  Howler.js  │  │   进度/队列          │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         └────────────────┼────────────────────┘             │
│                          │ IPC 通信 (Preload)               │
├──────────────────────────┼─────────────────────────────────┤
│                    主进程 (Main)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ API 代理服务 │  │ 文件下载器   │  │   数据库记录         │  │
│  │ (绕过CORS)  │  │  (流式保存)  │  │   采样元数据         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                             │
│  本地存储: ~/Music/SamplerHub/Downloads/                     │
└─────────────────────────────────────────────────────────────┘
```

### 第一步：主进程音频服务

创建 `electron/main/services/externalAudioAPI.ts`：

```typescript
import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';

// ===== 类型定义 =====
export interface ExternalSample {
  id: string;
  name: string;
  source: 'freesound' | 'lotsofsounds' | 'snd';
  duration: number;
  previewUrl: string;
  downloadUrl?: string;
  tags: string[];
  license: string;
}

export interface SearchOptions {
  query: string;
  durationMin?: number;
  durationMax?: number;
}

// ===== Freesound 客户端 =====
class FreesoundClient {
  constructor(private apiKey: string) {}

  async search(options: SearchOptions): Promise<ExternalSample[]> {
    const params = new URLSearchParams({
      query: options.query,
      fields: 'id,name,duration,previews,tags,license',
      page_size: '15',
    });

    if (options.durationMin || options.durationMax) {
      const min = options.durationMin ?? '*';
      const max = options.durationMax ?? '*';
      params.append('filter', `duration:[${min} TO ${max}]`);
    }

    const response = await fetch(`https://freesound.org/apiv2/search/?${params}`, {
      headers: { 'Authorization': `Token ${this.apiKey}` }
    });

    if (!response.ok) throw new Error(`Freesound: ${response.status}`);
    const data = await response.json();

    return data.results.map((s: any) => ({
      id: `fs-${s.id}`,
      name: s.name,
      source: 'freesound' as const,
      duration: s.duration,
      previewUrl: s.previews?.['preview-lq-mp3'],
      tags: s.tags || [],
      license: s.license,
    }));
  }
}

// ===== Lotsofsounds 客户端 =====
class LotsofsoundsClient {
  async getFreeSamples(): Promise<ExternalSample[]> {
    const response = await fetch('https://api.lotsofsounds.com/api/v1/sounds/sample');
    if (!response.ok) throw new Error(`Lotsofsounds: ${response.status}`);
    const data = await response.json();

    return data.data.map((s: any) => ({
      id: s.id,
      name: s.name,
      source: 'lotsofsounds' as const,
      duration: s.duration,
      previewUrl: `https://api.lotsofsounds.com${s.stream_url}`,
      downloadUrl: `https://api.lotsofsounds.com${s.stream_url}`,
      tags: s.tags || [],
      license: 'CC0',
    }));
  }
}

// ===== 统一服务 =====
export class ExternalAudioService {
  private freesound?: FreesoundClient;
  private lotsofsounds = new LotsofsoundsClient();

  constructor(config: { freesoundKey?: string }) {
    if (config.freesoundKey) {
      this.freesound = new FreesoundClient(config.freesoundKey);
    }
  }

  async searchAll(options: SearchOptions): Promise<ExternalSample[]> {
    const results: ExternalSample[] = [];
    const errors: string[] = [];

    await Promise.all([
      this.freesound?.search(options)
        .then(r => results.push(...r))
        .catch(e => errors.push(e.message)),
      this.lotsofsounds.getFreeSamples()
        .then(r => results.push(...r))
        .catch(e => errors.push(e.message)),
    ]);

    if (errors.length > 0) console.warn('搜索失败:', errors);
    return results;
  }

  async downloadAudio(url: string, filename: string, downloadDir: string): Promise<string> {
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
    const filePath = path.join(downloadDir, filename);

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);
      const protocol = url.startsWith('https:') ? https : http;

      protocol.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(filePath); });
      }).on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    });
  }
}

// ===== 注册 IPC =====
export function registerExternalAudioIPC(service: ExternalAudioService) {
  ipcMain.handle('external-audio:search', async (_event, options: SearchOptions) => {
    return service.searchAll(options);
  });

  ipcMain.handle('external-audio:download', async (_event, params: {
    url: string; filename: string; downloadDir: string;
  }) => {
    return service.downloadAudio(params.url, params.filename, params.downloadDir);
  });
}
```

### 第二步：Preload 暴露 API

在 `electron/preload/index.ts` 中添加：

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ... 现有 API ...

  externalAudio: {
    search: (options: any) => ipcRenderer.invoke('external-audio:search', options),
    download: (params: any) => ipcRenderer.invoke('external-audio:download', params),
  },
});
```

### 第三步：主进程初始化

在 `electron/main/index.ts` 中注册服务：

```typescript
import { ExternalAudioService, registerExternalAudioIPC } from './services/externalAudioAPI';

// 创建窗口前初始化服务
const externalAudioService = new ExternalAudioService({
  freesoundKey: process.env.FREESOUND_API_KEY, // 从环境变量或配置读取
});

registerExternalAudioIPC(externalAudioService);
```

### 第四步：渲染进程 React Hooks

创建 `src/hooks/useExternalSamples.ts`：

```typescript
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface ExternalSample {
  id: string; name: string; source: string;
  duration: number; previewUrl: string; downloadUrl?: string;
  tags: string[]; license: string;
}

export function useExternalSamples() {
  const [query, setQuery] = useState('');

  const { data: samples, isLoading } = useQuery({
    queryKey: ['external-samples', query],
    queryFn: async () => {
      if (!query) return [];
      // @ts-ignore
      return window.electronAPI.externalAudio.search({ query });
    },
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const search = useCallback((q: string) => setQuery(q), []);
  return { samples: samples || [], isLoading, search };
}

export function useExternalDownload() {
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

  const download = useCallback(async (sample: ExternalSample, dir: string) => {
    if (!sample.downloadUrl && !sample.previewUrl) return;
    setDownloading(p => new Set(p).add(sample.id));

    try {
      const url = sample.downloadUrl || sample.previewUrl;
      const filename = `${sample.source}_${sample.id}_${sample.name.replace(/[^a-z0-9]/gi, '_')}.mp3`;
      // @ts-ignore
      const path = await window.electronAPI.externalAudio.download({ url, filename, downloadDir: dir });
      return path;
    } finally {
      setDownloading(p => { const n = new Set(p); n.delete(sample.id); return n; });
    }
  }, []);

  return { download, downloading };
}
```

### 第五步：搜索界面组件

创建 `src/components/external/ExternalSampleSearch.tsx`：

```tsx
import React, { useState } from 'react';
import { Input, Button, Tag, Spin, List, Card } from 'antd';
import { SearchOutlined, PlayCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { useExternalSamples, useExternalDownload } from '../../hooks/useExternalSamples';

export const ExternalSampleSearch: React.FC = () => {
  const [input, setInput] = useState('');
  const { samples, isLoading, search } = useExternalSamples();
  const { download, downloading } = useExternalDownload();

  const handleSearch = () => search(input);

  const handleDownload = async (sample: any) => {
    const dir = '~/Music/SamplerHub/Downloads'; // 从配置读取
    await download(sample, dir);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          placeholder="搜索外部采样 (如: kick drum, snare)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 400 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          搜索
        </Button>
      </div>

      {isLoading && <Spin tip="搜索中..." />}

      <List
        grid={{ gutter: 16, column: 3 }}
        dataSource={samples}
        renderItem={sample => (
          <List.Item>
            <Card
              size="small"
              title={sample.name}
              extra={<Tag color="blue">{sample.source}</Tag>}
              actions={[
                <Button icon={<PlayCircleOutlined />} onClick={() => new Audio(sample.previewUrl).play()}>
                  试听
                </Button>,
                <Button
                  icon={<DownloadOutlined />}
                  loading={downloading.has(sample.id)}
                  onClick={() => handleDownload(sample)}
                >
                  下载
                </Button>,
              ]}
            >
              <div>时长: {sample.duration.toFixed(2)}s</div>
              <div>{sample.tags.slice(0, 5).map((t: string) => <Tag key={t} size="small">{t}</Tag>)}</div>
              <div style={{ fontSize: 12, color: '#888' }}>授权: {sample.license}</div>
            </Card>
          </List.Item>
        )}
      />
    </div>
  );
};
```

### 第六步：添加到应用路由

在 `src/App.tsx` 或 `LibraryPage.tsx` 中添加新页面：

```tsx
import { ExternalSampleSearch } from './components/external/ExternalSampleSearch';

// 在路由或Tab中添加
<Tabs.TabPane tab="外部采样" key="external">
  <ExternalSampleSearch />
</Tabs.TabPane>
```

### CORS 处理方案

Electron 渲染进程播放外部音频可能遇到 CORS，解决方案：

**方案1：主进程代理（推荐）**

```typescript
// 主进程中使用 net 模块绕过 CORS
import { net } from 'electron';

ipcMain.handle('fetch-audio-buffer', async (_event, url: string) => {
  const response = await net.fetch(url);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
});
```

**方案2：本地代理服务器**

```typescript
import { createServer } from 'http';

export function startProxyServer(port: number = 9999) {
  createServer(async (req, res) => {
    const targetUrl = req.headers['x-target-url'] as string;
    const response = await fetch(targetUrl);
    const buffer = await response.arrayBuffer();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(Buffer.from(buffer));
  }).listen(port);
}
```

### 配置管理

创建 `src/config/externalAPI.ts`：

```typescript
export interface ExternalAPIConfig {
  freesound?: { apiKey: string; enabled: boolean };
  lotsofsounds?: { enabled: boolean };
}

export const defaultConfig: ExternalAPIConfig = {
  freesound: { apiKey: '', enabled: false },
  lotsofsounds: { enabled: true }, // 免费端点默认启用
};
```

### 集成检查清单

| 步骤 | 操作 | 验证方式 |
|------|------|----------|
| 1 | 创建 `externalAudioAPI.ts` | 主进程无报错启动 |
| 2 | 注册 IPC 处理器 | 控制台输出注册成功 |
| 3 | 更新 Preload | 渲染进程 `window.electronAPI.externalAudio` 存在 |
| 4 | 创建 React Hooks | 调用 `search()` 返回数据 |
| 5 | 创建搜索组件 | 界面正常渲染 |
| 6 | 配置 Freesound Key | 搜索返回 Freesound 结果 |
| 7 | 测试试听 | 点击播放有声音 |
| 8 | 测试下载 | 文件保存到指定目录 |

### 关键注意事项

1. **Freesound 下载限制**：预览可直接播放，下载原始文件需 OAuth2。建议试听用预览流，下载引导用户授权
2. **Lotsofsounds 免费额度**：`/sample` 端点完全免费但仅返回 12 个样本，适合作为默认源
3. **版权合规**：每个采样显示许可证信息，CC 协议需署名
4. **缓存策略**：搜索结果缓存 5 分钟，避免重复请求
5. **错误处理**：部分 API 失败时不阻断其他源的结果展示

---

> **提示**：使用任何 API 前，请务必阅读其最新的服务条款和授权协议。本文档基于 2025 年 6 月的 API 状态编写，接口可能随时变更。
