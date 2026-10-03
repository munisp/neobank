import React from 'react';

export const ProgressBar = ({ percentage = 0, color = '#2563eb', className = '' }) => (
  <div className={`w-full bg-gray-200 rounded-full h-2 ${className}`}>
    <div
      className="h-2 rounded-full transition-all"
      style={{ width: `${Math.min(100, Math.max(0, percentage))}%`, backgroundColor: color }}
    />
  </div>
);
export default ProgressBar;
