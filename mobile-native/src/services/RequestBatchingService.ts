import ApiService from './ApiService';

export interface BatchRequest {
  id: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: any;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

export interface DebouncedRequest {
  id: string;
  fn: () => Promise<any>;
  timeout: NodeJS.Timeout;
}

class RequestBatchingService {
  private batchQueue: BatchRequest[] = [];
  private debouncedRequests: Map<string, DebouncedRequest> = new Map();
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_DELAY = 50; // ms
  private batchTimer: NodeJS.Timeout | null = null;

  /**
   * Add request to batch queue
   * Automatically batches multiple requests into single API call
   */
  async batchRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const request: BatchRequest = {
        id: `${endpoint}_${Date.now()}_${Math.random()}`,
        endpoint,
        method,
        data,
        resolve,
        reject,
      };

      this.batchQueue.push(request);

      // Schedule batch execution
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.executeBatch();
        }, this.BATCH_DELAY);
      }

      // Execute immediately if batch size reached
      if (this.batchQueue.length >= this.BATCH_SIZE) {
        if (this.batchTimer) {
          clearTimeout(this.batchTimer);
          this.batchTimer = null;
        }
        this.executeBatch();
      }
    });
  }

  /**
   * Execute batched requests
   */
  private async executeBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];
    this.batchTimer = null;

    try {
      // Group requests by endpoint and method
      const grouped = this.groupRequests(batch);

      // Execute each group
      for (const [key, requests] of Object.entries(grouped)) {
        await this.executeBatchGroup(requests);
      }
    } catch (error) {
      console.error('Error executing batch:', error);
      batch.forEach((req) => req.reject(error));
    }
  }

  /**
   * Group requests by endpoint and method
   */
  private groupRequests(batch: BatchRequest[]): { [key: string]: BatchRequest[] } {
    const grouped: { [key: string]: BatchRequest[] } = {};

    batch.forEach((request) => {
      const key = `${request.method}_${request.endpoint}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(request);
    });

    return grouped;
  }

  /**
   * Execute batch group
   */
  private async executeBatchGroup(requests: BatchRequest[]): Promise<void> {
    if (requests.length === 0) return;

    const { endpoint, method } = requests[0];

    try {
      if (method === 'GET') {
        // For GET requests, execute in parallel
        const promises = requests.map((req) => ApiService.get(req.endpoint));
        const results = await Promise.all(promises);
        results.forEach((result, index) => {
          requests[index].resolve(result);
        });
      } else {
        // For POST/PUT/DELETE, batch into single request
        const batchData = requests.map((req) => req.data);
        const response = await ApiService.post(`${endpoint}/batch`, { requests: batchData });

        // Resolve individual requests
        response.data.results.forEach((result: any, index: number) => {
          requests[index].resolve(result);
        });
      }
    } catch (error) {
      requests.forEach((req) => req.reject(error));
    }
  }

  /**
   * Debounce function execution
   * Prevents excessive API calls from rapid user input
   */
  debounce<T>(
    id: string,
    fn: () => Promise<T>,
    delay: number = 300
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Cancel existing debounced request
      const existing = this.debouncedRequests.get(id);
      if (existing) {
        clearTimeout(existing.timeout);
      }

      // Create new debounced request
      const timeout = setTimeout(async () => {
        try {
          const result = await fn();
          resolve(result);
          this.debouncedRequests.delete(id);
        } catch (error) {
          reject(error);
          this.debouncedRequests.delete(id);
        }
      }, delay);

      this.debouncedRequests.set(id, { id, fn, timeout });
    });
  }

  /**
   * Throttle function execution
   * Limits execution rate
   */
  private throttleTimers: Map<string, number> = new Map();

  async throttle<T>(
    id: string,
    fn: () => Promise<T>,
    limit: number = 1000
  ): Promise<T | null> {
    const lastExecution = this.throttleTimers.get(id) || 0;
    const now = Date.now();

    if (now - lastExecution < limit) {
      console.log(`Throttled: ${id}`);
      return null;
    }

    this.throttleTimers.set(id, now);
    return await fn();
  }

  /**
   * Debounced search (common use case)
   */
  async debouncedSearch(query: string, delay: number = 300): Promise<any> {
    return this.debounce(
      'search',
      async () => {
        const response = await ApiService.get(`/search?q=${encodeURIComponent(query)}`);
        return response.data;
      },
      delay
    );
  }

  /**
   * Debounced input validation
   */
  async debouncedValidation(
    fieldName: string,
    value: string,
    validationFn: (value: string) => Promise<boolean>,
    delay: number = 500
  ): Promise<boolean> {
    return this.debounce(
      `validation_${fieldName}`,
      async () => {
        return await validationFn(value);
      },
      delay
    );
  }

  /**
   * Batch analytics events
   */
  private analyticsQueue: any[] = [];
  private analyticsTimer: NodeJS.Timeout | null = null;

  async batchAnalyticsEvent(event: any): Promise<void> {
    this.analyticsQueue.push(event);

    if (!this.analyticsTimer) {
      this.analyticsTimer = setTimeout(() => {
        this.flushAnalytics();
      }, 5000); // Flush every 5 seconds
    }

    // Flush immediately if queue is large
    if (this.analyticsQueue.length >= 50) {
      if (this.analyticsTimer) {
        clearTimeout(this.analyticsTimer);
        this.analyticsTimer = null;
      }
      await this.flushAnalytics();
    }
  }

  /**
   * Flush analytics events
   */
  private async flushAnalytics(): Promise<void> {
    if (this.analyticsQueue.length === 0) return;

    const events = [...this.analyticsQueue];
    this.analyticsQueue = [];
    this.analyticsTimer = null;

    try {
      await ApiService.post('/analytics/batch', { events });
      console.log(`✅ Flushed ${events.length} analytics events`);
    } catch (error) {
      console.error('Error flushing analytics:', error);
      // Re-queue events on failure
      this.analyticsQueue.unshift(...events);
    }
  }

  /**
   * Get batching statistics
   */
  getBatchingStats(): {
    queuedRequests: number;
    debouncedRequests: number;
    estimatedSavings: string;
  } {
    const queuedRequests = this.batchQueue.length;
    const debouncedRequests = this.debouncedRequests.size;

    // Estimate network request savings
    const totalRequests = queuedRequests + debouncedRequests;
    const batchedRequests = Math.ceil(queuedRequests / this.BATCH_SIZE);
    const savedRequests = totalRequests - batchedRequests - debouncedRequests;
    const estimatedSavings = `${savedRequests} requests saved`;

    return {
      queuedRequests,
      debouncedRequests,
      estimatedSavings,
    };
  }

  /**
   * Clear all queues (for testing)
   */
  clearQueues(): void {
    this.batchQueue = [];
    this.analyticsQueue = [];
    this.debouncedRequests.forEach((req) => clearTimeout(req.timeout));
    this.debouncedRequests.clear();
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.analyticsTimer) {
      clearTimeout(this.analyticsTimer);
      this.analyticsTimer = null;
    }
  }

  /**
   * Force flush all queues
   */
  async flushAll(): Promise<void> {
    await Promise.all([
      this.executeBatch(),
      this.flushAnalytics(),
    ]);
  }
}

export default new RequestBatchingService();

