import React, { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, icon, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: open ? 12 : 0,
          cursor: 'pointer',
          userSelect: 'none',
          padding: '4px 0',
        }}
      >
        {icon}
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{title}</span>
        <span style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          transition: 'transform 0.2s',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>
          {'\u25B6'}
        </span>
      </div>
      {open && children}
    </section>
  );
};

export default CollapsibleSection;
