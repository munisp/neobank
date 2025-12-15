import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// --- Configuration and Constants ---

const NOTIFICATION_HISTORY_KEY = '@NotificationHistory:';
const MAX_HISTORY_ITEMS = 100; // Limit history size due to AsyncStorage limitations

// --- TypeScript Interfaces ---

/**
 * Defines the structure for a single notification item stored in history.
 */
export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: 'transaction' | 'loan' | 'bill' | 'general';
  isRead: boolean;
  timestamp: number;
  data?: Record<string, any>;
}

/**
 * Defines the payload for a push notification received from the server.
 * This is a simplified structure, real-world payloads are more complex.
 */
export interface PushNotificationPayload {
  title: string;
  body: string;
  data: Record<string, any>;
}

/**
 * Defines the options for scheduling a local notification.
 */
export interface LocalNotificationOptions {
  title: string;
  message: string;
  date?: Date; // For scheduled notifications
  repeatType?: 'time' | 'day' | 'week' | 'month' | 'year';
  userInfo?: Record<string, any>;
}

/**
 * Defines the public interface of the Notification Service.
 */
export interface INotificationService {
  // Permission Management
  requestPermissions(): Promise<boolean>;
  checkPermissions(): Promise<boolean>;

  // Push Notification Management
  registerForPushNotifications(): Promise<string | null>; // Returns token
  onNotificationReceived(callback: (notification: PushNotificationPayload) => void): () => void;
  onNotificationOpened(callback: (notification: PushNotificationPayload) => void): () => void;

  // Local Notification Management
  scheduleLocalNotification(options: LocalNotificationOptions): Promise<string>; // Returns notification ID
  cancelLocalNotification(notificationId: string): Promise<void>;

  // History Management
  getHistory(): Promise<NotificationItem[]>;
  markAsRead(notificationId: string): Promise<void>;
  deleteNotification(notificationId: string): Promise<void>;
  clearHistory(): Promise<void>;

  // Badge Management
  getBadgeCount(): Promise<number>;
  setBadgeCount(count: number): Promise<void>;
  incrementBadgeCount(delta?: number): Promise<void>;
}

// --- Platform-Specific Implementations (Mocks/Placeholders) ---

/**
 * A simple mock for the mobile notification library (e.g., react-native-push-notification or Firebase).
 * In a real app, this would be the actual library import.
 */
const MobileNotificationManager = {
  requestPermissions: async (): Promise<boolean> => {
    console.log('Mobile: Requesting notification permissions...');
    // Mocking a successful permission request
    return true;
  },
  getToken: async (): Promise<string> => {
    console.log('Mobile: Getting push token...');
    return 'MOBILE_PUSH_TOKEN_12345';
  },
  scheduleNotification: async (options: LocalNotificationOptions): Promise<string> => {
    console.log('Mobile: Scheduling local notification:', options.title);
    return `local_id_${Date.now()}`;
  },
  cancelNotification: async (id: string): Promise<void> => {
    console.log('Mobile: Cancelling local notification:', id);
  },
  setBadge: (count: number) => {
    console.log('Mobile: Setting badge count to', count);
  },
  getBadge: async (): Promise<number> => {
    console.log('Mobile: Getting current badge count');
    return 0;
  },
  // Placeholder for event listeners
  onNotification: (callback: (notification: PushNotificationPayload) => void) => {
    console.log('Mobile: Setting up notification listener');
    // In a real app, this would return an unsubscribe function
    return () => console.log('Mobile: Unsubscribed from notification listener');
  },
};

/**
 * A simple mock for the web notification implementation.
 * In a real app, this would use standard Web Push API or Firebase Web SDK.
 */
const WebNotificationManager = {
  requestPermissions: async (): Promise<boolean> => {
    console.log('Web: Requesting notification permissions...');
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return true;
  },
  getToken: async (): Promise<string> => {
    console.log('Web: Getting push token...');
    // Web push token logic is complex and requires a service worker.
    // Mocking a successful token retrieval.
    return 'WEB_PUSH_TOKEN_67890';
  },
  scheduleNotification: async (options: LocalNotificationOptions): Promise<string> => {
    console.log('Web: Showing local notification:', options.title);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(options.title, { body: options.message });
    }
    return `local_id_${Date.now()}`;
  },
  cancelNotification: async (id: string): Promise<void> => {
    console.log('Web: Cannot cancel a displayed web notification, only dismiss/close is possible.');
  },
  setBadge: (count: number) => {
    console.log('Web: Setting badge count is not directly supported on all web platforms.');
    // Fallback to a title change or a custom UI badge update
  },
  getBadge: async (): Promise<number> => {
    return 0;
  },
  // Placeholder for event listeners
  onNotification: (callback: (notification: PushNotificationPayload) => void) => {
    console.log('Web: Setting up notification listener (via Service Worker/Custom logic)');
    return () => console.log('Web: Unsubscribed from notification listener');
  },
};

// --- Main Service Class ---

/**
 * The main Notification Service class.
 * It abstracts platform-specific logic and manages notification history using AsyncStorage.
 */
export class NotificationService implements INotificationService {
  private static instance: NotificationService;
  private platformManager: typeof MobileNotificationManager | typeof WebNotificationManager;
  private history: NotificationItem[] = [];

  private constructor() {
    // Select the appropriate platform manager
    if (Platform.OS === 'web') {
      this.platformManager = WebNotificationManager;
    } else {
      // iOS and Android
      this.platformManager = MobileNotificationManager;
    }
    this.loadHistory();
  }

  /**
   * Singleton pattern to ensure only one instance of the service exists.
   */
  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // --- Internal History Management ---

  private async loadHistory(): Promise<void> {
    try {
      const historyJson = await AsyncStorage.getItem(NOTIFICATION_HISTORY_KEY);
      if (historyJson) {
        this.history = JSON.parse(historyJson);
      }
    } catch (error) {
      console.error('Failed to load notification history from AsyncStorage:', error);
      // Fail gracefully, history remains an empty array
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      // Ensure history is trimmed to MAX_HISTORY_ITEMS
      this.history.sort((a, b) => b.timestamp - a.timestamp); // Sort by newest first
      this.history = this.history.slice(0, MAX_HISTORY_ITEMS);
      const historyJson = JSON.stringify(this.history);
      await AsyncStorage.setItem(NOTIFICATION_HISTORY_KEY, historyJson);
    } catch (error) {
      console.error('Failed to save notification history to AsyncStorage:', error);
      // Log error but continue
    }
  }

  private async addNotificationToHistory(payload: PushNotificationPayload, type: NotificationItem['type'] = 'general'): Promise<void> {
    const newNotification: NotificationItem = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      title: payload.title,
      body: payload.body,
      type: type,
      isRead: false,
      timestamp: Date.now(),
      data: payload.data,
    };

    this.history.unshift(newNotification); // Add to the beginning
    await this.saveHistory();
  }

  // --- Public Methods Implementation ---

  /**
   * Requests notification permissions from the user.
   * @returns A promise that resolves to true if permission is granted, false otherwise.
   */
  public async requestPermissions(): Promise<boolean> {
    try {
      return await this.platformManager.requestPermissions();
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Checks the current notification permission status.
   * NOTE: The implementation here is simplified and assumes the requestPermissions result.
   * A real implementation would check the native/web API status.
   * @returns A promise that resolves to true if permission is granted, false otherwise.
   */
  public async checkPermissions(): Promise<boolean> {
    // For a real app, this would check the native/web API status directly
    return this.requestPermissions(); // Simple fallback
  }

  /**
   * Registers the device for push notifications and returns the push token.
   * @returns A promise that resolves to the push token string or null on failure.
   */
  public async registerForPushNotifications(): Promise<string | null> {
    try {
      const granted = await this.requestPermissions();
      if (granted) {
        return await this.platformManager.getToken();
      }
      return null;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  }

  /**
   * Sets up a listener for incoming push notifications.
   * @param callback The function to call when a notification is received.
   * @returns An unsubscribe function.
   */
  public onNotificationReceived(callback: (notification: PushNotificationPayload) => void): () => void {
    // This is a placeholder. Real implementation would differentiate between
    // foreground (received) and background/quit (opened) notifications.
    const unsubscribe = this.platformManager.onNotification((payload) => {
      // Automatically add received notifications to history
      const type = payload.data?.notificationType as NotificationItem['type'] || 'general';
      this.addNotificationToHistory(payload, type);
      callback(payload);
    });
    return unsubscribe;
  }

  /**
   * Sets up a listener for when a notification is opened by the user.
   * NOTE: In this simplified mock, it uses the same listener as onNotificationReceived.
   * A real implementation would use a dedicated 'onNotificationOpened' listener.
   * @param callback The function to call when a notification is opened.
   * @returns An unsubscribe function.
   */
  public onNotificationOpened(callback: (notification: PushNotificationPayload) => void): () => void {
    // In a real app, this would be a separate listener for when the app is opened via a notification
    return this.platformManager.onNotification(callback);
  }

  /**
   * Schedules a local notification.
   * @param options The options for the local notification.
   * @returns A promise that resolves to the notification ID.
   */
  public async scheduleLocalNotification(options: LocalNotificationOptions): Promise<string> {
    try {
      const id = await this.platformManager.scheduleNotification(options);
      // Local notifications are typically not added to history unless explicitly requested
      return id;
    } catch (error) {
      console.error('Error scheduling local notification:', error);
      throw new Error('Failed to schedule local notification.');
    }
  }

  /**
   * Cancels a scheduled local notification.
   * @param notificationId The ID of the notification to cancel.
   */
  public async cancelLocalNotification(notificationId: string): Promise<void> {
    try {
      await this.platformManager.cancelNotification(notificationId);
    } catch (error) {
      console.error(`Error cancelling local notification ${notificationId}:`, error);
      // Fail gracefully
    }
  }

  /**
   * Retrieves the notification history.
   * @returns A promise that resolves to an array of NotificationItem.
   */
  public async getHistory(): Promise<NotificationItem[]> {
    // Ensure history is loaded before returning
    if (this.history.length === 0) {
      await this.loadHistory();
    }
    return this.history;
  }

  /**
   * Marks a notification in the history as read.
   * @param notificationId The ID of the notification to mark as read.
   */
  public async markAsRead(notificationId: string): Promise<void> {
    const notification = this.history.find(n => n.id === notificationId);
    if (notification && !notification.isRead) {
      notification.isRead = true;
      await this.saveHistory();
      // Optionally, decrement badge count if the notification was unread
      this.decrementBadgeCount();
    }
  }

  /**
   * Deletes a notification from the history.
   * @param notificationId The ID of the notification to delete.
   */
  public async deleteNotification(notificationId: string): Promise<void> {
    const initialLength = this.history.length;
    this.history = this.history.filter(n => n.id !== notificationId);
    if (this.history.length < initialLength) {
      await this.saveHistory();
    }
  }

  /**
   * Clears the entire notification history.
   */
  public async clearHistory(): Promise<void> {
    this.history = [];
    try {
      await AsyncStorage.removeItem(NOTIFICATION_HISTORY_KEY);
    } catch (error) {
      console.error('Error clearing notification history:', error);
    }
  }

  /**
   * Retrieves the current badge count.
   * @returns A promise that resolves to the current badge count.
   */
  public async getBadgeCount(): Promise<number> {
    try {
      return await this.platformManager.getBadge();
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }

  /**
   * Sets the application badge count.
   * @param count The new badge count.
   */
  public async setBadgeCount(count: number): Promise<void> {
    try {
      this.platformManager.setBadge(count);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }

  /**
   * Increments the application badge count.
   * @param delta The amount to increment by (defaults to 1).
   */
  public async incrementBadgeCount(delta: number = 1): Promise<void> {
    try {
      const currentCount = await this.getBadgeCount();
      this.platformManager.setBadge(currentCount + delta);
    } catch (error) {
      console.error('Error incrementing badge count:', error);
    }
  }

  /**
   * Decrements the application badge count by 1, ensuring it doesn't go below zero.
   */
  private async decrementBadgeCount(): Promise<void> {
    try {
      const currentCount = await this.getBadgeCount();
      if (currentCount > 0) {
        this.platformManager.setBadge(currentCount - 1);
      }
    } catch (error) {
      console.error('Error decrementing badge count:', error);
    }
  }
}

// Export a singleton instance for easy access
export const notificationService = NotificationService.getInstance();

// NOTE ON IMPLEMENTATION:
// The MobileNotificationManager and WebNotificationManager are MOCKS.
// In a real-world application, you would replace these with actual imports and
// implementations using libraries like:
// - Mobile: @react-native-firebase/messaging and react-native-push-notification
// - Web: Firebase Web SDK and standard Web Push API
// The abstraction layer provided by this service class allows for easy swapping
// of the underlying platform-specific implementations.
// AsyncStorage is used for history as requested, but a warning is included
// about the MAX_HISTORY_ITEMS limit due to potential performance issues with
// large data sets in AsyncStorage.
