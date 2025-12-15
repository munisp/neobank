import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import ApiService from './ApiService';

const { WatchConnectivity } = NativeModules;
const watchEmitter = WatchConnectivity ? new NativeEventEmitter(WatchConnectivity) : null;

export interface WearableData {
  balance: number;
  recentTransactions: any[];
  spendingToday: number;
  stockPrices: { [symbol: string]: number };
  notifications: any[];
}

export interface WearableNotification {
  id: string;
  type: 'transaction' | 'payment' | 'alert';
  title: string;
  message: string;
  amount?: number;
  timestamp: Date;
}

class WearableService {
  private isWatchConnected: boolean = false;
  private watchData: WearableData | null = null;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    if (Platform.OS === 'ios' && WatchConnectivity) {
      // Initialize Apple Watch connectivity
      await WatchConnectivity.initializeWatchConnectivity();
      this.setupWatchListeners();
    } else if (Platform.OS === 'android') {
      // Initialize Wear OS connectivity
      this.setupWearOSListeners();
    }

    // Start periodic data sync
    this.startPeriodicSync();
  }

  private setupWatchListeners() {
    if (!watchEmitter) return;

    watchEmitter.addListener('watchStateChanged', (state: any) => {
      this.isWatchConnected = state.isReachable;
      console.log('Watch connection state:', this.isWatchConnected);

      if (this.isWatchConnected) {
        this.syncDataToWatch();
      }
    });

    watchEmitter.addListener('messageReceived', (message: any) => {
      this.handleWatchMessage(message);
    });
  }

  private setupWearOSListeners() {
    // Wear OS data layer listeners
    console.log('Wear OS listeners initialized');
  }

  private startPeriodicSync() {
    // Sync data every 5 minutes
    this.updateInterval = setInterval(() => {
      if (this.isWatchConnected) {
        this.syncDataToWatch();
      }
    }, 5 * 60 * 1000);
  }

  async syncDataToWatch(): Promise<void> {
    try {
      // Fetch fresh data
      const [balance, transactions, spending, stocks] = await Promise.all([
        this.fetchBalance(),
        this.fetchRecentTransactions(),
        this.fetchSpendingToday(),
        this.fetchStockPrices(),
      ]);

      this.watchData = {
        balance,
        recentTransactions: transactions,
        spendingToday: spending,
        stockPrices: stocks,
        notifications: [],
      };

      // Send to watch
      await this.sendDataToWatch(this.watchData);
    } catch (error) {
      console.error('Error syncing data to watch:', error);
    }
  }

  private async fetchBalance(): Promise<number> {
    try {
      const response = await ApiService.get('/accounts/checking/balance');
      return response.data.balance;
    } catch (error) {
      return 0;
    }
  }

  private async fetchRecentTransactions(): Promise<any[]> {
    try {
      const response = await ApiService.get('/transactions/recent?limit=5');
      return response.data.transactions;
    } catch (error) {
      return [];
    }
  }

  private async fetchSpendingToday(): Promise<number> {
    try {
      const response = await ApiService.get('/spending/today');
      return response.data.total;
    } catch (error) {
      return 0;
    }
  }

  private async fetchStockPrices(): Promise<{ [symbol: string]: number }> {
    try {
      const response = await ApiService.get('/stocks/watchlist/prices');
      return response.data.prices;
    } catch (error) {
      return {};
    }
  }

  private async sendDataToWatch(data: WearableData): Promise<void> {
    if (Platform.OS === 'ios' && WatchConnectivity) {
      await WatchConnectivity.updateApplicationContext(data);
    } else if (Platform.OS === 'android') {
      // Send to Wear OS via Data Layer API
      console.log('Sending data to Wear OS:', data);
    }
  }

  private async handleWatchMessage(message: any): Promise<void> {
    const { action, data } = message;

    switch (action) {
      case 'getBalance':
        await this.handleGetBalance();
        break;
      case 'getTransactions':
        await this.handleGetTransactions();
        break;
      case 'quickPay':
        await this.handleQuickPay(data);
        break;
      case 'getStockPrices':
        await this.handleGetStockPrices();
        break;
      default:
        console.log('Unknown watch message:', action);
    }
  }

  private async handleGetBalance(): Promise<void> {
    const balance = await this.fetchBalance();
    await this.sendMessageToWatch({ action: 'balanceResponse', data: { balance } });
  }

  private async handleGetTransactions(): Promise<void> {
    const transactions = await this.fetchRecentTransactions();
    await this.sendMessageToWatch({ action: 'transactionsResponse', data: { transactions } });
  }

  private async handleQuickPay(data: any): Promise<void> {
    try {
      await ApiService.post('/payments/quick', data);
      await this.sendMessageToWatch({ action: 'paymentSuccess', data: { amount: data.amount } });
    } catch (error) {
      await this.sendMessageToWatch({ action: 'paymentError', data: { error: 'Payment failed' } });
    }
  }

  private async handleGetStockPrices(): Promise<void> {
    const prices = await this.fetchStockPrices();
    await this.sendMessageToWatch({ action: 'stockPricesResponse', data: { prices } });
  }

  private async sendMessageToWatch(message: any): Promise<void> {
    if (Platform.OS === 'ios' && WatchConnectivity) {
      await WatchConnectivity.sendMessage(message);
    } else if (Platform.OS === 'android') {
      console.log('Sending message to Wear OS:', message);
    }
  }

  async sendNotificationToWatch(notification: WearableNotification): Promise<void> {
    const watchNotification = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      amount: notification.amount,
      timestamp: notification.timestamp.toISOString(),
    };

    await this.sendMessageToWatch({
      action: 'notification',
      data: watchNotification,
    });
  }

  async triggerHapticOnWatch(type: 'success' | 'error' | 'warning'): Promise<void> {
    await this.sendMessageToWatch({
      action: 'haptic',
      data: { type },
    });
  }

  async enableNFCPayment(): Promise<void> {
    await this.sendMessageToWatch({
      action: 'enableNFC',
      data: {},
    });
  }

  async disableNFCPayment(): Promise<void> {
    await this.sendMessageToWatch({
      action: 'disableNFC',
      data: {},
    });
  }

  getWatchData(): WearableData | null {
    return this.watchData;
  }

  isWatchPaired(): boolean {
    return this.isWatchConnected;
  }

  async forceSync(): Promise<void> {
    await this.syncDataToWatch();
  }

  destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (watchEmitter) {
      watchEmitter.removeAllListeners('watchStateChanged');
      watchEmitter.removeAllListeners('messageReceived');
    }
  }
}

export default new WearableService();

