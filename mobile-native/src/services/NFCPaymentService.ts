import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import { Platform } from 'react-native';
import ApiService from './ApiService';
import EncryptionService from './EncryptionService';
import * as Haptics from 'expo-haptics';

export interface NFCPaymentData {
  amount: number;
  currency: string;
  merchantId?: string;
  merchantName?: string;
  timestamp: Date;
  transactionId: string;
}

export interface NFCCard {
  id: string;
  last4: string;
  type: 'debit' | 'credit';
  network: 'visa' | 'mastercard' | 'amex';
  enabled: boolean;
}

class NFCPaymentService {
  private isNFCEnabled: boolean = false;
  private isNFCSupported: boolean = false;
  private activeCard: NFCCard | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      // Check if NFC is supported
      this.isNFCSupported = await NfcManager.isSupported();

      if (this.isNFCSupported) {
        await NfcManager.start();
        this.isNFCEnabled = await NfcManager.isEnabled();
      }

      console.log('NFC supported:', this.isNFCSupported);
      console.log('NFC enabled:', this.isNFCEnabled);
    } catch (error) {
      console.error('Error initializing NFC:', error);
    }
  }

  async enableNFCPayments(): Promise<boolean> {
    if (!this.isNFCSupported) {
      throw new Error('NFC is not supported on this device');
    }

    if (!this.isNFCEnabled) {
      // Prompt user to enable NFC in settings
      if (Platform.OS === 'android') {
        await NfcManager.goToNfcSetting();
      }
      return false;
    }

    // Register default card for NFC payments
    await this.registerDefaultCard();

    return true;
  }

  async disableNFCPayments(): Promise<void> {
    this.activeCard = null;
    await ApiService.post('/nfc/disable');
  }

  private async registerDefaultCard(): Promise<void> {
    try {
      const response = await ApiService.get('/cards/default');
      this.activeCard = {
        id: response.data.id,
        last4: response.data.last4,
        type: response.data.type,
        network: response.data.network,
        enabled: true,
      };
    } catch (error) {
      console.error('Error registering default card:', error);
    }
  }

  async setActiveCard(cardId: string): Promise<void> {
    try {
      const response = await ApiService.get(`/cards/${cardId}`);
      this.activeCard = {
        id: response.data.id,
        last4: response.data.last4,
        type: response.data.type,
        network: response.data.network,
        enabled: true,
      };

      await ApiService.post('/nfc/set-active-card', { cardId });
    } catch (error) {
      console.error('Error setting active card:', error);
      throw error;
    }
  }

  async initiateNFCPayment(): Promise<NFCPaymentData | null> {
    if (!this.isNFCSupported || !this.isNFCEnabled) {
      throw new Error('NFC is not available');
    }

    if (!this.activeCard) {
      throw new Error('No active card for NFC payments');
    }

    try {
      // Request NFC technology
      await NfcManager.requestTechnology(NfcTech.IsoDep);

      // Haptic feedback to indicate NFC is ready
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Read NFC tag data
      const tag = await NfcManager.getTag();

      if (!tag) {
        throw new Error('No NFC tag detected');
      }

      // Parse payment terminal data
      const paymentData = await this.parseNFCTag(tag);

      // Process payment
      const result = await this.processNFCPayment(paymentData);

      // Success haptic feedback
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      return result;
    } catch (error) {
      console.error('Error initiating NFC payment:', error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      throw error;
    } finally {
      // Cancel NFC technology request
      await NfcManager.cancelTechnologyRequest();
    }
  }

  private async parseNFCTag(tag: any): Promise<Partial<NFCPaymentData>> {
    // Parse NDEF messages from NFC tag
    const ndefRecords = tag.ndefMessage || [];

    let amount = 0;
    let merchantId = '';
    let merchantName = '';

    for (const record of ndefRecords) {
      const payload = Ndef.text.decodePayload(record.payload);

      if (payload.includes('amount:')) {
        amount = parseFloat(payload.split('amount:')[1]);
      } else if (payload.includes('merchant:')) {
        merchantId = payload.split('merchant:')[1];
      } else if (payload.includes('name:')) {
        merchantName = payload.split('name:')[1];
      }
    }

    return {
      amount,
      merchantId,
      merchantName,
      currency: 'USD',
      timestamp: new Date(),
    };
  }

  private async processNFCPayment(paymentData: Partial<NFCPaymentData>): Promise<NFCPaymentData> {
    if (!this.activeCard) {
      throw new Error('No active card');
    }

    try {
      // Generate encrypted payment token
      const paymentToken = await this.generatePaymentToken(paymentData);

      // Process payment through backend
      const response = await ApiService.post('/nfc/process-payment', {
        cardId: this.activeCard.id,
        paymentToken,
        amount: paymentData.amount,
        merchantId: paymentData.merchantId,
      });

      return {
        amount: paymentData.amount!,
        currency: paymentData.currency!,
        merchantId: paymentData.merchantId,
        merchantName: paymentData.merchantName,
        timestamp: paymentData.timestamp!,
        transactionId: response.data.transactionId,
      };
    } catch (error) {
      console.error('Error processing NFC payment:', error);
      throw error;
    }
  }

  private async generatePaymentToken(paymentData: Partial<NFCPaymentData>): Promise<string> {
    const tokenData = {
      cardId: this.activeCard!.id,
      amount: paymentData.amount,
      merchantId: paymentData.merchantId,
      timestamp: paymentData.timestamp?.toISOString(),
      nonce: Math.random().toString(36).substr(2, 9),
    };

    return await EncryptionService.encrypt(JSON.stringify(tokenData));
  }

  async writeNFCTag(data: any): Promise<void> {
    if (!this.isNFCSupported || !this.isNFCEnabled) {
      throw new Error('NFC is not available');
    }

    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);

      // Create NDEF message
      const bytes = Ndef.encodeMessage([Ndef.textRecord(JSON.stringify(data))]);

      // Write to NFC tag
      await NfcManager.ndefHandler.writeNdefMessage(bytes);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error writing NFC tag:', error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      throw error;
    } finally {
      await NfcManager.cancelTechnologyRequest();
    }
  }

  async readNFCTag(): Promise<any> {
    if (!this.isNFCSupported || !this.isNFCEnabled) {
      throw new Error('NFC is not available');
    }

    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);

      const tag = await NfcManager.getTag();

      if (!tag || !tag.ndefMessage) {
        throw new Error('No NDEF data found');
      }

      // Parse NDEF messages
      const records = tag.ndefMessage;
      const data = records.map((record: any) => {
        return Ndef.text.decodePayload(record.payload);
      });

      return data;
    } catch (error) {
      console.error('Error reading NFC tag:', error);
      throw error;
    } finally {
      await NfcManager.cancelTechnologyRequest();
    }
  }

  async getPaymentHistory(limit: number = 50): Promise<NFCPaymentData[]> {
    try {
      const response = await ApiService.get(`/nfc/history?limit=${limit}`);
      return response.data.payments.map((payment: any) => ({
        ...payment,
        timestamp: new Date(payment.timestamp),
      }));
    } catch (error) {
      console.error('Error fetching NFC payment history:', error);
      return [];
    }
  }

  async enableQuickPay(amount: number): Promise<void> {
    // Enable quick pay for specific amount without confirmation
    await ApiService.post('/nfc/quick-pay/enable', { amount });
  }

  async disableQuickPay(): Promise<void> {
    await ApiService.post('/nfc/quick-pay/disable');
  }

  getActiveCard(): NFCCard | null {
    return this.activeCard;
  }

  isNFCAvailable(): boolean {
    return this.isNFCSupported && this.isNFCEnabled;
  }

  async cleanup(): Promise<void> {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}

export default new NFCPaymentService();

