import ApiService from './ApiService';

export interface MiddlewareConfig {
  lakehouseEndpoint: string;
  postgresEndpoint: string;
  tigerbeetleEndpoint: string;
  batchSize: number;
  flushInterval: number;
}

export interface DataDestination {
  lakehouse: boolean;
  postgres: boolean;
  tigerbeetle: boolean;
}

export interface BatchPayload {
  destination: DataDestination;
  dataType: 'events' | 'sessions' | 'revenue' | 'crashes' | 'performance';
  data: any[];
  metadata: {
    batchId: string;
    timestamp: string;
    count: number;
  };
}

class AnalyticsMiddlewareService {
  private config: MiddlewareConfig = {
    lakehouseEndpoint: '/api/lakehouse',
    postgresEndpoint: '/api/postgres',
    tigerbeetleEndpoint: '/api/tigerbeetle',
    batchSize: 100,
    flushInterval: 30000,
  };

  private eventBatch: any[] = [];
  private sessionBatch: any[] = [];
  private revenueBatch: any[] = [];
  private crashBatch: any[] = [];
  private performanceBatch: any[] = [];

  async initialize(config?: Partial<MiddlewareConfig>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Start auto-flush interval
    setInterval(() => {
      this.flushAllBatches();
    }, this.config.flushInterval);

    console.log('Analytics middleware initialized');
  }

  async sendToLakehouse(dataType: string, data: any[]): Promise<void> {
    try {
      await ApiService.post(`${this.config.lakehouseEndpoint}/ingest`, {
        dataType,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to send to Lakehouse:', error);
      throw error;
    }
  }

  async sendToPostgres(table: string, records: any[]): Promise<void> {
    try {
      await ApiService.post(`${this.config.postgresEndpoint}/bulk-insert`, {
        table,
        records,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to send to Postgres:', error);
      throw error;
    }
  }

  async sendToTigerBeetle(transactions: any[]): Promise<void> {
    try {
      await ApiService.post(`${this.config.tigerbeetleEndpoint}/transactions`, {
        transactions,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to send to TigerBeetle:', error);
      throw error;
    }
  }

  async routeData(
    dataType: BatchPayload['dataType'],
    data: any[],
    destination: DataDestination
  ): Promise<void> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const payload: BatchPayload = {
      destination,
      dataType,
      data,
      metadata: {
        batchId,
        timestamp: new Date().toISOString(),
        count: data.length,
      },
    };

    try {
      // Send to middleware router
      await ApiService.post('/analytics/middleware/route', payload);
    } catch (error) {
      console.error('Failed to route data:', error);
      throw error;
    }
  }

  addEventToBatch(event: any): void {
    this.eventBatch.push(event);
    if (this.eventBatch.length >= this.config.batchSize) {
      this.flushEventBatch();
    }
  }

  addSessionToBatch(session: any): void {
    this.sessionBatch.push(session);
    if (this.sessionBatch.length >= this.config.batchSize) {
      this.flushSessionBatch();
    }
  }

  addRevenueToBatch(revenue: any): void {
    this.revenueBatch.push(revenue);
    if (this.revenueBatch.length >= this.config.batchSize) {
      this.flushRevenueBatch();
    }
  }

  addCrashToBatch(crash: any): void {
    this.crashBatch.push(crash);
    // Flush crashes immediately
    this.flushCrashBatch();
  }

  addPerformanceToBatch(metric: any): void {
    this.performanceBatch.push(metric);
    if (this.performanceBatch.length >= this.config.batchSize) {
      this.flushPerformanceBatch();
    }
  }

  private async flushEventBatch(): Promise<void> {
    if (this.eventBatch.length === 0) return;

    const batch = [...this.eventBatch];
    this.eventBatch = [];

    await this.routeData('events', batch, {
      lakehouse: true,  // Events go to Lakehouse for analytics
      postgres: true,   // Also stored in Postgres for querying
      tigerbeetle: false,
    });
  }

  private async flushSessionBatch(): Promise<void> {
    if (this.sessionBatch.length === 0) return;

    const batch = [...this.sessionBatch];
    this.sessionBatch = [];

    await this.routeData('sessions', batch, {
      lakehouse: true,
      postgres: true,
      tigerbeetle: false,
    });
  }

  private async flushRevenueBatch(): Promise<void> {
    if (this.revenueBatch.length === 0) return;

    const batch = [...this.revenueBatch];
    this.revenueBatch = [];

    await this.routeData('revenue', batch, {
      lakehouse: true,   // Revenue analytics in Lakehouse
      postgres: true,    // Revenue records in Postgres
      tigerbeetle: true, // Financial transactions in TigerBeetle
    });
  }

  private async flushCrashBatch(): Promise<void> {
    if (this.crashBatch.length === 0) return;

    const batch = [...this.crashBatch];
    this.crashBatch = [];

    await this.routeData('crashes', batch, {
      lakehouse: true,
      postgres: true,
      tigerbeetle: false,
    });
  }

  private async flushPerformanceBatch(): Promise<void> {
    if (this.performanceBatch.length === 0) return;

    const batch = [...this.performanceBatch];
    this.performanceBatch = [];

    await this.routeData('performance', batch, {
      lakehouse: true,
      postgres: false,
      tigerbeetle: false,
    });
  }

  async flushAllBatches(): Promise<void> {
    await Promise.all([
      this.flushEventBatch(),
      this.flushSessionBatch(),
      this.flushRevenueBatch(),
      this.flushCrashBatch(),
      this.flushPerformanceBatch(),
    ]);
  }

  async queryLakehouse(query: string, params?: Record<string, any>): Promise<any> {
    try {
      const response = await ApiService.post(`${this.config.lakehouseEndpoint}/query`, {
        query,
        params,
      });
      return response.data;
    } catch (error) {
      console.error('Failed to query Lakehouse:', error);
      throw error;
    }
  }

  async queryPostgres(query: string, params?: any[]): Promise<any> {
    try {
      const response = await ApiService.post(`${this.config.postgresEndpoint}/query`, {
        query,
        params,
      });
      return response.data;
    } catch (error) {
      console.error('Failed to query Postgres:', error);
      throw error;
    }
  }

  async getTigerBeetleBalance(accountId: string): Promise<number> {
    try {
      const response = await ApiService.get(`${this.config.tigerbeetleEndpoint}/balance/${accountId}`);
      return response.data.balance;
    } catch (error) {
      console.error('Failed to get TigerBeetle balance:', error);
      throw error;
    }
  }

  getBatchSizes(): {
    events: number;
    sessions: number;
    revenue: number;
    crashes: number;
    performance: number;
  } {
    return {
      events: this.eventBatch.length,
      sessions: this.sessionBatch.length,
      revenue: this.revenueBatch.length,
      crashes: this.crashBatch.length,
      performance: this.performanceBatch.length,
    };
  }
}

export default new AnalyticsMiddlewareService();

