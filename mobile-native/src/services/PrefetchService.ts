import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import ApiService from './ApiService';
import CachingService from './CachingService';

export interface PrefetchStrategy {
  timeOfDay: {
    morning: string[]; // 6 AM - 11 AM
    afternoon: string[]; // 12 PM - 5 PM
    evening: string[]; // 6 PM - 11 PM
    night: string[]; // 12 AM - 5 AM
  };
  userBehavior: {
    [pattern: string]: string[];
  };
  marketHours: string[]; // 9:30 AM - 4 PM
}

export interface PrefetchTask {
  id: string;
  endpoint: string;
  priority: 'low' | 'medium' | 'high';
  executed: boolean;
  timestamp?: Date;
  dataSize?: number;
}

class PrefetchService {
  private strategy: PrefetchStrategy = {
    timeOfDay: {
      morning: [
        '/accounts/balance',
        '/transactions/recent',
        '/notifications/unread',
        '/bills/upcoming',
      ],
      afternoon: [
        '/spending/insights',
        '/budget/status',
        '/goals/progress',
      ],
      evening: [
        '/spending/analytics',
        '/bills/reminders',
        '/transactions/summary',
      ],
      night: [
        '/accounts/summary',
      ],
    },
    userBehavior: {
      frequent_trader: [
        '/stocks/portfolio',
        '/stocks/watchlist',
        '/stocks/market-data',
      ],
      crypto_investor: [
        '/crypto/portfolio',
        '/crypto/prices',
        '/crypto/trending',
      ],
      loan_applicant: [
        '/loans/applications',
        '/loans/eligibility',
        '/credit-score',
      ],
    },
    marketHours: [
      '/stocks/market-data',
      '/stocks/trending',
      '/crypto/prices',
    ],
  };

  private prefetchQueue: PrefetchTask[] = [];
  private isOnline: boolean = true;
  private appState: AppStateStatus = 'active';
  private userBehaviorPatterns: string[] = [];

  constructor() {
    this.initialize();
  }

  private async initialize() {
    // Monitor network status
    NetInfo.addEventListener((state) => {
      this.isOnline = state.isConnected ?? false;
      if (this.isOnline) {
        this.executePrefetchQueue();
      }
    });

    // Monitor app state
    AppState.addEventListener('change', (nextAppState) => {
      this.appState = nextAppState;
      if (nextAppState === 'active') {
        this.prefetchBasedOnTimeOfDay();
      }
    });

    // Load user behavior patterns
    await this.loadUserBehaviorPatterns();
  }

  /**
   * Intelligent prefetching based on time of day
   */
  async prefetchBasedOnTimeOfDay(): Promise<void> {
    if (!this.isOnline) {
      console.log('Offline - skipping prefetch');
      return;
    }

    const hour = new Date().getHours();
    let endpoints: string[] = [];

    // Morning hours (6 AM - 11 AM)
    if (hour >= 6 && hour < 12) {
      endpoints = this.strategy.timeOfDay.morning;
      console.log('🌅 Morning prefetch: Account balances and transactions');
    }
    // Afternoon hours (12 PM - 5 PM)
    else if (hour >= 12 && hour < 18) {
      endpoints = this.strategy.timeOfDay.afternoon;
      console.log('☀️ Afternoon prefetch: Spending insights and budgets');
    }
    // Evening hours (6 PM - 11 PM)
    else if (hour >= 18 && hour < 24) {
      endpoints = this.strategy.timeOfDay.evening;
      console.log('🌆 Evening prefetch: Analytics and bill reminders');
    }
    // Night hours (12 AM - 5 AM)
    else {
      endpoints = this.strategy.timeOfDay.night;
      console.log('🌙 Night prefetch: Account summary');
    }

    // Add market data during market hours (9:30 AM - 4 PM)
    if (hour >= 9 && hour < 16) {
      endpoints = [...endpoints, ...this.strategy.marketHours];
      console.log('📈 Market hours: Prefetching stock and crypto data');
    }

    // Execute prefetch
    await this.prefetchEndpoints(endpoints, 'medium');
  }

  /**
   * Prefetch based on user behavior patterns
   */
  async prefetchBasedOnBehavior(userId: string): Promise<void> {
    if (!this.isOnline) return;

    const patterns = await this.analyzeUserBehavior(userId);
    let endpoints: string[] = [];

    patterns.forEach((pattern) => {
      const patternEndpoints = this.strategy.userBehavior[pattern];
      if (patternEndpoints) {
        endpoints = [...endpoints, ...patternEndpoints];
      }
    });

    if (endpoints.length > 0) {
      console.log(`👤 User behavior prefetch: ${patterns.join(', ')}`);
      await this.prefetchEndpoints(endpoints, 'high');
    }
  }

  /**
   * Analyze user behavior to determine prefetch strategy
   */
  private async analyzeUserBehavior(userId: string): Promise<string[]> {
    try {
      // Check recent activity
      const recentActivity = await AsyncStorage.getItem(`user_activity_${userId}`);
      if (!recentActivity) return [];

      const activity = JSON.parse(recentActivity);
      const patterns: string[] = [];

      // Detect frequent trader
      if (activity.stockTrades > 5) {
        patterns.push('frequent_trader');
      }

      // Detect crypto investor
      if (activity.cryptoTransactions > 3) {
        patterns.push('crypto_investor');
      }

      // Detect loan applicant
      if (activity.loanApplications > 0) {
        patterns.push('loan_applicant');
      }

      return patterns;
    } catch (error) {
      console.error('Error analyzing user behavior:', error);
      return [];
    }
  }

  /**
   * Prefetch multiple endpoints
   */
  private async prefetchEndpoints(endpoints: string[], priority: 'low' | 'medium' | 'high'): Promise<void> {
    const tasks: PrefetchTask[] = endpoints.map((endpoint) => ({
      id: `prefetch_${endpoint}_${Date.now()}`,
      endpoint,
      priority,
      executed: false,
    }));

    // Add to queue
    this.prefetchQueue.push(...tasks);

    // Execute queue
    await this.executePrefetchQueue();
  }

  /**
   * Execute prefetch queue
   */
  private async executePrefetchQueue(): Promise<void> {
    if (!this.isOnline || this.appState !== 'active') {
      return;
    }

    // Sort by priority
    const sortedTasks = this.prefetchQueue
      .filter((task) => !task.executed)
      .sort((a, b) => {
        const priorityMap = { high: 3, medium: 2, low: 1 };
        return priorityMap[b.priority] - priorityMap[a.priority];
      });

    // Execute tasks in parallel (with concurrency limit)
    const concurrencyLimit = 3;
    for (let i = 0; i < sortedTasks.length; i += concurrencyLimit) {
      const batch = sortedTasks.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map((task) => this.executePrefetchTask(task)));
    }
  }

  /**
   * Execute single prefetch task
   */
  private async executePrefetchTask(task: PrefetchTask): Promise<void> {
    try {
      const startTime = Date.now();

      // Fetch data
      const response = await ApiService.get(task.endpoint);

      // Cache data
      await CachingService.set(task.endpoint, response.data, {
        ttl: this.getTTLForEndpoint(task.endpoint),
      });

      // Mark as executed
      task.executed = true;
      task.timestamp = new Date();
      task.dataSize = JSON.stringify(response.data).length;

      const duration = Date.now() - startTime;
      console.log(`✅ Prefetched ${task.endpoint} in ${duration}ms (${task.dataSize} bytes)`);
    } catch (error) {
      console.error(`Error prefetching ${task.endpoint}:`, error);
      task.executed = true; // Mark as executed to avoid retry
    }
  }

  /**
   * Get TTL for endpoint based on data type
   */
  private getTTLForEndpoint(endpoint: string): number {
    // Real-time data: 1 minute
    if (endpoint.includes('/stocks/market-data') || endpoint.includes('/crypto/prices')) {
      return 60 * 1000;
    }

    // Frequently changing data: 5 minutes
    if (endpoint.includes('/balance') || endpoint.includes('/transactions/recent')) {
      return 5 * 60 * 1000;
    }

    // Moderately changing data: 15 minutes
    if (endpoint.includes('/spending') || endpoint.includes('/budget')) {
      return 15 * 60 * 1000;
    }

    // Slowly changing data: 1 hour
    return 60 * 60 * 1000;
  }

  /**
   * Prefetch specific screen data
   */
  async prefetchScreenData(screenName: string): Promise<void> {
    const screenEndpoints: { [key: string]: string[] } = {
      Dashboard: ['/accounts/balance', '/transactions/recent', '/notifications/unread'],
      StockTrading: ['/stocks/portfolio', '/stocks/watchlist', '/stocks/market-data'],
      Cryptocurrency: ['/crypto/portfolio', '/crypto/prices', '/crypto/trending'],
      Loans: ['/loans/applications', '/loans/eligibility', '/credit-score'],
      CreditScore: ['/credit-score', '/credit-history', '/credit-recommendations'],
      Budget: ['/budget/status', '/spending/insights', '/spending/trends'],
      Bills: ['/bills/upcoming', '/bills/history', '/bills/reminders'],
    };

    const endpoints = screenEndpoints[screenName];
    if (endpoints) {
      console.log(`📱 Prefetching data for ${screenName} screen`);
      await this.prefetchEndpoints(endpoints, 'high');
    }
  }

  /**
   * Prefetch navigation path
   * Predicts likely next screens and prefetches their data
   */
  async prefetchNavigationPath(currentScreen: string): Promise<void> {
    const navigationPaths: { [key: string]: string[] } = {
      Dashboard: ['StockTrading', 'Cryptocurrency', 'Loans'],
      StockTrading: ['Dashboard', 'Cryptocurrency'],
      Cryptocurrency: ['Dashboard', 'StockTrading'],
      Loans: ['Dashboard', 'CreditScore'],
      CreditScore: ['Dashboard', 'Loans'],
    };

    const likelyNextScreens = navigationPaths[currentScreen] || [];
    for (const screen of likelyNextScreens) {
      await this.prefetchScreenData(screen);
    }
  }

  /**
   * Load user behavior patterns from storage
   */
  private async loadUserBehaviorPatterns(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('user_behavior_patterns');
      if (stored) {
        this.userBehaviorPatterns = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading user behavior patterns:', error);
    }
  }

  /**
   * Save user behavior patterns
   */
  async saveUserBehaviorPattern(pattern: string): Promise<void> {
    if (!this.userBehaviorPatterns.includes(pattern)) {
      this.userBehaviorPatterns.push(pattern);
      await AsyncStorage.setItem(
        'user_behavior_patterns',
        JSON.stringify(this.userBehaviorPatterns)
      );
    }
  }

  /**
   * Get prefetch statistics
   */
  getPrefetchStats(): {
    totalTasks: number;
    executedTasks: number;
    pendingTasks: number;
    totalDataPrefetched: number;
  } {
    const executedTasks = this.prefetchQueue.filter((t) => t.executed);
    const totalDataPrefetched = executedTasks.reduce((sum, task) => sum + (task.dataSize || 0), 0);

    return {
      totalTasks: this.prefetchQueue.length,
      executedTasks: executedTasks.length,
      pendingTasks: this.prefetchQueue.length - executedTasks.length,
      totalDataPrefetched,
    };
  }

  /**
   * Clear prefetch queue
   */
  clearQueue(): void {
    this.prefetchQueue = [];
  }

  /**
   * Enable/disable prefetching
   */
  private prefetchEnabled: boolean = true;

  enablePrefetching(): void {
    this.prefetchEnabled = true;
  }

  disablePrefetching(): void {
    this.prefetchEnabled = false;
  }

  isPrefetchingEnabled(): boolean {
    return this.prefetchEnabled;
  }
}

export default new PrefetchService();

