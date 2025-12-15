// Note: Would need: npm install @react-native-firebase/app @react-native-firebase/messaging
// import messaging from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface NotificationData {
  id: string;
  title: string;
  body: string;
  data?: any;
  timestamp: number;
  read: boolean;
}

class NotificationService {
  private static instance: NotificationService;
  private fcmToken: string | null = null;
  private readonly STORAGE_KEY = '@neobank:fcm_token';
  private readonly NOTIFICATIONS_KEY = '@neobank:notifications';

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // Initialize push notifications
  public async initialize() {
    try {
      // Request permission
      const hasPermission = await this.requestPermission();
      
      if (!hasPermission) {
        console.log('Notification permission denied');
        return;
      }

      // Get FCM token
      await this.getFCMToken();

      // Set up message handlers
      this.setupMessageHandlers();

      console.log('Push notifications initialized');
    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
    }
  }

  // Request notification permission
  private async requestPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
        return true; // Android < 13 doesn't require permission
      } else {
        // iOS permission request
        // const authStatus = await messaging().requestPermission();
        // return authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        //        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
        return true; // Simulated
      }
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  }

  // Get FCM token
  private async getFCMToken() {
    try {
      // Check if token is cached
      const cachedToken = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (cachedToken) {
        this.fcmToken = cachedToken;
        return cachedToken;
      }

      // Get new token
      // const token = await messaging().getToken();
      const token = 'SIMULATED_FCM_TOKEN_' + Date.now(); // Simulated
      
      this.fcmToken = token;
      await AsyncStorage.setItem(this.STORAGE_KEY, token);

      // Send token to backend
      await this.sendTokenToBackend(token);

      return token;
    } catch (error) {
      console.error('Failed to get FCM token:', error);
      return null;
    }
  }

  // Send token to backend
  private async sendTokenToBackend(token: string) {
    try {
      // await apiService.registerPushToken({ token, platform: Platform.OS });
      console.log('FCM token sent to backend:', token);
    } catch (error) {
      console.error('Failed to send token to backend:', error);
    }
  }

  // Set up message handlers
  private setupMessageHandlers() {
    // Foreground messages
    // messaging().onMessage(async (remoteMessage) => {
    //   console.log('Foreground message:', remoteMessage);
    //   this.handleForegroundMessage(remoteMessage);
    // });

    // Background messages
    // messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    //   console.log('Background message:', remoteMessage);
    //   this.handleBackgroundMessage(remoteMessage);
    // });

    // Notification opened (app was in background)
    // messaging().onNotificationOpenedApp((remoteMessage) => {
    //   console.log('Notification opened app:', remoteMessage);
    //   this.handleNotificationOpen(remoteMessage);
    // });

    // Notification opened (app was quit)
    // messaging()
    //   .getInitialNotification()
    //   .then((remoteMessage) => {
    //     if (remoteMessage) {
    //       console.log('App opened from quit state:', remoteMessage);
    //       this.handleNotificationOpen(remoteMessage);
    //     }
    //   });

    // Token refresh
    // messaging().onTokenRefresh(async (token) => {
    //   console.log('Token refreshed:', token);
    //   this.fcmToken = token;
    //   await AsyncStorage.setItem(this.STORAGE_KEY, token);
    //   await this.sendTokenToBackend(token);
    // });
  }

  // Handle foreground message
  private async handleForegroundMessage(remoteMessage: any) {
    const notification: NotificationData = {
      id: remoteMessage.messageId,
      title: remoteMessage.notification?.title || 'New Notification',
      body: remoteMessage.notification?.body || '',
      data: remoteMessage.data,
      timestamp: Date.now(),
      read: false,
    };

    // Save notification
    await this.saveNotification(notification);

    // Show alert
    Alert.alert(
      notification.title,
      notification.body,
      [
        { text: 'Dismiss', style: 'cancel' },
        { text: 'View', onPress: () => this.handleNotificationOpen(remoteMessage) },
      ]
    );
  }

  // Handle background message
  private async handleBackgroundMessage(remoteMessage: any) {
    const notification: NotificationData = {
      id: remoteMessage.messageId,
      title: remoteMessage.notification?.title || 'New Notification',
      body: remoteMessage.notification?.body || '',
      data: remoteMessage.data,
      timestamp: Date.now(),
      read: false,
    };

    await this.saveNotification(notification);
  }

  // Handle notification open
  private handleNotificationOpen(remoteMessage: any) {
    const data = remoteMessage.data;

    // Navigate based on notification type
    if (data?.type === 'transaction') {
      // Navigate to transactions screen
      console.log('Navigate to transaction:', data.transactionId);
    } else if (data?.type === 'loan') {
      // Navigate to loan details
      console.log('Navigate to loan:', data.loanId);
    } else if (data?.type === 'credit_score') {
      // Navigate to credit score
      console.log('Navigate to credit score');
    }
  }

  // Save notification to local storage
  private async saveNotification(notification: NotificationData) {
    try {
      const notifications = await this.getNotifications();
      notifications.unshift(notification);

      // Keep only last 100 notifications
      const trimmed = notifications.slice(0, 100);

      await AsyncStorage.setItem(
        this.NOTIFICATIONS_KEY,
        JSON.stringify(trimmed)
      );
    } catch (error) {
      console.error('Failed to save notification:', error);
    }
  }

  // Get all notifications
  public async getNotifications(): Promise<NotificationData[]> {
    try {
      const data = await AsyncStorage.getItem(this.NOTIFICATIONS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get notifications:', error);
      return [];
    }
  }

  // Mark notification as read
  public async markAsRead(notificationId: string) {
    try {
      const notifications = await this.getNotifications();
      const updated = notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n
      );
      await AsyncStorage.setItem(
        this.NOTIFICATIONS_KEY,
        JSON.stringify(updated)
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  // Mark all notifications as read
  public async markAllAsRead() {
    try {
      const notifications = await this.getNotifications();
      const updated = notifications.map((n) => ({ ...n, read: true }));
      await AsyncStorage.setItem(
        this.NOTIFICATIONS_KEY,
        JSON.stringify(updated)
      );
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }

  // Get unread count
  public async getUnreadCount(): Promise<number> {
    try {
      const notifications = await this.getNotifications();
      return notifications.filter((n) => !n.read).length;
    } catch (error) {
      console.error('Failed to get unread count:', error);
      return 0;
    }
  }

  // Clear all notifications
  public async clearAll() {
    try {
      await AsyncStorage.removeItem(this.NOTIFICATIONS_KEY);
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  }

  // Send local notification (for testing)
  public async sendLocalNotification(title: string, body: string, data?: any) {
    const notification: NotificationData = {
      id: `local_${Date.now()}`,
      title,
      body,
      data,
      timestamp: Date.now(),
      read: false,
    };

    await this.saveNotification(notification);

    Alert.alert(title, body);
  }

  // Get FCM token
  public getToken(): string | null {
    return this.fcmToken;
  }

  // Subscribe to topic
  public async subscribeToTopic(topic: string) {
    try {
      // await messaging().subscribeToTopic(topic);
      console.log(`Subscribed to topic: ${topic}`);
    } catch (error) {
      console.error(`Failed to subscribe to topic ${topic}:`, error);
    }
  }

  // Unsubscribe from topic
  public async unsubscribeFromTopic(topic: string) {
    try {
      // await messaging().unsubscribeFromTopic(topic);
      console.log(`Unsubscribed from topic: ${topic}`);
    } catch (error) {
      console.error(`Failed to unsubscribe from topic ${topic}:`, error);
    }
  }
}

export default NotificationService.getInstance();

