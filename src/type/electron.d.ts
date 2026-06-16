export {};

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      off: (channel: string, callback?: (...args: unknown[]) => void) => void;
      send: (channel: string, ...args: unknown[]) => void;
      sendSync: (channel: string, ...args: unknown[]) => undefined;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      createPadWindow: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
      createSequencerWindow: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
      setAlwaysOnTop: (flag: boolean) => Promise<{ success: boolean; data?: boolean; error?: string }>;
      onMaximizeChange: (callback: (isMaximized: boolean) => void) => void;
      removeMaximizeListener: () => void;
    };
  }
}
