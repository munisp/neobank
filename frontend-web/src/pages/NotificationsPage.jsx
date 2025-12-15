import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Bell, Settings, Trash2, CheckCircle, Mail, DollarSign, Shield, XCircle, Loader } from 'lucide-react';

// --- Types and Mock Data ---

type NotificationType = 'transaction' | 'security' | 'promotion' | 'system';
type NotificationStatus = 'read' | 'unread';

interface Notification {
  id: string;
  type: NotificationType;
  status: NotificationStatus;
  title: string;
  message: string;
  timestamp: string;
}

interface NotificationFilter {
  type: NotificationType | 'all';
  status: NotificationStatus | 'all';
}

// Mock API Hook to simulate fetching, updating, and deleting notifications
const useNotificationsApi = () => {
  const initialNotifications: Notification[] = useMemo(() => [
    { id: '1', type: 'transaction', status: 'unread', title: 'Deposit Received', message: 'A deposit of $500.00 has been credited to your account.', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
    { id: '2', type: 'security', status: 'unread', title: 'New Login Detected', message: 'A new login was detected from an unrecognized device.', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
    { id: '3', type: 'promotion', status: 'read', title: 'Limited Time Offer', message: 'Earn 5% cashback on all dining expenses this month.', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
    { id: '4', type: 'transaction', status: 'read', title: 'Payment Sent', message: 'Your payment of $50.00 to Netflix was successful.', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() },
    { id: '5', type: 'system', status: 'unread', title: 'System Maintenance', message: 'Scheduled maintenance on Sunday from 2 AM to 4 AM UTC.', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString() },
  ], []);

  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simulate API call delay
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await delay(500); // Simulate network delay
      // In a real app, this would be a call to one of the 28 endpoints (e.g., /api/notifications/list)
      setNotifications(notifications); // Use the current state for mock
    } catch (err) {
      setError('Failed to fetch notifications.');
    } finally {
      setIsLoading(false);
    }
  }, [notifications]);

  const updateNotificationStatus = useCallback(async (id: string, status: NotificationStatus) => {
    setIsLoading(true);
    setError(null);
    try {
      await delay(300);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status } : n));
    } catch (err) {
      setError(`Failed to update notification ${id}.`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await delay(300);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      setError(`Failed to delete notification ${id}.`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await delay(500);
      setNotifications(prev => prev.map(n => ({ ...n, status: 'read' })));
    } catch (err) {
      setError('Failed to mark all as read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Mock for push notification settings API (e.g., /api/notifications/settings)
  const [pushEnabled, setPushEnabled] = useState(true);
  const updatePushSettings = useCallback(async (enabled: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      await delay(300);
      setPushEnabled(enabled);
    } catch (err) {
      setError('Failed to update push settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Mock for real-time updates (e.g., via WebSockets or long polling)
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate a new notification arriving every 30 seconds
      const newId = `${Date.now()}`;
      const newNotification: Notification = {
        id: newId,
        type: 'system',
        status: 'unread',
        title: 'Real-time Update',
        message: `A new system update arrived at ${new Date().toLocaleTimeString()}`,
        timestamp: new Date().toISOString(),
      };
      setNotifications(prev => [newNotification, ...prev]);
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, []);


  return {
    notifications,
    isLoading,
    error,
    fetchNotifications,
    updateNotificationStatus,
    deleteNotification,
    markAllAsRead,
    pushEnabled,
    updatePushSettings,
  };
};

// --- Utility Components ---

const NotificationIcon: React.FC<{ type: NotificationType }> = ({ type }) => {
  const iconMap = {
    transaction: DollarSign,
    security: Shield,
    promotion: Mail,
    system: Bell,
  };
  const Icon = iconMap[type];
  const colorMap = {
    transaction: 'text-green-500',
    security: 'text-red-500',
    promotion: 'text-blue-500',
    system: 'text-yellow-500',
  };
  return <Icon className={`w-6 h-6 ${colorMap[type]}`} />;
};

const FilterButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1 text-sm rounded-full transition-colors duration-200 ${
      active
        ? 'bg-blue-600 text-white shadow-md'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`}
  >
    {label}
  </button>
);

// --- Main Component ---

const NotificationsPage: React.FC = () => {
  const {
    notifications,
    isLoading,
    error,
    updateNotificationStatus,
    deleteNotification,
    markAllAsRead,
    pushEnabled,
    updatePushSettings,
  } = useNotificationsApi();

  const [filter, setFilter] = useState<NotificationFilter>({ type: 'all', status: 'all' });
  const [showSettings, setShowSettings] = useState(false);

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      const typeMatch = filter.type === 'all' || n.type === filter.type;
      const statusMatch = filter.status === 'all' || n.status === filter.status;
      return typeMatch && statusMatch;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [notifications, filter]);

  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  // Notification Item Component
  const NotificationItem: React.FC<{ notification: Notification }> = ({ notification }) => {
    const isUnread = notification.status === 'unread';
    const toggleStatus = () => updateNotificationStatus(notification.id, isUnread ? 'read' : 'unread');
    const handleDelete = () => deleteNotification(notification.id);

    return (
      <div
        className={`flex items-start p-4 border-b last:border-b-0 transition-all duration-300 ${
          isUnread ? 'bg-blue-50 hover:bg-blue-100 border-blue-200' : 'bg-white hover:bg-gray-50 border-gray-100'
        }`}
      >
        <div className="flex-shrink-0 pt-1">
          <NotificationIcon type={notification.type} />
        </div>
        <div className="ml-4 flex-grow">
          <div className="flex justify-between items-start">
            <h3 className={`text-lg font-semibold ${isUnread ? 'text-gray-900' : 'text-gray-600'}`}>
              {notification.title}
            </h3>
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {new Date(notification.timestamp).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{notification.message}</p>
          <div className="mt-3 flex space-x-3 text-sm">
            <button
              onClick={toggleStatus}
              className="flex items-center text-blue-600 hover:text-blue-800 transition-colors"
            >
              {isUnread ? <CheckCircle className="w-4 h-4 mr-1" /> : <Mail className="w-4 h-4 mr-1" />}
              {isUnread ? 'Mark as Read' : 'Mark as Unread'}
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center text-red-600 hover:text-red-800 transition-colors"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Settings Panel Component
  const SettingsPanel: React.FC = () => (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Push Notification Settings</h2>
      <div className="flex items-center justify-between py-3 border-b">
        <label htmlFor="push-toggle" className="text-gray-700 font-medium">
          Enable Push Notifications
        </label>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            id="push-toggle"
            checked={pushEnabled}
            onChange={(e) => updatePushSettings(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>
      <p className="mt-4 text-sm text-gray-500">
        Manage how you receive real-time alerts about your account activity.
      </p>
    </div>
  );

  // Main Render
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-extrabold text-gray-900 flex items-center">
            <Bell className="w-8 h-8 mr-3 text-blue-600" />
            Notifications
            {unreadCount > 0 && (
              <span className="ml-3 inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-red-100 text-red-800">
                {unreadCount} Unread
              </span>
            )}
          </h1>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-full bg-white text-gray-600 hover:bg-gray-100 hover:text-blue-600 transition-colors shadow-md"
            aria-label="Notification Settings"
          >
            <Settings className="w-6 h-6" />
          </button>
        </header>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-6">
            <SettingsPanel />
          </div>
        )}

        {/* Controls and Filters */}
        <div className="bg-white p-4 rounded-lg shadow-md mb-6 flex flex-col sm:flex-row sm:items-center justify-between">
          <div className="flex flex-wrap gap-2 mb-4 sm:mb-0">
            <span className="text-sm font-medium text-gray-700 mr-2">Filter by Type:</span>
            {(['all', 'transaction', 'security', 'promotion'] as const).map(type => (
              <FilterButton
                key={type}
                label={type.charAt(0).toUpperCase() + type.slice(1)}
                active={filter.type === type}
                onClick={() => setFilter(prev => ({ ...prev, type }))}
              />
            ))}
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={markAllAsRead}
              disabled={isLoading || unreadCount === 0}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400 transition-colors flex items-center"
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              Mark All as Read
            </button>
          </div>
        </div>

        {/* Notification List */}
        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          {isLoading && (
            <div className="p-8 text-center text-blue-600">
              <Loader className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p>Loading notifications...</p>
            </div>
          )}

          {error && (
            <div className="p-8 text-center bg-red-50 text-red-700 border-l-4 border-red-500">
              <XCircle className="w-6 h-6 inline-block mr-2" />
              <p className="font-medium">{error}</p>
              <p className="text-sm mt-1">Please try refreshing the page.</p>
            </div>
          )}

          {!isLoading && filteredNotifications.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Bell className="w-10 h-10 mx-auto mb-4" />
              <p className="text-lg font-medium">No notifications found.</p>
              <p className="text-sm">Your inbox is clean!</p>
            </div>
          )}

          {!isLoading && filteredNotifications.length > 0 && (
            <div className="divide-y divide-gray-100">
              {filteredNotifications.map(n => (
                <NotificationItem key={n.id} notification={n} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;

// Note on API Endpoints:
// The component simulates interaction with the 28 available notification endpoints
// by abstracting them behind the \`useNotificationsApi\` hook.
// In a real application, the hook would map actions to specific endpoints:
// - Fetch: GET /api/notifications/list (or similar)
// - Mark as Read/Unread: PUT /api/notifications/{id}/status
// - Delete: DELETE /api/notifications/{id}
// - Mark All Read: POST /api/notifications/mark-all-read
// - Push Settings: GET/PUT /api/notifications/settings
// The mock covers all required features using a single, cohesive state management approach.
