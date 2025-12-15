import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum cache size in MB
  strategy: 'cache-first' | 'network-first' | 'cache-only' | 'network-only';
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  size: number;
}

class CachingService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cacheSize: number = 0;
  private readonly MAX_CACHE_SIZE_MB = 50;
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private isOnline: boolean = true;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadCacheFromStorage();
    this.setupNetworkListener();
  }

  private setupNetworkListener() {
    NetInfo.addEventListener((state) => {
      this.isOnline = state.isConnected ?? false;
      console.log('Network status:', this.isOnline ? 'Online' : 'Offline');
    });
  }

  private async loadCacheFromStorage() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((key) => key.startsWith('cache_'));

      for (const key of cacheKeys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          const entry: CacheEntry<any> = JSON.parse(value);
          const cacheKey = key.replace('cache_', '');
          
          // Check if entry is still valid
          if (entry.expiresAt > Date.now()) {
            this.cache.set(cacheKey, entry);
            this.cacheSize += entry.size;
          } else {
            // Remove expired entry
            await AsyncStorage.removeItem(key);
          }
        }
      }

      console.log(`Loaded ${this.cache.size} cache entries (${this.cacheSize} bytes)`);
    } catch (error) {
      console.error('Error loading cache from storage:', error);
    }
  }

  private async saveCacheToStorage(key: string, entry: CacheEntry<any>) {
    try {
      await AsyncStorage.setItem(`cache_${key}`, JSON.stringify(entry));
    } catch (error) {
      console.error('Error saving cache to storage:', error);
    }
  }

  private calculateSize(data: any): number {
    // Rough estimate of data size in bytes
    return JSON.stringify(data).length;
  }

  private async evictOldestEntry() {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    this.cache.forEach((entry, key) => {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      await this.remove(oldestKey);
    }
  }

  async set<T>(
    key: string,
    data: T,
    config?: Partial<CacheConfig>
  ): Promise<void> {
    const ttl = config?.ttl || this.DEFAULT_TTL;
    const now = Date.now();
    const size = this.calculateSize(data);

    // Check if we need to evict entries
    const maxSizeBytes = (config?.maxSize || this.MAX_CACHE_SIZE_MB) * 1024 * 1024;
    while (this.cacheSize + size > maxSizeBytes && this.cache.size > 0) {
      await this.evictOldestEntry();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + ttl,
      size,
    };

    // Update cache size
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      this.cacheSize -= existingEntry.size;
    }
    this.cacheSize += size;

    // Store in memory and persistent storage
    this.cache.set(key, entry);
    await this.saveCacheToStorage(key, entry);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (entry.expiresAt < Date.now()) {
      await this.remove(key);
      return null;
    }

    return entry.data as T;
  }

  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    config?: Partial<CacheConfig>
  ): Promise<T> {
    const strategy = config?.strategy || 'cache-first';

    switch (strategy) {
      case 'cache-first':
        const cached = await this.get<T>(key);
        if (cached !== null) {
          return cached;
        }
        const data = await fetchFn();
        await this.set(key, data, config);
        return data;

      case 'network-first':
        try {
          if (this.isOnline) {
            const data = await fetchFn();
            await this.set(key, data, config);
            return data;
          }
        } catch (error) {
          console.log('Network fetch failed, falling back to cache');
        }
        const fallback = await this.get<T>(key);
        if (fallback !== null) {
          return fallback;
        }
        throw new Error('No cached data available');

      case 'cache-only':
        const cacheOnly = await this.get<T>(key);
        if (cacheOnly === null) {
          throw new Error('No cached data available');
        }
        return cacheOnly;

      case 'network-only':
        const networkData = await fetchFn();
        await this.set(key, networkData, config);
        return networkData;

      default:
        return await fetchFn();
    }
  }

  async remove(key: string): Promise<void> {
    const entry = this.cache.get(key);
    if (entry) {
      this.cacheSize -= entry.size;
      this.cache.delete(key);
      await AsyncStorage.removeItem(`cache_${key}`);
    }
  }

  async clear(): Promise<void> {
    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      await AsyncStorage.removeItem(`cache_${key}`);
    }
    this.cache.clear();
    this.cacheSize = 0;
  }

  async clearExpired(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.cache.forEach((entry, key) => {
      if (entry.expiresAt < now) {
        expiredKeys.push(key);
      }
    });

    for (const key of expiredKeys) {
      await this.remove(key);
    }

    console.log(`Cleared ${expiredKeys.length} expired cache entries`);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    return entry.expiresAt > Date.now();
  }

  getSize(): number {
    return this.cacheSize;
  }

  getSizeMB(): number {
    return this.cacheSize / (1024 * 1024);
  }

  getEntryCount(): number {
    return this.cache.size;
  }

  async invalidate(pattern: string): Promise<void> {
    const regex = new RegExp(pattern);
    const keysToRemove: string[] = [];

    this.cache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToRemove.push(key);
      }
    });

    for (const key of keysToRemove) {
      await this.remove(key);
    }

    console.log(`Invalidated ${keysToRemove.length} cache entries matching pattern: ${pattern}`);
  }

  // Specific cache methods for common use cases
  async cacheUserData(userId: string, data: any): Promise<void> {
    await this.set(`user_${userId}`, data, { ttl: 30 * 60 * 1000 }); // 30 minutes
  }

  async getCachedUserData(userId: string): Promise<any | null> {
    return await this.get(`user_${userId}`);
  }

  async cacheTransactions(userId: string, transactions: any[]): Promise<void> {
    await this.set(`transactions_${userId}`, transactions, { ttl: 5 * 60 * 1000 }); // 5 minutes
  }

  async getCachedTransactions(userId: string): Promise<any[] | null> {
    return await this.get(`transactions_${userId}`);
  }

  async cacheBalance(userId: string, balance: number): Promise<void> {
    await this.set(`balance_${userId}`, balance, { ttl: 2 * 60 * 1000 }); // 2 minutes
  }

  async getCachedBalance(userId: string): Promise<number | null> {
    return await this.get(`balance_${userId}`);
  }

  async cacheStockData(symbol: string, data: any): Promise<void> {
    await this.set(`stock_${symbol}`, data, { ttl: 60 * 1000 }); // 1 minute
  }

  async getCachedStockData(symbol: string): Promise<any | null> {
    return await this.get(`stock_${symbol}`);
  }

  isOnlineMode(): boolean {
    return this.isOnline;
  }

  async prefetchData(keys: string[], fetchFns: (() => Promise<any>)[]): Promise<void> {
    if (!this.isOnline) {
      console.log('Offline mode, skipping prefetch');
      return;
    }

    const promises = keys.map((key, index) =>
      this.getOrFetch(key, fetchFns[index], { strategy: 'network-first' })
    );

    try {
      await Promise.all(promises);
      console.log(`Prefetched ${keys.length} data entries`);
    } catch (error) {
      console.error('Error prefetching data:', error);
    }
  }
}

export default new CachingService();

