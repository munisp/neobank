import ApiService from './ApiService';
import AnalyticsEngineService from './AnalyticsEngineService';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

export interface CrashReport {
  id: string;
  errorType: string;
  errorMessage: string;
  stackTrace: string;
  timestamp: Date;
  userId?: string;
  deviceId: string;
  platform: string;
  appVersion: string;
  osVersion: string;
  deviceModel: string;
  isFatal: boolean;
  breadcrumbs: Breadcrumb[];
  customData?: Record<string, any>;
}

export interface Breadcrumb {
  timestamp: Date;
  category: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  data?: Record<string, any>;
}

export interface PerformanceMetric {
  id: string;
  metricType: 'screen_load' | 'api_call' | 'database_query' | 'custom';
  name: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  metadata?: Record<string, any>;
}

class CrashMonitoringService {
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs: number = 50;
  private performanceMetrics: PerformanceMetric[] = [];
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Set up global error handler
    this.setupGlobalErrorHandler();

    // Set up unhandled promise rejection handler
    this.setupUnhandledRejectionHandler();

    this.isInitialized = true;
    console.log('Crash monitoring initialized');
  }

  private setupGlobalErrorHandler(): void {
    const originalHandler = ErrorUtils.getGlobalHandler();

    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      // Report crash
      this.reportCrash(error, isFatal ?? false);

      // Call original handler
      if (originalHandler) {
        originalHandler(error, isFatal);
      }
    });
  }

  private setupUnhandledRejectionHandler(): void {
    // @ts-ignore - tracking_unhandled_rejection is available in React Native
    if (global.tracking_unhandled_rejection) {
      return;
    }

    // @ts-ignore
    global.tracking_unhandled_rejection = true;

    const tracking = require('promise/setimmediate/rejection-tracking');
    tracking.enable({
      allRejections: true,
      onUnhandled: (id: string, error: Error) => {
        this.reportCrash(error, false);
      },
      onHandled: () => {},
    });
  }

  async reportCrash(error: Error, isFatal: boolean = false): Promise<void> {
    const crashReport: CrashReport = {
      id: `crash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      errorType: error.name || 'Error',
      errorMessage: error.message || 'Unknown error',
      stackTrace: error.stack || '',
      timestamp: new Date(),
      userId: AnalyticsEngineService.getUserId(),
      deviceId: AnalyticsEngineService.getDeviceId(),
      platform: Device.osName || 'unknown',
      appVersion: Application.nativeApplicationVersion || '1.0.0',
      osVersion: Device.osVersion || 'unknown',
      deviceModel: Device.modelName || 'unknown',
      isFatal,
      breadcrumbs: [...this.breadcrumbs],
    };

    // Track in analytics
    await AnalyticsEngineService.trackError(
      crashReport.errorType,
      crashReport.errorMessage,
      crashReport.stackTrace,
      {
        isFatal,
        deviceModel: crashReport.deviceModel,
      }
    );

    // Send to middleware for storage in Postgres
    try {
      await ApiService.post('/monitoring/crashes', crashReport);
    } catch (sendError) {
      console.error('Failed to send crash report:', sendError);
      // Store locally for retry
      this.storeCrashLocally(crashReport);
    }

    console.error('Crash reported:', crashReport);
  }

  private async storeCrashLocally(crashReport: CrashReport): Promise<void> {
    // Implementation would store in AsyncStorage for later retry
    console.log('Storing crash report locally for retry');
  }

  addBreadcrumb(
    category: string,
    message: string,
    level: Breadcrumb['level'] = 'info',
    data?: Record<string, any>
  ): void {
    const breadcrumb: Breadcrumb = {
      timestamp: new Date(),
      category,
      message,
      level,
      data,
    };

    this.breadcrumbs.push(breadcrumb);

    // Keep only last N breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  async recordPerformanceMetric(
    metricType: PerformanceMetric['metricType'],
    name: string,
    duration: number,
    success: boolean = true,
    metadata?: Record<string, any>
  ): Promise<void> {
    const metric: PerformanceMetric = {
      id: `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metricType,
      name,
      duration,
      timestamp: new Date(),
      success,
      metadata,
    };

    this.performanceMetrics.push(metric);

    // Track in analytics
    await AnalyticsEngineService.trackEvent('performance_metric', 'custom', {
      metricType,
      name,
      duration,
      success,
      ...metadata,
    });

    // Send to middleware for Lakehouse storage
    try {
      await ApiService.post('/monitoring/performance', metric);
    } catch (error) {
      console.error('Failed to send performance metric:', error);
    }

    // Auto-flush if too many metrics
    if (this.performanceMetrics.length >= 100) {
      await this.flushPerformanceMetrics();
    }
  }

  async measureScreenLoad(screenName: string, startTime: number): Promise<void> {
    const duration = Date.now() - startTime;
    await this.recordPerformanceMetric('screen_load', screenName, duration, true, {
      screenName,
    });
  }

  async measureApiCall(endpoint: string, startTime: number, success: boolean): Promise<void> {
    const duration = Date.now() - startTime;
    await this.recordPerformanceMetric('api_call', endpoint, duration, success, {
      endpoint,
    });
  }

  async measureDatabaseQuery(queryName: string, startTime: number, success: boolean): Promise<void> {
    const duration = Date.now() - startTime;
    await this.recordPerformanceMetric('database_query', queryName, duration, success, {
      queryName,
    });
  }

  private async flushPerformanceMetrics(): Promise<void> {
    if (this.performanceMetrics.length === 0) {
      return;
    }

    const metricsToSend = [...this.performanceMetrics];
    this.performanceMetrics = [];

    try {
      await ApiService.post('/monitoring/performance/batch', {
        metrics: metricsToSend,
      });
    } catch (error) {
      console.error('Failed to flush performance metrics:', error);
    }
  }

  async getCrashFreeRate(days: number = 7): Promise<number> {
    try {
      const response = await ApiService.get(`/monitoring/crash-free-rate?days=${days}`);
      return response.data.rate;
    } catch (error) {
      console.error('Failed to get crash-free rate:', error);
      return 0;
    }
  }

  async getPerformanceStats(): Promise<{
    avgScreenLoadTime: number;
    avgApiCallTime: number;
    slowestScreens: { name: string; avgDuration: number }[];
    slowestApis: { endpoint: string; avgDuration: number }[];
  } | null> {
    try {
      const response = await ApiService.get('/monitoring/performance/stats');
      return response.data;
    } catch (error) {
      console.error('Failed to get performance stats:', error);
      return null;
    }
  }

  getBreadcrumbs(): Breadcrumb[] {
    return [...this.breadcrumbs];
  }

  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }
}

export default new CrashMonitoringService();

