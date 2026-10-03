import React from 'react';

const STATUS_COLORS = {
  active: 'text-green-600',
  expired: 'text-red-600',
  pending: 'text-yellow-600',
};

export const PolicyDetailItem = ({ label, value, status }) => (
  <div className="flex justify-between py-2 border-b border-gray-100 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className={status ? STATUS_COLORS[status] || '' : 'font-medium'}>{value}</span>
  </div>
);
export default PolicyDetailItem;
