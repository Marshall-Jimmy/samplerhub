import { app } from 'electron';

// 模拟 Sentry，当用户配置 DSN 后启用
// 实际集成时需要安装 @sentry/electron: npm install @sentry/electron
class SentryMock {
  static init(options: any) {
    if (!options.dsn) {
      console.log('[Sentry] DSN not configured, skipping crash reporting');
      return;
    }
    console.log('[Sentry] Initialized with DSN:', options.dsn);
    console.log('[Sentry] Environment:', options.environment);
    console.log('[Sentry] Release:', options.release);
  }

  static captureException(error: Error) {
    console.error('[Sentry] Captured exception:', error);
  }

  static captureMessage(message: string) {
    console.log('[Sentry] Captured message:', message);
  }
}

export function initSentry() {
  SentryMock.init({
    dsn: '', // 用户需要配置自己的 DSN
    environment: process.env.NODE_ENV || 'production',
    release: `samplerhub@${app.getVersion()}`,
    beforeSend(event: any) {
      // 可以添加用户同意检查
      return event;
    },
  });
}

export { SentryMock };
