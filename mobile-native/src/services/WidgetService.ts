import { Platform, NativeModules } from 'react-native';
import SharedGroupPreferences from 'react-native-shared-group-preferences';
import ApiService from './ApiService';

const { WidgetManager } = NativeModules;

export interface WidgetData {
  balance: number;
  recentTransactions: {
    id: string;
    description: string;
    amount: number;
    date: string;
  }[];
  spendingSummary: {
    today: number;
    week: number;
    month: number;
  };
  stockPortfolio: {
    symbol: string;
    shares: number;
    price: number;
    change: number;
  }[];
  quickActions: string[];
}

export type WidgetType = 'balance' | 'transactions' | 'spending' | 'stocks' | 'quickActions';

class WidgetService {
  private readonly APP_GROUP = 'group.com.neobank.mobile';
  private widgetData: WidgetData | null = null;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    // Start periodic widget updates
    this.startPeriodicUpdates();

    // Initial data fetch
    await this.updateAllWidgets();
  }

  private startPeriodicUpdates() {
    // Update widgets every 15 minutes
    this.updateInterval = setInterval(() => {
      this.updateAllWidgets();
    }, 15 * 60 * 1000);
  }

  async updateAllWidgets(): Promise<void> {
    try {
      // Fetch all widget data
      const [balance, transactions, spending, stocks] = await Promise.all([
        this.fetchBalance(),
        this.fetchRecentTransactions(),
        this.fetchSpendingSummary(),
        this.fetchStockPortfolio(),
      ]);

      this.widgetData = {
        balance,
        recentTransactions: transactions,
        spendingSummary: spending,
        stockPortfolio: stocks,
        quickActions: ['Send Money', 'Pay Bill', 'Check Balance', 'View Transactions'],
      };

      // Save to shared storage for widgets
      await this.saveWidgetData(this.widgetData);

      // Reload widgets
      await this.reloadWidgets();
    } catch (error) {
      console.error('Error updating widgets:', error);
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
      const response = await ApiService.get('/transactions/recent?limit=3');
      return response.data.transactions.map((tx: any) => ({
        id: tx.id,
        description: tx.description,
        amount: tx.amount,
        date: tx.date,
      }));
    } catch (error) {
      return [];
    }
  }

  private async fetchSpendingSummary(): Promise<{ today: number; week: number; month: number }> {
    try {
      const [today, week, month] = await Promise.all([
        ApiService.get('/spending/today'),
        ApiService.get('/spending/week'),
        ApiService.get('/spending/month'),
      ]);

      return {
        today: today.data.total,
        week: week.data.total,
        month: month.data.total,
      };
    } catch (error) {
      return { today: 0, week: 0, month: 0 };
    }
  }

  private async fetchStockPortfolio(): Promise<any[]> {
    try {
      const response = await ApiService.get('/stocks/portfolio');
      return response.data.holdings.slice(0, 3).map((holding: any) => ({
        symbol: holding.symbol,
        shares: holding.shares,
        price: holding.currentPrice,
        change: holding.changePercent,
      }));
    } catch (error) {
      return [];
    }
  }

  private async saveWidgetData(data: WidgetData): Promise<void> {
    if (Platform.OS === 'ios') {
      // Save to iOS App Group
      try {
        await SharedGroupPreferences.setItem('widgetData', JSON.stringify(data), this.APP_GROUP);
      } catch (error) {
        console.error('Error saving widget data to App Group:', error);
      }
    } else if (Platform.OS === 'android') {
      // Save to Android shared preferences
      if (WidgetManager) {
        await WidgetManager.updateWidgetData(data);
      }
    }
  }

  private async reloadWidgets(): Promise<void> {
    if (Platform.OS === 'ios' && WidgetManager) {
      // Reload iOS widgets
      await WidgetManager.reloadAllTimelines();
    } else if (Platform.OS === 'android' && WidgetManager) {
      // Update Android widgets
      await WidgetManager.updateAllWidgets();
    }
  }

  async updateWidget(type: WidgetType): Promise<void> {
    if (!this.widgetData) {
      await this.updateAllWidgets();
      return;
    }

    let data: any;

    switch (type) {
      case 'balance':
        data = { balance: this.widgetData.balance };
        break;
      case 'transactions':
        data = { transactions: this.widgetData.recentTransactions };
        break;
      case 'spending':
        data = { spending: this.widgetData.spendingSummary };
        break;
      case 'stocks':
        data = { stocks: this.widgetData.stockPortfolio };
        break;
      case 'quickActions':
        data = { actions: this.widgetData.quickActions };
        break;
    }

    await this.saveWidgetData({ ...this.widgetData, ...data });
    await this.reloadWidgets();
  }

  async handleWidgetAction(action: string): Promise<void> {
    console.log('Widget action triggered:', action);

    switch (action) {
      case 'Send Money':
        // Open send money screen
        break;
      case 'Pay Bill':
        // Open pay bill screen
        break;
      case 'Check Balance':
        // Open balance screen
        await this.updateWidget('balance');
        break;
      case 'View Transactions':
        // Open transactions screen
        await this.updateWidget('transactions');
        break;
    }
  }

  async configureWidget(type: WidgetType, config: any): Promise<void> {
    // Save widget configuration
    const configKey = `widget_config_${type}`;

    if (Platform.OS === 'ios') {
      await SharedGroupPreferences.setItem(configKey, JSON.stringify(config), this.APP_GROUP);
    } else if (Platform.OS === 'android' && WidgetManager) {
      await WidgetManager.setWidgetConfig(type, config);
    }

    // Update widget with new config
    await this.updateWidget(type);
  }

  async getWidgetConfig(type: WidgetType): Promise<any> {
    const configKey = `widget_config_${type}`;

    if (Platform.OS === 'ios') {
      const config = await SharedGroupPreferences.getItem(configKey, this.APP_GROUP);
      return config ? JSON.parse(config) : null;
    } else if (Platform.OS === 'android' && WidgetManager) {
      return await WidgetManager.getWidgetConfig(type);
    }

    return null;
  }

  getWidgetData(): WidgetData | null {
    return this.widgetData;
  }

  async forceUpdate(): Promise<void> {
    await this.updateAllWidgets();
  }

  destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}

export default new WidgetService();

