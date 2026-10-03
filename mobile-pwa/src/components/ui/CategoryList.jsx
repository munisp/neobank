import React from 'react';
import Icon from './Icon';

export const CategoryList = ({ categories = [], onSelect }) => (
  <div className="divide-y divide-gray-100">
    {categories.map((cat) => {
      const c = typeof cat === 'object' ? cat : { id: cat, name: cat };
      return (
        <button key={c.id} onClick={() => onSelect?.(c)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
          {c.icon && <Icon name={c.icon} size={18} className="text-gray-400" />}
          <span className="flex-1 text-sm font-medium">{c.name}</span>
          {c.amount !== undefined && <span className="text-sm text-gray-500">₦{Number(c.amount).toLocaleString()}</span>}
        </button>
      );
    })}
  </div>
);
export default CategoryList;
