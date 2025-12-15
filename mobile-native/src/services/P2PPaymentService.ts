import ApiService from './ApiService';
import * as Contacts from 'expo-contacts';
import * as Haptics from 'expo-haptics';

export interface P2PContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  avatar?: string;
  isNeoBankUser: boolean;
}

export interface P2PTransaction {
  id: string;
  amount: number;
  recipient: P2PContact;
  sender: P2PContact;
  description?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  timestamp: Date;
  transactionFee: number;
}

export interface P2PRequest {
  id: string;
  amount: number;
  requester: P2PContact;
  description?: string;
  status: 'pending' | 'paid' | 'declined' | 'expired';
  expiresAt: Date;
}

class P2PPaymentService {
  private contacts: P2PContact[] = [];
  private recentRecipients: P2PContact[] = [];

  async loadContacts(): Promise<P2PContact[]> {
    try {
      const { status } = await Contacts.requestPermissionsAsync();

      if (status !== 'granted') {
        throw new Error('Contacts permission not granted');
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
      });

      // Check which contacts are NeoBank users
      const phoneNumbers = data
        .filter((contact) => contact.phoneNumbers && contact.phoneNumbers.length > 0)
        .map((contact) => ({
          name: contact.name,
          phone: contact.phoneNumbers![0].number,
          email: contact.emails?.[0]?.email,
        }));

      const response = await ApiService.post('/p2p/check-users', { contacts: phoneNumbers });

      this.contacts = response.data.contacts.map((contact: any) => ({
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        avatar: contact.avatar,
        isNeoBankUser: contact.isNeoBankUser,
      }));

      return this.contacts;
    } catch (error) {
      console.error('Error loading contacts:', error);
      return [];
    }
  }

  async sendMoney(
    recipientId: string,
    amount: number,
    description?: string
  ): Promise<P2PTransaction> {
    try {
      const response = await ApiService.post('/p2p/send', {
        recipientId,
        amount,
        description,
      });

      const transaction: P2PTransaction = {
        id: response.data.transactionId,
        amount,
        recipient: response.data.recipient,
        sender: response.data.sender,
        description,
        status: 'completed',
        timestamp: new Date(),
        transactionFee: response.data.fee || 0,
      };

      // Add to recent recipients
      this.addRecentRecipient(transaction.recipient);

      // Haptic feedback
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      return transaction;
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      throw error;
    }
  }

  async sendMoneyByPhone(
    phoneNumber: string,
    amount: number,
    description?: string
  ): Promise<P2PTransaction> {
    try {
      const response = await ApiService.post('/p2p/send-by-phone', {
        phoneNumber,
        amount,
        description,
      });

      const transaction: P2PTransaction = {
        id: response.data.transactionId,
        amount,
        recipient: response.data.recipient,
        sender: response.data.sender,
        description,
        status: response.data.recipient.isNeoBankUser ? 'completed' : 'pending',
        timestamp: new Date(),
        transactionFee: response.data.fee || 0,
      };

      this.addRecentRecipient(transaction.recipient);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      return transaction;
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      throw error;
    }
  }

  async sendMoneyByEmail(
    email: string,
    amount: number,
    description?: string
  ): Promise<P2PTransaction> {
    try {
      const response = await ApiService.post('/p2p/send-by-email', {
        email,
        amount,
        description,
      });

      const transaction: P2PTransaction = {
        id: response.data.transactionId,
        amount,
        recipient: response.data.recipient,
        sender: response.data.sender,
        description,
        status: response.data.recipient.isNeoBankUser ? 'completed' : 'pending',
        timestamp: new Date(),
        transactionFee: response.data.fee || 0,
      };

      this.addRecentRecipient(transaction.recipient);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      return transaction;
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      throw error;
    }
  }

  async requestMoney(
    requesteeId: string,
    amount: number,
    description?: string
  ): Promise<P2PRequest> {
    try {
      const response = await ApiService.post('/p2p/request', {
        requesteeId,
        amount,
        description,
      });

      const request: P2PRequest = {
        id: response.data.requestId,
        amount,
        requester: response.data.requester,
        description,
        status: 'pending',
        expiresAt: new Date(response.data.expiresAt),
      };

      return request;
    } catch (error) {
      console.error('Error requesting money:', error);
      throw error;
    }
  }

  async payRequest(requestId: string): Promise<P2PTransaction> {
    try {
      const response = await ApiService.post(`/p2p/requests/${requestId}/pay`);

      const transaction: P2PTransaction = {
        id: response.data.transactionId,
        amount: response.data.amount,
        recipient: response.data.recipient,
        sender: response.data.sender,
        description: response.data.description,
        status: 'completed',
        timestamp: new Date(),
        transactionFee: response.data.fee || 0,
      };

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      return transaction;
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      throw error;
    }
  }

  async declineRequest(requestId: string): Promise<void> {
    try {
      await ApiService.post(`/p2p/requests/${requestId}/decline`);
    } catch (error) {
      console.error('Error declining request:', error);
      throw error;
    }
  }

  async cancelRequest(requestId: string): Promise<void> {
    try {
      await ApiService.post(`/p2p/requests/${requestId}/cancel`);
    } catch (error) {
      console.error('Error cancelling request:', error);
      throw error;
    }
  }

  async getTransactionHistory(limit: number = 50): Promise<P2PTransaction[]> {
    try {
      const response = await ApiService.get(`/p2p/transactions?limit=${limit}`);
      return response.data.transactions.map((tx: any) => ({
        ...tx,
        timestamp: new Date(tx.timestamp),
      }));
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      return [];
    }
  }

  async getPendingRequests(): Promise<P2PRequest[]> {
    try {
      const response = await ApiService.get('/p2p/requests/pending');
      return response.data.requests.map((req: any) => ({
        ...req,
        expiresAt: new Date(req.expiresAt),
      }));
    } catch (error) {
      console.error('Error fetching pending requests:', error);
      return [];
    }
  }

  async splitBill(
    amount: number,
    participants: string[],
    description?: string
  ): Promise<P2PTransaction[]> {
    try {
      const amountPerPerson = amount / (participants.length + 1); // +1 for sender

      const response = await ApiService.post('/p2p/split-bill', {
        amount,
        participants,
        description,
      });

      const transactions: P2PTransaction[] = response.data.transactions.map((tx: any) => ({
        id: tx.transactionId,
        amount: amountPerPerson,
        recipient: tx.recipient,
        sender: tx.sender,
        description: `Split bill: ${description || 'No description'}`,
        status: tx.status,
        timestamp: new Date(),
        transactionFee: 0,
      }));

      return transactions;
    } catch (error) {
      console.error('Error splitting bill:', error);
      throw error;
    }
  }

  async setPaymentLimit(dailyLimit: number, perTransactionLimit: number): Promise<void> {
    try {
      await ApiService.post('/p2p/limits', {
        dailyLimit,
        perTransactionLimit,
      });
    } catch (error) {
      console.error('Error setting payment limits:', error);
      throw error;
    }
  }

  async getPaymentLimits(): Promise<{ dailyLimit: number; perTransactionLimit: number; remainingToday: number }> {
    try {
      const response = await ApiService.get('/p2p/limits');
      return response.data;
    } catch (error) {
      console.error('Error fetching payment limits:', error);
      return { dailyLimit: 0, perTransactionLimit: 0, remainingToday: 0 };
    }
  }

  private addRecentRecipient(recipient: P2PContact): void {
    // Remove if already exists
    this.recentRecipients = this.recentRecipients.filter((r) => r.id !== recipient.id);

    // Add to front
    this.recentRecipients.unshift(recipient);

    // Keep only last 10
    if (this.recentRecipients.length > 10) {
      this.recentRecipients = this.recentRecipients.slice(0, 10);
    }
  }

  getRecentRecipients(): P2PContact[] {
    return this.recentRecipients;
  }

  getContacts(): P2PContact[] {
    return this.contacts;
  }

  async searchContacts(query: string): Promise<P2PContact[]> {
    const lowerQuery = query.toLowerCase();
    return this.contacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(lowerQuery) ||
        contact.phone?.includes(query) ||
        contact.email?.toLowerCase().includes(lowerQuery)
    );
  }
}

export default new P2PPaymentService();

