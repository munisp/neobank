// ApiServiceTypes.ts

import { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';

// --- Core Types ---

/**
 * Represents the structure of a successful API response body.
 * T is the type of the data payload.
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  statusCode: number;
}

/**
 * Represents a request that failed due to an authentication error (e.g., 401)
 * and needs to be retried after token refresh.
 */
export interface FailedRequestQueueItem {
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
  config: AxiosRequestConfig;
}

/**
 * Represents the structure of the stored authentication tokens.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // Unix timestamp for expiration
}

// --- API Data Models (Simplified for structure) ---

export interface Account {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
}

export interface TransferDetails {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
}

export interface Card {
  id: string;
  last4: string;
  status: 'active' | 'blocked';
}

export interface Loan {
  id: string;
  amount: number;
  interestRate: number;
  status: 'active' | 'paid';
}

export interface Investment {
  id: string;
  name: string;
  value: number;
}

export interface InsurancePolicy {
  id: string;
  type: string;
  premium: number;
}

export interface BillPayment {
  id: string;
  billerName: string;
  amount: number;
  dueDate: string;
}

export interface Budget {
  id: string;
  category: string;
  limit: number;
  spent: number;
}

export interface Document {
  id: string;
  name: string;
  url: string;
}

export interface AnalyticsData {
  monthlySpend: { month: string; amount: number }[];
  categoryBreakdown: { category: string; percentage: number }[];
}

// --- API Service Interface ---

export interface IApiService {
  // Auth & Utility
  setTokens(tokens: AuthTokens): Promise<void>;
  clearTokens(): Promise<void>;
  isLoggedIn(): Promise<boolean>;
  isOnline: boolean;

  // Accounts
  getAccounts(): Promise<ApiResponse<Account[]>>;
  getAccount(id: string): Promise<ApiResponse<Account>>;

  // Transactions
  getTransactions(accountId: string): Promise<ApiResponse<Transaction[]>>;
  getTransaction(id: string): Promise<ApiResponse<Transaction>>;

  // Transfers
  createTransfer(details: TransferDetails): Promise<ApiResponse<{ transferId: string }>>;

  // Cards
  getCards(): Promise<ApiResponse<Card[]>>;
  blockCard(cardId: string): Promise<ApiResponse<Card>>;

  // Loans
  getLoans(): Promise<ApiResponse<Loan[]>>;

  // Investments
  getInvestments(): Promise<ApiResponse<Investment[]>>;

  // Insurance
  getInsurancePolicies(): Promise<ApiResponse<InsurancePolicy[]>>;

  // Bill Payments
  payBill(payment: Omit<BillPayment, 'id'>): Promise<ApiResponse<{ paymentId: string }>>;

  // Budgets
  getBudgets(): Promise<ApiResponse<Budget[]>>;
  createBudget(budget: Omit<Budget, 'id' | 'spent'>): Promise<ApiResponse<Budget>>;

  // Analytics
  getAnalyticsData(): Promise<ApiResponse<AnalyticsData>>;

  // Documents
  getDocuments(): Promise<ApiResponse<Document[]>>;
  downloadDocument(id: string): Promise<ApiResponse<string>>; // Returns local file path or base64
}

// ApiService.ts

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
  IApiService,
  AuthTokens,
  ApiResponse,
  FailedRequestQueueItem,
  Account,
  Transaction,
  TransferDetails,
  Card,
  Loan,
  Investment,
  InsurancePolicy,
  BillPayment,
  Budget,
  Document,
  AnalyticsData,
} from './ApiServiceTypes';

// --- Configuration ---
const API_BASE_URL = 'https://api.neobank.com/v1';
const ASYNC_STORAGE_KEY_TOKENS = '@NeoBank:AuthTokens';
const ASYNC_STORAGE_KEY_OFFLINE_QUEUE = '@NeoBank:OfflineQueue';

// --- Utility Functions (Mock for React Native specific imports) ---

// Mock implementation for NetInfo.fetch() and AsyncStorage
// In a real React Native project, these would be imported from the respective packages.
// For the purpose of this task, we'll assume they are available and functional.

// Mock NetInfo for web/testing environment
const mockNetInfo = {
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
  addEventListener: (callback: (state: { isConnected: boolean }) => void) => {
    // Mock network status change listener
    const interval = setInterval(() => {
      // Simulate network status change
      const isConnected = Math.random() > 0.1;
      callback({ isConnected });
    }, 5000);
    return () => clearInterval(interval);
  },
};

// Mock AsyncStorage for web/testing environment
const mockAsyncStorage = {
  getItem: async (key: string) => {
    if (key === ASYNC_STORAGE_KEY_TOKENS) {
      // Mock stored tokens
      return JSON.stringify({
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
        expiresIn: Date.now() + 3600000, // Expires in 1 hour
      });
    }
    return null;
  },
  setItem: async (key: string, value: string) => {},
  removeItem: async (key: string) => {},
};

// Use actual imports if running in a React Native environment, otherwise use mocks
// NOTE: In a real project, you would need to install these packages:
// npm install axios @react-native-async-storage/async-storage @react-native-community/netinfo
// npm install -D @types/react-native @types/axios
const RN_AsyncStorage = AsyncStorage || mockAsyncStorage;
const RN_NetInfo = NetInfo || mockNetInfo;

// --- ApiService Implementation ---

class ApiService implements IApiService {
  private axiosInstance: AxiosInstance;
  private isRefreshing: boolean = false;
  private failedRequestsQueue: FailedRequestQueueItem[] = [];
  private currentTokens: AuthTokens | null = null;
  public isOnline: boolean = true;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 15000, // 15 seconds timeout
    });

    this.setupInterceptors();
    this.initNetworkListener();
    this.loadTokens();
  }

  // --- Initialization and Utility ---

  private async loadTokens(): Promise<void> {
    try {
      const tokensJson = await RN_AsyncStorage.getItem(ASYNC_STORAGE_KEY_TOKENS);
      if (tokensJson) {
        this.currentTokens = JSON.parse(tokensJson);
      }
    } catch (error) {
      console.error('Failed to load tokens from storage:', error);
    }
  }

  public async setTokens(tokens: AuthTokens): Promise<void> {
    this.currentTokens = tokens;
    try {
      await RN_AsyncStorage.setItem(ASYNC_STORAGE_KEY_TOKENS, JSON.stringify(tokens));
    } catch (error) {
      console.error('Failed to save tokens to storage:', error);
    }
  }

  public async clearTokens(): Promise<void> {
    this.currentTokens = null;
    try {
      await RN_AsyncStorage.removeItem(ASYNC_STORAGE_KEY_TOKENS);
    } catch (error) {
      console.error('Failed to remove tokens from storage:', error);
    }
  }

  public async isLoggedIn(): Promise<boolean> {
    await this.loadTokens(); // Ensure tokens are loaded
    return !!this.currentTokens?.accessToken;
  }

  private initNetworkListener(): void {
    RN_NetInfo.addEventListener(state => {
      const wasOnline = this.isOnline;
      this.isOnline = !!state.isConnected;
      if (!wasOnline && this.isOnline) {
        console.log('Network reconnected. Processing offline queue...');
        this.processOfflineQueue();
      }
    });
  }

  // --- Interceptors ---

  private setupInterceptors(): void {
    // Request Interceptor: Add Authorization header
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        if (this.currentTokens?.accessToken) {
          config.headers.Authorization = `Bearer ${this.currentTokens.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response Interceptor: Handle token refresh and error formatting
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // Format successful response to match ApiResponse structure
        return {
          ...response,
          data: {
            success: true,
            data: response.data,
            statusCode: response.status,
          } as ApiResponse,
        };
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

        // 1. Handle Network Error (Offline support)
        if (!error.response && !this.isOnline) {
          console.warn('Request failed due to network error. Adding to offline queue.');
          return this.handleOfflineRequest(originalRequest);
        }

        // 2. Handle 401 Unauthorized (Token Refresh)
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          return this.handleTokenRefresh(originalRequest);
        }

        // 3. Handle other API errors
        return this.formatApiError(error);
      }
    );
  }

  // --- Token Refresh Logic ---

  private async handleTokenRefresh(originalRequest: AxiosRequestConfig): Promise<AxiosResponse<ApiResponse>> {
    return new Promise(async (resolve, reject) => {
      this.failedRequestsQueue.push({ resolve, reject, config: originalRequest });

      if (!this.isRefreshing) {
        this.isRefreshing = true;
        try {
          const newTokens = await this.refreshToken();
          this.setTokens(newTokens);
          this.processQueue(null, newTokens.accessToken);
        } catch (refreshError) {
          this.processQueue(refreshError);
          this.clearTokens();
        } finally {
          this.isRefreshing = false;
        }
      }
    });
  }

  private async refreshToken(): Promise<AuthTokens> {
    if (!this.currentTokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    // NOTE: This is a mock implementation. In a real app, this would be a dedicated API call.
    console.log('Attempting to refresh token...');
    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refreshToken: this.currentTokens.refreshToken,
    });

    if (response.status === 200 && response.data.accessToken) {
      return {
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken || this.currentTokens.refreshToken,
        expiresIn: Date.now() + 3600000, // New expiration time
      };
    } else {
      throw new Error('Token refresh failed');
    }
  }

  private processQueue(error: any | null, accessToken?: string): void {
    this.failedRequestsQueue.forEach((promise) => {
      if (error) {
        promise.reject(error);
      } else if (accessToken) {
        promise.config.headers = {
          ...promise.config.headers,
          Authorization: `Bearer ${accessToken}`,
        };
        // Re-run the original request with the new token
        this.axiosInstance(promise.config).then(promise.resolve).catch(promise.reject);
      }
    });
    this.failedRequestsQueue = [];
  }

  // --- Offline Queue Logic ---

  private async handleOfflineRequest(originalRequest: AxiosRequestConfig): Promise<AxiosResponse<ApiResponse>> {
    // Only queue POST, PUT, DELETE requests that modify state
    if (['POST', 'PUT', 'DELETE'].includes(originalRequest.method?.toUpperCase() || '')) {
      const queueItem = {
        method: originalRequest.method,
        url: originalRequest.url,
        data: originalRequest.data,
        headers: originalRequest.headers,
      };
      await this.saveToOfflineQueue(queueItem);
      // Return a custom response indicating the request was queued
      return Promise.resolve({
        status: 202,
        statusText: 'Accepted',
        config: originalRequest,
        headers: {},
        data: {
          success: true,
          data: { message: 'Request queued for later submission.' },
          statusCode: 202,
        } as ApiResponse,
      });
    }

    // For GET requests, reject immediately or return cached data (advanced feature, not implemented here)
    return Promise.reject(this.createNetworkError(originalRequest));
  }

  private async saveToOfflineQueue(item: any): Promise<void> {
    try {
      const queueJson = await RN_AsyncStorage.getItem(ASYNC_STORAGE_KEY_OFFLINE_QUEUE);
      const queue = queueJson ? JSON.parse(queueJson) : [];
      queue.push(item);
      await RN_AsyncStorage.setItem(ASYNC_STORAGE_KEY_OFFLINE_QUEUE, JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to save to offline queue:', error);
    }
  }

  private async processOfflineQueue(): Promise<void> {
    if (!this.isOnline) return;

    try {
      const queueJson = await RN_AsyncStorage.getItem(ASYNC_STORAGE_KEY_OFFLINE_QUEUE);
      const queue: any[] = queueJson ? JSON.parse(queueJson) : [];

      if (queue.length === 0) return;

      console.log(`Processing ${queue.length} offline requests...`);

      const successfulRequests: any[] = [];
      for (const item of queue) {
        try {
          // Re-run the request using the main axios instance
          await this.axiosInstance.request({
            method: item.method,
            url: item.url,
            data: item.data,
            headers: item.headers,
          });
          successfulRequests.push(item);
        } catch (error) {
          console.error('Failed to process offline request:', item, error);
          // Stop processing on first failure to maintain order and prevent further errors
          break;
        }
      }

      // Remove successfully processed requests from the queue
      const remainingQueue = queue.slice(successfulRequests.length);
      await RN_AsyncStorage.setItem(ASYNC_STORAGE_KEY_OFFLINE_QUEUE, JSON.stringify(remainingQueue));

      if (remainingQueue.length === 0) {
        console.log('Offline queue successfully cleared.');
      } else {
        console.warn(`${remainingQueue.length} requests remain in the offline queue.`);
      }
    } catch (error) {
      console.error('Error processing offline queue:', error);
    }
  }

  // --- Error Handling ---

  private createNetworkError(config: AxiosRequestConfig): AxiosError<ApiResponse> {
    const error = new Error('Network Error: No internet connection.') as AxiosError<ApiResponse>;
    error.isAxiosError = true;
    error.config = config;
    error.name = 'NetworkError';
    error.message = 'No internet connection or server unreachable.';
    error.code = 'ERR_NETWORK';
    return error;
  }

  private formatApiError(error: AxiosError): Promise<AxiosResponse<ApiResponse>> {
    const response = error.response;
    const statusCode = response?.status || 500;
    const errorData = response?.data as any;

    const apiResponse: ApiResponse = {
      success: false,
      data: errorData?.data || null,
      message: errorData?.message || error.message || 'An unknown error occurred.',
      statusCode: statusCode,
    };

    // Create a new error object that wraps the formatted response
    const formattedError = new Error(apiResponse.message) as AxiosError<ApiResponse>;
    formattedError.isAxiosError = true;
    formattedError.config = error.config;
    formattedError.name = 'ApiServiceError';
    formattedError.response = {
      ...response,
      data: apiResponse,
    } as AxiosResponse<ApiResponse>;

    return Promise.reject(formattedError);
  }

  // --- Generic Request Method ---

  private async request<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.axiosInstance.request<ApiResponse<T>>(config);
      return response.data;
    } catch (error) {
      // The error is already formatted by the response interceptor
      // Re-throw the error for the caller to handle
      throw error;
    }
  }

  // --- API Methods Implementation ---

  // Accounts
  public getAccounts(): Promise<ApiResponse<Account[]>> {
    return this.request<Account[]>({ method: 'GET', url: '/accounts' });
  }

  public getAccount(id: string): Promise<ApiResponse<Account>> {
    return this.request<Account>({ method: 'GET', url: `/accounts/${id}` });
  }

  // Transactions
  public getTransactions(accountId: string): Promise<ApiResponse<Transaction[]>> {
    return this.request<Transaction[]>({ method: 'GET', url: `/accounts/${accountId}/transactions` });
  }

  public getTransaction(id: string): Promise<ApiResponse<Transaction>> {
    return this.request<Transaction>({ method: 'GET', url: `/transactions/${id}` });
  }

  // Transfers
  public createTransfer(details: TransferDetails): Promise<ApiResponse<{ transferId: string }>> {
    return this.request<{ transferId: string }>({ method: 'POST', url: '/transfers', data: details });
  }

  // Cards
  public getCards(): Promise<ApiResponse<Card[]>> {
    return this.request<Card[]>({ method: 'GET', url: '/cards' });
  }

  public blockCard(cardId: string): Promise<ApiResponse<Card>> {
    // Assuming a PUT or POST to change status
    return this.request<Card>({ method: 'PUT', url: `/cards/${cardId}/block` });
  }

  // Loans
  public getLoans(): Promise<ApiResponse<Loan[]>> {
    return this.request<Loan[]>({ method: 'GET', url: '/loans' });
  }

  // Investments
  public getInvestments(): Promise<ApiResponse<Investment[]>> {
    return this.request<Investment[]>({ method: 'GET', url: '/investments' });
  }

  // Insurance
  public getInsurancePolicies(): Promise<ApiResponse<InsurancePolicy[]>> {
    return this.request<InsurancePolicy[]>({ method: 'GET', url: '/insurance/policies' });
  }

  // Bill Payments
  public payBill(payment: Omit<BillPayment, 'id'>): Promise<ApiResponse<{ paymentId: string }>> {
    return this.request<{ paymentId: string }>({ method: 'POST', url: '/bills/pay', data: payment });
  }

  // Budgets
  public getBudgets(): Promise<ApiResponse<Budget[]>> {
    return this.request<Budget[]>({ method: 'GET', url: '/budgets' });
  }

  public createBudget(budget: Omit<Budget, 'id' | 'spent'>): Promise<ApiResponse<Budget>> {
    return this.request<Budget>({ method: 'POST', url: '/budgets', data: budget });
  }

  // Analytics
  public getAnalyticsData(): Promise<ApiResponse<AnalyticsData>> {
    return this.request<AnalyticsData>({ method: 'GET', url: '/analytics' });
  }

  // Documents
  public getDocuments(): Promise<ApiResponse<Document[]>> {
    return this.request<Document[]>({ method: 'GET', url: '/documents' });
  }

  public downloadDocument(id: string): Promise<ApiResponse<string>> {
    // NOTE: This is a simplified mock. Real implementation would handle file download and storage.
    return this.request<string>({ method: 'GET', url: `/documents/${id}/download` });
  }
}

// Export a singleton instance
export const apiService = new ApiService();
export default apiService;
