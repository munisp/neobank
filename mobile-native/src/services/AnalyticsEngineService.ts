import ApiService from './ApiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import NetInfo from '@react-native-community/netinfo';

export interface AnalyticsEvent {
  eventName: string;
  eventType: 'screen_view' | 'button_click' | 'transaction' | 'error' | 'custom';
  properties: Record<string, any>;
  timestamp: Date;
  sessionId: string;
  userId?: string;
  deviceId: string;
  platform: 'ios' | 'android';
  appVersion: string;
  osVersion: string;
}

export interface UserProperties {
  userId: string;
  email?: string;
  signupDate: Date;
  acquisitionSource: string;
  deviceType: string;
  country?: string;
  language: string;
  isPremium: boolean;
  lifetimeValue: number;
}

export interface SessionData {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  screenViews: number;
  interactions: number;
  errors: number;
}

class AnalyticsEngineService {
  private sessionId: string = '';
  private userId?: string;
  private deviceId: string = '';
  private sessionStartTime: Date = new Date();
  private eventQueue: AnalyticsEvent[] = [];
  private isOnline: boolean = true;
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    // Generate or load device ID
    this.deviceId = await this.getOrCreateDeviceId();
    
    // Start new session
    this.sessionId = this.generateSessionId();
    this.sessionStartTime = new Date();

    // Monitor network connectivity
    NetInfo.addEventListener(state => {
      this.isOnline = state.isConnected ?? false;
      if (this.isOnline) {
        this.flushQueue();
      }
    });

    // Auto-flush queue every 30 seconds
    this.flushInterval = setInterval(() => {
      this.flushQueue();
    }, 30000);

    // Track session start
    await this.trackEvent('session_start', 'custom', {
      deviceModel: Device.modelName,
      osVersion: Device.osVersion,
      appVersion: Application.nativeApplicationVersion,
    });
  }

  private async getOrCreateDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem('analytics_device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem('analytics_device_id', deviceId);
    }
    return deviceId;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async setUserId(userId: string) {
    this.userId = userId;
    await AsyncStorage.setItem('analytics_user_id', userId);
  }

  async trackEvent(
    eventName: string,
    eventType: AnalyticsEvent['eventType'],
    properties: Record<string, any> = {}
  ): Promise<void> {
    const event: AnalyticsEvent = {
      eventName,
      eventType,
      properties,
      timestamp: new Date(),
      sessionId: this.sessionId,
      userId: this.userId,
      deviceId: this.deviceId,
      platform: Device.osName === 'iOS' ? 'ios' : 'android',
      appVersion: Application.nativeApplicationVersion || '1.0.0',
      osVersion: Device.osVersion || 'unknown',
    };

    // Add to queue
    this.eventQueue.push(event);

    // Flush if queue is large or event is critical
    if (this.eventQueue.length >= 10 || eventType === 'error' || eventType === 'transaction') {
      await this.flushQueue();
    }
  }

  async trackScreenView(screenName: string, properties: Record<string, any> = {}): Promise<void> {
    await this.trackEvent(`screen_${screenName}`, 'screen_view', {
      screenName,
      ...properties,
    });
  }

  async trackButtonClick(buttonName: string, screenName: string, properties: Record<string, any> = {}): Promise<void> {
    await this.trackEvent(`button_${buttonName}`, 'button_click', {
      buttonName,
      screenName,
      ...properties,
    });
  }

  async trackTransaction(
    transactionType: string,
    amount: number,
    currency: string,
    properties: Record<string, any> = {}
  ): Promise<void> {
    await this.trackEvent(`transaction_${transactionType}`, 'transaction', {
      transactionType,
      amount,
      currency,
      ...properties,
    });
  }

  async trackError(
    errorType: string,
    errorMessage: string,
    stackTrace?: string,
    properties: Record<string, any> = {}
  ): Promise<void> {
    await this.trackEvent(`error_${errorType}`, 'error', {
      errorType,
      errorMessage,
      stackTrace,
      ...properties,
    });
  }

  private async flushQueue(): Promise<void> {
    if (this.eventQueue.length === 0 || !this.isOnline) {
      return;
    }

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    try {
      // Send to Lakehouse via middleware
      await ApiService.post('/analytics/events/batch', {
        events: eventsToSend,
        metadata: {
          flushTime: new Date().toISOString(),
          eventCount: eventsToSend.length,
        },
      });

      console.log(`Flushed ${eventsToSend.length} analytics events`);
    } catch (error) {
      console.error('Failed to flush analytics events:', error);
      // Re-add events to queue for retry
      this.eventQueue.unshift(...eventsToSend);
    }
  }

  async setUserProperties(properties: Partial<UserProperties>): Promise<void> {
    try {
      await ApiService.post('/analytics/user/properties', {
        userId: this.userId,
        properties,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to set user properties:', error);
    }
  }

  async trackAcquisitionSource(source: string, campaign?: string, medium?: string): Promise<void> {
    await this.trackEvent('acquisition', 'custom', {
      source,
      campaign,
      medium,
    });

    await this.setUserProperties({
      acquisitionSource: source,
    });
  }

  async trackOnboardingStep(step: string, completed: boolean): Promise<void> {
    await this.trackEvent('onboarding_step', 'custom', {
      step,
      completed,
    });
  }

  async trackFeatureAdoption(featureName: string, firstUse: boolean = false): Promise<void> {
    await this.trackEvent('feature_adoption', 'custom', {
      featureName,
      firstUse,
    });
  }

  async trackRetention(daysSinceSignup: number): Promise<void> {
    await this.trackEvent('retention', 'custom', {
      daysSinceSignup,
      retentionType: this.getRetentionType(daysSinceSignup),
    });
  }

  private getRetentionType(days: number): string {
    if (days === 1) return 'day_1';
    if (days === 7) return 'day_7';
    if (days === 30) return 'day_30';
    return `day_${days}`;
  }

  async endSession(): Promise<void> {
    const sessionEndTime = new Date();
    const duration = (sessionEndTime.getTime() - this.sessionStartTime.getTime()) / 1000;

    await this.trackEvent('session_end', 'custom', {
      duration,
      sessionId: this.sessionId,
    });

    // Send session data to Postgres via middleware
    try {
      await ApiService.post('/analytics/sessions', {
        sessionId: this.sessionId,
        userId: this.userId,
        startTime: this.sessionStartTime.toISOString(),
        endTime: sessionEndTime.toISOString(),
        duration,
        deviceId: this.deviceId,
      });
    } catch (error) {
      console.error('Failed to save session data:', error);
    }

    await this.flushQueue();
  }

  async getAnalyticsSummary(): Promise<{
    totalEvents: number;
    sessionDuration: number;
    screenViews: number;
    interactions: number;
  }> {
    try {
      const response = await ApiService.get(`/analytics/summary/${this.sessionId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get analytics summary:', error);
      return {
        totalEvents: 0,
        sessionDuration: 0,
        screenViews: 0,
        interactions: 0,
      };
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  async cleanup(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.endSession();
  }
}

export default new AnalyticsEngineService();

