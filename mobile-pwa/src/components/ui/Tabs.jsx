import React from 'react';

// Descriptor-driven tab bar; pages render the active panel themselves.
export const Tabs = ({ tabs, activeTab, onTabChange, className = '' }) => (
  <div className={`flex border-b border-gray-200 ${className}`} role="tablist">
    {(tabs || []).map((tab) => {
      const t = typeof tab === 'object' ? tab : { id: tab, label: tab };
      const active = t.id === activeTab;
      return (
        <button
          key={t.id}
          role="tab"
          aria-selected={active}
          onClick={() => onTabChange?.(t.id)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          {t.label}
        </button>
      );
    })}
  </div>
);

export const TabItem = ({ id, label }) => null; // descriptor marker
export const Tab = Tabs;
export const TabPanel = ({ children, active = true }) => (active ? <div role="tabpanel">{children}</div> : null);
export default Tabs;
