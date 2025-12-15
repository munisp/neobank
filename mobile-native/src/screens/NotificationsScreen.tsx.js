import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';

// --- Type Definitions ---

/**
 * Defines the structure of a single notification item.
 */
interface Notification {
  id: string;
  title: string;
  body: string;
  timestamp: string; // ISO 8601 string
  isRead: boolean;
  type: 'info' | 'warning' | 'success' | 'promotion';
  link?: string; // Optional deep link or URL
}

/**
 * Defines the props for the NotificationsScreen component.
 * Assuming a simple stack navigator setup.
 */
type RootStackParamList = {
  Notifications: undefined;
  NotificationDetail: { notificationId: string };
  // Add other screen types as needed
};

type NotificationsScreenProps = StackScreenProps<RootStackParamList, 'Notifications'>;

// --- Mock API Service ---

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    title: 'New Feature Alert',
    body: 'Check out our new dark mode feature!',
    timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    isRead: false,
    type: 'success',
    link: '/settings/appearance',
  },
  {
    id: '2',
    title: 'System Maintenance',
    body: 'Scheduled maintenance tonight at 2:00 AM UTC.',
    timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    isRead: true,
    type: 'warning',
  },
  {
    id: '3',
    title: 'Your order has shipped!',
    body: 'Order #12345 is on its way. Track it now.',
    timestamp: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    isRead: false,
    type: 'info',
    link: '/orders/12345',
  },
  {
    id: '4',
    title: 'Limited Time Offer',
    body: 'Get 20% off all premium plans this week.',
    timestamp: new Date(Date.now() - 604800000).toISOString(), // 7 days ago
    isRead: true,
    type: 'promotion',
  },
];

/**
 * Mock implementation of an ApiService for notifications.
 * In a real app, this would be a class with actual network calls.
 */
const ApiService = {
  /**
   * Fetches a list of notifications. Supports pagination and refresh.
   * @param page The page number to fetch.
   * @returns A promise that resolves to an array of notifications.
   */
  fetchNotifications: (page: number = 1): Promise<Notification[]> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() < 0.05) { // Simulate a 5% chance of failure
          reject(new Error('Failed to fetch notifications. Please try again.'));
          return;
        }
        
        // Simple mock pagination: return the same list for all pages > 1
        const data = page === 1 ? MOCK_NOTIFICATIONS : [];
        resolve(data);
      }, 1000); // Simulate network delay
    });
  },

  /**
   * Marks a specific notification as read.
   * @param id The ID of the notification to mark as read.
   */
  markAsRead: (id: string): Promise<void> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        // In a real app, this would update the backend
        console.log(`Notification ${id} marked as read on server.`);
        resolve();
      }, 300);
    });
  },

  /**
   * Marks all notifications as read.
   */
  markAllAsRead: (): Promise<void> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        // In a real app, this would update the backend
        console.log('All notifications marked as read on server.');
        resolve();
      }, 500);
    });
  },
};

// --- Utility Functions ---

/**
 * Formats an ISO timestamp into a human-readable relative time string.
 * @param timestamp The ISO 8601 timestamp string.
 */
const formatTime = (timestamp: string): string => {
  const now = new Date();
  const date = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  
  return date.toLocaleDateString();
};

// --- Component: NotificationItem ---

interface NotificationItemProps {
  item: Notification;
  onPress: (item: Notification) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ item, onPress }) => {
  const backgroundColor = item.isRead ? styles.readBackground : styles.unreadBackground;
  const dotColor = item.isRead ? 'transparent' : styles.unreadDot.backgroundColor;

  return (
    <TouchableOpacity 
      style={[styles.itemContainer, backgroundColor]} 
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.unreadDot, { backgroundColor: dotColor }]} />
      <View style={styles.textContainer}>
        <Text style={[styles.title, item.isRead && styles.readTitle]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.timestamp}>{formatTime(item.timestamp)}</Text>
      </View>
    </TouchableOpacity>
  );
};

// --- Main Component: NotificationsScreen ---

const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ navigation }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State to track if there are more notifications to load (for infinite scroll)
  const [hasMore, setHasMore] = useState(true); 
  const [page, setPage] = useState(1);

  /**
   * Fetches notifications from the API service.
   * @param refresh If true, resets the list and fetches the first page.
   */
  const fetchNotifications = useCallback(async (refresh: boolean = false) => {
    if (refresh) {
      setIsRefreshing(true);
      setPage(1);
      setHasMore(true);
    } else if (!hasMore) {
      return; // Stop if no more data is available
    }

    const currentPage = refresh ? 1 : page;
    
    try {
      const data = await ApiService.fetchNotifications(currentPage);
      
      if (refresh) {
        setNotifications(data);
      } else {
        // Append new data for infinite scroll
        setNotifications(prev => [...prev, ...data]);
      }

      // If the mock returns less than a full page (or 0), assume no more data
      if (data.length === 0 && currentPage > 1) {
        setHasMore(false);
      } else if (data.length === 0 && currentPage === 1) {
        // Handle case where there are no notifications at all
        setHasMore(false);
      }
      
      setError(null);
    } catch (err) {
      // Proper error handling
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [page, hasMore]);

  // Initial load effect
  useEffect(() => {
    fetchNotifications(true);
  }, [fetchNotifications]);

  /**
   * Handles the action when a notification item is pressed.
   * This mimics PWA behavior: mark as read and navigate/perform action.
   */
  const handleNotificationPress = async (item: Notification) => {
    // 1. Mark as read locally for immediate UI update
    setNotifications(prev => 
      prev.map(n => n.id === item.id ? { ...n, isRead: true } : n)
    );

    // 2. Mark as read on the server (non-blocking)
    try {
      await ApiService.markAsRead(item.id);
    } catch (e) {
      // Log error but don't block the user
      console.error('Failed to mark as read on server:', e);
    }

    // 3. Navigate or perform action based on the link
    if (item.link) {
      // In a real app, this would use navigation.navigate or Linking.openURL
      Alert.alert(
        'Action Triggered', 
        `Navigating to: ${item.link}\n(In a real app, this would navigate to a detail screen or open a deep link.)`
      );
      // Example navigation to a detail screen:
      // navigation.navigate('NotificationDetail', { notificationId: item.id });
    }
  };

  /**
   * Marks all currently displayed unread notifications as read.
   */
  const handleMarkAllAsRead = async () => {
    const unreadCount = notifications.filter(n => !n.isRead).length;
    if (unreadCount === 0) {
      Alert.alert('No Unread Notifications', 'All notifications are already marked as read.');
      return;
    }

    // 1. Mark all as read locally
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));

    // 2. Mark all as read on the server
    try {
      await ApiService.markAllAsRead();
      Alert.alert('Success', `${unreadCount} notifications marked as read.`);
    } catch (e) {
      // Revert local state if server call fails (optional, but good practice)
      // For simplicity, we'll just show an error and rely on refresh to sync.
      Alert.alert('Error', 'Failed to mark all as read on the server.');
      console.error('Mark all as read error:', e);
    }
  };

  /**
   * Handles the end of list reached for infinite scrolling.
   */
  const handleLoadMore = () => {
    if (!isLoading && hasMore && !isRefreshing) {
      // Increment page number and trigger a new fetch
      setPage(prev => prev + 1);
      // The fetch will be triggered by the page state change in the useEffect below
    }
  };

  // Effect to trigger fetch when page state changes (for load more)
  useEffect(() => {
    if (page > 1) {
      fetchNotifications(false);
    }
  }, [page, fetchNotifications]);


  // --- Render Logic ---

  const renderItem = ({ item }: { item: Notification }) => (
    <NotificationItem item={item} onPress={handleNotificationPress} />
  );

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>You're all caught up!</Text>
      <Text style={styles.emptySubText}>No new notifications at this time.</Text>
    </View>
  );

  const renderFooter = () => {
    if (!isLoading && !isRefreshing) return null;
    if (!hasMore && notifications.length > 0) return (
      <View style={styles.footerContainer}>
        <Text style={styles.footerText}>— End of List —</Text>
      </View>
    );
    
    return (
      <View style={styles.footerContainer}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  };

  if (isLoading && notifications.length === 0 && !error) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  if (error && notifications.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchNotifications(true)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <View style={styles.screenContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity 
          onPress={handleMarkAllAsRead} 
          style={styles.markAllButton}
          disabled={unreadCount === 0}
        >
          <Text style={[styles.markAllText, unreadCount === 0 && styles.disabledText]}>
            Mark All Read
          </Text>
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={notifications.length === 0 ? styles.listEmpty : undefined}
        ListEmptyComponent={renderEmptyList}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchNotifications(true)}
            tintColor="#007AFF"
          />
        }
      />
    </View>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5', // Light background for the whole screen
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  markAllButton: {
    padding: 5,
  },
  markAllText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledText: {
    color: '#A0A0A0',
  },
  itemContainer: {
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: 'white',
  },
  unreadBackground: {
    backgroundColor: '#E6F0FF', // Light blue for unread
  },
  readBackground: {
    backgroundColor: 'white',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF', // Blue dot for unread
    marginRight: 10,
    marginTop: 5,
    flexShrink: 0,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  readTitle: {
    fontWeight: 'normal',
    color: '#666',
  },
  body: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  listEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 50,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 5,
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
  },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    color: '#999',
    fontSize: 14,
  }
});

export default NotificationsScreen;