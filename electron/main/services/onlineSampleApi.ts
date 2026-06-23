/**
 * 在线采样 API 代理服务
 * 在主进程中代理 HTTP 请求，避免渲染进程的 CORS 限制
 *
 * 支持的 API：
 * - Lotsofsounds: 免费，无需认证
 * - Freesound: 需要 API Key（用户自行提供）
 * - SND.dev: 免费，无需认证
 * - Pixabay: 通过网页爬取搜索音效（官方 API 不支持音效）
 */

import { net, protocol } from 'electron';

// ===== 类型定义 =====

export interface OnlineSample {
  id: string;
  name: string;
  tags: string[];
  duration: number;
  previewUrl: string;
  downloadUrl?: string;
  source: 'lotsofsounds' | 'freesound' | 'snddev' | 'pixabay';
  license?: string;
  description?: string;
  /** 额外元数据：上传者、播放次数等 */
  extras?: Record<string, string>;
}

export interface SearchResult {
  samples: OnlineSample[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ===== HTTP 请求工具 =====

async function fetchJSON(url: string, headers?: Record<string, string>): Promise<any> {
  const response = await net.fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function fetchBuffer(url: string, headers?: Record<string, string>): Promise<Buffer> {
  const response = await net.fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  const response = await net.fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}

// ===== 预览音频缓存 =====
// 缓存已下载的预览音频 Buffer，供 online-preview:// 协议使用
const previewCache = new Map<string, { buffer: Buffer; contentType: string; timestamp: number }>();
const PREVIEW_CACHE_TTL = 5 * 60 * 1000; // 5 分钟过期
const PREVIEW_CACHE_MAX = 50; // 最多缓存 50 个

function cleanPreviewCache() {
  const now = Date.now();
  for (const [key, val] of previewCache) {
    if (now - val.timestamp > PREVIEW_CACHE_TTL) {
      previewCache.delete(key);
    }
  }
  // 如果仍然超过上限，删除最旧的
  if (previewCache.size > PREVIEW_CACHE_MAX) {
    const entries = [...previewCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    while (entries.length > PREVIEW_CACHE_MAX) {
      const [key] = entries.shift()!;
      previewCache.delete(key);
    }
  }
}

/**
 * 预下载音频到缓存，返回可用于 online-preview:// 协议的 URL
 * URL 格式: online-preview:///<cacheKey>
 */
export async function cachePreviewAudio(url: string): Promise<string> {
  cleanPreviewCache();

  // 生成缓存 key（URL 的简单 hash）
  let cacheKey: string;
  try {
    // 使用 URL 的路径部分作为 key
    const u = new URL(url);
    cacheKey = u.hostname + u.pathname;
  } catch {
    cacheKey = url.replace(/[^a-zA-Z0-9]/g, '_');
  }

  // 如果已缓存且未过期，直接返回
  const cached = previewCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PREVIEW_CACHE_TTL) {
    return `online-preview:///${cacheKey}`;
  }

  // 下载音频（需要 Referer header，否则 Pixabay CDN 会拒绝）
  const audioHeaders: Record<string, string> = {
    'Referer': `${PIXABAY_BASE}/`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,*/*;q=0.8',
  };

  console.log('[cachePreviewAudio] Downloading:', url);
  const buffer = await fetchBuffer(url, audioHeaders);
  console.log('[cachePreviewAudio] Downloaded, size:', buffer.length, 'bytes');

  // 检测 content type
  let contentType = 'audio/mpeg';
  if (url.includes('.wav')) contentType = 'audio/wav';
  else if (url.includes('.ogg')) contentType = 'audio/ogg';
  else if (url.includes('.flac')) contentType = 'audio/flac';

  previewCache.set(cacheKey, { buffer, contentType, timestamp: Date.now() });
  return `online-preview:///${cacheKey}`;
}

/**
 * 从缓存获取预览音频 Buffer
 */
export function getCachedPreview(cacheKey: string): { buffer: Buffer; contentType: string } | null {
  const cached = previewCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > PREVIEW_CACHE_TTL) {
    previewCache.delete(cacheKey);
    return null;
  }
  return { buffer: cached.buffer, contentType: cached.contentType };
}

/**
 * 注册 online-preview:// 自定义协议
 * 在主进程 app.whenReady() 中调用
 */
export function registerOnlinePreviewProtocol() {
  protocol.handle('online-preview', (request) => {
    const rawUrl = request.url;
    const cacheKey = decodeURIComponent(rawUrl.slice('online-preview:///'.length));
    const cached = getCachedPreview(cacheKey);

    if (!cached) {
      return new Response('Not found', { status: 404 });
    }

    return new Response(new Uint8Array(cached.buffer), {
      headers: {
        'Content-Type': cached.contentType,
        'Content-Length': String(cached.buffer.length),
        'Cache-Control': 'public, max-age=300',
        'Accept-Ranges': 'bytes',
      },
    });
  });
}

// ===== Lotsofsounds API =====

const LOTSOFSOUNDS_BASE = 'https://api.lotsofsounds.com/api/v1';

export async function searchLotsofsounds(query: string, page: number = 1): Promise<SearchResult> {
  const params = new URLSearchParams();
  if (query) params.append('q', query);
  params.append('page', String(page));
  params.append('limit', '20');

  const url = `${LOTSOFSOUNDS_BASE}/sounds/sample?${params}`;
  const data = await fetchJSON(url);

  const samples: OnlineSample[] = (data.data || []).map((item: any) => ({
    id: `los-${item.id}`,
    name: item.name,
    tags: item.tags || [],
    duration: item.duration || 0,
    previewUrl: `${LOTSOFSOUNDS_BASE}${item.stream_url}`,
    downloadUrl: `${LOTSOFSOUNDS_BASE}${item.stream_url}`,
    source: 'lotsofsounds' as const,
    description: item.description,
  }));

  return {
    samples,
    total: data.pagination?.total || samples.length,
    page: data.pagination?.page || page,
    pageSize: data.pagination?.limit || 20,
    hasMore: page < (data.pagination?.totalPages || 1),
  };
}

// ===== Freesound API =====

const FREESOUND_BASE = 'https://freesound.org/apiv2';

export async function searchFreesound(
  apiKey: string,
  query: string,
  options: {
    filter?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<SearchResult> {
  const params = new URLSearchParams();
  params.append('query', query);
  params.append('fields', 'id,name,tags,duration,previews,license,description');
  params.append('page_size', String(options.pageSize || 20));
  params.append('page', String(options.page || 1));
  if (options.filter) params.append('filter', options.filter);
  if (options.sort) params.append('sort', options.sort);

  const url = `${FREESOUND_BASE}/search/?${params}`;
  const data = await fetchJSON(url, { Authorization: `Token ${apiKey}` });

  const samples: OnlineSample[] = (data.results || []).map((item: any) => ({
    id: `fs-${item.id}`,
    name: item.name,
    tags: item.tags || [],
    duration: item.duration || 0,
    previewUrl: item.previews?.['preview-hq-mp3'] || item.previews?.['preview-lq-mp3'] || '',
    downloadUrl: `${FREESOUND_BASE}/sounds/${item.id}/download/`,
    source: 'freesound' as const,
    license: item.license,
    description: item.description,
  }));

  return {
    samples,
    total: data.count || 0,
    page: options.page || 1,
    pageSize: options.pageSize || 20,
    hasMore: !!data.next,
  };
}

// ===== SND.dev API =====

const SNDDEV_BASE = 'https://cdn.snd.dev';

// SND.dev 的音效分类
const SNDDEV_CATEGORIES: Record<string, string> = {
  'notification': '通知',
  'alert': '提醒',
  'success': '成功',
  'error': '错误',
  'warning': '警告',
  'click': '点击',
  'toggle': '切换',
  'navigation': '导航',
  'typing': '输入',
  'message': '消息',
};

export async function searchSnddev(category?: string): Promise<SearchResult> {
  // SND.dev 是静态 CDN，按分类列出音效
  const categories = category ? [category] : Object.keys(SNDDEV_CATEGORIES);

  const samples: OnlineSample[] = [];

  for (const cat of categories) {
    // SND.dev 提供预设音效 URL
    const variants = ['1', '2', '3'];
    for (const v of variants) {
      samples.push({
        id: `snd-${cat}-${v}`,
        name: `${SNDDEV_CATEGORIES[cat] || cat} ${v}`,
        tags: [cat, 'ui', 'interaction'],
        duration: 0.5,
        previewUrl: `${SNDDEV_BASE}/audio/${cat}/${v}.mp3`,
        downloadUrl: `${SNDDEV_BASE}/audio/${cat}/${v}.mp3`,
        source: 'snddev' as const,
        license: 'Free for commercial use',
      });
    }
  }

  return {
    samples,
    total: samples.length,
    page: 1,
    pageSize: samples.length,
    hasMore: false,
  };
}

export function getSnddevCategories(): Record<string, string> {
  return SNDDEV_CATEGORIES;
}

// ===== Pixabay 音效搜索（Bootstrap JSON） =====
// Pixabay 官方 API 不支持音效搜索，只有图片和视频 API
// 通过请求搜索页面 HTML，提取 __BOOTSTRAP_URL__，然后获取 bootstrap JSON 数据

const PIXABAY_BASE = 'https://pixabay.com';

/**
 * Pixabay 音效热门分类
 */
export const PIXABAY_SOUND_CATEGORIES: Record<string, string> = {
  'nature': '自然',
  'animals': '动物',
  'music': '音乐',
  'transportation': '交通',
  'emergency': '紧急',
  'household': '家居',
  'tools': '工具',
  'human': '人声',
  'electronic': '电子',
  'impact': '撞击',
  'transition': '过渡',
  'ambient': '环境',
  'foley': '拟音',
  'game': '游戏',
  'notification': '通知',
  'interface': '界面',
};

/**
 * 从搜索页面 HTML 提取 bootstrap URL
 */
function extractBootstrapUrl(html: string): string | null {
  const match = html.match(/window\.__BOOTSTRAP_URL__\s*=\s*['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

/**
 * 解析 bootstrap JSON 中的音效数据
 */
function parseBootstrapResults(data: any): {
  samples: OnlineSample[];
  total: number;
  page: number;
  pages: number;
} {
  const page = data?.page;
  if (!page?.results) {
    return { samples: [], total: 0, page: 1, pages: 0 };
  }

  const samples: OnlineSample[] = (page.results || []).map((item: any) => {
    const sources = item.sources || {};
    const tagList = item.tagList || [];
    const tags = tagList.map((t: any) => Array.isArray(t) ? t[0] : t).filter(Boolean);

    return {
      id: `px-${item.id}`,
      name: item.name || `Sound ${item.id}`,
      tags,
      duration: item.duration || 0,
      previewUrl: sources.src || '',
      downloadUrl: sources.downloadUrl
        ? `${PIXABAY_BASE}${sources.downloadUrl}`
        : sources.src || '',
      source: 'pixabay' as const,
      license: 'Pixabay License (免费商用)',
      description: item.description || '',
      extras: {
        slug: (item.href || '').replace(/^\/sound-effects\//, '').replace(/\/$/, ''),
        filename: sources.filename || '',
        waveformUrl: sources.waveformUrl ? `${PIXABAY_BASE}${sources.waveformUrl}` : '',
        thumbnailUrl: sources.thumbnailUrl || '',
        viewCount: String(item.viewCount || 0),
        downloadCount: String(item.downloadCount || 0),
        likeCount: String(item.likeCount || 0),
        username: item.user?.username || '',
        mediaType: item.mediaDescriptiveType || 'sound_effect',
        rating: String(item.rating || 0),
      },
    };
  });

  return {
    samples,
    total: page.total || 0,
    page: page.page || 1,
    pages: page.pages || 0,
  };
}

/**
 * 搜索 Pixabay 音效
 * 1. 请求搜索页面 HTML，提取 __BOOTSTRAP_URL__
 * 2. 请求 bootstrap JSON，解析音效数据
 * 3. 如果失败，回退到视频 API
 */
export async function searchPixabay(
  apiKey: string,
  query: string,
  options: {
    category?: string;
    lang?: string;
    order?: 'popular' | 'latest';
    page?: number;
    perPage?: number;
  } = {}
): Promise<SearchResult> {
  const page = options.page || 1;
  const order = options.order || 'popular';
  const orderMap: Record<string, string> = {
    'popular': 'most-relevant',
    'latest': 'latest',
  };
  const orderParam = orderMap[order] || 'most-relevant';

  // 构建搜索 URL
  // Pixabay 搜索支持中文，URL 中空格替换为 -，encodeURIComponent 处理特殊字符
  let searchUrl: string;
  if (query && query.trim()) {
    const trimmed = query.trim();
    // Pixabay 搜索 URL 格式：/sound-effects/search/{query}/
    // 空格替换为 -，其他字符用 encodeURIComponent
    const pathQuery = trimmed.split(/\s+/).map(part => encodeURIComponent(part)).join('-');
    searchUrl = `${PIXABAY_BASE}/sound-effects/search/${pathQuery}/?order=${orderParam}&pagi=${page}`;
  } else {
    searchUrl = `${PIXABAY_BASE}/sound-effects/?order=${orderParam}&pagi=${page}`;
  }

  // 请求头模拟浏览器
  const headers: Record<string, string> = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Referer': `${PIXABAY_BASE}/`,
  };

  try {
    // 步骤 1：获取搜索页面 HTML
    const html = await fetchText(searchUrl, headers);

    // 步骤 2：提取 bootstrap URL
    const bootstrapUrl = extractBootstrapUrl(html);
    if (!bootstrapUrl) {
      throw new Error('无法提取 bootstrap URL，页面结构可能已变化');
    }

    // 步骤 3：请求 bootstrap JSON
    const fullBootstrapUrl = bootstrapUrl.startsWith('http')
      ? bootstrapUrl
      : `${PIXABAY_BASE}${bootstrapUrl}`;

    const jsonData = await fetchJSON(fullBootstrapUrl, headers);

    // 步骤 4：解析结果
    const { samples, total, page: currentPage, pages } = parseBootstrapResults(jsonData);

    return {
      samples,
      total,
      page: currentPage,
      pageSize: options.perPage || 20,
      hasMore: currentPage < pages,
    };
  } catch (error: any) {
    // 如果网页爬取失败（如 Cloudflare 拦截），回退到视频 API
    console.warn('[Pixabay] Bootstrap fetch failed, falling back to video API:', error.message);
    return searchPixabayVideoFallback(apiKey, query, options);
  }
}

/**
 * Pixabay 视频 API 回退方案
 * 当网页爬取失败时使用（如 Cloudflare 拦截）
 * 注意：这搜索的是视频，不是纯音效，但可以找到一些音乐/背景音
 */
async function searchPixabayVideoFallback(
  apiKey: string,
  query: string,
  options: {
    category?: string;
    order?: 'popular' | 'latest';
    page?: number;
    perPage?: number;
  } = {}
): Promise<SearchResult> {
  const params = new URLSearchParams();
  params.append('key', apiKey);
  params.append('q', query);
  params.append('category', 'music');
  params.append('lang', 'en');
  params.append('order', options.order || 'popular');
  params.append('page', String(options.page || 1));
  params.append('per_page', String(options.perPage || 20));
  params.append('safesearch', 'true');
  params.append('video_type', 'animation');

  const url = `https://pixabay.com/api/videos/?${params}`;
  const data = await fetchJSON(url);

  const samples: OnlineSample[] = (data.hits || []).map((item: any) => {
    const videos = item.videos || {};
    const preview = videos.tiny || videos.small || videos.medium || videos.large;
    const download = videos.medium || videos.large || preview;

    return {
      id: `px-vid-${item.id}`,
      name: item.tags ? item.tags.split(',')[0].trim() : `Pixabay Music ${item.id}`,
      tags: (item.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      duration: item.duration || 0,
      previewUrl: preview?.url || '',
      downloadUrl: download?.url ? `${download.url}?download=1` : undefined,
      source: 'pixabay' as const,
      license: 'Pixabay License (免费商用)',
      description: `by ${item.user}`,
      extras: {
        type: 'video',
      },
    };
  });

  return {
    samples,
    total: data.totalHits || 0,
    page: options.page || 1,
    pageSize: options.perPage || 20,
    hasMore: (options.page || 1) * (options.perPage || 20) < (data.totalHits || 0),
  };
}

// ===== 下载采样到本地 =====

export async function downloadOnlineSample(
  url: string,
  targetPath: string,
  headers?: Record<string, string>
): Promise<string> {
  // 处理相对 URL（如 Pixabay 的 /sound-effects/download/id-xxx.mp3）
  let fullUrl = url;
  if (url.startsWith('/')) {
    fullUrl = `${PIXABAY_BASE}${url}`;
  }

  const downloadHeaders: Record<string, string> = {
    ...headers,
    'Referer': `${PIXABAY_BASE}/`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  };

  const buffer = await fetchBuffer(fullUrl, downloadHeaders);
  const fs = await import('node:fs');
  fs.writeFileSync(targetPath, buffer);
  return targetPath;
}
