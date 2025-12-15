import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type BiometricType = 'fingerprint' | 'facial' | 'iris' | 'none';

export interface BiometricConfig {
  enabled: boolean;
  type: BiometricType;
  requireForLogin: boolean;
  requireForTransactions: boolean;
  requireForSettings: boolean;
  fallbackToPin: boolean;
}

class BiometricAuthService {
  private config: BiometricConfig = {
    enabled: false,
    type: 'none',
    requireForLogin: true,
    requireForTransactions: true,
    requireForSettings: true,
    fallbackToPin: true,
  };

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadConfig();
    await this.checkHardwareSupport();
  }

  private async loadConfig() {
    try {
      const stored = await AsyncStorage.getItem('biometric_config');
      if (stored) {
        this.config = { ...this.config, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Error loading biometric config:', error);
    }
  }

  private async saveConfig() {
    try {
      await AsyncStorage.setItem('biometric_config', JSON.stringify(this.config));
    } catch (error) {
      console.error('Error saving biometric config:', error);
    }
  }

  async checkHardwareSupport(): Promise<boolean> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      return compatible;
    } catch (error) {
      console.error('Error checking biometric hardware:', error);
      return false;
    }
  }

  async checkEnrolledBiometrics(): Promise<boolean> {
    try {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      return enrolled;
    } catch (error) {
      console.error('Error checking enrolled biometrics:', error);
      return false;
    }
  }

  async getSupportedBiometricTypes(): Promise<BiometricType[]> {
    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const biometricTypes: BiometricType[] = [];

      types.forEach((type) => {
        switch (type) {
          case LocalAuthentication.AuthenticationType.FINGERPRINT:
            biometricTypes.push('fingerprint');
            break;
          case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
            biometricTypes.push('facial');
            break;
          case LocalAuthentication.AuthenticationType.IRIS:
            biometricTypes.push('iris');
            break;
        }
      });

      return biometricTypes;
    } catch (error) {
      console.error('Error getting supported biometric types:', error);
      return [];
    }
  }

  async authenticate(reason: string = 'Authenticate to continue'): Promise<boolean> {
    try {
      // Check if biometrics are available
      const hasHardware = await this.checkHardwareSupport();
      if (!hasHardware) {
        console.log('Biometric hardware not available');
        return false;
      }

      const isEnrolled = await this.checkEnrolledBiometrics();
      if (!isEnrolled) {
        console.log('No biometrics enrolled');
        return false;
      }

      // Perform authentication
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        cancelLabel: 'Cancel',
        fallbackLabel: this.config.fallbackToPin ? 'Use PIN' : undefined,
        disableDeviceFallback: !this.config.fallbackToPin,
      });

      return result.success;
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return false;
    }
  }

  async authenticateForLogin(): Promise<boolean> {
    if (!this.config.enabled || !this.config.requireForLogin) {
      return true; // Skip if not required
    }

    return await this.authenticate('Login to NeoBank');
  }

  async authenticateForTransaction(amount?: number): Promise<boolean> {
    if (!this.config.enabled || !this.config.requireForTransactions) {
      return true; // Skip if not required
    }

    const message = amount
      ? `Confirm transaction of $${amount.toFixed(2)}`
      : 'Confirm transaction';

    return await this.authenticate(message);
  }

  async authenticateForSettings(): Promise<boolean> {
    if (!this.config.enabled || !this.config.requireForSettings) {
      return true; // Skip if not required
    }

    return await this.authenticate('Access security settings');
  }

  async enableBiometrics(): Promise<boolean> {
    try {
      // Check hardware and enrollment
      const hasHardware = await this.checkHardwareSupport();
      if (!hasHardware) {
        throw new Error('Biometric hardware not available');
      }

      const isEnrolled = await this.checkEnrolledBiometrics();
      if (!isEnrolled) {
        throw new Error('No biometrics enrolled on device');
      }

      // Test authentication
      const authenticated = await this.authenticate('Enable biometric authentication');
      if (!authenticated) {
        return false;
      }

      // Get supported types
      const types = await this.getSupportedBiometricTypes();
      const primaryType = types[0] || 'none';

      // Update config
      this.config.enabled = true;
      this.config.type = primaryType;
      await this.saveConfig();

      return true;
    } catch (error) {
      console.error('Error enabling biometrics:', error);
      return false;
    }
  }

  async disableBiometrics(): Promise<void> {
    this.config.enabled = false;
    this.config.type = 'none';
    await this.saveConfig();
  }

  async updateConfig(updates: Partial<BiometricConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
  }

  getConfig(): BiometricConfig {
    return { ...this.config };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getBiometricType(): BiometricType {
    return this.config.type;
  }

  getBiometricIcon(): string {
    switch (this.config.type) {
      case 'fingerprint':
        return 'fingerprint';
      case 'facial':
        return Platform.OS === 'ios' ? 'face-recognition' : 'face-scan';
      case 'iris':
        return 'eye-outline';
      default:
        return 'shield-lock';
    }
  }

  getBiometricLabel(): string {
    switch (this.config.type) {
      case 'fingerprint':
        return 'Touch ID / Fingerprint';
      case 'facial':
        return Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition';
      case 'iris':
        return 'Iris Scan';
      default:
        return 'Biometric Authentication';
    }
  }

  async storeBiometricCredentials(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value, {
        requireAuthentication: true,
        authenticationPrompt: 'Authenticate to save credentials',
      });
    } catch (error) {
      console.error('Error storing biometric credentials:', error);
      throw error;
    }
  }

  async retrieveBiometricCredentials(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key, {
        requireAuthentication: true,
        authenticationPrompt: 'Authenticate to retrieve credentials',
      });
      return value;
    } catch (error) {
      console.error('Error retrieving biometric credentials:', error);
      return null;
    }
  }

  async deleteBiometricCredentials(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('Error deleting biometric credentials:', error);
    }
  }
}

export default new BiometricAuthService();

