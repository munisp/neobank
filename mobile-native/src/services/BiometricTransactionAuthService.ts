import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from './ApiService';
import EncryptionService from './EncryptionService';
import * as Haptics from 'expo-haptics';

export type BiometricType = 'fingerprint' | 'facial' | 'iris' | 'none';

export interface BiometricConfig {
  enabled: boolean;
  requiredForTransactions: boolean;
  requiredForHighValue: boolean;
  highValueThreshold: number;
  requiredForLogin: boolean;
  requiredForSettings: boolean;
  fallbackToPin: boolean;
  maxAttempts: number;
  lockoutDuration: number; // minutes
}

export interface TransactionAuthRequest {
  transactionId: string;
  type: 'transfer' | 'payment' | 'withdrawal' | 'investment' | 'bill_pay';
  amount: number;
  recipient?: string;
  description?: string;
  requiresBiometric: boolean;
}

export interface BiometricAuthResult {
  success: boolean;
  biometricType?: BiometricType;
  error?: string;
  fallbackUsed?: boolean;
  timestamp: Date;
}

class BiometricTransactionAuthService {
  private isAvailable: boolean = false;
  private supportedTypes: BiometricType[] = [];
  private config: BiometricConfig = {
    enabled: false,
    requiredForTransactions: false,
    requiredForHighValue: true,
    highValueThreshold: 1000,
    requiredForLogin: true,
    requiredForSettings: true,
    fallbackToPin: true,
    maxAttempts: 3,
    lockoutDuration: 15,
  };
  private failedAttempts: number = 0;
  private lockedUntil: Date | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      // Check if biometric hardware is available
      this.isAvailable = await LocalAuthentication.hasHardwareAsync();

      if (this.isAvailable) {
        // Check if biometrics are enrolled
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (isEnrolled) {
          // Get supported biometric types
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          this.supportedTypes = this.mapBiometricTypes(types);

          // Load saved config
          await this.loadConfig();
        }
      }

      console.log('Biometric auth available:', this.isAvailable);
      console.log('Supported types:', this.supportedTypes);
    } catch (error) {
      console.error('Error initializing biometric auth:', error);
    }
  }

  private mapBiometricTypes(types: LocalAuthentication.AuthenticationType[]): BiometricType[] {
    const mapped: BiometricType[] = [];

    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      mapped.push('fingerprint');
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      mapped.push('facial');
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      mapped.push('iris');
    }

    return mapped;
  }

  async authenticateTransaction(request: TransactionAuthRequest): Promise<BiometricAuthResult> {
    // Check if locked out
    if (this.isLockedOut()) {
      const remainingTime = this.getRemainingLockoutTime();
      return {
        success: false,
        error: `Too many failed attempts. Try again in ${remainingTime} minutes.`,
        timestamp: new Date(),
      };
    }

    // Check if biometric is required for this transaction
    const requiresBiometric = this.shouldRequireBiometric(request);

    if (!requiresBiometric) {
      return {
        success: true,
        timestamp: new Date(),
      };
    }

    // Perform biometric authentication
    try {
      const result = await this.performBiometricAuth(
        `Authenticate to ${request.type} $${request.amount.toFixed(2)}${request.recipient ? ` to ${request.recipient}` : ''}`
      );

      if (result.success) {
        // Reset failed attempts on success
        this.failedAttempts = 0;
        await this.saveFailedAttempts();

        // Log successful authentication
        await this.logAuthEvent(request, true, result.biometricType);

        // Haptic feedback
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        return result;
      } else {
        // Increment failed attempts
        this.failedAttempts++;
        await this.saveFailedAttempts();

        // Check if should lock out
        if (this.failedAttempts >= this.config.maxAttempts) {
          await this.lockout();
        }

        // Log failed authentication
        await this.logAuthEvent(request, false, result.biometricType);

        // Haptic feedback
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        return result;
      }
    } catch (error) {
      console.error('Error during biometric authentication:', error);
      return {
        success: false,
        error: 'Authentication failed. Please try again.',
        timestamp: new Date(),
      };
    }
  }

  private shouldRequireBiometric(request: TransactionAuthRequest): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // Always require for high-value transactions
    if (this.config.requiredForHighValue && request.amount >= this.config.highValueThreshold) {
      return true;
    }

    // Require for all transactions if configured
    if (this.config.requiredForTransactions) {
      return true;
    }

    // Explicitly required
    if (request.requiresBiometric) {
      return true;
    }

    return false;
  }

  private async performBiometricAuth(promptMessage: string): Promise<BiometricAuthResult> {
    if (!this.isAvailable) {
      return {
        success: false,
        error: 'Biometric authentication is not available on this device.',
        timestamp: new Date(),
      };
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        fallbackLabel: this.config.fallbackToPin ? 'Use PIN' : undefined,
        cancelLabel: 'Cancel',
        disableDeviceFallback: !this.config.fallbackToPin,
      });

      if (result.success) {
        return {
          success: true,
          biometricType: this.supportedTypes[0] || 'none',
          timestamp: new Date(),
        };
      } else {
        return {
          success: false,
          error: result.error || 'Authentication failed',
          fallbackUsed: result.error === 'user_fallback',
          timestamp: new Date(),
        };
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return {
        success: false,
        error: 'Authentication failed. Please try again.',
        timestamp: new Date(),
      };
    }
  }

  async authenticateForLogin(): Promise<BiometricAuthResult> {
    if (!this.config.requiredForLogin) {
      return { success: true, timestamp: new Date() };
    }

    return await this.performBiometricAuth('Authenticate to login');
  }

  async authenticateForSettings(): Promise<BiometricAuthResult> {
    if (!this.config.requiredForSettings) {
      return { success: true, timestamp: new Date() };
    }

    return await this.performBiometricAuth('Authenticate to access settings');
  }

  async authenticateForCardView(): Promise<BiometricAuthResult> {
    return await this.performBiometricAuth('Authenticate to view card details');
  }

  async authenticateForAccountAccess(accountType: string): Promise<BiometricAuthResult> {
    return await this.performBiometricAuth(`Authenticate to access ${accountType} account`);
  }

  async enableBiometricAuth(): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable) {
      return {
        success: false,
        error: 'Biometric authentication is not available on this device.',
      };
    }

    // Test biometric authentication
    const result = await this.performBiometricAuth('Enable biometric authentication');

    if (result.success) {
      this.config.enabled = true;
      await this.saveConfig();

      // Register with backend
      await ApiService.post('/security/biometric/enable', {
        biometricType: result.biometricType,
        deviceId: await this.getDeviceId(),
      });

      return { success: true };
    } else {
      return {
        success: false,
        error: result.error || 'Failed to enable biometric authentication',
      };
    }
  }

  async disableBiometricAuth(): Promise<void> {
    this.config.enabled = false;
    await this.saveConfig();

    // Unregister with backend
    await ApiService.post('/security/biometric/disable', {
      deviceId: await this.getDeviceId(),
    });
  }

  async updateConfig(updates: Partial<BiometricConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();

    // Sync with backend
    await ApiService.put('/security/biometric/config', this.config);
  }

  private async saveConfig(): Promise<void> {
    try {
      await AsyncStorage.setItem('biometric_config', JSON.stringify(this.config));
    } catch (error) {
      console.error('Error saving biometric config:', error);
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem('biometric_config');
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Error loading biometric config:', error);
    }
  }

  private async saveFailedAttempts(): Promise<void> {
    try {
      await AsyncStorage.setItem('biometric_failed_attempts', this.failedAttempts.toString());
    } catch (error) {
      console.error('Error saving failed attempts:', error);
    }
  }

  private async loadFailedAttempts(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem('biometric_failed_attempts');
      if (saved) {
        this.failedAttempts = parseInt(saved, 10);
      }
    } catch (error) {
      console.error('Error loading failed attempts:', error);
    }
  }

  private async lockout(): Promise<void> {
    this.lockedUntil = new Date(Date.now() + this.config.lockoutDuration * 60 * 1000);
    await AsyncStorage.setItem('biometric_locked_until', this.lockedUntil.toISOString());

    // Notify user
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    // Log lockout event
    await ApiService.post('/security/biometric/lockout', {
      deviceId: await this.getDeviceId(),
      lockedUntil: this.lockedUntil,
    });
  }

  private isLockedOut(): boolean {
    if (!this.lockedUntil) {
      return false;
    }

    const now = new Date();
    if (now < this.lockedUntil) {
      return true;
    }

    // Lockout expired
    this.lockedUntil = null;
    this.failedAttempts = 0;
    AsyncStorage.removeItem('biometric_locked_until');
    this.saveFailedAttempts();

    return false;
  }

  private getRemainingLockoutTime(): number {
    if (!this.lockedUntil) {
      return 0;
    }

    const now = new Date();
    const remaining = Math.ceil((this.lockedUntil.getTime() - now.getTime()) / 60000);
    return Math.max(0, remaining);
  }

  private async logAuthEvent(
    request: TransactionAuthRequest,
    success: boolean,
    biometricType?: BiometricType
  ): Promise<void> {
    try {
      await ApiService.post('/security/biometric/log', {
        transactionId: request.transactionId,
        transactionType: request.type,
        amount: request.amount,
        success,
        biometricType,
        timestamp: new Date().toISOString(),
        deviceId: await this.getDeviceId(),
      });
    } catch (error) {
      console.error('Error logging auth event:', error);
    }
  }

  private async getDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem('device_id', deviceId);
    }
    return deviceId;
  }

  async getAuthHistory(limit: number = 50): Promise<any[]> {
    try {
      const response = await ApiService.get(`/security/biometric/history?limit=${limit}`);
      return response.data.history;
    } catch (error) {
      console.error('Error fetching auth history:', error);
      return [];
    }
  }

  async getBiometricStats(): Promise<{
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    successRate: number;
    lastAuthDate?: Date;
  }> {
    try {
      const response = await ApiService.get('/security/biometric/stats');
      return {
        ...response.data,
        lastAuthDate: response.data.lastAuthDate ? new Date(response.data.lastAuthDate) : undefined,
      };
    } catch (error) {
      console.error('Error fetching biometric stats:', error);
      return {
        totalAttempts: 0,
        successfulAttempts: 0,
        failedAttempts: 0,
        successRate: 0,
      };
    }
  }

  async testBiometric(): Promise<BiometricAuthResult> {
    return await this.performBiometricAuth('Test biometric authentication');
  }

  isAvailableOnDevice(): boolean {
    return this.isAvailable;
  }

  getSupportedTypes(): BiometricType[] {
    return this.supportedTypes;
  }

  getConfig(): BiometricConfig {
    return { ...this.config };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getFailedAttempts(): number {
    return this.failedAttempts;
  }

  getLockedUntil(): Date | null {
    return this.lockedUntil;
  }

  getBiometricName(): string {
    if (this.supportedTypes.includes('facial')) {
      return Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition';
    } else if (this.supportedTypes.includes('fingerprint')) {
      return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
    } else if (this.supportedTypes.includes('iris')) {
      return 'Iris Recognition';
    }
    return 'Biometric';
  }
}

export default new BiometricTransactionAuthService();

