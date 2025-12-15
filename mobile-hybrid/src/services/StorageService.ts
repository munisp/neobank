import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
// In a real project, you would use a library like 'react-native-keychain' for mobile
// and a less secure alternative (e.g., encrypted AsyncStorage) for web.
// For this example, we'll use a simple mock for secure storage on web.

// --- TYPES AND INTERFACES ---

/**
 * Defines the structure for data stored in the cache.
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number; // Time of storage in milliseconds
  ttl: number; // Time-to-live in milliseconds
}

/**
 * Defines the structure for a pending offline synchronization operation.
 */
interface OfflineOperation {
  id: string;
  type: 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  payload: any;
  timestamp: number;
}

/**
 * Defines the public interface for the StorageService.
 */
export interface IStorageService {
  // Core Storage
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  clearAll(): Promise<void>;

  // Secure Storage
  getSecureItem(key: string): Promise<string | null>;
  setSecureItem(key: string, value: string): Promise<void>;
  removeSecureItem(key: string): Promise<void>;

  // Cache Management
  getCachedItem<T>(key: string): Promise<T | null>;
  setCachedItem<T>(key: string, value: T, ttlInSeconds: number): Promise<void>;
  
  // Offline Sync
  addOfflineOperation(operation: Omit<OfflineOperation, 'timestamp' | 'id'>): Promise<void>;
  processOfflineQueue(): Promise<void>;

  // Quota Management (Simulated)
  getStorageUsage(): Promise<{ totalBytes: number; usedBytes: number }>;
}

// --- CONSTANTS ---

const OFFLINE_QUEUE_KEY = '@StorageService:OfflineQueue';
const SECURE_STORAGE_PREFIX = '@StorageService:Secure:';
const CACHE_PREFIX = '@StorageService:Cache:';
const MAX_STORAGE_BYTES = 5 * 1024 * 1024; // 5MB limit for simulation

// --- UTILITY FUNCTIONS ---

/**
 * Handles JSON serialization with error handling.
 */
function serialize<T>(value: T): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    console.error('Serialization error:', error);
    throw new Error('Failed to serialize value.');
  }
}

/**
 * Handles JSON deserialization with error handling.
 */
function deserialize<T>(value: string | null): T | null {
  if (value === null) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.error('Deserialization error:', error);
    return null;
  }
}

/**
 * A simple mock for secure storage on web/non-keychain environments.
 * In a real app, this would be replaced by react-native-keychain on mobile
 * and a more robust, encrypted solution on web.
 */
const secureStorageMock = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      // WARNING: localStorage is NOT secure. This is a mock for demonstration.
      return localStorage.getItem(SECURE_STORAGE_PREFIX + key);
    }
    // Fallback for non-keychain mobile environment (should be replaced)
    return AsyncStorage.getItem(SECURE_STORAGE_PREFIX + key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(SECURE_STORAGE_PREFIX + key, value);
      return;
    }
    await AsyncStorage.setItem(SECURE_STORAGE_PREFIX + key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(SECURE_STORAGE_PREFIX + key);
      return;
    }
    await AsyncStorage.removeItem(SECURE_STORAGE_PREFIX + key);
  }
};

// --- STORAGE SERVICE IMPLEMENTATION ---

class StorageService implements IStorageService {

  // --- CORE STORAGE (AsyncStorage Wrapper) ---

  /**
   * Retrieves a value for a given key.
   */
  public async getItem<T>(key: string): Promise<T | null> {
    try {
      const serializedValue = await AsyncStorage.getItem(key);
      return deserialize<T>(serializedValue);
    } catch (error) {
      console.error(`Error getting item with key ${key}:`, error);
      return null;
    }
  }

  /**
   * Stores a value for a given key.
   */
  public async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const serializedValue = serialize(value);
      await this.checkQuota(key, serializedValue);
      await AsyncStorage.setItem(key, serializedValue);
    } catch (error) {
      console.error(`Error setting item with key ${key}:`, error);
      throw error; // Re-throw to allow calling code to handle quota/serialization errors
    }
  }

  /**
   * Removes an item for a given key.
   */
  public async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing item with key ${key}:`, error);
    }
  }

  /**
   * Clears all stored items. Use with caution.
   */
  public async clearAll(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Error clearing all storage:', error);
    }
  }

  // --- SECURE STORAGE (Phase 3) ---

  public async getSecureItem(key: string): Promise<string | null> {
    // In a real app, this would use react-native-keychain or a web equivalent
    return secureStorageMock.get(key);
  }

  public async setSecureItem(key: string, value: string): Promise<void> {
    // In a real app, this would use react-native-keychain or a web equivalent
    return secureStorageMock.set(key, value);
  }

  public async removeSecureItem(key: string): Promise<void> {
    // In a real app, this would use react-native-keychain or a web equivalent
    return secureStorageMock.remove(key);
  }

  // --- CACHE MANAGEMENT (Phase 3) ---

  public async getCachedItem<T>(key: string): Promise<T | null> {
    const cacheKey = CACHE_PREFIX + key;
    const entry = await this.getItem<CacheEntry<T>>(cacheKey);

    if (!entry) {
      return null;
    }

    const isExpired = Date.now() > entry.timestamp + entry.ttl;

    if (isExpired) {
      await this.removeItem(cacheKey);
      return null;
    }

    return entry.value;
  }

  public async setCachedItem<T>(key: string, value: T, ttlInSeconds: number): Promise<void> {
    const cacheKey = CACHE_PREFIX + key;
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttlInSeconds * 1000, // Convert seconds to milliseconds
    };
    await this.setItem(cacheKey, entry);
  }

  // --- OFFLINE SYNC (Phase 4) ---

  public async addOfflineOperation(operation: Omit<OfflineOperation, 'timestamp' | 'id'>): Promise<void> {
    const queue = await this.getItem<OfflineOperation[]>(OFFLINE_QUEUE_KEY) || [];
    const newOperation: OfflineOperation = {
      ...operation,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };
    queue.push(newOperation);
    await this.setItem(OFFLINE_QUEUE_KEY, queue);
  }

  public async processOfflineQueue(): Promise<void> {
    // This is a placeholder for the actual sync logic (Phase 4)
    console.log('Starting offline queue processing...');
    const queue = await this.getItem<OfflineOperation[]>(OFFLINE_QUEUE_KEY) || [];
    
    if (queue.length === 0) {
      console.log('Offline queue is empty.');
      return;
    }

    // Simulate network check and processing
    // In a real app, you'd check NetInfo and use a fetch/axios client
    const isOnline = true; // Assume online for now

    if (!isOnline) {
      console.log('Device is offline. Sync postponed.');
      return;
    }

    let successfulOperations = 0;
    const failedQueue: OfflineOperation[] = [];

    for (const operation of queue) {
      try {
        // Simulate API call
        // await fetch(operation.endpoint, { method: operation.type, body: JSON.stringify(operation.payload) });
        console.log(`Successfully processed operation ${operation.id} (${operation.type} ${operation.endpoint})`);
        successfulOperations++;
      } catch (error) {
        console.error(`Failed to process operation ${operation.id}:`, error);
        failedQueue.push(operation);
      }
    }

    // Update the queue with only the failed operations
    await this.setItem(OFFLINE_QUEUE_KEY, failedQueue);
    console.log(`Offline sync complete. Successful: ${successfulOperations}, Failed: ${failedQueue.length}`);
  }

  // --- QUOTA MANAGEMENT (Phase 4) ---

  /**
   * Simulates checking the storage quota before setting a new item.
   * NOTE: AsyncStorage does not provide a direct way to get used space.
   * This is a simulation based on key/value size estimation.
   */
  private async checkQuota(key: string, serializedValue: string): Promise<void> {
    const currentUsage = await this.getStorageUsage();
    const newItemSize = (key.length * 2) + (serializedValue.length * 2); // Rough byte estimation (2 bytes per char for UTF-16)
    
    // We need to account for the size of the item being replaced, if it exists.
    let oldItemSize = 0;
    const oldSerializedValue = await AsyncStorage.getItem(key);
    if (oldSerializedValue) {
      oldItemSize = (key.length * 2) + (oldSerializedValue.length * 2);
    }

    const netChange = newItemSize - oldItemSize;
    const projectedUsage = currentUsage.usedBytes + netChange;

    if (projectedUsage > MAX_STORAGE_BYTES) {
      throw new Error(\`Storage quota exceeded. Projected usage: \${(projectedUsage / 1024 / 1024).toFixed(2)}MB. Max: \${(MAX_STORAGE_BYTES / 1024 / 1024).toFixed(2)}MB.\`);
    }
  }

  /**
   * Simulates calculating the current storage usage.
   * NOTE: This is a highly simplified and inaccurate simulation.
   * A real implementation would require iterating over all keys and estimating size.
   */
  public async getStorageUsage(): Promise<{ totalBytes: number; usedBytes: number }> {
    let usedBytes = 0;
    try {
      const keys = await AsyncStorage.getAllKeys();
      const items = await AsyncStorage.multiGet(keys);
      
      for (const [key, value] of items) {
        if (key && value) {
          // Rough byte estimation (2 bytes per char for UTF-16)
          usedBytes += (key.length * 2) + (value.length * 2);
        }
      }
    } catch (error) {
      console.error('Error calculating storage usage:', error);
    }

    return {
      totalBytes: MAX_STORAGE_BYTES,
      usedBytes: usedBytes,
    };
  }
}

export const StorageServiceInstance = new StorageService();
export default StorageServiceInstance;

// --- ENCRYPTION UTILITIES (Phase 3) ---

// NOTE: For a production-ready service, you would use a robust
// encryption library like 'crypto-js' or 'react-native-crypto'
// with a securely stored key (e.g., from react-native-keychain).

// Placeholder for encryption/decryption functions
// For this example, we'll assume the secure storage handles the encryption.
// If we were to encrypt non-secure data, these would be used:

// const ENCRYPTION_KEY = 'YOUR_SECRET_KEY'; // MUST be securely managed

// function encrypt(data: string): string {
//   // return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
//   return \`ENCRYPTED(\${data})\`;
// }

// function decrypt(data: string): string {
//   // const bytes = CryptoJS.AES.decrypt(data, ENCRYPTION_KEY);
//   // return bytes.toString(CryptoJS.enc.Utf8);
//   return data.replace('ENCRYPTED(', '').replace(')', '');
// }