import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getDbPath } from './database';

class PerformanceMonitor {
  private startTime: number;
  private metrics: Map<string, number>;

  constructor() {
    this.startTime = Date.now();
    this.metrics = new Map();
  }

  recordMetric(name: string, value: number) {
    this.metrics.set(name, value);
    console.log(`[Performance] ${name}: ${value}ms`);
  }

  getStartupTime() {
    return Date.now() - this.startTime;
  }

  getMetrics() {
    return Object.fromEntries(this.metrics);
  }

  /** 获取内存占用（MB） */
  getMemoryUsage(): { rss: number; heapTotal: number; heapUsed: number; external: number } {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100,
    };
  }

  /** 获取数据库文件大小（字节） */
  getDatabaseSize(): number {
    try {
      const dbPath = getDbPath();
      if (fs.existsSync(dbPath)) {
        return fs.statSync(dbPath).size;
      }
      return 0;
    } catch {
      return 0;
    }
  }
}

export const perfMonitor = new PerformanceMonitor();
