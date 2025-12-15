import AsyncStorage from '@react-native-async-storage/async-storage';
// Note: Would need: npm install @react-native-async-storage/async-storage react-native-netinfo

interface QueuedAction {
  id: string;
  type: string;
  data: any;
  timestamp: number;
  retryCount: number;
}

interface CachedData {
  key: string;
  data: any;
  timestamp: number;
  expiresAt?: number;
}

class OfflineService {
  private static instance: OfflineService;
  private syncQueue: QueuedAction[] = [];
  private isSyncing = false;
  private readonly STORAGE_KEYS = {
    SYNC_QUEUE: '@neobank:sync_queue',
    CACHED_DATA: '@neobank:cached_data',
    LAST_SYNC: '@neobank:last_sync',
  };

  private constructor() {
    this.loadSyncQueue();
  }

  public static getInstance(): OfflineService {
    if (!OfflineService.instance) {
      OfflineService.instance = new OfflineService();
    }
    return OfflineService.instance;
  }

  // Queue Management
  private async loadSyncQueue() {
    try {
      const queueData = await AsyncStorage.getItem(this.STORAGE_KEYS.SYNC_QUEUE);
      if (queueData) {
        this.syncQueue = JSON.parse(queueData);
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
    }
  }

  private async saveSyncQueue() {
    try {
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.SYNC_QUEUE,
        JSON.stringify(this.syncQueue)
      );
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  }

  public async addToQueue(type: string, data: any): Promise<string> {
    const action: QueuedAction = {
      id: `${Date.now()}_${Math.random()}`,
      type,
      data,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.syncQueue.push(action);
    await this.saveSyncQueue();

    return action.id;
  }

  public async removeFromQueue(actionId: string) {
    this.syncQueue = this.syncQueue.filter((action) => action.id !== actionId);
    await this.saveSyncQueue();
  }

  public getQueueLength(): number {
    return this.syncQueue.length;
  }

  public async clearQueue() {
    this.syncQueue = [];
    await this.saveSyncQueue();
  }

  // Data Caching
  public async cacheData(key: string, data: any, ttl?: number) {
    try {
      const cachedData: CachedData = {
        key,
        data,
        timestamp: Date.now(),
        expiresAt: ttl ? Date.now() + ttl : undefined,
      };

      await AsyncStorage.setItem(
        `${this.STORAGE_KEYS.CACHED_DATA}:${key}`,
        JSON.stringify(cachedData)
      );
    } catch (error) {
      console.error(`Failed to cache data for ${key}:`, error);
    }
  }

  public async getCachedData(key: string): Promise<any | null> {
    try {
      const cachedDataString = await AsyncStorage.getItem(
        `${this.STORAGE_KEYS.CACHED_DATA}:${key}`
      );

      if (!cachedDataString) {
        return null;
      }

      const cachedData: CachedData = JSON.parse(cachedDataString);

      // Check if data has expired
      if (cachedData.expiresAt && Date.now() > cachedData.expiresAt) {
        await this.removeCachedData(key);
        return null;
      }

      return cachedData.data;
    } catch (error) {
      console.error(`Failed to get cached data for ${key}:`, error);
      return null;
    }
  }

  public async removeCachedData(key: string) {
    try {
      await AsyncStorage.removeItem(`${this.STORAGE_KEYS.CACHED_DATA}:${key}`);
    } catch (error) {
      console.error(`Failed to remove cached data for ${key}:`, error);
    }
  }

  public async clearAllCache() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((key) =>
        key.startsWith(this.STORAGE_KEYS.CACHED_DATA)
      );
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  // Sync Operations
  public async sync(apiService: any): Promise<boolean> {
    if (this.isSyncing || this.syncQueue.length === 0) {
      return true;
    }

    this.isSyncing = true;
    let allSuccessful = true;

    try {
      const actionsToSync = [...this.syncQueue];

      for (const action of actionsToSync) {
        try {
          await this.syncAction(action, apiService);
          await this.removeFromQueue(action.id);
        } catch (error) {
          console.error(`Failed to sync action ${action.id}:`, error);
          
          // Increment retry count
          action.retryCount++;
          
          // Remove if max retries exceeded
          if (action.retryCount >= 3) {
            console.warn(`Max retries exceeded for action ${action.id}, removing from queue`);
            await this.removeFromQueue(action.id);
          }
          
          allSuccessful = false;
        }
      }

      // Update last sync time
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.LAST_SYNC,
        Date.now().toString()
      );

      return allSuccessful;
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncAction(action: QueuedAction, apiService: any) {
    switch (action.type) {
      case 'TRADE_STOCK':
        await apiService.tradeStock(action.data);
        break;
      case 'TRADE_CRYPTO':
        await apiService.tradeCrypto(action.data);
        break;
      case 'APPLY_LOAN':
        await apiService.applyForLoan(action.data);
        break;
      case 'UPDATE_PROFILE':
        await apiService.updateProfile(action.data);
        break;
      default:
        console.warn(`Unknown action type: ${action.type}`);
    }
  }

  public async getLastSyncTime(): Promise<number | null> {
    try {
      const lastSync = await AsyncStorage.getItem(this.STORAGE_KEYS.LAST_SYNC);
      return lastSync ? parseInt(lastSync) : null;
    } catch (error) {
      console.error('Failed to get last sync time:', error);
      return null;
    }
  }

  // Offline-first operations
  public async executeWithOfflineSupport<T>(
    operation: () => Promise<T>,
    cacheKey: string,
    ttl?: number
  ): Promise<T> {
    try {
      // Try to execute operation
      const result = await operation();
      
      // Cache the result
      await this.cacheData(cacheKey, result, ttl);
      
      return result;
    } catch (error) {
      // If operation fails, try to get cached data
      console.log(`Operation failed, attempting to use cached data for ${cacheKey}`);
      const cachedData = await this.getCachedData(cacheKey);
      
      if (cachedData) {
        console.log(`Using cached data for ${cacheKey}`);
        return cachedData;
      }
      
      // If no cached data, throw the original error
      throw error;
    }
  }

  // Storage info
  public async getStorageInfo() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((key) =>
        key.startsWith(this.STORAGE_KEYS.CACHED_DATA)
      );

      return {
        totalKeys: keys.length,
        cacheKeys: cacheKeys.length,
        queueLength: this.syncQueue.length,
        lastSync: await this.getLastSyncTime(),
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return null;
    }
  }
}

export default OfflineService.getInstance();

