import * as Analytics from 'expo-firebase-analytics';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from './ApiService';

export interface AnalyticsEvent {
  name: string;
  params?: { [key: string]: any };
  timestamp: Date;
}

export interface UserProperties {
  userId?: string;
  email?: string;
  accountType?: string;
  creditScore?: number;
  totalBalance?: number;
  hasLoans?: boolean;
  hasInvestments?: boolean;
  preferredLanguage?: string;
  deviceType?: string;
}

export interface SessionData {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  screenViews: number;
  events: AnalyticsEvent[];
  duration?: number;
}

class AnalyticsService {
  private currentSession: SessionData | null = null;
  private userProperties: UserProperties = {};
  private eventQueue: AnalyticsEvent[] = [];
  private readonly MAX_QUEUE_SIZE = 50;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadUserProperties();
    this.startSession();
  }

  private async loadUserProperties() {
    try {
      const stored = await AsyncStorage.getItem('user_properties');
      if (stored) {
        this.userProperties = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading user properties:', error);
    }
  }

  private async saveUserProperties() {
    try {
      await AsyncStorage.setItem('user_properties', JSON.stringify(this.userProperties));
    } catch (error) {
      console.error('Error saving user properties:', error);
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  startSession(): void {
    this.currentSession = {
      sessionId: this.generateSessionId(),
      startTime: new Date(),
      screenViews: 0,
      events: [],
    };

    this.logEvent('session_start', {
      platform: Platform.OS,
      version: Platform.Version,
    });
  }

  endSession(): void {
    if (this.currentSession) {
      this.currentSession.endTime = new Date();
      this.currentSession.duration =
        this.currentSession.endTime.getTime() - this.currentSession.startTime.getTime();

      this.logEvent('session_end', {
        sessionId: this.currentSession.sessionId,
        duration: this.currentSession.duration,
        screenViews: this.currentSession.screenViews,
        eventCount: this.currentSession.events.length,
      });

      this.flushEvents();
      this.currentSession = null;
    }
  }

  async logEvent(eventName: string, params?: { [key: string]: any }): Promise<void> {
    const event: AnalyticsEvent = {
      name: eventName,
      params: {
        ...params,
        timestamp: new Date().toISOString(),
        sessionId: this.currentSession?.sessionId,
      },
      timestamp: new Date(),
    };

    // Add to current session
    if (this.currentSession) {
      this.currentSession.events.push(event);
    }

    // Add to queue
    this.eventQueue.push(event);

    // Log to Firebase Analytics
    try {
      await Analytics.logEvent(eventName, params);
    } catch (error) {
      console.error('Error logging to Firebase:', error);
    }

    // Flush if queue is full
    if (this.eventQueue.length >= this.MAX_QUEUE_SIZE) {
      await this.flushEvents();
    }
  }

  async logScreenView(screenName: string, screenClass?: string): Promise<void> {
    if (this.currentSession) {
      this.currentSession.screenViews++;
    }

    await this.logEvent('screen_view', {
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });

    try {
      await Analytics.setCurrentScreen(screenName, screenClass);
    } catch (error) {
      console.error('Error logging screen view:', error);
    }
  }

  async setUserProperties(properties: Partial<UserProperties>): Promise<void> {
    this.userProperties = { ...this.userProperties, ...properties };
    await this.saveUserProperties();

    // Set Firebase user properties
    try {
      for (const [key, value] of Object.entries(properties)) {
        await Analytics.setUserProperty(key, String(value));
      }
    } catch (error) {
      console.error('Error setting user properties:', error);
    }
  }

  async setUserId(userId: string): Promise<void> {
    this.userProperties.userId = userId;
    await this.saveUserProperties();

    try {
      await Analytics.setUserId(userId);
    } catch (error) {
      console.error('Error setting user ID:', error);
    }
  }

  // Business-specific analytics events
  async trackLogin(method: 'email' | 'biometric' | 'social'): Promise<void> {
    await this.logEvent('login', { method });
  }

  async trackSignup(method: 'email' | 'social'): Promise<void> {
    await this.logEvent('sign_up', { method });
  }

  async trackTransaction(
    type: 'transfer' | 'deposit' | 'withdrawal',
    amount: number,
    currency: string = 'USD'
  ): Promise<void> {
    await this.logEvent('transaction', {
      type,
      amount,
      currency,
      value: amount,
    });
  }

  async trackStockTrade(
    action: 'buy' | 'sell',
    symbol: string,
    quantity: number,
    price: number
  ): Promise<void> {
    await this.logEvent('stock_trade', {
      action,
      symbol,
      quantity,
      price,
      total_value: quantity * price,
    });
  }

  async trackLoanApplication(
    loanType: string,
    amount: number,
    term: number
  ): Promise<void> {
    await this.logEvent('loan_application', {
      loan_type: loanType,
      amount,
      term,
    });
  }

  async trackCreditScoreCheck(): Promise<void> {
    await this.logEvent('credit_score_check');
  }

  async trackBillPayment(billType: string, amount: number): Promise<void> {
    await this.logEvent('bill_payment', {
      bill_type: billType,
      amount,
    });
  }

  async trackSearch(query: string, resultCount: number): Promise<void> {
    await this.logEvent('search', {
      search_term: query,
      result_count: resultCount,
    });
  }

  async trackError(
    errorType: string,
    errorMessage: string,
    context?: string
  ): Promise<void> {
    await this.logEvent('error', {
      error_type: errorType,
      error_message: errorMessage,
      context,
    });
  }

  async trackFeatureUsage(featureName: string, action: string): Promise<void> {
    await this.logEvent('feature_usage', {
      feature_name: featureName,
      action,
    });
  }

  async trackNotificationInteraction(
    notificationType: string,
    action: 'opened' | 'dismissed' | 'clicked'
  ): Promise<void> {
    await this.logEvent('notification_interaction', {
      notification_type: notificationType,
      action,
    });
  }

  async trackSettingsChange(setting: string, newValue: any): Promise<void> {
    await this.logEvent('settings_change', {
      setting,
      new_value: String(newValue),
    });
  }

  // Conversion tracking
  async trackConversion(
    conversionType: string,
    value?: number,
    currency: string = 'USD'
  ): Promise<void> {
    await this.logEvent('conversion', {
      conversion_type: conversionType,
      value,
      currency,
    });
  }

  // E-commerce tracking
  async trackPurchase(
    productId: string,
    productName: string,
    amount: number,
    currency: string = 'USD'
  ): Promise<void> {
    await this.logEvent('purchase', {
      product_id: productId,
      product_name: productName,
      value: amount,
      currency,
    });
  }

  // User engagement tracking
  async trackEngagement(
    engagementType: string,
    duration?: number
  ): Promise<void> {
    await this.logEvent('user_engagement', {
      engagement_type: engagementType,
      engagement_time_msec: duration,
    });
  }

  // Custom event tracking
  async trackCustomEvent(
    category: string,
    action: string,
    label?: string,
    value?: number
  ): Promise<void> {
    await this.logEvent('custom_event', {
      category,
      action,
      label,
      value,
    });
  }

  private async flushEvents(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    try {
      // Send events to backend
      await ApiService.post('/analytics/events', {
        events: this.eventQueue,
        userProperties: this.userProperties,
        session: this.currentSession,
      });

      // Clear queue
      this.eventQueue = [];
    } catch (error) {
      console.error('Error flushing analytics events:', error);
      // Keep events in queue for retry
    }
  }

  getUserProperties(): UserProperties {
    return { ...this.userProperties };
  }

  getCurrentSession(): SessionData | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  async clearAnalyticsData(): Promise<void> {
    this.eventQueue = [];
    this.userProperties = {};
    await AsyncStorage.removeItem('user_properties');
    
    try {
      await Analytics.resetAnalyticsData();
    } catch (error) {
      console.error('Error clearing analytics data:', error);
    }
  }

  // A/B Testing support
  async trackExperiment(
    experimentId: string,
    variantId: string
  ): Promise<void> {
    await this.logEvent('experiment_impression', {
      experiment_id: experimentId,
      variant_id: variantId,
    });
  }

  async trackExperimentConversion(
    experimentId: string,
    variantId: string,
    goalId: string
  ): Promise<void> {
    await this.logEvent('experiment_conversion', {
      experiment_id: experimentId,
      variant_id: variantId,
      goal_id: goalId,
    });
  }
}

export default new AnalyticsService();

