import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ApiService from '../../services/ApiService';
import NotificationService from '../../services/NotificationService';

interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  category: string;
  recurring: boolean;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  reminderEnabled: boolean;
  reminderDays: number;
  isPaid: boolean;
  icon: string;
  color: string;
}

export default function BillRemindersScreen() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [upcomingBills, setUpcomingBills] = useState<Bill[]>([]);
  const [overdueBills, setOverdueBills] = useState<Bill[]>([]);

  useEffect(() => {
    loadBills();
  }, []);

  const loadBills = async () => {
    try {
      const data = await ApiService.getBills();
      setBills(data);
      
      const now = new Date();
      const upcoming = data.filter((bill: Bill) => {
        const dueDate = new Date(bill.dueDate);
        return !bill.isPaid && dueDate > now;
      });
      
      const overdue = data.filter((bill: Bill) => {
        const dueDate = new Date(bill.dueDate);
        return !bill.isPaid && dueDate < now;
      });
      
      setUpcomingBills(upcoming);
      setOverdueBills(overdue);
    } catch (error) {
      console.error('Failed to load bills:', error);
    }
  };

  const toggleReminder = async (billId: string, enabled: boolean) => {
    try {
      await ApiService.updateBillReminder(billId, enabled);
      
      if (enabled) {
        const bill = bills.find(b => b.id === billId);
        if (bill) {
          await NotificationService.scheduleBillReminder(bill);
        }
      } else {
        await NotificationService.cancelBillReminder(billId);
      }
      
      loadBills();
    } catch (error) {
      Alert.alert('Error', 'Failed to update reminder');
    }
  };

  const markAsPaid = async (billId: string) => {
    try {
      await ApiService.markBillAsPaid(billId);
      loadBills();
    } catch (error) {
      Alert.alert('Error', 'Failed to mark bill as paid');
    }
  };

  const getDaysUntilDue = (dueDate: string): number => {
    const now = new Date();
    const due = new Date(dueDate);
    const diff = due.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const renderBillCard = (bill: Bill) => {
    const daysUntilDue = getDaysUntilDue(bill.dueDate);
    const isOverdue = daysUntilDue < 0;
    const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 3;

    return (
      <View key={bill.id} style={styles.billCard}>
        <View style={styles.billHeader}>
          <View style={styles.billLeft}>
            <View style={[styles.iconContainer, { backgroundColor: bill.color + '20' }]}>
              <Icon name={bill.icon} size={28} color={bill.color} />
            </View>
            <View style={styles.billInfo}>
              <Text style={styles.billName}>{bill.name}</Text>
              <Text style={styles.billCategory}>{bill.category}</Text>
            </View>
          </View>
          <View style={styles.billRight}>
            <Text style={styles.billAmount}>${bill.amount.toLocaleString()}</Text>
            {bill.recurring && (
              <Text style={styles.recurringBadge}>{bill.frequency}</Text>
            )}
          </View>
        </View>

        <View style={styles.billDetails}>
          <View style={styles.dueDateRow}>
            <Icon name="calendar" size={16} color="#666" />
            <Text style={styles.dueDateText}>
              Due: {new Date(bill.dueDate).toLocaleDateString()}
            </Text>
            {isOverdue && (
              <View style={styles.overdueBadge}>
                <Text style={styles.overdueText}>OVERDUE</Text>
              </View>
            )}
            {isDueSoon && !isOverdue && (
              <View style={styles.dueSoonBadge}>
                <Text style={styles.dueSoonText}>DUE SOON</Text>
              </View>
            )}
          </View>

          <View style={styles.reminderRow}>
            <View style={styles.reminderLeft}>
              <Icon name="bell-outline" size={16} color="#666" />
              <Text style={styles.reminderText}>
                Remind {bill.reminderDays} days before
              </Text>
            </View>
            <Switch
              value={bill.reminderEnabled}
              onValueChange={(enabled) => toggleReminder(bill.id, enabled)}
              trackColor={{ false: '#ddd', true: '#4caf50' }}
              thumbColor="#fff"
            />
          </View>

          {!bill.isPaid && (
            <TouchableOpacity
              style={styles.payButton}
              onPress={() => markAsPaid(bill.id)}
            >
              <Icon name="check-circle-outline" size={20} color="#4caf50" />
              <Text style={styles.payButtonText}>Mark as Paid</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Bill Reminders</Text>
        <TouchableOpacity style={styles.addButton}>
          <Icon name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {overdueBills.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="alert-circle" size={20} color="#f44336" />
            <Text style={[styles.sectionTitle, { color: '#f44336' }]}>
              Overdue ({overdueBills.length})
            </Text>
          </View>
          {overdueBills.map(renderBillCard)}
        </View>
      )}

      {upcomingBills.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="clock-outline" size={20} color="#2196f3" />
            <Text style={[styles.sectionTitle, { color: '#2196f3' }]}>
              Upcoming ({upcomingBills.length})
            </Text>
          </View>
          {upcomingBills.map(renderBillCard)}
        </View>
      )}

      {bills.length === 0 && (
        <View style={styles.emptyState}>
          <Icon name="receipt-text-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No bills yet</Text>
          <Text style={styles.emptySubtext}>Add your first bill to get reminders</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4caf50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  billCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  billHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  billInfo: {
    flex: 1,
  },
  billName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  billCategory: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  billRight: {
    alignItems: 'flex-end',
  },
  billAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  recurringBadge: {
    fontSize: 12,
    color: '#2196f3',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  billDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dueDateText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    flex: 1,
  },
  overdueBadge: {
    backgroundColor: '#ffebee',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  overdueText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#f44336',
  },
  dueSoonBadge: {
    backgroundColor: '#fff3e0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  dueSoonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ff9800',
  },
  reminderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reminderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4caf50',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
  },
});

