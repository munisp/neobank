import React from 'react';

export const NotificationItem = ({ notification, onMarkAsRead, onDelete }) => {
  const n = notification || {};
  return (
    <div className={`flex items-start gap-3 p-3 border-b ${n.read ? 'opacity-60' : 'bg-blue-50/40'}`}>
      <div className="flex-1">
        <div className="font-medium text-sm">{n.title}</div>
        <div className="text-sm text-gray-600">{n.message}</div>
        {n.timestamp && <div className="text-xs text-gray-400 mt-1">{new Date(n.timestamp).toLocaleString()}</div>}
      </div>
      <div className="flex gap-1">
        {!n.read && onMarkAsRead && (
          <button onClick={() => onMarkAsRead(n.id)} className="text-xs text-blue-600">Mark read</button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(n.id)} className="text-xs text-red-500">Delete</button>
        )}
      </div>
    </div>
  );
};
export default NotificationItem;
