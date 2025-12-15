import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from './ApiService';

export interface NotificationPreferences {
  transactions: boolean;
  bills: boolean;
  budgetAlerts: boolean;
  securityAlerts: boolean;
  promotions: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:MM format
  quietHoursEnd: string; // HH:MM format
}

export interface SmartNotification {
  id: string;
  title: string;
  body: string;
  data?: any;
  priority: 'low' | 'normal' | 'high' | 'critical';
  category: 'transaction' | 'bill' | 'budget' | 'security' | 'promotion' | 'general';
  actionable: boolean;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  title: string;
  action: string;
  params?: any;
}

class SmartNotificationsService {
  private expoPushToken: string | null = null;
  private preferences: NotificationPreferences = {
    transactions: true,
    bills: true,
    budgetAlerts: true,
    securityAlerts: true,
    promotions: false,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
  };

  constructor() {
    this.initializeNotifications();
  }

  private async initializeNotifications() {
    // Configure notification handler
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const category = notification.request.content.data?.category || 'general';
        const priority = notification.request.content.data?.priority || 'normal';

        // Check quiet hours
        if (this.isQuietHours() && priority !== 'critical') {
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: true,
          };
        }

        // Check category preferences
        if (!this.isCategoryEnabled(category)) {
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: true,
          };
        }

        return {
          shouldShowAlert: true,
          shouldPlaySound: priority === 'high' || priority === 'critical',
          shouldSetBadge: true,
          priority: priority === 'critical' ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
        };
      },
    });

    // Load preferences
    await this.loadPreferences();

    // Register for push notifications
    await this.registerForPushNotifications();

    // Set up notification categories with actions
    await this.setupNotificationCategories();
  }

  private async setupNotificationCategories() {
    if (Platform.OS === 'ios') {
      await Notifications.setNotificationCategoryAsync('transaction', [
        {
          identifier: 'view',
          buttonTitle: 'View Details',
          options: { opensAppToForeground: true },
        },
        {
          identifier: 'dismiss',
          buttonTitle: 'Dismiss',
          options: { opensAppToForeground: false },
        },
      ]);

      await Notifications.setNotificationCategoryAsync('bill', [
        {
          identifier: 'pay_now',
          buttonTitle: 'Pay Now',
          options: { opensAppToForeground: true },
        },
        {
          identifier: 'remind_later',
          buttonTitle: 'Remind Later',
          options: { opensAppToForeground: false },
        },
      ]);

      await Notifications.setNotificationCategoryAsync('budget', [
        {
          identifier: 'view_budget',
          buttonTitle: 'View Budget',
          options: { opensAppToForeground: true },
        },
      ]);

      await Notifications.setNotificationCategoryAsync('security', [
        {
          identifier: 'review',
          buttonTitle: 'Review',
          options: { opensAppToForeground: true },
        },
        {
          identifier: 'not_me',
          buttonTitle: 'Not Me',
          options: { opensAppToForeground: true, isDestructive: true },
        },
      ]);
    }
  }

  private async registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Push notifications only work on physical devices');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push notification permissions');
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    this.expoPushToken = token;

    // Send token to backend
    try {
      await ApiService.post('/notifications/register', { token });
    } catch (error) {
      console.error('Error registering push token:', error);
    }

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2196f3',
      });

      Notifications.setNotificationChannelAsync('transactions', {
        name: 'Transactions',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4caf50',
      });

      Notifications.setNotificationChannelAsync('security', {
        name: 'Security Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#f44336',
      });
    }

    return token;
  }

  async scheduleSmartNotification(notification: SmartNotification): Promise<string> {
    // Check if notification should be sent based on preferences
    if (!this.isCategoryEnabled(notification.category)) {
      console.log('Notification category disabled:', notification.category);
      return '';
    }

    // Check quiet hours for non-critical notifications
    if (this.isQuietHours() && notification.priority !== 'critical') {
      // Schedule for after quiet hours
      const trigger = this.calculateNextAvailableTime();
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data,
          categoryIdentifier: notification.category,
          priority: this.mapPriorityToAndroid(notification.priority),
        },
        trigger,
      });
    }

    // Send immediately
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        data: notification.data,
        categoryIdentifier: notification.category,
        priority: this.mapPriorityToAndroid(notification.priority),
      },
      trigger: null,
    });
  }

  private mapPriorityToAndroid(priority: string): Notifications.AndroidNotificationPriority {
    switch (priority) {
      case 'critical':
        return Notifications.AndroidNotificationPriority.MAX;
      case 'high':
        return Notifications.AndroidNotificationPriority.HIGH;
      case 'normal':
        return Notifications.AndroidNotificationPriority.DEFAULT;
      case 'low':
        return Notifications.AndroidNotificationPriority.LOW;
      default:
        return Notifications.AndroidNotificationPriority.DEFAULT;
    }
  }

  private isQuietHours(): boolean {
    if (!this.preferences.quietHoursEnabled) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const { quietHoursStart, quietHoursEnd } = this.preferences;

    if (quietHoursStart < quietHoursEnd) {
      return currentTime >= quietHoursStart && currentTime < quietHoursEnd;
    } else {
      // Quiet hours span midnight
      return currentTime >= quietHoursStart || currentTime < quietHoursEnd;
    }
  }

  private calculateNextAvailableTime(): Date {
    const now = new Date();
    const [endHour, endMinute] = this.preferences.quietHoursEnd.split(':').map(Number);
    
    const nextAvailable = new Date(now);
    nextAvailable.setHours(endHour, endMinute, 0, 0);

    if (nextAvailable <= now) {
      nextAvailable.setDate(nextAvailable.getDate() + 1);
    }

    return nextAvailable;
  }

  private isCategoryEnabled(category: string): boolean {
    switch (category) {
      case 'transaction':
        return this.preferences.transactions;
      case 'bill':
        return this.preferences.bills;
      case 'budget':
        return this.preferences.budgetAlerts;
      case 'security':
        return this.preferences.securityAlerts;
      case 'promotion':
        return this.preferences.promotions;
      default:
        return true;
    }
  }

  async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...preferences };
    await AsyncStorage.setItem('notification_preferences', JSON.stringify(this.preferences));

    // Sync with backend
    try {
      await ApiService.post('/notifications/preferences', this.preferences);
    } catch (error) {
      console.error('Error updating notification preferences:', error);
    }
  }

  async loadPreferences(): Promise<NotificationPreferences> {
    try {
      const stored = await AsyncStorage.getItem('notification_preferences');
      if (stored) {
        this.preferences = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading notification preferences:', error);
    }
    return this.preferences;
  }

  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }

  getPushToken(): string | null {
    return this.expoPushToken;
  }
}

export default new SmartNotificationsService();

