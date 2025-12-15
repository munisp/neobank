import { InteractionManager, PerformanceObserver } from 'react-native';
import * as Performance from 'expo-performance';
import ApiService from './ApiService';

export interface PerformanceMetrics {
  appLaunchTime: number;
  screenLoadTimes: Map<string, number>;
  apiResponseTimes: Map<string, number[]>;
  memoryUsage: number;
  fps: number;
  jsThreadUsage: number;
  nativeThreadUsage: number;
}

export interface PerformanceReport {
  timestamp: Date;
  metrics: PerformanceMetrics;
  deviceInfo: any;
  issues: PerformanceIssue[];
}

export interface PerformanceIssue {
  type: 'slow_screen' | 'slow_api' | 'memory_leak' | 'low_fps' | 'thread_blocking';
  severity: 'low' | 'medium' | 'high';
  description: string;
  value: number;
  threshold: number;
}

class PerformanceMonitorService {
  private metrics: PerformanceMetrics = {
    appLaunchTime: 0,
    screenLoadTimes: new Map(),
    apiResponseTimes: new Map(),
    memoryUsage: 0,
    fps: 60,
    jsThreadUsage: 0,
    nativeThreadUsage: 0,
  };

  private screenStartTimes: Map<string, number> = new Map();
  private apiStartTimes: Map<string, number> = new Map();
  private fpsFrames: number[] = [];
  private lastFrameTime: number = 0;

  constructor() {
    this.initialize();
  }

  private initialize() {
    this.trackAppLaunch();
    this.setupPerformanceObserver();
    this.startFPSMonitoring();
  }

  private trackAppLaunch() {
    InteractionManager.runAfterInteractions(() => {
      const launchTime = Date.now() - (global as any).__APP_START_TIME__;
      this.metrics.appLaunchTime = launchTime;
      
      if (launchTime > 3000) {
        console.warn(`Slow app launch: ${launchTime}ms`);
      }
    });
  }

  private setupPerformanceObserver() {
    try {
      // Monitor React Native performance marks
      if (typeof PerformanceObserver !== 'undefined') {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            console.log(`Performance: ${entry.name} - ${entry.duration}ms`);
          });
        });
        
        observer.observe({ entryTypes: ['measure', 'mark'] });
      }
    } catch (error) {
      console.log('PerformanceObserver not available');
    }
  }

  private startFPSMonitoring() {
    const monitorFPS = () => {
      const now = Date.now();
      if (this.lastFrameTime > 0) {
        const frameDuration = now - this.lastFrameTime;
        const fps = 1000 / frameDuration;
        this.fpsFrames.push(fps);

        // Keep last 60 frames
        if (this.fpsFrames.length > 60) {
          this.fpsFrames.shift();
        }

        // Calculate average FPS
        this.metrics.fps = this.fpsFrames.reduce((a, b) => a + b, 0) / this.fpsFrames.length;
      }
      this.lastFrameTime = now;

      requestAnimationFrame(monitorFPS);
    };

    requestAnimationFrame(monitorFPS);
  }

  markScreenStart(screenName: string): void {
    this.screenStartTimes.set(screenName, Date.now());
    Performance.mark(`screen_${screenName}_start`);
  }

  markScreenEnd(screenName: string): void {
    const startTime = this.screenStartTimes.get(screenName);
    if (startTime) {
      const loadTime = Date.now() - startTime;
      this.metrics.screenLoadTimes.set(screenName, loadTime);
      this.screenStartTimes.delete(screenName);

      Performance.mark(`screen_${screenName}_end`);
      Performance.measure(
        `screen_${screenName}_load`,
        `screen_${screenName}_start`,
        `screen_${screenName}_end`
      );

      if (loadTime > 2000) {
        console.warn(`Slow screen load: ${screenName} - ${loadTime}ms`);
      }
    }
  }

  markApiStart(endpoint: string, requestId: string): void {
    this.apiStartTimes.set(requestId, Date.now());
    Performance.mark(`api_${requestId}_start`);
  }

  markApiEnd(endpoint: string, requestId: string): void {
    const startTime = this.apiStartTimes.get(requestId);
    if (startTime) {
      const responseTime = Date.now() - startTime;
      
      // Store response times for this endpoint
      const times = this.metrics.apiResponseTimes.get(endpoint) || [];
      times.push(responseTime);
      
      // Keep last 10 response times
      if (times.length > 10) {
        times.shift();
      }
      
      this.metrics.apiResponseTimes.set(endpoint, times);
      this.apiStartTimes.delete(requestId);

      Performance.mark(`api_${requestId}_end`);
      Performance.measure(
        `api_${endpoint}`,
        `api_${requestId}_start`,
        `api_${requestId}_end`
      );

      if (responseTime > 5000) {
        console.warn(`Slow API response: ${endpoint} - ${responseTime}ms`);
      }
    }
  }

  async measureMemoryUsage(): Promise<number> {
    try {
      // In production, use proper memory profiling tools
      // This is a simplified version
      if ((performance as any).memory) {
        const memory = (performance as any).memory;
        this.metrics.memoryUsage = memory.usedJSHeapSize / 1048576; // Convert to MB
        return this.metrics.memoryUsage;
      }
    } catch (error) {
      console.error('Error measuring memory:', error);
    }
    return 0;
  }

  getAverageScreenLoadTime(screenName: string): number {
    return this.metrics.screenLoadTimes.get(screenName) || 0;
  }

  getAverageApiResponseTime(endpoint: string): number {
    const times = this.metrics.apiResponseTimes.get(endpoint);
    if (!times || times.length === 0) {
      return 0;
    }
    return times.reduce((a, b) => a + b, 0) / times.length;
  }

  getCurrentFPS(): number {
    return Math.round(this.metrics.fps);
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  analyzePerformance(): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];

    // Check screen load times
    this.metrics.screenLoadTimes.forEach((time, screen) => {
      if (time > 3000) {
        issues.push({
          type: 'slow_screen',
          severity: 'high',
          description: `Screen ${screen} takes too long to load`,
          value: time,
          threshold: 2000,
        });
      } else if (time > 2000) {
        issues.push({
          type: 'slow_screen',
          severity: 'medium',
          description: `Screen ${screen} load time is above optimal`,
          value: time,
          threshold: 2000,
        });
      }
    });

    // Check API response times
    this.metrics.apiResponseTimes.forEach((times, endpoint) => {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      if (avgTime > 5000) {
        issues.push({
          type: 'slow_api',
          severity: 'high',
          description: `API ${endpoint} is very slow`,
          value: avgTime,
          threshold: 3000,
        });
      } else if (avgTime > 3000) {
        issues.push({
          type: 'slow_api',
          severity: 'medium',
          description: `API ${endpoint} response time is above optimal`,
          value: avgTime,
          threshold: 3000,
        });
      }
    });

    // Check FPS
    if (this.metrics.fps < 30) {
      issues.push({
        type: 'low_fps',
        severity: 'high',
        description: 'Frame rate is critically low',
        value: this.metrics.fps,
        threshold: 60,
      });
    } else if (this.metrics.fps < 50) {
      issues.push({
        type: 'low_fps',
        severity: 'medium',
        description: 'Frame rate is below optimal',
        value: this.metrics.fps,
        threshold: 60,
      });
    }

    // Check memory usage
    if (this.metrics.memoryUsage > 200) {
      issues.push({
        type: 'memory_leak',
        severity: 'high',
        description: 'Memory usage is very high',
        value: this.metrics.memoryUsage,
        threshold: 150,
      });
    } else if (this.metrics.memoryUsage > 150) {
      issues.push({
        type: 'memory_leak',
        severity: 'medium',
        description: 'Memory usage is above optimal',
        value: this.metrics.memoryUsage,
        threshold: 150,
      });
    }

    return issues;
  }

  async generateReport(): Promise<PerformanceReport> {
    await this.measureMemoryUsage();

    const report: PerformanceReport = {
      timestamp: new Date(),
      metrics: this.getMetrics(),
      deviceInfo: {
        // Add device info here
      },
      issues: this.analyzePerformance(),
    };

    return report;
  }

  async sendReportToBackend(): Promise<void> {
    try {
      const report = await this.generateReport();
      await ApiService.post('/performance/report', report);
    } catch (error) {
      console.error('Error sending performance report:', error);
    }
  }

  clearMetrics(): void {
    this.metrics = {
      appLaunchTime: 0,
      screenLoadTimes: new Map(),
      apiResponseTimes: new Map(),
      memoryUsage: 0,
      fps: 60,
      jsThreadUsage: 0,
      nativeThreadUsage: 0,
    };
    this.fpsFrames = [];
  }

  // Utility methods for component usage
  withPerformanceTracking<T>(
    componentName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      this.markScreenStart(componentName);
      try {
        const result = await operation();
        this.markScreenEnd(componentName);
        resolve(result);
      } catch (error) {
        this.markScreenEnd(componentName);
        reject(error);
      }
    });
  }
}

export default new PerformanceMonitorService();

