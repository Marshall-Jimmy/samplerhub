/**
 * AudioContextManager - 全局 AudioContext 单例管理
 * 统一所有音频模块的 AudioContext，避免创建多个实例
 */

let globalContext: AudioContext | null = null;
let globalMasterGain: GainNode | null = null;
let refCount = 0;

export const AudioContextManager = {
  /** 获取或创建全局 AudioContext */
  getContext(): AudioContext {
    if (!globalContext) {
      globalContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (globalContext.state === 'suspended') {
      globalContext.resume();
    }
    return globalContext;
  },

  /** 获取或创建全局 Master Gain */
  getMasterGain(): GainNode {
    const ctx = this.getContext();
    if (!globalMasterGain) {
      globalMasterGain = ctx.createGain();
      globalMasterGain.connect(ctx.destination);
    }
    return globalMasterGain;
  },

  /** 增加引用计数 */
  acquire(): void {
    refCount++;
  },

  /** 减少引用计数，当为0时释放资源 */
  release(): void {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      this.dispose();
    }
  },

  /** 获取当前引用计数 */
  getRefCount(): number {
    return refCount;
  },

  /** 释放所有资源 */
  dispose(): void {
    if (globalMasterGain) {
      try { globalMasterGain.disconnect(); } catch {}
      globalMasterGain = null;
    }
    if (globalContext && globalContext.state !== 'closed') {
      globalContext.close();
      globalContext = null;
    }
    refCount = 0;
  },
};
