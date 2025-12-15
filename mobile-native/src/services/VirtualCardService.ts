import ApiService from './ApiService';
import EncryptionService from './EncryptionService';
import * as Clipboard from 'expo-clipboard';

export interface VirtualCard {
  id: string;
  cardNumber: string;
  cvv: string;
  expiryDate: string;
  type: 'single-use' | 'merchant-locked' | 'temporary' | 'subscription';
  status: 'active' | 'used' | 'expired' | 'cancelled';
  spendingLimit?: number;
  merchantName?: string;
  merchantCategory?: string;
  createdAt: Date;
  expiresAt?: Date;
  usageCount: number;
  maxUsages?: number;
}

export interface TravelMode {
  enabled: boolean;
  countries: string[];
  startDate: Date;
  endDate: Date;
  notificationsEnabled: boolean;
  autoDeclineNonTravel: boolean;
}

class VirtualCardService {
  private virtualCards: VirtualCard[] = [];
  private travelMode: TravelMode | null = null;

  async generateVirtualCard(
    type: 'single-use' | 'merchant-locked' | 'temporary' | 'subscription',
    options?: {
      spendingLimit?: number;
      merchantName?: string;
      expiresInDays?: number;
      maxUsages?: number;
    }
  ): Promise<VirtualCard> {
    try {
      const response = await ApiService.post('/cards/virtual/generate', {
        type,
        ...options,
      });

      const virtualCard: VirtualCard = {
        id: response.data.cardId,
        cardNumber: response.data.cardNumber,
        cvv: response.data.cvv,
        expiryDate: response.data.expiryDate,
        type,
        status: 'active',
        spendingLimit: options?.spendingLimit,
        merchantName: options?.merchantName,
        createdAt: new Date(),
        expiresAt: options?.expiresInDays
          ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
          : undefined,
        usageCount: 0,
        maxUsages: options?.maxUsages,
      };

      this.virtualCards.push(virtualCard);

      return virtualCard;
    } catch (error) {
      console.error('Error generating virtual card:', error);
      throw error;
    }
  }

  async generateSingleUseCard(spendingLimit?: number): Promise<VirtualCard> {
    return await this.generateVirtualCard('single-use', {
      spendingLimit,
      maxUsages: 1,
      expiresInDays: 1,
    });
  }

  async generateMerchantLockedCard(
    merchantName: string,
    spendingLimit?: number
  ): Promise<VirtualCard> {
    return await this.generateVirtualCard('merchant-locked', {
      merchantName,
      spendingLimit,
      expiresInDays: 30,
    });
  }

  async generateTemporaryCard(expiresInDays: number = 7): Promise<VirtualCard> {
    return await this.generateVirtualCard('temporary', {
      expiresInDays,
    });
  }

  async generateSubscriptionCard(
    merchantName: string,
    monthlyLimit: number
  ): Promise<VirtualCard> {
    return await this.generateVirtualCard('subscription', {
      merchantName,
      spendingLimit: monthlyLimit,
    });
  }

  async getVirtualCards(): Promise<VirtualCard[]> {
    try {
      const response = await ApiService.get('/cards/virtual');
      this.virtualCards = response.data.cards.map((card: any) => ({
        ...card,
        createdAt: new Date(card.createdAt),
        expiresAt: card.expiresAt ? new Date(card.expiresAt) : undefined,
      }));
      return this.virtualCards;
    } catch (error) {
      console.error('Error fetching virtual cards:', error);
      return [];
    }
  }

  async getVirtualCardDetails(cardId: string): Promise<VirtualCard | null> {
    try {
      const response = await ApiService.get(`/cards/virtual/${cardId}`);
      return {
        ...response.data.card,
        createdAt: new Date(response.data.card.createdAt),
        expiresAt: response.data.card.expiresAt
          ? new Date(response.data.card.expiresAt)
          : undefined,
      };
    } catch (error) {
      console.error('Error fetching virtual card details:', error);
      return null;
    }
  }

  async cancelVirtualCard(cardId: string): Promise<void> {
    try {
      await ApiService.post(`/cards/virtual/${cardId}/cancel`);

      const card = this.virtualCards.find((c) => c.id === cardId);
      if (card) {
        card.status = 'cancelled';
      }
    } catch (error) {
      console.error('Error cancelling virtual card:', error);
      throw error;
    }
  }

  async updateSpendingLimit(cardId: string, newLimit: number): Promise<void> {
    try {
      await ApiService.put(`/cards/virtual/${cardId}/spending-limit`, {
        limit: newLimit,
      });

      const card = this.virtualCards.find((c) => c.id === cardId);
      if (card) {
        card.spendingLimit = newLimit;
      }
    } catch (error) {
      console.error('Error updating spending limit:', error);
      throw error;
    }
  }

  async copyCardNumber(cardId: string): Promise<void> {
    const card = this.virtualCards.find((c) => c.id === cardId);
    if (card) {
      await Clipboard.setStringAsync(card.cardNumber);
    }
  }

  async copyCVV(cardId: string): Promise<void> {
    const card = this.virtualCards.find((c) => c.id === cardId);
    if (card) {
      await Clipboard.setStringAsync(card.cvv);
    }
  }

  async getCardTransactions(cardId: string, limit: number = 50): Promise<any[]> {
    try {
      const response = await ApiService.get(`/cards/virtual/${cardId}/transactions?limit=${limit}`);
      return response.data.transactions;
    } catch (error) {
      console.error('Error fetching card transactions:', error);
      return [];
    }
  }

  async enableTravelMode(
    countries: string[],
    startDate: Date,
    endDate: Date,
    options?: {
      notificationsEnabled?: boolean;
      autoDeclineNonTravel?: boolean;
    }
  ): Promise<TravelMode> {
    try {
      const response = await ApiService.post('/cards/travel-mode/enable', {
        countries,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        ...options,
      });

      this.travelMode = {
        enabled: true,
        countries,
        startDate,
        endDate,
        notificationsEnabled: options?.notificationsEnabled ?? true,
        autoDeclineNonTravel: options?.autoDeclineNonTravel ?? false,
      };

      return this.travelMode;
    } catch (error) {
      console.error('Error enabling travel mode:', error);
      throw error;
    }
  }

  async disableTravelMode(): Promise<void> {
    try {
      await ApiService.post('/cards/travel-mode/disable');
      this.travelMode = null;
    } catch (error) {
      console.error('Error disabling travel mode:', error);
      throw error;
    }
  }

  async updateTravelMode(updates: Partial<TravelMode>): Promise<TravelMode> {
    if (!this.travelMode) {
      throw new Error('Travel mode is not enabled');
    }

    try {
      const response = await ApiService.put('/cards/travel-mode', updates);

      this.travelMode = {
        ...this.travelMode,
        ...updates,
      };

      return this.travelMode;
    } catch (error) {
      console.error('Error updating travel mode:', error);
      throw error;
    }
  }

  async getTravelModeStatus(): Promise<TravelMode | null> {
    try {
      const response = await ApiService.get('/cards/travel-mode/status');
      if (response.data.enabled) {
        this.travelMode = {
          ...response.data,
          startDate: new Date(response.data.startDate),
          endDate: new Date(response.data.endDate),
        };
        return this.travelMode;
      }
      return null;
    } catch (error) {
      console.error('Error fetching travel mode status:', error);
      return null;
    }
  }

  async addTravelCountry(country: string): Promise<void> {
    if (!this.travelMode) {
      throw new Error('Travel mode is not enabled');
    }

    if (!this.travelMode.countries.includes(country)) {
      this.travelMode.countries.push(country);
      await this.updateTravelMode({ countries: this.travelMode.countries });
    }
  }

  async removeTravelCountry(country: string): Promise<void> {
    if (!this.travelMode) {
      throw new Error('Travel mode is not enabled');
    }

    this.travelMode.countries = this.travelMode.countries.filter((c) => c !== country);
    await this.updateTravelMode({ countries: this.travelMode.countries });
  }

  async getTravelNotifications(): Promise<any[]> {
    try {
      const response = await ApiService.get('/cards/travel-mode/notifications');
      return response.data.notifications;
    } catch (error) {
      console.error('Error fetching travel notifications:', error);
      return [];
    }
  }

  async cleanupExpiredCards(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    for (const card of this.virtualCards) {
      if (
        card.status === 'active' &&
        card.expiresAt &&
        card.expiresAt < now
      ) {
        await this.cancelVirtualCard(card.id);
        cleaned++;
      }
    }

    return cleaned;
  }

  getActiveVirtualCards(): VirtualCard[] {
    return this.virtualCards.filter((card) => card.status === 'active');
  }

  getTravelMode(): TravelMode | null {
    return this.travelMode;
  }

  isTravelModeActive(): boolean {
    if (!this.travelMode) {
      return false;
    }

    const now = new Date();
    return (
      this.travelMode.enabled &&
      now >= this.travelMode.startDate &&
      now <= this.travelMode.endDate
    );
  }
}

export default new VirtualCardService();

