/**
 * 模组 UI 注册表 - 全局单例
 * 存储模组注册的工具栏按钮和面板，供 Toolbar/Layout 组件渲染
 */
import React from 'react';

export interface ModToolbarButton {
  id: string;
  icon: string;
  tooltip: string;
  onClick: () => void;
}

export interface ModPanel {
  id: string;
  title: string;
  component: React.ComponentType;
  position?: 'sidebar' | 'modal' | 'floating';
}

class ModUIRegistry {
  // 工具栏按钮
  private toolbarButtons = new Map<string, ModToolbarButton>();
  // 面板
  private panels = new Map<string, ModPanel>();
  // 面板打开状态
  private openPanels = new Set<string>();
  // 变更通知回调
  private listeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  // ─── 工具栏按钮 ───
  addButton(config: ModToolbarButton) {
    this.toolbarButtons.set(config.id, config);
    this.notify();
  }

  removeButton(id: string) {
    this.toolbarButtons.delete(id);
    this.notify();
  }

  getButtons(): ModToolbarButton[] {
    return Array.from(this.toolbarButtons.values());
  }

  // ─── 面板 ───
  registerPanel(config: ModPanel) {
    this.panels.set(config.id, config);
    this.notify();
  }

  unregisterPanel(id: string) {
    this.panels.delete(id);
    this.openPanels.delete(id);
    this.notify();
  }

  getPanels(): ModPanel[] {
    return Array.from(this.panels.values());
  }

  getPanel(id: string): ModPanel | undefined {
    return this.panels.get(id);
  }

  openPanel(id: string) {
    this.openPanels.add(id);
    this.notify();
  }

  closePanel(id: string) {
    this.openPanels.delete(id);
    this.notify();
  }

  isPanelOpen(id: string): boolean {
    return this.openPanels.has(id);
  }

  // ─── 重置（页面刷新或模组卸载时） ───
  clear() {
    this.toolbarButtons.clear();
    this.panels.clear();
    this.openPanels.clear();
    this.notify();
  }
}

// 全局单例
export const modUIRegistry = new ModUIRegistry();
