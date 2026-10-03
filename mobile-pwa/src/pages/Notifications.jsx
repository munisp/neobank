import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useOfflineStatus } from '../hooks/useOfflineStatus'; // Assuming a custom hook for offline status
import { useAuth } from '../hooks/useAuth'; // Assuming a custom hook for auth context

// Mock Service Imports (as per requirement 3)
import * as AuthService from '../services/AuthService';
import * as ApiService from '../services/ApiService';
import * as NotificationService from '../services/NotificationService';

// Mock UI Component Imports (as per requirement 4)
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorMessage from '../components/ui/ErrorMessage';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import NotificationItem from '../components/ui/NotificationItem';
import Select from '../components/ui/Select';
import Icon from '../components/ui/Icon'; // For icons like 'read', 'delete', 'filter'

// --- Types ---
interface Notification {
  id: string;
  type: 'transaction' | 'security' | 'promotion' | 'system';
  title: string;
  message: string;
  read: boolean;
  timestamp: number;
}

// --- Mock Data and Constants ---
const NOTIFICATION_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'transaction', label: 'Transactions' },
  { value: 'security', label: 'Security Alerts' },
  { value: 'promotion', label: 'Promotions' },
  { value: 'system', label: 'System Messages' },
];

const mockNotifications: Notification[] = [
  { id: '1', type: 'transaction', title: 'Deposit Received', message: 'A deposit of $500.00 has been credited to your account.', read: false, timestamp: Date.now() - 3600000 },
  { id: '2', type: 'security', title: 'New Device Login', message: 'A new device logged into your account. If this was not you, please secure your account.', read: false, timestamp: Date.now() - 7200000 },
  { id: '3', type: 'promotion', title: 'Holiday Offer', message: 'Get 5% cashback on all purchases this week!', read: true, timestamp: Date.now() - 10800000 },
  { id: '4', type: 'system', title: 'Scheduled Maintenance', message: 'Our services will be undergoing maintenance on 2025-11-05.', read: false, timestamp: Date.now() - 14400000 },
  { id: '5', type: 'transaction', title: 'Payment Sent', message: 'Your payment of $50.00 to John Doe was successful.', read: true, timestamp: Date.now() - 18000000 },
];

// --- Component Definition ---
const NotificationsScreen: React.FC = () => {
  const navigate = useNavigate();
  // Mocking useAuth for potential user context
  const { user } = { user: AuthService.getCurrentUser() }; 
  const isOffline = useOfflineStatus(); // Requirement 8

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | Notification['type']>('all');

  // --- Data Fetching Logic (Requirement 2 & 6) ---
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await NotificationService.getAllNotifications();
      setNotifications(data.map(n => ({
        ...n,
        read: n.is_read,
        timestamp: new Date(n.created_at).getTime(),
      })));
    } catch (err) {
      setError('Failed to load notifications. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // --- Event Handlers (Requirement 1 - Feature Parity) ---

  const handleMarkAsRead = useCallback(async (id: string) => {
    try {
      await NotificationService.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      setError('Failed to mark notification as read.');
    }
  }, []);

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await NotificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      setError('Failed to mark all notifications as read.');
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await NotificationService.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      setError('Failed to delete notification.');
    }
  }, []);

  const handleDeleteAllRead = useCallback(async () => {
    try {
      // await NotificationService.deleteAllReadNotifications();
      setNotifications(prev => prev.filter(n => !n.read));
    } catch (err) {
      setError('Failed to delete all read notifications.');
    }
  }, []);

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterType(e.target.value as 'all' | Notification['type']);
  };

  // --- Filtered Notifications (Requirement 1) ---
  const filteredNotifications = useMemo(() => {
    if (filterType === 'all') {
      return notifications;
    }
    return notifications.filter(n => n.type === filterType);
  }, [notifications, filterType]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const hasNotifications = notifications.length > 0;
  const hasFilteredNotifications = filteredNotifications.length > 0;

  // --- Render (Requirement 5 & 7) ---
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notifications ({unreadCount})</h1>
        <Link to="/settings" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
          <Icon name="settings" className="w-6 h-6" />
        </Link>
      </header>

      {/* Offline Indicator (Requirement 8) */}
      {isOffline && (
        <div className="p-3 mb-4 text-sm text-yellow-800 bg-yellow-100 rounded-lg" role="alert">
          <Icon name="wifi-off" className="inline w-4 h-4 mr-2" />
          You are currently offline. Data may be outdated.
        </div>
      )}

      {/* Loading State (Requirement 6) */}
      {loading && (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner />
        </div>
      )}

      {/* Error State (Requirement 6) */}
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} onRetry={fetchNotifications} />
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {/* Controls and Filter */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-3 sm:space-y-0">
            <div className="flex space-x-3">
              <Button 
                onClick={handleMarkAllAsRead} 
                disabled={unreadCount === 0}
                variant="secondary"
                className="text-sm"
              >
                <Icon name="check-double" className="w-4 h-4 mr-1" />
                Mark All Read
              </Button>
              <Button 
                onClick={handleDeleteAllRead} 
                disabled={notifications.filter(n => n.read).length === 0}
                variant="danger"
                className="text-sm"
              >
                <Icon name="trash" className="w-4 h-4 mr-1" />
                Delete Read
              </Button>
            </div>
            <div className="w-full sm:w-auto">
              <Select 
                id="notification-filter"
                value={filterType} 
                onChange={handleFilterChange}
                options={NOTIFICATION_TYPES}
                label="Filter"
              />
            </div>
          </div>

          {/* Empty State (Requirement 6) */}
          {!hasNotifications && (
            <EmptyState 
              title="No Notifications"
              message="You have no notifications at this time."
              iconName="bell-off"
            />
          )}

          {/* Filtered Empty State */}
          {hasNotifications && !hasFilteredNotifications && (
            <EmptyState 
              title="No Matching Notifications"
              message={`No notifications found for type: ${NOTIFICATION_TYPES.find(t => t.value === filterType)?.label}.`}
              iconName="search-off"
            />
          )}

          {/* Notifications List */}
          {hasFilteredNotifications && (
            <ul className="space-y-4">
              {filteredNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

// Mocking the NotificationItem component for completeness
const MockNotificationItem: React.FC<{
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ notification, onMarkAsRead, onDelete }) => (
  <li 
    className={`p-4 rounded-lg shadow-md transition duration-150 ease-in-out ${
      notification.read ? 'bg-white hover:bg-gray-100' : 'bg-indigo-50 hover:bg-indigo-100 border-l-4 border-indigo-500'
    }`}
  >
    <div className="flex justify-between items-start">
      <div>
        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
          notification.type === 'transaction' ? 'bg-green-100 text-green-800' :
          notification.type === 'security' ? 'bg-red-100 text-red-800' :
          notification.type === 'promotion' ? 'bg-purple-100 text-purple-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {NOTIFICATION_TYPES.find(t => t.value === notification.type)?.label}
        </span>
        <h3 className="text-lg font-semibold text-gray-900 mt-1">{notification.title}</h3>
        <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
        <p className="text-xs text-gray-400 mt-2">
          {new Date(notification.timestamp).toLocaleString()}
          {!notification.read && <span className="ml-2 text-indigo-600 font-medium"> • NEW</span>}
        </p>
      </div>
      <div className="flex space-x-2 ml-4 flex-shrink-0">
        {!notification.read && (
          <button 
            onClick={() => onMarkAsRead(notification.id)}
            className="p-2 text-indigo-600 hover:text-indigo-800 rounded-full hover:bg-indigo-100 transition"
            title="Mark as Read"
          >
            <Icon name="check" className="w-5 h-5" />
          </button>
        )}
        <button 
          onClick={() => onDelete(notification.id)}
          className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-100 transition"
          title="Delete"
        >
          <Icon name="trash" className="w-5 h-5" />
        </button>
      </div>
    </div>
  </li>
);

// Overriding the mock import with the actual mock component for a self-contained file
// In a real project, this would be a separate file.
const NotificationItem = MockNotificationItem; 

// Mocking other UI components for a self-contained file
const MockLoadingSpinner: React.FC = () => <div className="text-center text-indigo-600">Loading...</div>;
const LoadingSpinner = MockLoadingSpinner;

const MockErrorMessage: React.FC<{ message: string, onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg flex justify-between items-center">
    <span>Error: {message}</span>
    <Button onClick={onRetry} variant="primary">Retry</Button>
  </div>
);
const ErrorMessage = MockErrorMessage;

const MockEmptyState: React.FC<{ title: string, message: string, iconName: string }> = ({ title, message }) => (
  <div className="text-center p-10 bg-white rounded-lg shadow-inner mt-8">
    <Icon name="bell-off" className="w-12 h-12 mx-auto text-gray-400" />
    <h3 className="mt-2 text-lg font-medium text-gray-900">{title}</h3>
    <p className="mt-1 text-sm text-gray-500">{message}</p>
  </div>
);
const EmptyState = MockEmptyState;

const MockButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant: 'primary' | 'secondary' | 'danger' }> = ({ children, variant, className, ...props }) => (
  <button 
    className={`px-4 py-2 rounded-md font-medium transition duration-150 ease-in-out ${
      variant === 'primary' ? 'bg-indigo-600 text-white hover:bg-indigo-700' :
      variant === 'secondary' ? 'bg-white text-indigo-600 border border-indigo-600 hover:bg-indigo-50' :
      'bg-red-600 text-white hover:bg-red-700'
    } ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    {...props}
  >
    {children}
  </button>
);
const Button = MockButton;

const MockSelect: React.FC<{ id: string, value: string, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void, options: { value: string, label: string }[], label: string }> = ({ id, value, onChange, options, label }) => (
  <div className="relative">
    <label htmlFor={id} className="sr-only">{label}</label>
    <select
      id={id}
      value={value}
      onChange={onChange}
      className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </div>
);
const Select = MockSelect;

const MockIcon: React.FC<{ name: string, className: string }> = ({ name, className }) => (
  <span className={className} title={name}>
    {/* Simple text representation for mock icons */}
    {name.charAt(0).toUpperCase()}
  </span>
);
const Icon = MockIcon;

// Mocking service functions for a self-contained file
const MockAuthService = {
  getCurrentUser: () => ({ id: 'user-123', name: 'NeoUser' }),
};
const AuthService = MockAuthService;

// Mocking hooks for a self-contained file
const MockUseOfflineStatus = () => false;
const useOfflineStatus = MockUseOfflineStatus;

// --- Export Default ---
export default NotificationsScreen;
