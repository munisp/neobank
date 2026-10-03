import React from 'react';
import { ChevronRight } from 'lucide-react';

export const SettingsItem = ({ icon, label, description, value, onClick, danger = false }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 text-left hover:bg-gray-50"
  >
    {icon && <span className="text-gray-400">{icon}</span>}
    <span className="flex-1">
      <span className={`block text-sm font-medium ${danger ? 'text-red-600' : ''}`}>{label}</span>
      {description && <span className="block text-xs text-gray-500">{description}</span>}
    </span>
    {value !== undefined ? <span className="text-sm text-gray-500">{value}</span> : <ChevronRight size={16} className="text-gray-300" />}
  </button>
);
export default SettingsItem;
