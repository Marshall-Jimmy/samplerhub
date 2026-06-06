import { toast } from 'sonner';

/**
 * 统一处理 IPC 调用错误：记录日志 + 显示用户提示
 */
export function handleIpcError(error: unknown, userMessage?: string) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[IPC Error] ${userMessage || 'Operation failed'}:`, message);
  toast.error(userMessage || message || 'Operation failed');
}
