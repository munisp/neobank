import { Camera } from 'expo-camera';
import * as Location from 'expo-location';

export interface ARBranchLocation {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance: number;
  services: string[];
  hours: { [day: string]: string };
  waitTime?: number;
}

export interface ARATMLocation {
  id: string;
  latitude: number;
  longitude: number;
  distance: number;
  available: boolean;
  services: ('withdrawal' | 'deposit' | 'balance')[];
  fees: number;
}

export interface ARCardVisualization {
  cardNumber: string;
  cardType: 'debit' | 'credit' | 'virtual';
  balance: number;
  limit?: number;
  expiryDate: string;
  cvv: string;
  design: string;
}

class ARBankingService {
  private cameraPermission: boolean = false;
  private locationPermission: boolean = false;
  private currentLocation: { latitude: number; longitude: number } | null = null;

  async initialize(): Promise<boolean> {
    try {
      await this.requestPermissions();
      await this.getCurrentLocation();
      return true;
    } catch (error) {
      console.error('Error initializing AR Banking:', error);
      return false;
    }
  }

  private async requestPermissions(): Promise<void> {
    // Request camera permission
    const cameraStatus = await Camera.requestCameraPermissionsAsync();
    this.cameraPermission = cameraStatus.status === 'granted';

    // Request location permission
    const locationStatus = await Location.requestForegroundPermissionsAsync();
    this.locationPermission = locationStatus.status === 'granted';

    if (!this.cameraPermission || !this.locationPermission) {
      throw new Error('Required permissions not granted');
    }
  }

  private async getCurrentLocation(): Promise<void> {
    if (!this.locationPermission) {
      throw new Error('Location permission not granted');
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    this.currentLocation = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  }

  async findNearbyBranches(radius: number = 5000): Promise<ARBranchLocation[]> {
    if (!this.currentLocation) {
      await this.getCurrentLocation();
    }

    // In production, this would call an API
    // For now, return mock data
    const mockBranches: ARBranchLocation[] = [
      {
        id: 'branch_1',
        name: 'NeoBank Downtown Branch',
        address: '123 Main St, New York, NY 10001',
        latitude: this.currentLocation!.latitude + 0.01,
        longitude: this.currentLocation!.longitude + 0.01,
        distance: 1200,
        services: ['Personal Banking', 'Business Banking', 'Loans', 'Safe Deposit'],
        hours: {
          Monday: '9:00 AM - 5:00 PM',
          Tuesday: '9:00 AM - 5:00 PM',
          Wednesday: '9:00 AM - 5:00 PM',
          Thursday: '9:00 AM - 5:00 PM',
          Friday: '9:00 AM - 6:00 PM',
          Saturday: '10:00 AM - 2:00 PM',
          Sunday: 'Closed',
        },
        waitTime: 15,
      },
      {
        id: 'branch_2',
        name: 'NeoBank Midtown Branch',
        address: '456 Park Ave, New York, NY 10022',
        latitude: this.currentLocation!.latitude + 0.02,
        longitude: this.currentLocation!.longitude - 0.01,
        distance: 2400,
        services: ['Personal Banking', 'Investment Services', 'Wealth Management'],
        hours: {
          Monday: '9:00 AM - 5:00 PM',
          Tuesday: '9:00 AM - 5:00 PM',
          Wednesday: '9:00 AM - 5:00 PM',
          Thursday: '9:00 AM - 5:00 PM',
          Friday: '9:00 AM - 6:00 PM',
          Saturday: 'Closed',
          Sunday: 'Closed',
        },
        waitTime: 25,
      },
    ];

    return mockBranches;
  }

  async findNearbyATMs(radius: number = 2000): Promise<ARATMLocation[]> {
    if (!this.currentLocation) {
      await this.getCurrentLocation();
    }

    // Mock ATM data
    const mockATMs: ARATMLocation[] = [
      {
        id: 'atm_1',
        latitude: this.currentLocation!.latitude + 0.005,
        longitude: this.currentLocation!.longitude + 0.005,
        distance: 600,
        available: true,
        services: ['withdrawal', 'deposit', 'balance'],
        fees: 0,
      },
      {
        id: 'atm_2',
        latitude: this.currentLocation!.latitude - 0.003,
        longitude: this.currentLocation!.longitude + 0.008,
        distance: 800,
        available: true,
        services: ['withdrawal', 'balance'],
        fees: 2.5,
      },
      {
        id: 'atm_3',
        latitude: this.currentLocation!.latitude + 0.008,
        longitude: this.currentLocation!.longitude - 0.004,
        distance: 950,
        available: false,
        services: ['withdrawal', 'deposit', 'balance'],
        fees: 0,
      },
    ];

    return mockATMs;
  }

  async visualizeCard(cardId: string): Promise<ARCardVisualization> {
    // In production, fetch real card data
    return {
      cardNumber: '**** **** **** 1234',
      cardType: 'debit',
      balance: 5432.10,
      expiryDate: '12/25',
      cvv: '***',
      design: 'premium_blue',
    };
  }

  async scanQRCode(): Promise<{ type: string; data: any } | null> {
    if (!this.cameraPermission) {
      throw new Error('Camera permission not granted');
    }

    // This would integrate with a QR code scanner library
    // For now, return mock data
    return {
      type: 'payment',
      data: {
        recipient: 'merchant@example.com',
        amount: 25.00,
        currency: 'USD',
      },
    };
  }

  async scanCheckForDeposit(imageUri: string): Promise<{
    amount: number;
    accountNumber: string;
    routingNumber: string;
    confidence: number;
  }> {
    // This would use OCR to extract check information
    // For now, return mock data
    return {
      amount: 1250.00,
      accountNumber: '123456789',
      routingNumber: '021000021',
      confidence: 0.95,
    };
  }

  async visualizeSpendingInAR(period: 'week' | 'month' | 'year'): Promise<{
    categories: { name: string; amount: number; percentage: number; color: string }[];
    total: number;
  }> {
    // Mock spending data for AR visualization
    return {
      categories: [
        { name: 'Food & Dining', amount: 450, percentage: 30, color: '#FF6384' },
        { name: 'Shopping', amount: 380, percentage: 25, color: '#36A2EB' },
        { name: 'Transportation', amount: 225, percentage: 15, color: '#FFCE56' },
        { name: 'Entertainment', amount: 180, percentage: 12, color: '#4BC0C0' },
        { name: 'Utilities', amount: 150, percentage: 10, color: '#9966FF' },
        { name: 'Other', amount: 120, percentage: 8, color: '#FF9F40' },
      ],
      total: 1505,
    };
  }

  async get3DCardModel(cardId: string): Promise<{
    modelUrl: string;
    textureUrl: string;
    animations: string[];
  }> {
    // Return 3D model data for AR card visualization
    return {
      modelUrl: 'https://example.com/models/card.glb',
      textureUrl: 'https://example.com/textures/card_premium.jpg',
      animations: ['flip', 'rotate', 'glow'],
    };
  }

  async getARNavigationToLocation(
    targetLatitude: number,
    targetLongitude: number
  ): Promise<{
    distance: number;
    bearing: number;
    steps: { instruction: string; distance: number }[];
  }> {
    if (!this.currentLocation) {
      await this.getCurrentLocation();
    }

    // Calculate distance and bearing
    const distance = this.calculateDistance(
      this.currentLocation!.latitude,
      this.currentLocation!.longitude,
      targetLatitude,
      targetLongitude
    );

    const bearing = this.calculateBearing(
      this.currentLocation!.latitude,
      this.currentLocation!.longitude,
      targetLatitude,
      targetLongitude
    );

    // Mock navigation steps
    const steps = [
      { instruction: 'Head north on Main St', distance: 200 },
      { instruction: 'Turn right on Park Ave', distance: 450 },
      { instruction: 'Destination on your left', distance: 50 },
    ];

    return { distance, bearing, steps };
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private calculateBearing(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);

    return ((θ * 180) / Math.PI + 360) % 360;
  }

  async enableARMode(): Promise<boolean> {
    return await this.initialize();
  }

  async disableARMode(): Promise<void> {
    // Cleanup AR resources
    this.currentLocation = null;
  }

  isARSupported(): boolean {
    // Check if device supports AR features
    return this.cameraPermission && this.locationPermission;
  }

  getCurrentLocation(): { latitude: number; longitude: number } | null {
    return this.currentLocation;
  }
}

export default new ARBankingService();

