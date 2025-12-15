/**
 * Device Integrity Check
 * Detects jailbroken/rooted devices and compromised environments
 * Multi-layer device security
 */

import JailMonkey from 'jail-monkey';
import { Platform, Alert } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CrashMonitoringService from '../services/CrashMonitoringService';

export interface DeviceIntegrityResult {
  safe: boolean;
  issues: string[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  action: 'allow' | 'warn' | 'block_sensitive' | 'block_all';
  details: {
    isJailbroken: boolean;
    isDebugMode: boolean;
    hasHooks: boolean;
    isEmulator: boolean;
    isRooted: boolean;
    hasDangerousApps: boolean;
  };
}

export class DeviceIntegrity {
  /**
   * Perform comprehensive device integrity check
   */
  static async check(): Promise<DeviceIntegrityResult> {
    const issues: string[] = [];
    let severity: DeviceIntegrityResult['severity'] = 'none';
    let action: DeviceIntegrityResult['action'] = 'allow';

    // Check 1: Jailbreak/Root detection
    const isJailbroken = JailMonkey.isJailBroken();
    if (isJailbroken) {
      issues.push('Device is jailbroken or rooted');
      severity = 'critical';
      action = 'block_all';
    }

    // Check 2: Debug mode detection
    const isDebugMode = await this.isDebugMode();
    if (isDebugMode) {
      issues.push('App is running in debug mode');
      severity = severity === 'none' ? 'medium' : severity;
      action = action === 'allow' ? 'warn' : action;
    }

    // Check 3: Hook detection (Frida, Xposed, etc.)
    const hasHooks = JailMonkey.hookDetected();
    if (hasHooks) {
      issues.push('Hooking framework detected');
      severity = 'critical';
      action = 'block_all';
    }

    // Check 4: Emulator detection
    const isEmulator = await DeviceInfo.isEmulator();
    if (isEmulator && !__DEV__) {
      issues.push('Running on emulator in production');
      severity = severity === 'none' ? 'high' : severity;
      action = action === 'allow' ? 'block_sensitive' : action;
    }

    // Check 5: Root detection (Android-specific)
    const isRooted = Platform.OS === 'android' ? this.isRooted() : false;
    if (isRooted) {
      issues.push('Android device is rooted');
      severity = 'critical';
      action = 'block_all';
    }

    // Check 6: Dangerous apps detection
    const hasDangerousApps = await this.hasDangerousApps();
    if (hasDangerousApps) {
      issues.push('Dangerous apps detected on device');
      severity = severity === 'none' ? 'high' : severity;
      action = action === 'allow' ? 'block_sensitive' : action;
    }

    const result: DeviceIntegrityResult = {
      safe: issues.length === 0,
      issues,
      severity,
      action,
      details: {
        isJailbroken,
        isDebugMode,
        hasHooks,
        isEmulator,
        isRooted,
        hasDangerousApps,
      },
    };

    // Log security event if device is compromised
    if (!result.safe) {
      this.logSecurityEvent(result);
    }

    return result;
  }

  /**
   * Check if app is running in debug mode
   */
  private static async isDebugMode(): Promise<boolean> {
    if (__DEV__) {
      return true;
    }

    // Additional checks for production builds in debug mode
    if (Platform.OS === 'android') {
      return JailMonkey.isOnExternalStorage();
    }

    return false;
  }

  /**
   * Check if Android device is rooted
   */
  private static isRooted(): boolean {
    if (Platform.OS !== 'android') {
      return false;
    }

    // JailMonkey already checks for root
    return JailMonkey.isJailBroken();
  }

  /**
   * Check for dangerous apps (reverse engineering tools, etc.)
   */
  private static async hasDangerousApps(): Promise<boolean> {
    // List of dangerous package names (Android) or bundle IDs (iOS)
    const dangerousApps = [
      'com.saurik.substrate',      // Cydia Substrate
      'de.robv.android.xposed',    // Xposed Framework
      'com.topjohnwu.magisk',      // Magisk
      'eu.chainfire.supersu',      // SuperSU
      'com.noshufou.android.su',   // Superuser
      'com.koushikdutta.superuser',// Koushik's Superuser
      'com.zachspong.temprootremovejb', // TempRoot
      'com.ramdroid.appquarantine', // App Quarantine
      'com.devadvance.rootcloak',  // RootCloak
      'com.devadvance.rootcloakplus', // RootCloak Plus
      'com.formyhm.hideroot',      // Hide My Root
      'me.phh.superuser',          // PHH Superuser
    ];

    // In production, check if any of these apps are installed
    // This is a simplified version
    return false;
  }

  /**
   * Log security event
   */
  private static logSecurityEvent(result: DeviceIntegrityResult): void {
    console.error('🚨 Device Integrity Check Failed:', result);

    CrashMonitoringService.addBreadcrumb(
      'security',
      `Device integrity check failed: ${result.issues.join(', ')}`,
      'error',
      {
        severity: result.severity,
        action: result.action,
        details: result.details,
      }
    );

    const securityError = new Error(
      `[DEVICE_INTEGRITY] ${result.severity.toUpperCase()}: ${result.issues.join(', ')}`
    );
    CrashMonitoringService.reportCrash(
      securityError,
      result.severity === 'critical'
    );
  }

  /**
   * Get recommended action based on integrity check
   */
  static getRecommendedAction(result: DeviceIntegrityResult): {
    allowLogin: boolean;
    allowTransactions: boolean;
    allowSensitiveData: boolean;
    showWarning: boolean;
    warningMessage: string;
  } {
    switch (result.action) {
      case 'block_all':
        return {
          allowLogin: false,
          allowTransactions: false,
          allowSensitiveData: false,
          showWarning: true,
          warningMessage:
            'For your security, this app cannot run on jailbroken or rooted devices. Please use a secure device to access your account.',
        };

      case 'block_sensitive':
        return {
          allowLogin: true,
          allowTransactions: false,
          allowSensitiveData: false,
          showWarning: true,
          warningMessage:
            'Your device has security concerns. Some features are disabled for your protection.',
        };

      case 'warn':
        return {
          allowLogin: true,
          allowTransactions: true,
          allowSensitiveData: true,
          showWarning: true,
          warningMessage:
            'We detected potential security issues with your device. Please ensure you are using a trusted device.',
        };

      default:
        return {
          allowLogin: true,
          allowTransactions: true,
          allowSensitiveData: true,
          showWarning: false,
          warningMessage: '',
        };
    }
  }

  /**
   * Force logout user due to security concerns
   */
  private static async forceLogout(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        '@neobank_auth_token',
        '@neobank_refresh_token',
        '@neobank_user_data',
        '@neobank_session',
      ]);

      CrashMonitoringService.addBreadcrumb(
        'security',
        'User forcefully logged out due to device integrity failure',
        'warning'
      );

      Alert.alert(
        'Security Alert',
        'For your security, you have been logged out. Please use a secure device to access your account.',
        [{ text: 'OK', style: 'default' }],
        { cancelable: false }
      );

      global.__NEOBANK_FORCE_LOGOUT__ = true;
    } catch (error) {
      console.error('Failed to force logout:', error);
    }
  }

  /**
   * Continuous monitoring (run periodically)
   */
  static startContinuousMonitoring(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(async () => {
      const result = await this.check();
      if (!result.safe) {
        const action = this.getRecommendedAction(result);
        if (!action.allowLogin) {
          console.warn('Forcing logout due to device integrity failure');
          await this.forceLogout();
        }
      }
    }, intervalMs);
  }
}

export default DeviceIntegrity;

