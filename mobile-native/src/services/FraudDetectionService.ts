import * as Location from 'expo-location';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from './ApiService';

export interface TransactionPattern {
  averageAmount: number;
  maxAmount: number;
  frequentLocations: string[];
  frequentMerchants: string[];
  typicalTimeRanges: { start: number; end: number }[];
  deviceFingerprint: string;
}

export interface FraudAlert {
  id: string;
  type: 'unusual_location' | 'unusual_amount' | 'unusual_time' | 'unusual_device' | 'velocity' | 'pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  transactionId?: string;
  requiresAction: boolean;
}

export interface RiskScore {
  score: number; // 0-100
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
}

class FraudDetectionService {
  private userPattern: TransactionPattern | null = null;
  private deviceFingerprint: string = '';
  private recentTransactions: any[] = [];

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.generateDeviceFingerprint();
    await this.loadUserPattern();
  }

  private async generateDeviceFingerprint(): Promise<void> {
    try {
      const deviceInfo = {
        brand: Device.brand,
        manufacturer: Device.manufacturer,
        modelName: Device.modelName,
        osName: Device.osName,
        osVersion: Device.osVersion,
        deviceName: Device.deviceName,
        deviceYearClass: Device.deviceYearClass,
      };

      // Create a unique fingerprint
      const fingerprintString = JSON.stringify(deviceInfo);
      this.deviceFingerprint = await this.hashString(fingerprintString);
    } catch (error) {
      console.error('Error generating device fingerprint:', error);
    }
  }

  private async hashString(str: string): Promise<string> {
    // Simple hash function (use proper crypto in production)
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  private async loadUserPattern(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('user_transaction_pattern');
      if (stored) {
        this.userPattern = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading user pattern:', error);
    }
  }

  private async saveUserPattern(): Promise<void> {
    try {
      if (this.userPattern) {
        await AsyncStorage.setItem('user_transaction_pattern', JSON.stringify(this.userPattern));
      }
    } catch (error) {
      console.error('Error saving user pattern:', error);
    }
  }

  async analyzeTransaction(transaction: {
    amount: number;
    merchant?: string;
    category?: string;
    location?: { latitude: number; longitude: number };
    timestamp?: Date;
  }): Promise<RiskScore> {
    const factors: string[] = [];
    let riskScore = 0;

    // Check amount anomaly
    if (this.userPattern) {
      if (transaction.amount > this.userPattern.maxAmount * 2) {
        factors.push('Transaction amount significantly higher than usual');
        riskScore += 30;
      } else if (transaction.amount > this.userPattern.averageAmount * 3) {
        factors.push('Transaction amount higher than average');
        riskScore += 15;
      }
    }

    // Check location anomaly
    if (transaction.location) {
      const isUnusualLocation = await this.checkUnusualLocation(transaction.location);
      if (isUnusualLocation) {
        factors.push('Transaction from unusual location');
        riskScore += 25;
      }
    }

    // Check time anomaly
    const timestamp = transaction.timestamp || new Date();
    const isUnusualTime = this.checkUnusualTime(timestamp);
    if (isUnusualTime) {
      factors.push('Transaction at unusual time');
      riskScore += 10;
    }

    // Check velocity (rapid transactions)
    const velocityRisk = this.checkVelocity();
    if (velocityRisk > 0) {
      factors.push('Multiple transactions in short time');
      riskScore += velocityRisk;
    }

    // Determine risk level
    let level: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 70) {
      level = 'critical';
    } else if (riskScore >= 50) {
      level = 'high';
    } else if (riskScore >= 30) {
      level = 'medium';
    } else {
      level = 'low';
    }

    // Update pattern
    await this.updatePattern(transaction);

    return {
      score: Math.min(riskScore, 100),
      level,
      factors,
    };
  }

  private async checkUnusualLocation(location: { latitude: number; longitude: number }): Promise<boolean> {
    if (!this.userPattern || this.userPattern.frequentLocations.length === 0) {
      return false;
    }

    // Check if location is far from frequent locations
    // In production, use proper geolocation distance calculation
    const locationString = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
    
    return !this.userPattern.frequentLocations.some((freq) => {
      const [lat, lon] = freq.split(',').map(Number);
      const distance = Math.sqrt(
        Math.pow(location.latitude - lat, 2) + Math.pow(location.longitude - lon, 2)
      );
      return distance < 0.5; // Within ~50km
    });
  }

  private checkUnusualTime(timestamp: Date): boolean {
    if (!this.userPattern || this.userPattern.typicalTimeRanges.length === 0) {
      return false;
    }

    const hour = timestamp.getHours();
    
    return !this.userPattern.typicalTimeRanges.some((range) => {
      return hour >= range.start && hour <= range.end;
    });
  }

  private checkVelocity(): number {
    const now = Date.now();
    const recentCount = this.recentTransactions.filter(
      (t) => now - t.timestamp < 5 * 60 * 1000 // Last 5 minutes
    ).length;

    if (recentCount >= 5) {
      return 30; // High velocity
    } else if (recentCount >= 3) {
      return 15; // Medium velocity
    }
    return 0;
  }

  private async updatePattern(transaction: any): Promise<void> {
    // Track recent transactions
    this.recentTransactions.push({
      ...transaction,
      timestamp: Date.now(),
    });

    // Keep only last 10 transactions
    if (this.recentTransactions.length > 10) {
      this.recentTransactions = this.recentTransactions.slice(-10);
    }

    // Update user pattern
    if (!this.userPattern) {
      this.userPattern = {
        averageAmount: transaction.amount,
        maxAmount: transaction.amount,
        frequentLocations: [],
        frequentMerchants: [],
        typicalTimeRanges: [],
        deviceFingerprint: this.deviceFingerprint,
      };
    } else {
      // Update average amount
      this.userPattern.averageAmount =
        (this.userPattern.averageAmount * 0.9 + transaction.amount * 0.1);

      // Update max amount
      if (transaction.amount > this.userPattern.maxAmount) {
        this.userPattern.maxAmount = transaction.amount;
      }

      // Update frequent locations
      if (transaction.location) {
        const locationString = `${transaction.location.latitude.toFixed(2)},${transaction.location.longitude.toFixed(2)}`;
        if (!this.userPattern.frequentLocations.includes(locationString)) {
          this.userPattern.frequentLocations.push(locationString);
          if (this.userPattern.frequentLocations.length > 5) {
            this.userPattern.frequentLocations.shift();
          }
        }
      }

      // Update frequent merchants
      if (transaction.merchant) {
        if (!this.userPattern.frequentMerchants.includes(transaction.merchant)) {
          this.userPattern.frequentMerchants.push(transaction.merchant);
          if (this.userPattern.frequentMerchants.length > 10) {
            this.userPattern.frequentMerchants.shift();
          }
        }
      }
    }

    await this.saveUserPattern();
  }

  async verifyDeviceFingerprint(): Promise<boolean> {
    if (!this.userPattern) {
      return true; // No pattern to compare
    }

    return this.deviceFingerprint === this.userPattern.deviceFingerprint;
  }

  async getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  }

  async reportFraud(transactionId: string, reason: string): Promise<void> {
    try {
      await ApiService.post('/fraud/report', {
        transactionId,
        reason,
        deviceFingerprint: this.deviceFingerprint,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error reporting fraud:', error);
      throw error;
    }
  }

  async blockCard(cardId: string, reason: string): Promise<void> {
    try {
      await ApiService.post('/cards/block', {
        cardId,
        reason,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error blocking card:', error);
      throw error;
    }
  }

  async enableTravelMode(
    destination: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    try {
      await ApiService.post('/fraud/travel-mode', {
        destination,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
    } catch (error) {
      console.error('Error enabling travel mode:', error);
      throw error;
    }
  }

  async setTransactionLimits(limits: {
    dailyLimit?: number;
    perTransactionLimit?: number;
    monthlyLimit?: number;
  }): Promise<void> {
    try {
      await ApiService.post('/fraud/limits', limits);
    } catch (error) {
      console.error('Error setting transaction limits:', error);
      throw error;
    }
  }

  getDeviceFingerprint(): string {
    return this.deviceFingerprint;
  }

  getUserPattern(): TransactionPattern | null {
    return this.userPattern ? { ...this.userPattern } : null;
  }

  async resetPattern(): Promise<void> {
    this.userPattern = null;
    this.recentTransactions = [];
    await AsyncStorage.removeItem('user_transaction_pattern');
  }
}

export default new FraudDetectionService();

