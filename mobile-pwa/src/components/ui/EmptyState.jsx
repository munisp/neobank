import React from 'react';
import Icon from './Icon';

export const EmptyState = ({ title = 'Nothing here yet', message, iconName = 'inbox', action }) => (
  <div className="flex flex-col items-center justify-center text-center p-8 text-gray-500">
    <Icon name={iconName} size={40} className="mb-3 text-gray-300" />
    <h3 className="font-medium text-gray-700">{title}</h3>
    {message && <p className="text-sm mt-1">{message}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
export default EmptyState;
