import ApiService from './ApiService';
import * as Notifications from 'expo-notifications';

export interface Bill {
  id: string;
  name: string;
  payee: string;
  amount: number;
  dueDate: Date;
  category: 'utilities' | 'subscription' | 'loan' | 'insurance' | 'rent' | 'other';
  status: 'pending' | 'paid' | 'overdue' | 'scheduled';
  recurring: boolean;
  frequency?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';
  autopayEnabled: boolean;
}

export interface AutopayRule {
  id: string;
  billId: string;
  enabled: boolean;
  paymentDate: 'due_date' | 'before_due_date' | 'custom';
  daysBefore?: number;
  customDay?: number;
  maxAmount?: number;
  notifyBeforePayment: boolean;
  notificationDays: number;
}

export interface BillPayment {
  id: string;
  billId: string;
  amount: number;
  paymentDate: Date;
  status: 'scheduled' | 'processing' | 'completed' | 'failed';
  confirmationNumber?: string;
}

class AutomatedBillPayService {
  private bills: Bill[] = [];
  private autopayRules: Map<string, AutopayRule> = new Map();

  async loadBills(): Promise<Bill[]> {
    try {
      const response = await ApiService.get('/bills');
      this.bills = response.data.bills.map((bill: any) => ({
        ...bill,
        dueDate: new Date(bill.dueDate),
      }));
      return this.bills;
    } catch (error) {
      console.error('Error loading bills:', error);
      return [];
    }
  }

  async addBill(bill: Omit<Bill, 'id' | 'status'>): Promise<Bill> {
    try {
      const response = await ApiService.post('/bills', bill);
      const newBill: Bill = {
        ...response.data.bill,
        dueDate: new Date(response.data.bill.dueDate),
      };
      this.bills.push(newBill);
      return newBill;
    } catch (error) {
      console.error('Error adding bill:', error);
      throw error;
    }
  }

  async updateBill(billId: string, updates: Partial<Bill>): Promise<Bill> {
    try {
      const response = await ApiService.put(`/bills/${billId}`, updates);
      const updatedBill: Bill = {
        ...response.data.bill,
        dueDate: new Date(response.data.bill.dueDate),
      };

      const index = this.bills.findIndex((b) => b.id === billId);
      if (index !== -1) {
        this.bills[index] = updatedBill;
      }

      return updatedBill;
    } catch (error) {
      console.error('Error updating bill:', error);
      throw error;
    }
  }

  async deleteBill(billId: string): Promise<void> {
    try {
      await ApiService.delete(`/bills/${billId}`);
      this.bills = this.bills.filter((b) => b.id !== billId);
      this.autopayRules.delete(billId);
    } catch (error) {
      console.error('Error deleting bill:', error);
      throw error;
    }
  }

  async payBill(billId: string, amount?: number): Promise<BillPayment> {
    try {
      const bill = this.bills.find((b) => b.id === billId);
      if (!bill) {
        throw new Error('Bill not found');
      }

      const response = await ApiService.post(`/bills/${billId}/pay`, {
        amount: amount || bill.amount,
      });

      const payment: BillPayment = {
        id: response.data.paymentId,
        billId,
        amount: amount || bill.amount,
        paymentDate: new Date(),
        status: 'completed',
        confirmationNumber: response.data.confirmationNumber,
      };

      // Update bill status
      await this.updateBill(billId, { status: 'paid' });

      return payment;
    } catch (error) {
      console.error('Error paying bill:', error);
      throw error;
    }
  }

  async scheduleBillPayment(billId: string, paymentDate: Date, amount?: number): Promise<BillPayment> {
    try {
      const bill = this.bills.find((b) => b.id === billId);
      if (!bill) {
        throw new Error('Bill not found');
      }

      const response = await ApiService.post(`/bills/${billId}/schedule`, {
        amount: amount || bill.amount,
        paymentDate: paymentDate.toISOString(),
      });

      const payment: BillPayment = {
        id: response.data.paymentId,
        billId,
        amount: amount || bill.amount,
        paymentDate,
        status: 'scheduled',
      };

      // Update bill status
      await this.updateBill(billId, { status: 'scheduled' });

      // Schedule notification
      await this.schedulePaymentNotification(bill, paymentDate);

      return payment;
    } catch (error) {
      console.error('Error scheduling bill payment:', error);
      throw error;
    }
  }

  async enableAutopay(billId: string, rule: Omit<AutopayRule, 'id' | 'billId'>): Promise<AutopayRule> {
    try {
      const response = await ApiService.post(`/bills/${billId}/autopay/enable`, rule);

      const autopayRule: AutopayRule = {
        id: response.data.ruleId,
        billId,
        ...rule,
      };

      this.autopayRules.set(billId, autopayRule);

      // Update bill
      await this.updateBill(billId, { autopayEnabled: true });

      return autopayRule;
    } catch (error) {
      console.error('Error enabling autopay:', error);
      throw error;
    }
  }

  async disableAutopay(billId: string): Promise<void> {
    try {
      await ApiService.post(`/bills/${billId}/autopay/disable`);
      this.autopayRules.delete(billId);
      await this.updateBill(billId, { autopayEnabled: false });
    } catch (error) {
      console.error('Error disabling autopay:', error);
      throw error;
    }
  }

  async updateAutopayRule(billId: string, updates: Partial<AutopayRule>): Promise<AutopayRule> {
    try {
      const response = await ApiService.put(`/bills/${billId}/autopay`, updates);

      const updatedRule: AutopayRule = {
        ...response.data.rule,
      };

      this.autopayRules.set(billId, updatedRule);

      return updatedRule;
    } catch (error) {
      console.error('Error updating autopay rule:', error);
      throw error;
    }
  }

  async getUpcomingBills(days: number = 30): Promise<Bill[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return this.bills.filter(
      (bill) =>
        bill.status !== 'paid' &&
        bill.dueDate >= now &&
        bill.dueDate <= futureDate
    ).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  async getOverdueBills(): Promise<Bill[]> {
    const now = new Date();
    return this.bills.filter(
      (bill) => bill.status !== 'paid' && bill.dueDate < now
    );
  }

  async getPaymentHistory(billId?: string, limit: number = 50): Promise<BillPayment[]> {
    try {
      const url = billId
        ? `/bills/${billId}/payments?limit=${limit}`
        : `/bills/payments?limit=${limit}`;

      const response = await ApiService.get(url);
      return response.data.payments.map((payment: any) => ({
        ...payment,
        paymentDate: new Date(payment.paymentDate),
      }));
    } catch (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }
  }

  async getMonthlyBillTotal(month?: number, year?: number): Promise<number> {
    const now = new Date();
    const targetMonth = month !== undefined ? month : now.getMonth();
    const targetYear = year !== undefined ? year : now.getFullYear();

    const monthlyBills = this.bills.filter((bill) => {
      const billMonth = bill.dueDate.getMonth();
      const billYear = bill.dueDate.getFullYear();
      return billMonth === targetMonth && billYear === targetYear;
    });

    return monthlyBills.reduce((total, bill) => total + bill.amount, 0);
  }

  async getBillsByCategory(category: Bill['category']): Promise<Bill[]> {
    return this.bills.filter((bill) => bill.category === category);
  }

  async searchBills(query: string): Promise<Bill[]> {
    const lowerQuery = query.toLowerCase();
    return this.bills.filter(
      (bill) =>
        bill.name.toLowerCase().includes(lowerQuery) ||
        bill.payee.toLowerCase().includes(lowerQuery)
    );
  }

  private async schedulePaymentNotification(bill: Bill, paymentDate: Date): Promise<void> {
    const notificationDate = new Date(paymentDate.getTime() - 24 * 60 * 60 * 1000); // 1 day before

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Bill Payment Scheduled',
        body: `Your ${bill.name} payment of $${bill.amount.toFixed(2)} is scheduled for tomorrow`,
        data: { billId: bill.id },
      },
      trigger: notificationDate,
    });
  }

  async setupBillReminders(billId: string, daysBefore: number[]): Promise<void> {
    const bill = this.bills.find((b) => b.id === billId);
    if (!bill) {
      throw new Error('Bill not found');
    }

    for (const days of daysBefore) {
      const reminderDate = new Date(bill.dueDate.getTime() - days * 24 * 60 * 60 * 1000);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Bill Reminder',
          body: `Your ${bill.name} payment of $${bill.amount.toFixed(2)} is due in ${days} day${days > 1 ? 's' : ''}`,
          data: { billId: bill.id },
        },
        trigger: reminderDate,
      });
    }
  }

  getAutopayRule(billId: string): AutopayRule | undefined {
    return this.autopayRules.get(billId);
  }

  getAllBills(): Bill[] {
    return this.bills;
  }

  getBillById(billId: string): Bill | undefined {
    return this.bills.find((b) => b.id === billId);
  }
}

export default new AutomatedBillPayService();

