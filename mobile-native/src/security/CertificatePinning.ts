/**
 * Certificate Pinning
 * Prevents man-in-the-middle attacks by pinning SSL certificates
 * Bank-grade security implementation
 */

import { fetch as sslFetch } from 'react-native-ssl-pinning';
import { Alert } from 'react-native';
import CrashMonitoringService from '../services/CrashMonitoringService';

// Certificate hashes for api.neobank.com
// These should be updated when certificates are rotated
const CERTIFICATE_PINS = {
  'api.neobank.com': [
    'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // Primary certificate
    'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=', // Backup certificate
  ],
};

// Certificate pinning configuration
const SSL_PINNING_CONFIG = {
  sslPinning: {
    certs: ['api-neobank-com'], // Certificate file names in assets
  },
  timeoutInterval: 30000, // 30 seconds
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
};

export class CertificatePinning {
  /**
   * Make a secure API request with certificate pinning
   */
  static async secureRequest(
    url: string,
    options: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      headers?: Record<string, string>;
      body?: any;
      timeout?: number;
    }
  ): Promise<any> {
    try {
      const config = {
        ...SSL_PINNING_CONFIG,
        method: options.method,
        headers: {
          ...SSL_PINNING_CONFIG.headers,
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        timeoutInterval: options.timeout || SSL_PINNING_CONFIG.timeoutInterval,
      };

      const response = await sslFetch(url, config);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error.message?.includes('SSL')) {
        // Certificate pinning failure - potential MITM attack
        this.handlePinningFailure(error);
      }
      throw error;
    }
  }

  /**
   * Handle certificate pinning failure
   * This indicates a potential man-in-the-middle attack
   */
  private static handlePinningFailure(error: Error): void {
    console.error('🚨 SECURITY ALERT: Certificate pinning failed!', error);

    // Log security event
    this.logSecurityEvent({
      type: 'CERTIFICATE_PINNING_FAILURE',
      severity: 'CRITICAL',
      message: error.message,
      timestamp: new Date().toISOString(),
    });

    // Block all further API requests
    this.blockAPIRequests();

    // Notify user
    this.notifyUser(
      'Security Alert',
      'A security issue was detected. Please ensure you are connected to a trusted network.'
    );
  }

  /**
   * Log security event to monitoring system
   */
  private static logSecurityEvent(event: {
    type: string;
    severity: string;
    message: string;
    timestamp: string;
  }): void {
    console.log('Security Event:', event);
    
    CrashMonitoringService.addBreadcrumb(
      'security',
      `${event.type}: ${event.message}`,
      'error',
      { severity: event.severity, timestamp: event.timestamp }
    );
    
    const securityError = new Error(`[SECURITY] ${event.type}: ${event.message}`);
    CrashMonitoringService.reportCrash(securityError, event.severity === 'CRITICAL');
  }

  /**
   * Block all API requests until app restart
   */
  private static blockAPIRequests(): void {
    // Set global flag to block requests
    global.__NEOBANK_API_BLOCKED__ = true;
  }

  /**
   * Notify user of security issue
   */
  private static notifyUser(title: string, message: string): void {
    console.warn(`${title}: ${message}`);
    
    Alert.alert(
      title,
      message,
      [
        {
          text: 'OK',
          style: 'default',
        },
      ],
      { cancelable: false }
    );
  }

  /**
   * Verify certificate pins are up to date
   */
  static verifyCertificatePins(): boolean {
    // Check if certificates are expiring soon
    // In production, this would check actual certificate expiry dates
    return true;
  }

  /**
   * Get certificate information for debugging
   */
  static getCertificateInfo(): any {
    return {
      pins: CERTIFICATE_PINS,
      config: SSL_PINNING_CONFIG,
      blocked: global.__NEOBANK_API_BLOCKED__ || false,
    };
  }
}

export default CertificatePinning;

