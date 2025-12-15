import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';

// Placeholder for service imports
// import { ApiService, NotificationService } from 'src/services';

// --- TypeScript Interfaces ---

interface Payee {
  id: string;
  name: string;
  accountNumber: string;
  isBiller: boolean; // true for a company/biller, false for a person
}

interface Payment {
  id: string;
  payeeName: string;
  amount: number;
  date: string; // ISO date string
  status: 'Pending' | 'Completed' | 'Failed';
}

interface PaymentFormState {
  selectedPayeeId: string | null;
  amount: string;
  scheduleDate: string; // YYYY-MM-DD
  isRecurring: boolean;
}

// --- Mock Data and Services (to be replaced by actual imports) ---

const mockPayees: Payee[] = [
  { id: 'p1', name: 'Electric Co.', accountNumber: '123456789', isBiller: true },
  { id: 'p2', name: 'Water Utility', accountNumber: '987654321', isBiller: true },
  { id: 'p3', name: 'John Doe', accountNumber: '112233445', isBiller: false },
];

const mockPaymentHistory: Payment[] = [
  { id: 'h1', payeeName: 'Electric Co.', amount: 150.5, date: '2025-10-28', status: 'Completed' },
  { id: 'h2', payeeName: 'Water Utility', amount: 75.0, date: '2025-11-01', status: 'Pending' },
  { id: 'h3', payeeName: 'John Doe', amount: 500.0, date: '2025-10-15', status: 'Completed' },
];

const ApiService = {
  fetchPayees: async (): Promise<Payee[]> => {
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
    return mockPayees;
  },
  fetchPaymentHistory: async (): Promise<Payment[]> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return mockPaymentHistory;
  },
  submitPayment: async (data: any): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (Math.random() > 0.1) { // 90% success rate
      return true;
    } else {
      throw new Error('Payment processing failed due to insufficient funds.');
    }
  },
  addPayee: async (name: string, accountNumber: string): Promise<Payee> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const newPayee: Payee = {
      id: `p${Date.now()}`,
      name,
      accountNumber,
      isBiller: true, // Assume new payees are billers for simplicity
    };
    return newPayee;
  }
};

const NotificationService = {
  showSuccess: (message: string) => Alert.alert('Success', message),
  showError: (message: string) => Alert.alert('Error', message),
};

// --- Component Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollViewContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    marginTop: 20,
  },
  // Payee List Styles
  payeeListContainer: {
    maxHeight: 150, // Limit height for a scrollable list
    marginBottom: 20,
  },
  payeeItem: {
    padding: 15,
    marginRight: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payeeItemSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#e6f2ff',
  },
  payeeName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  // Form Styles
  formContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  input: {
    height: 45,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    color: '#333',
    // Web specific styling for better text input experience
    ...(Platform.OS === 'web' && {
      outlineStyle: 'none',
    }),
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // History Styles
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
  },
  historyText: {
    fontSize: 14,
    color: '#333',
  },
  statusCompleted: {
    color: 'green',
    fontWeight: '600',
  },
  statusPending: {
    color: 'orange',
    fontWeight: '600',
  },
  statusFailed: {
    color: 'red',
    fontWeight: '600',
  },
  // Responsive/Web styles
  webLayout: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    justifyContent: 'space-between',
  },
  webColumn: {
    flex: Platform.OS === 'web' ? 1 : undefined,
    marginHorizontal: Platform.OS === 'web' ? 10 : 0,
  },
  addPayeeButton: {
    backgroundColor: '#4CAF50',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  addPayeeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal/Add Payee Form Styles
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    width: Platform.OS === 'web' ? 400 : '90%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
  },
});

// --- Sub-Components ---

const PayeeItem: React.FC<{ payee: Payee; isSelected: boolean; onPress: () => void }> = ({
  payee,
  isSelected,
  onPress,
}) => (
  <TouchableOpacity
    style={[styles.payeeItem, isSelected && styles.payeeItemSelected]}
    onPress={onPress}
  >
    <Text style={styles.payeeName}>{payee.name}</Text>
  </TouchableOpacity>
);

const PaymentHistoryItem: React.FC<{ payment: Payment }> = ({ payment }) => {
  const statusStyle = useMemo(() => {
    switch (payment.status) {
      case 'Completed':
        return styles.statusCompleted;
      case 'Pending':
        return styles.statusPending;
      case 'Failed':
        return styles.statusFailed;
      default:
        return {};
    }
  }, [payment.status]);

  return (
    <View style={styles.historyItem}>
      <View>
        <Text style={styles.historyText}>{payment.payeeName}</Text>
        <Text style={[styles.historyText, { fontSize: 12, color: '#666' }]}>
          {payment.date}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.historyText, { fontWeight: '600' }]}>
          ${payment.amount.toFixed(2)}
        </Text>
        <Text style={[styles.historyText, statusStyle]}>{payment.status}</Text>
      </View>
    </View>
  );
};

// A simple modal for adding a new payee (using conditional rendering instead of a true Modal component for RN-Web compatibility simplicity)
const AddPayeeModal: React.FC<{
  isVisible: boolean;
  onClose: () => void;
  onAdd: (name: string, accountNumber: string) => void;
  isLoading: boolean;
}> = ({ isVisible, onClose, onAdd, isLoading }) => {
  const [name, setName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const handleAdd = useCallback(() => {
    if (!name || !accountNumber) {
      NotificationService.showError('Please enter both name and account number.');
      return;
    }
    onAdd(name, accountNumber);
    setName('');
    setAccountNumber('');
  }, [name, accountNumber, onAdd]);

  if (!isVisible) {
    return null;
  }

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.sectionTitle}>Add New Payee</Text>
        <TextInput
          style={styles.input}
          placeholder="Payee Name (e.g., Gas Company)"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Account Number"
          value={accountNumber}
          onChangeText={setAccountNumber}
          keyboardType="numeric"
        />
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleAdd}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Add Payee</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: '#6c757d', marginTop: 10 }]}
          onPress={onClose}
          disabled={isLoading}
        >
          <Text style={styles.submitButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// --- Main Component ---

const BillPaymentsScreen: React.FC = () => {
  const [payees, setPayees] = useState<Payee[]>([]);
  const [history, setHistory] = useState<Payment[]>([]);
  const [form, setForm] = useState<PaymentFormState>({
    selectedPayeeId: null,
    amount: '',
    scheduleDate: new Date().toISOString().split('T')[0], // Default to today
    isRecurring: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingPayee, setIsAddingPayee] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // --- Data Fetching ---

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedPayees, fetchedHistory] = await Promise.all([
        ApiService.fetchPayees(),
        ApiService.fetchPaymentHistory(),
      ]);
      setPayees(fetchedPayees);
      setHistory(fetchedHistory);
    } catch (error) {
      NotificationService.showError('Failed to load initial data.');
      console.error('Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // --- Handlers ---

  const handleFormChange = useCallback(
    (field: keyof PaymentFormState, value: string | boolean) => {
      setForm(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleSelectPayee = useCallback((payeeId: string) => {
    setForm(prev => ({ ...prev, selectedPayeeId: payeeId }));
  }, []);

  const handleSubmitPayment = useCallback(async () => {
    const { selectedPayeeId, amount, scheduleDate } = form;
    const numericAmount = parseFloat(amount);

    if (!selectedPayeeId) {
      NotificationService.showError('Please select a payee.');
      return;
    }
    if (isNaN(numericAmount) || numericAmount <= 0) {
      NotificationService.showError('Please enter a valid amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await ApiService.submitPayment({
        payeeId: selectedPayeeId,
        amount: numericAmount,
        scheduleDate,
        isRecurring: form.isRecurring,
      });

      if (success) {
        NotificationService.showSuccess('Payment successfully scheduled/sent!');
        // Reset form and update history (in a real app, history would be refetched)
        setForm(prev => ({ ...prev, amount: '', selectedPayeeId: null }));
        const newPayment: Payment = {
          id: `h${Date.now()}`,
          payeeName: payees.find(p => p.id === selectedPayeeId)?.name || 'Unknown Payee',
          amount: numericAmount,
          date: scheduleDate,
          status: 'Pending',
        };
        setHistory(prev => [newPayment, ...prev]);
      } else {
        // This path should ideally not be hit if ApiService throws on failure
        NotificationService.showError('Payment failed to process.');
      }
    } catch (error: any) {
      NotificationService.showError(error.message || 'An unexpected error occurred during payment.');
    } finally {
      setIsSubmitting(false);
    }
  }, [form, payees]);

  const handleAddPayee = useCallback(async (name: string, accountNumber: string) => {
    setIsAddingPayee(true);
    try {
      const newPayee = await ApiService.addPayee(name, accountNumber);
      setPayees(prev => [...prev, newPayee]);
      NotificationService.showSuccess(`Payee "${newPayee.name}" added successfully.`);
      setIsModalVisible(false);
    } catch (error) {
      NotificationService.showError('Failed to add new payee.');
      console.error('Add Payee error:', error);
    } finally {
      setIsAddingPayee(false);
    }
  }, []);

  // --- Render Functions ---

  const renderPayeeList = () => (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.sectionTitle}>Select Payee</Text>
        <TouchableOpacity
          style={styles.addPayeeButton}
          onPress={() => setIsModalVisible(true)}
        >
          <Text style={styles.addPayeeButtonText}>+ Add Payee</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.payeeListContainer}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#007AFF" />
        ) : (
          <FlatList
            data={payees}
            keyExtractor={item => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <PayeeItem
                payee={item}
                isSelected={item.id === form.selectedPayeeId}
                onPress={() => handleSelectPayee(item.id)}
              />
            )}
            ListEmptyComponent={<Text>No payees found. Add one to start.</Text>}
          />
        )}
      </View>
    </View>
  );

  const renderPaymentForm = () => (
    <View style={styles.formContainer}>
      <Text style={styles.sectionTitle}>Payment Details</Text>

      <TextInput
        style={styles.input}
        placeholder="Amount (e.g., 100.00)"
        value={form.amount}
        onChangeText={text => handleFormChange('amount', text.replace(/[^0-9.]/g, ''))} // Only allow numbers and one decimal point
        keyboardType="numeric"
      />

      <TextInput
        style={styles.input}
        placeholder="Schedule Date (YYYY-MM-DD)"
        value={form.scheduleDate}
        onChangeText={text => handleFormChange('scheduleDate', text)}
        // In a real app, this would be a DatePicker component
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
        <Text style={{ marginRight: 10, fontSize: 16 }}>Recurring Payment:</Text>
        <TouchableOpacity
          onPress={() => handleFormChange('isRecurring', !form.isRecurring)}
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            borderWidth: 2,
            borderColor: '#007AFF',
            backgroundColor: form.isRecurring ? '#007AFF' : '#fff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {form.isRecurring && <Text style={{ color: '#fff', fontWeight: 'bold' }}>✓</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmitPayment}
        disabled={isSubmitting || isLoading || !form.selectedPayeeId || parseFloat(form.amount) <= 0}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Schedule Payment</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderPaymentHistory = () => (
    <View>
      <Text style={styles.sectionTitle}>Payment History</Text>
      {isLoading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <FlatList
          data={history}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <PaymentHistoryItem payment={item} />}
          ListEmptyComponent={<Text style={{ padding: 10 }}>No payment history found.</Text>}
          scrollEnabled={false} // Disable internal scroll for FlatList inside ScrollView
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {renderPayeeList()}

        <View style={styles.webLayout}>
          {/* Payment Form (Left/Top) */}
          <View style={styles.webColumn}>
            {renderPaymentForm()}
          </View>

          {/* Payment History (Right/Bottom) */}
          <View style={styles.webColumn}>
            {renderPaymentHistory()}
          </View>
        </View>
      </ScrollView>

      {/* Add Payee Modal */}
      <AddPayeeModal
        isVisible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onAdd={handleAddPayee}
        isLoading={isAddingPayee}
      />
    </View>
  );
};

export default BillPaymentsScreen;
