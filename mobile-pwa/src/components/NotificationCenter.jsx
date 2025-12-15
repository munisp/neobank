import React, { useState, useEffect } from 'react';
import { X, Bell, Check } from 'lucide-react';

const NotificationCenter = ({ notifications = [], onClose, onMarkAsRead, onMarkAllAsRead }) => {
  const [isVisible, setIsVisible] = useState(true);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose && onClose(), 300);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div
      className={`fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${
        isVisible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-indigo-600 text-white">
        <div className="flex items-center space-x-2">
          <Bell className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Notifications</h2>
          {unreadCount > 0 && (
            <span className="bg-white text-indigo-600 text-xs font-bold px-2 py-1 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-indigo-700 rounded-full transition"
          aria-label="Close notifications"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Mark All as Read */}
      {unreadCount > 0 && (
        <div className="p-3 border-b border-gray-200 bg-gray-50">
          <button
            onClick={onMarkAllAsRead}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1"
          >
            <Check className="w-4 h-4" />
            <span>Mark all as read</span>
          </button>
        </div>
      )}

      {/* Notifications List */}
      <div className="overflow-y-auto h-full pb-20">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Bell className="w-16 h-16 mb-4" />
            <p className="text-lg font-medium">No notifications</p>
            <p className="text-sm">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 hover:bg-gray-50 transition cursor-pointer ${
                  !notification.read ? 'bg-indigo-50' : ''
                }`}
                onClick={() => onMarkAsRead && onMarkAsRead(notification.id)}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`flex-shrink-0 w-2 h-2 mt-2 rounded-full ${
                      !notification.read ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium text-gray-900 ${!notification.read ? 'font-semibold' : ''}`}>
                      {notification.title}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                    <p className="text-xs text-gray-400 mt-2">{notification.timestamp}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
