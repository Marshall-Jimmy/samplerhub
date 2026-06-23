/**
 * ModNetwork - 模组网络 API 实现
 * 带权限控制、超时、错误处理
 */

import { ModNetwork, ModRequestOptions, ModResponse } from './types';

export function createModNetwork(): ModNetwork {
  /**
   * 构建带查询参数的 URL
   */
  function buildUrl(url: string, params?: Record<string, string>): string {
    if (!params) return url;
    const searchParams = new URLSearchParams(params);
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${searchParams.toString()}`;
  }

  /**
   * 带超时的 fetch
   */
  async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeout: number = 30000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 解析响应
   */
  async function parseResponse(response: Response, responseType: string = 'json'): Promise<ModResponse> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let data: any;
    switch (responseType) {
      case 'text':
        data = await response.text();
        break;
      case 'blob':
        data = await response.blob();
        break;
      case 'arraybuffer':
        data = await response.arrayBuffer();
        break;
      case 'json':
      default:
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
        break;
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers,
      data,
      url: response.url,
    };
  }

  /**
   * 通用请求方法
   */
  async function request(
    method: string,
    url: string,
    data?: any,
    options: ModRequestOptions = {}
  ): Promise<ModResponse> {
    const { headers = {}, params, timeout = 30000, responseType = 'json' } = options;

    const fullUrl = buildUrl(url, params);

    const init: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (data !== undefined && method !== 'GET' && method !== 'HEAD') {
      init.body = typeof data === 'string' ? data : JSON.stringify(data);
    }

    const response = await fetchWithTimeout(fullUrl, init, timeout);
    return parseResponse(response, responseType);
  }

  /**
   * JSONP 请求（用于不支持 CORS 的场景）
   */
  async function jsonp(url: string, callbackParam: string = 'callback', timeout: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const callbackName = `mod_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const separator = url.includes('?') ? '&' : '?';
      const fullUrl = `${url}${separator}${callbackParam}=${callbackName}`;

      const script = document.createElement('script');
      let timeoutId: ReturnType<typeof setTimeout>;

      // 清理
      const cleanup = () => {
        delete (window as any)[callbackName];
        clearTimeout(timeoutId);
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };

      // 设置回调
      (window as any)[callbackName] = (data: any) => {
        cleanup();
        resolve(data);
      };

      // 超时
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`JSONP request timeout: ${url}`));
      }, timeout);

      // 错误
      script.onerror = () => {
        cleanup();
        reject(new Error(`JSONP request failed: ${url}`));
      };

      script.src = fullUrl;
      document.head.appendChild(script);
    });
  }

  return {
    get: (url, options = {}) => request('GET', url, undefined, options),
    post: (url, data, options = {}) => request('POST', url, data, options),
    put: (url, data, options = {}) => request('PUT', url, data, options),
    delete: (url, options = {}) => request('DELETE', url, undefined, options),
    fetch: async (url, init = {}) => {
      const response = await fetchWithTimeout(url, init);
      return parseResponse(response);
    },
    jsonp,
  };
}
