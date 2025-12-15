import { InteractionManager, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface StartupMetrics {
  coldStartTime: number;
  warmStartTime: number;
  criticalPathTime: number;
  deferredTasksCount: number;
  preloadedDataSize: number;
}

interface DeferredTask {
  id: string;
  priority: 'low' | 'medium' | 'high';
  execute: () => Promise<void>;
  executed: boolean;
}

class StartupOptimizationService {
  private startTime: number = Date.now();
  private criticalPathComplete: boolean = false;
  private deferredTasks: DeferredTask[] = [];
  private metrics: StartupMetrics = {
    coldStartTime: 0,
    warmStartTime: 0,
    criticalPathTime: 0,
    deferredTasksCount: 0,
    preloadedDataSize: 0,
  };

  constructor() {
    // Mark app start time globally
    (global as any).__APP_START_TIME__ = Date.now();
  }

  /**
   * Initialize critical path - only essential operations for first render
   * Target: < 500ms for critical path
   */
  async initializeCriticalPath(): Promise<void> {
    const criticalStart = Date.now();

    try {
      // Only load absolutely essential data
      await Promise.all([
        this.loadAuthToken(),
        this.loadThemePreference(),
        this.loadLanguagePreference(),
      ]);

      this.criticalPathComplete = true;
      this.metrics.criticalPathTime = Date.now() - criticalStart;

      console.log(`✅ Critical path completed in ${this.metrics.criticalPathTime}ms`);

      // Schedule deferred tasks after critical path
      this.scheduleDeferredTasks();
    } catch (error) {
      console.error('Error in critical path:', error);
      throw error;
    }
  }

  /**
   * Load only authentication token during critical path
   */
  private async loadAuthToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('auth_token');
    } catch (error) {
      console.error('Error loading auth token:', error);
      return null;
    }
  }

  /**
   * Load theme preference (needed for first render)
   */
  private async loadThemePreference(): Promise<string> {
    try {
      const theme = await AsyncStorage.getItem('theme');
      return theme || 'light';
    } catch (error) {
      return 'light';
    }
  }

  /**
   * Load language preference (needed for first render)
   */
  private async loadLanguagePreference(): Promise<string> {
    try {
      const language = await AsyncStorage.getItem('language');
      return language || 'en';
    } catch (error) {
      return 'en';
    }
  }

  /**
   * Schedule non-critical tasks to run after interactions complete
   */
  private scheduleDeferredTasks(): void {
    InteractionManager.runAfterInteractions(() => {
      this.executeDeferredTasks();
    });
  }

  /**
   * Add task to be executed after critical path
   */
  deferTask(id: string, priority: 'low' | 'medium' | 'high', task: () => Promise<void>): void {
    this.deferredTasks.push({
      id,
      priority,
      execute: task,
      executed: false,
    });
    this.metrics.deferredTasksCount++;
  }

  /**
   * Execute deferred tasks in priority order
   */
  private async executeDeferredTasks(): Promise<void> {
    // Sort by priority
    const sortedTasks = this.deferredTasks.sort((a, b) => {
      const priorityMap = { high: 3, medium: 2, low: 1 };
      return priorityMap[b.priority] - priorityMap[a.priority];
    });

    for (const task of sortedTasks) {
      if (!task.executed) {
        try {
          await task.execute();
          task.executed = true;
        } catch (error) {
          console.error(`Error executing deferred task ${task.id}:`, error);
        }
      }
    }
  }

  /**
   * Preload critical data based on time of day and user patterns
   */
  async preloadCriticalData(userId: string): Promise<void> {
    const hour = new Date().getHours();
    const preloadTasks: Promise<void>[] = [];

    // Morning hours (6 AM - 11 AM): Preload account balances and transactions
    if (hour >= 6 && hour < 11) {
      preloadTasks.push(
        this.preloadAccountBalance(userId),
        this.preloadRecentTransactions(userId)
      );
    }

    // Evening hours (6 PM - 11 PM): Preload spending analytics
    if (hour >= 18 && hour < 23) {
      preloadTasks.push(
        this.preloadSpendingAnalytics(userId),
        this.preloadBillReminders(userId)
      );
    }

    // Market hours (9:30 AM - 4 PM): Preload stock data
    if (hour >= 9 && hour < 16) {
      preloadTasks.push(this.preloadStockData(userId));
    }

    // Execute all preload tasks in parallel
    await Promise.all(preloadTasks);
  }

  private async preloadAccountBalance(userId: string): Promise<void> {
    // This would call the actual API and cache the result
    console.log('Preloading account balance...');
    // Simulated preload
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private async preloadRecentTransactions(userId: string): Promise<void> {
    console.log('Preloading recent transactions...');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private async preloadSpendingAnalytics(userId: string): Promise<void> {
    console.log('Preloading spending analytics...');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private async preloadBillReminders(userId: string): Promise<void> {
    console.log('Preloading bill reminders...');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private async preloadStockData(userId: string): Promise<void> {
    console.log('Preloading stock data...');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Lazy load non-critical modules
   */
  async lazyLoadModule(moduleName: string): Promise<any> {
    const lazyModules: { [key: string]: () => Promise<any> } = {
      analytics: () => import('../services/AnalyticsService'),
      blockchain: () => import('../services/BlockchainService'),
      ar: () => import('../services/ARBankingService'),
      collaboration: () => import('../services/CollaborationService'),
    };

    const loader = lazyModules[moduleName];
    if (!loader) {
      throw new Error(`Module ${moduleName} not found`);
    }

    try {
      const module = await loader();
      console.log(`✅ Lazy loaded module: ${moduleName}`);
      return module.default;
    } catch (error) {
      console.error(`Error lazy loading module ${moduleName}:`, error);
      throw error;
    }
  }

  /**
   * Optimize bundle by removing unused dependencies
   */
  getOptimizationRecommendations(): string[] {
    return [
      'Enable Hermes engine in android/app/build.gradle',
      'Enable code splitting in metro.config.js',
      'Remove unused dependencies from package.json',
      'Enable ProGuard/R8 for Android release builds',
      'Enable bitcode for iOS release builds',
      'Use dynamic imports for heavy libraries',
      'Implement tree shaking for unused code',
      'Compress images with WebP format',
      'Minimize JavaScript bundle size',
      'Use native modules for performance-critical operations',
    ];
  }

  /**
   * Measure startup performance
   */
  measureStartupTime(): StartupMetrics {
    const now = Date.now();
    const startTime = (global as any).__APP_START_TIME__ || this.startTime;

    if (this.metrics.coldStartTime === 0) {
      this.metrics.coldStartTime = now - startTime;
    } else {
      this.metrics.warmStartTime = now - startTime;
    }

    return { ...this.metrics };
  }

  /**
   * Get startup performance report
   */
  getPerformanceReport(): {
    metrics: StartupMetrics;
    recommendations: string[];
    status: 'excellent' | 'good' | 'needs-improvement' | 'poor';
  } {
    const metrics = this.measureStartupTime();
    const recommendations: string[] = [];
    let status: 'excellent' | 'good' | 'needs-improvement' | 'poor' = 'excellent';

    // Analyze cold start time
    if (metrics.coldStartTime > 2000) {
      status = 'poor';
      recommendations.push('Cold start time exceeds 2 seconds - critical optimization needed');
    } else if (metrics.coldStartTime > 1000) {
      status = 'needs-improvement';
      recommendations.push('Cold start time exceeds 1 second - optimization recommended');
    } else if (metrics.coldStartTime > 500) {
      status = 'good';
      recommendations.push('Cold start time is acceptable but can be improved');
    }

    // Analyze critical path time
    if (metrics.criticalPathTime > 500) {
      recommendations.push('Critical path exceeds 500ms - defer more operations');
    }

    // Analyze deferred tasks
    if (metrics.deferredTasksCount < 5) {
      recommendations.push('Consider deferring more non-critical operations');
    }

    return { metrics, recommendations, status };
  }

  /**
   * Enable performance optimizations
   */
  enableOptimizations(): void {
    // Enable Hermes optimizations
    if (__DEV__) {
      console.log('Development mode - some optimizations disabled');
    } else {
      console.log('Production mode - all optimizations enabled');
    }

    // Monitor app state changes
    AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // App came to foreground - measure warm start
        this.measureStartupTime();
      }
    });
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      coldStartTime: 0,
      warmStartTime: 0,
      criticalPathTime: 0,
      deferredTasksCount: 0,
      preloadedDataSize: 0,
    };
    this.deferredTasks = [];
    this.criticalPathComplete = false;
  }

  /**
   * Check if critical path is complete
   */
  isCriticalPathComplete(): boolean {
    return this.criticalPathComplete;
  }

  /**
   * Get deferred tasks status
   */
  getDeferredTasksStatus(): {
    total: number;
    executed: number;
    pending: number;
  } {
    const executed = this.deferredTasks.filter((t) => t.executed).length;
    return {
      total: this.deferredTasks.length,
      executed,
      pending: this.deferredTasks.length - executed,
    };
  }
}

export default new StartupOptimizationService();

