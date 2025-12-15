import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- MOCK SERVICES AND TYPES ---

// 1. Types
export type NotificationType = 'TRANSACTION' | 'SYSTEM' | 'PROMOTION' | 'SECURITY';

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  createdAt: Date;
  isRead: boolean;
}

// 2. Mock Data
const mockNotifications: Notification[] = [
  { id: '1', title: 'Deposit Successful', body: 'Your deposit of $500 has been credited.', type: 'TRANSACTION', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), isRead: false },
  { id: '2', title: 'System Update', body: 'Scheduled maintenance tonight at 2 AM.', type: 'SYSTEM', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), isRead: false },
  { id: '3', title: 'New Offer!', body: 'Get 5% cashback on all online purchases this month.', type: 'PROMOTION', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48), isRead: true },
  { id: '4', title: 'Login Alert', body: 'New login detected from an unrecognized device.', type: 'SECURITY', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72), isRead: false },
  { id: '5', title: 'Withdrawal Processed', body: 'Your withdrawal of $100 is complete.', type: 'TRANSACTION', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 96), isRead: true },
  { id: '6', title: 'Password Change', body: 'Your password was successfully changed.', type: 'SECURITY', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 120), isRead: false },
];

// 3. Mock NotificationService (simulating src/services/NotificationService)
class MockNotificationService {
  private notifications: Notification[] = [...mockNotifications];

  private delay(ms: number = 500): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchNotifications(): Promise<Notification[]> {
    await this.delay();
    // Sort by date descending
    return this.notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async markAsRead(id: string): Promise<void> {
    await this.delay(200);
    const index = this.notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      this.notifications[index].isRead = true;
    }
  }

  async deleteNotification(id: string): Promise<void> {
    await this.delay(200);
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  async markAllAsRead(): Promise<void> {
    await this.delay(500);
    this.notifications = this.notifications.map(n => ({ ...n, isRead: true }));
  }

  async deleteAllNotifications(): Promise<void> {
    await this.delay(500);
    this.notifications = [];
  }
}

const notificationService = new MockNotificationService();

// --- COMPONENTS ---

interface NotificationCardProps {
  item: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}

const NotificationCard: React.FC<NotificationCardProps> = React.memo(({ item, onMarkRead, onDelete }) => {
  const timeAgo = useMemo(() => {
    const diff = Date.now() - item.createdAt.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }, [item.createdAt]);

  const cardStyle = item.isRead ? styles.cardRead : styles.cardUnread;
  const typeColor = {
    TRANSACTION: '#4CAF50',
    SYSTEM: '#2196F3',
    PROMOTION: '#FF9800',
    SECURITY: '#F44336',
  }[item.type];

  return (
    <View style={[styles.card, cardStyle]}>
      <View style={[styles.typeIndicator, { backgroundColor: typeColor }]} />
      <View style={styles.contentContainer}>
        <View style={styles.headerContainer}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.timeAgo}>{timeAgo}</Text>
        </View>
        <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
        <View style={styles.actionsContainer}>
          {!item.isRead && (
            <TouchableOpacity style={styles.actionButton} onPress={() => onMarkRead(item.id)}>
              <Text style={styles.actionText}>Mark Read</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => onDelete(item.id)}>
            <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

// --- SCREEN IMPLEMENTATION ---

type FilterType = NotificationType | 'ALL';
const FILTER_OPTIONS: FilterType[] = ['ALL', 'TRANSACTION', 'SYSTEM', 'PROMOTION', 'SECURITY'];

export const NotificationsScreen: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [isProcessing, setIsProcessing] = useState(false); // For bulk actions

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await notificationService.fetchNotifications();
      setNotifications(data);
    } catch (err) {
      setError('Failed to load notifications.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'ALL') {
      return notifications;
    }
    return notifications.filter(n => n.type === filter);
  }, [notifications, filter]);

  const handleMarkRead = useCallback(async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      Alert.alert('Error', 'Could not mark notification as read.');
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await notificationService.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      Alert.alert('Error', 'Could not delete notification.');
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    if (notifications.every(n => n.isRead)) return;

    setIsProcessing(true);
    try {
      await notificationService.markAllAsRead();
      // Re-fetch to ensure state is synchronized, or optimistically update
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      Alert.alert('Error', 'Could not mark all notifications as read.');
    } finally {
      setIsProcessing(false);
    }
  }, [notifications]);

  const handleDeleteAll = useCallback(async () => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete all notifications? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await notificationService.deleteAllNotifications();
              setNotifications([]);
            } catch (err) {
              Alert.alert('Error', 'Could not delete all notifications.');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  }, []);

  const renderFilterButton = (type: FilterType) => (
    <TouchableOpacity
      key={type}
      style={[styles.filterButton, filter === type && styles.filterButtonActive]}
      onPress={() => setFilter(type)}
      disabled={loading || isProcessing}
    >
      <Text style={[styles.filterText, filter === type && styles.filterTextActive]}>
        {type.charAt(0) + type.slice(1).toLowerCase()}
      </Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: Notification }) => (
    <NotificationCard
      item={item}
      onMarkRead={handleMarkRead}
      onDelete={handleDelete}
    />
  );

  const ListEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        {loading ? 'Loading...' : 'No notifications found.'}
      </Text>
      {!loading && (
        <TouchableOpacity style={styles.retryButton} onPress={fetchNotifications}>
          <Text style={styles.retryText}>Refresh</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.screenTitle}>Notifications</Text>

        {/* Filter Bar */}
        <View style={styles.filterBar}>
          <FlatList
            data={FILTER_OPTIONS}
            renderItem={({ item }) => renderFilterButton(item)}
            keyExtractor={(item) => item}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterListContent}
          />
        </View>

        {/* Bulk Actions */}
        <View style={styles.bulkActionsContainer}>
          <TouchableOpacity
            style={styles.bulkActionButton}
            onPress={handleMarkAllRead}
            disabled={isProcessing || notifications.every(n => n.isRead)}
          >
            <Text style={styles.bulkActionText}>Mark All Read</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkActionButton, styles.bulkDeleteButton]}
            onPress={handleDeleteAll}
            disabled={isProcessing || notifications.length === 0}
          >
            <Text style={styles.bulkActionText}>Delete All</Text>
          </TouchableOpacity>
          {isProcessing && <ActivityIndicator size="small" color="#007AFF" style={styles.processingIndicator} />}
        </View>

        {/* Loading and Error States */}
        {loading && notifications.length === 0 && (
          <View style={styles.fullScreenCenter}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Fetching notifications...</Text>
          </View>
        )}

        {error && (
          <View style={styles.fullScreenCenter}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchNotifications}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Notification List */}
        {!loading && !error && (
          <FlatList
            data={filteredNotifications}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={ListEmptyComponent}
            onRefresh={fetchNotifications}
            refreshing={loading}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

// --- STYLES ---

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  container: {
    flex: 1,
    paddingHorizontal: 15,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E3A8A', // NeoBank Primary Color
    marginVertical: 15,
  },
  // Filter Bar Styles
  filterBar: {
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  filterListContent: {
    paddingVertical: 5,
  },
  filterButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#E0E7FF', // Light Blue/Gray
  },
  filterButtonActive: {
    backgroundColor: '#1E3A8A', // Primary Color
  },
  filterText: {
    color: '#1E3A8A',
    fontWeight: '600',
    fontSize: 14,
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  // Bulk Actions Styles
  bulkActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  bulkActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#D1FAE5', // Light Green
    marginRight: 10,
  },
  bulkActionText: {
    color: '#065F46', // Dark Green
    fontWeight: '600',
    fontSize: 13,
  },
  bulkDeleteButton: {
    backgroundColor: '#FEE2E2', // Light Red
  },
  bulkDeleteText: {
    color: '#991B1B', // Dark Red
  },
  processingIndicator: {
    marginLeft: 10,
  },
  // List Styles
  listContent: {
    paddingBottom: 20,
  },
  // Card Styles
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardUnread: {
    borderLeftWidth: 5,
    borderLeftColor: '#1E3A8A',
  },
  cardRead: {
    opacity: 0.7,
    borderLeftWidth: 5,
    borderLeftColor: '#E0E0E0',
  },
  typeIndicator: {
    width: 5,
    height: '100%',
    marginRight: 10,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  contentContainer: {
    flex: 1,
    marginLeft: 5,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    flexShrink: 1,
  },
  timeAgo: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 10,
  },
  body: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 10,
  },
  actionsContainer: {
    flexDirection: 'row',
    marginTop: 5,
  },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: '#E0E7FF',
    marginRight: 10,
  },
  actionText: {
    color: '#1E3A8A',
    fontWeight: '600',
    fontSize: 12,
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
  },
  deleteText: {
    color: '#991B1B',
  },
  // Empty and Error States
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 15,
  },
  fullScreenCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#4B5563',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    marginBottom: 15,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1E3A8A',
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});

export default NotificationsScreen;