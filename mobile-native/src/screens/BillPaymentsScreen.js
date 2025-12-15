import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';

// --- Types and Interfaces ---

// Define the structure for a single Bill Payment
interface BillPayment {
  id: string;
  billerName: string;
  amount: number;
  dueDate: string; // ISO date string
  status: 'Pending' | 'Paid' | 'Overdue';
  accountNumber: string;
}

// Define the structure for the Bill Payments screen navigation parameters
type RootStackParamList = {
  BillPayments: undefined;
  AddBill: undefined;
  PaymentDetails: { paymentId: string };
};

type BillPaymentsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'BillPayments'>;
type BillPaymentsScreenRouteProp = RouteProp<RootStackParamList, 'BillPayments'>;

interface Props {
  navigation: BillPaymentsScreenNavigationProp;
  route: BillPaymentsScreenRouteProp;
}

// --- Mock API Service (Simulating existing ApiService) ---

const mockPayments: BillPayment[] = [
  { id: '1', billerName: 'Electricity Co.', amount: 125.50, dueDate: '2025-11-15', status: 'Pending', accountNumber: '123456789' },
  { id: '2', billerName: 'Internet Provider', amount: 59.99, dueDate: '2025-10-28', status: 'Overdue', accountNumber: '987654321' },
  { id: '3', billerName: 'Water Utility', amount: 45.00, dueDate: '2025-10-01', status: 'Paid', accountNumber: '112233445' },
  { id: '4', billerName: 'Credit Card', amount: 500.00, dueDate: '2025-11-30', status: 'Pending', accountNumber: '556677889' },
];

const ApiService = {
  fetchBillPayments: async (): Promise<BillPayment[]> => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Simulate a random error for demonstration
    if (Math.random() < 0.1) {
      throw new Error('Failed to fetch bill payments due to network error.');
    }

    return mockPayments;
  },
  payBill: async (paymentId: string): Promise<void> => {
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const payment = mockPayments.find(p => p.id === paymentId);
    if (payment) {
      payment.status = 'Paid';
      return;
    }
    throw new Error('Payment not found.');
  }
};

// --- Helper Components ---

interface BillItemProps {
  payment: BillPayment;
  onPress: (paymentId: string) => void;
  onPay: (paymentId: string) => void;
}

const BillItem: React.FC<BillItemProps> = ({ payment, onPress, onPay }) => {
  const isOverdue = payment.status === 'Overdue';
  const isPaid = payment.status === 'Paid';

  const statusStyle = isOverdue ? styles.overdueText : isPaid ? styles.paidText : styles.pendingText;

  return (
    <TouchableOpacity style={styles.billItemContainer} onPress={() => onPress(payment.id)}>
      <View style={styles.billInfo}>
        <Text style={styles.billerName}>{payment.billerName}</Text>
        <Text style={styles.dueDate}>Due: {payment.dueDate}</Text>
      </View>
      <View style={styles.billActions}>
        <Text style={styles.amountText}>${payment.amount.toFixed(2)}</Text>
        <Text style={[styles.statusText, statusStyle]}>{payment.status}</Text>
        {!isPaid && (
          <TouchableOpacity 
            style={styles.payButton} 
            onPress={() => onPay(payment.id)}
            disabled={isPaid}
          >
            <Text style={styles.payButtonText}>Pay Now</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

// --- Main Screen Component ---

const BillPaymentsScreen: React.FC<Props> = ({ navigation }) => {
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Function to fetch data from the API service
  const fetchPayments = useCallback(async () => {
    setError(null);
    try {
      const data = await ApiService.fetchBillPayments();
      setPayments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      Alert.alert('Error', 'Could not load bill payments. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial data fetch on component mount
  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Handle pull-to-refresh
  const onRefresh = () => {
    setIsRefreshing(true);
    fetchPayments();
  };

  // Handle navigation to payment details
  const handlePressBill = (paymentId: string) => {
    navigation.navigate('PaymentDetails', { paymentId });
  };

  // Handle bill payment action
  const handlePayBill = async (paymentId: string) => {
    setIsLoading(true);
    try {
      await ApiService.payBill(paymentId);
      // Update the status locally after successful payment
      setPayments(prevPayments => 
        prevPayments.map(p => 
          p.id === paymentId ? { ...p, status: 'Paid' } : p
        )
      );
      Alert.alert('Success', 'Bill paid successfully!');
    } catch (err) {
      Alert.alert('Payment Failed', err instanceof Error ? err.message : 'An unknown error occurred during payment.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render Logic ---

  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading bills...</Text>
      </View>
    );
  }

  if (error && payments.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchPayments}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pendingPayments = payments.filter(p => p.status !== 'Paid');
  const paidPayments = payments.filter(p => p.status === 'Paid');

  return (
    <View style={styles.container}>
      {/* Header with Add Bill button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bill Payments</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('AddBill')}>
          <Text style={styles.addButtonText}>+ Add Bill</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        {/* Pending/Overdue Bills Section */}
        <Text style={styles.sectionTitle}>Pending Bills ({pendingPayments.length})</Text>
        {pendingPayments.length > 0 ? (
          pendingPayments.map(payment => (
            <BillItem 
              key={payment.id} 
              payment={payment} 
              onPress={handlePressBill} 
              onPay={handlePayBill} 
            />
          ))
        ) : (
          <Text style={styles.emptyText}>No pending bills. You're all caught up!</Text>
        )}

        {/* Paid Bills Section */}
        <Text style={styles.sectionTitle}>Paid Bills ({paidPayments.length})</Text>
        {paidPayments.length > 0 ? (
          paidPayments.map(payment => (
            <BillItem 
              key={payment.id} 
              payment={payment} 
              onPress={handlePressBill} 
              onPay={handlePayBill} 
            />
          ))
        ) : (
          <Text style={styles.emptyText}>No bills have been paid yet.</Text>
        )}
      </ScrollView>
      
      {/* Global Loading Indicator (for payment action) */}
      {isLoading && !isRefreshing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.overlayText}>Processing...</Text>
        </View>
      )}
    </View>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    paddingHorizontal: 15,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  billItemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  billInfo: {
    flex: 2,
  },
  billerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  dueDate: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  billActions: {
    flex: 1,
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 5,
  },
  pendingText: {
    color: '#FFA500', // Orange
    backgroundColor: '#FFF3E0',
  },
  paidText: {
    color: '#4CAF50', // Green
    backgroundColor: '#E8F5E9',
  },
  overdueText: {
    color: '#F44336', // Red
    backgroundColor: '#FFEBEE',
  },
  payButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 10,
    padding: 10,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  overlayText: {
    color: '#FFFFFF',
    marginTop: 10,
    fontSize: 16,
  }
});

export default BillPaymentsScreen;
