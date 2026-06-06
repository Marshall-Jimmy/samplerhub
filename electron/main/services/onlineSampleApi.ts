/**
 * 在线采样 API 代理服务
 * 在主进程中代理 HTTP 请求，避免渲染进程的 CORS 限制
 *
 * 支持的 API：
 * - Lotsofsounds: 免费，无需认证
 * - Freesound: 需要 API Key（用户自行提供）
 * - SND.dev: 免费，无需认证
 * - Pixabay: 需要 API Key（免费注册获取）
 */

import { net } from 'electron';

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

// ===== Pixabay API =====

const PIXABAY_BASE = 'https://pixabay.com/api';

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
  const params = new URLSearchParams();
  params.append('key', apiKey);
  params.append('q', query);
  params.append('category', options.category || 'music');
  params.append('lang', options.lang || 'en');
  params.append('order', options.order || 'popular');
  params.append('page', String(options.page || 1));
  params.append('per_page', String(options.perPage || 20));
  params.append('safesearch', 'true');

  // Pixabay 音频通过视频端点搜索
  const url = `${PIXABAY_BASE}/videos/?${params}`;
  const data = await fetchJSON(url);

  const samples: OnlineSample[] = (data.hits || []).map((item: any) => {
    // 优先使用小文件作为预览，中等文件作为下载
    const videos = item.videos || {};
    const preview = videos.tiny || videos.small || videos.medium || videos.large;
    const download = videos.medium || videos.large || preview;

    return {
      id: `px-${item.id}`,
      name: item.tags || `Pixabay Audio ${item.id}`,
      tags: (item.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      duration: item.duration || 0,
      previewUrl: preview?.url || '',
      downloadUrl: download?.url ? `${download.url}?download=1` : undefined,
      source: 'pixabay' as const,
      license: 'Pixabay License (免版税商用)',
      description: `by ${item.user}`,
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
  const buffer = await fetchBuffer(url, headers);
  const fs = await import('node:fs');
  fs.writeFileSync(targetPath, buffer);
  return targetPath;
}
