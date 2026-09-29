import type { ReactNode } from 'react';

export interface TabsProps {
  tabs: { key: string; label: string; icon?: ReactNode }[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <div
      role="tablist"
      className={`flex gap-1 overflow-x-auto border-b border-line ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.key)}
            className={
              `flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm transition-colors duration-150 ` +
              (isActive
                ? 'border-primary font-medium text-fg'
                : 'border-transparent text-fg-secondary hover:text-fg')
            }
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
