import React, { useEffect, useRef, useState, useCallback } from 'react';
import s from '../../styles/components/context-menu.module.css';

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  shortcut?: string;
  onClick?: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });
  const [focusedIdx, setFocusedIdx] = useState(-1);

  const nonDividerItems = items.filter(i => !i.divider);

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (x + rect.width > vw - 8) nx = vw - rect.width - 8;
    if (ny + rect.height > vh - 8) ny = vh - rect.height - 8;
    if (nx < 8) nx = 8;
    if (ny < 8) ny = 8;
    setAdjustedPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx(prev => {
          let next = prev + 1;
          while (next < nonDividerItems.length && nonDividerItems[next]?.disabled) next++;
          return next >= nonDividerItems.length ? prev : next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx(prev => {
          let next = prev - 1;
          while (next >= 0 && nonDividerItems[next]?.disabled) next--;
          return next < 0 ? prev : next;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIdx >= 0 && focusedIdx < nonDividerItems.length) {
          const item = nonDividerItems[focusedIdx];
          if (!item.disabled) { item.onClick?.(); onClose(); }
        }
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, focusedIdx, nonDividerItems]);

  let itemIdx = 0;

  return (
    <div
      ref={menuRef}
      className={s.menu}
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {items.map((item) => {
        const isDivider = item.divider;
        const currentIdx = isDivider ? -1 : itemIdx++;
        const isFocused = currentIdx === focusedIdx;
        return (
          <React.Fragment key={item.key}>
            {isDivider && <div className={s.divider} />}
            {!isDivider && (
              <div
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick?.();
                    onClose();
                  }
                }}
                onMouseEnter={() => setFocusedIdx(currentIdx)}
                className={`${s.item} ${item.danger ? s.itemDanger : ''} ${item.disabled ? s.itemDisabled : ''} ${isFocused ? s.itemFocused : ''}`}
              >
                {item.icon && <span className={s.itemIcon}>{item.icon}</span>}
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.shortcut && <span className={s.itemShortcut}>{item.shortcut}</span>}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export function useContextMenu() {
  const [menuState, setMenuState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
  }>({ visible: false, x: 0, y: 0, items: [] });

  const showMenu = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({ visible: true, x: e.clientX, y: e.clientY, items });
  }, []);

  const hideMenu = useCallback(() => {
    setMenuState(prev => ({ ...prev, visible: false }));
  }, []);

  const MenuComponent = useCallback(() => {
    if (!menuState.visible) return null;
    return <ContextMenu x={menuState.x} y={menuState.y} items={menuState.items} onClose={hideMenu} />;
  }, [menuState, hideMenu]);

  return { showMenu, MenuComponent };
}

export default ContextMenu;
