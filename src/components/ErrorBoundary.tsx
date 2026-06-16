import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo);
    // 上报错误到主进程日志
    try {
      if (window.electronAPI?.send) {
        window.electronAPI.send('error:report', {
          source: 'ErrorBoundary',
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
        });
      }
    } catch { /* 上报失败不影响用户体验 */ }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0f0f14',
          color: '#e5e5e5',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          padding: 40,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 48,
            marginBottom: 16,
            opacity: 0.5,
          }}>
            :(
          </div>
          <h2 style={{
            fontSize: 20,
            fontWeight: 600,
            marginBottom: 8,
            color: '#f0f0f3',
          }}>
            出了点问题
          </h2>
          <p style={{
            fontSize: 14,
            color: '#71717a',
            marginBottom: 24,
            maxWidth: 400,
            lineHeight: 1.6,
          }}>
            应用遇到了一个意外错误。请尝试重新加载，如果问题持续存在，请联系开发者。
          </p>
          <div style={{
            background: '#1c1c21',
            border: '1px solid #2a2a32',
            borderRadius: 8,
            padding: '12px 16px',
            maxWidth: 500,
            width: '100%',
            marginBottom: 24,
            textAlign: 'left',
          }}>
            <code style={{
              fontSize: 12,
              color: '#fb7185',
              wordBreak: 'break-all',
              lineHeight: 1.6,
            }}>
              {this.state.error?.message || 'Unknown error'}
            </code>
          </div>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 32px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #22d3ee)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            重新加载
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
