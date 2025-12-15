import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  FlatList,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';

// --- Type Definitions ---

// Assuming a simple navigation stack for demonstration
type RootStackParamList = {
  Home: undefined;
  Transfers: undefined;
  TransferDetails: { transactionId: string };
  NewRecipient: undefined;
};

type TransfersScreenProps = StackScreenProps<RootStackParamList, 'Transfers'>;

interface Account {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  status: 'Completed' | 'Pending' | 'Failed';
}

interface Recipient {
  id: string;
  name: string;
  accountNumber: string;
  bank: string;
}

// --- Mock API Service (Simulating existing ApiService) ---

/**
 * NOTE: In a real application, this would be an imported service.
 * This mock simulates the required API calls for the Transfers screen.
 */
const ApiService = {
  fetchAccounts: async (): Promise<Account[]> => {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
    return [
      { id: 'acc1', name: 'Checking Account', balance: 12500.50, currency: 'USD' },
      { id: 'acc2', name: 'Savings Account', balance: 55000.00, currency: 'USD' },
    ];
  },
  fetchRecentTransactions: async (): Promise<Transaction[]> => {
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
    // Simulate a possible error on first load to demonstrate error handling
    // if (Math.random() < 0.3) throw new Error('Failed to load transactions.');
    return [
      { id: 't1', date: '2025-10-30', description: 'Transfer to John Doe', amount: -500.00, currency: 'USD', status: 'Completed' },
      { id: 't2', date: '2025-10-29', description: 'Transfer from Jane Smith', amount: 1200.00, currency: 'USD', status: 'Completed' },
      { id: 't3', date: '2025-10-28', description: 'Scheduled Payment', amount: -150.00, currency: 'USD', status: 'Pending' },
    ];
  },
  fetchRecipients: async (): Promise<Recipient[]> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return [
      { id: 'r1', name: 'John Doe', accountNumber: '1234567890', bank: 'First National' },
      { id: 'r2', name: 'Jane Smith', accountNumber: '0987654321', bank: 'Global Bank' },
    ];
  },
  executeTransfer: async (transferData: {
    fromAccountId: string;
    recipientId: string;
    amount: number;
  }): Promise<Transaction> => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (transferData.amount > 10000) {
      throw new Error('Transfer amount exceeds daily limit.');
    }
    return {
      id: `t${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      description: `Transfer to ${transferData.recipientId}`,
      amount: -transferData.amount,
      currency: 'USD',
      status: 'Completed',
    };
  },
};

// --- Component State and Logic ---

const TransfersScreen: React.FC<TransfersScreenProps> = ({ navigation }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transfer Form State
  const [fromAccount, setFromAccount] = useState<string>('');
  const [toRecipient, setToRecipient] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Function to fetch all necessary data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [accs, txns, recs] = await Promise.all([
        ApiService.fetchAccounts(),
        ApiService.fetchRecentTransactions(),
        ApiService.fetchRecipients(),
      ]);
      setAccounts(accs);
      setTransactions(txns);
      setRecipients(recs);
      if (accs.length > 0) {
        setFromAccount(accs[0].id); // Set default account
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Data load failed: ${errorMessage}`);
      Alert.alert('Error', `Failed to load data: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Transfer Submission
  const handleTransfer = async () => {
    if (!fromAccount || !toRecipient || !amount) {
      Alert.alert('Validation Error', 'Please fill in all transfer details.');
      return;
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid amount.');
      return;
    }

    setIsTransferring(true);
    try {
      const newTransaction = await ApiService.executeTransfer({
        fromAccountId: fromAccount,
        recipientId: toRecipient,
        amount: transferAmount,
      });
      Alert.alert('Success', 'Transfer completed successfully!');
      // Prepend new transaction to the list
      setTransactions(prev => [newTransaction, ...prev]);
      // Reset form
      setAmount('');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      Alert.alert('Transfer Failed', errorMessage);
    } finally {
      setIsTransferring(false);
    }
  };

  // --- UI Components ---

  const renderLoading = () => (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>Loading transfers data...</Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.centered}>
      <Text style={styles.errorText}>Error: {error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
        <Text style={styles.retryButtonText}>Tap to Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTransferForm = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>New Transfer</Text>

      {/* Source Account Selector (Simplified as Text Input for now) */}
      <Text style={styles.label}>From Account</Text>
      <View style={styles.inputContainer}>
        <Text style={styles.selectText}>
          {accounts.find(a => a.id === fromAccount)?.name || 'Select Account'}
        </Text>
        {/* In a real app, this would open a modal/picker */}
        <TouchableOpacity onPress={() => Alert.alert('Select Account', 'Account selection modal/picker goes here.')}>
          <Text style={styles.changeText}>Change</Text>
        </TouchableOpacity>
      </View>

      {/* Recipient Selector (Simplified as Text Input for now) */}
      <Text style={styles.label}>To Recipient</Text>
      <View style={styles.inputContainer}>
        <Text style={styles.selectText}>
          {recipients.find(r => r.id === toRecipient)?.name || 'Select Recipient'}
        </Text>
        {/* In a real app, this would open a modal/picker */}
        <TouchableOpacity onPress={() => Alert.alert('Select Recipient', 'Recipient selection modal/picker goes here.')}>
          <Text style={styles.changeText}>Change</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.newRecipientButton}
        onPress={() => navigation.navigate('NewRecipient')}
      >
        <Text style={styles.newRecipientButtonText}>+ Add New Recipient</Text>
      </TouchableOpacity>

      {/* Amount Input */}
      <Text style={styles.label}>Amount (USD)</Text>
      <TextInput
        style={styles.textInput}
        keyboardType="numeric"
        placeholder="0.00"
        value={amount}
        onChangeText={setAmount}
      />

      {/* Transfer Button */}
      <TouchableOpacity
        style={[styles.transferButton, isTransferring && styles.transferButtonDisabled]}
        onPress={handleTransfer}
        disabled={isTransferring}
      >
        {isTransferring ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.transferButtonText}>Execute Transfer</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderTransactionItem = ({ item }: { item: Transaction }) => (
    <TouchableOpacity
      style={styles.transactionItem}
      onPress={() => navigation.navigate('TransferDetails', { transactionId: item.id })}
    >
      <View style={styles.transactionDetails}>
        <Text style={styles.transactionDescription}>{item.description}</Text>
        <Text style={styles.transactionDate}>{item.date}</Text>
      </View>
      <View style={styles.transactionAmountContainer}>
        <Text
          style={[
            styles.transactionAmount,
            item.amount < 0 ? styles.amountNegative : styles.amountPositive,
          ]}
        >
          {item.amount < 0 ? '-' : '+'} ${Math.abs(item.amount).toFixed(2)}
        </Text>
        <Text style={styles.transactionStatus}>{item.status}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderRecentTransfers = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Recent Transfers</Text>
      {transactions.length === 0 ? (
        <Text style={styles.noDataText}>No recent transfers found.</Text>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransactionItem}
          scrollEnabled={false} // FlatList inside ScrollView
        />
      )}
    </View>
  );

  // --- Main Render ---

  if (isLoading) {
    return renderLoading();
  }

  if (error) {
    return renderError();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {renderTransferForm()}
      {renderRecentTransfers()}
      <View style={{ height: 50 }} />
    </ScrollView>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  contentContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    color: 'red',
    fontSize: 18,
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
    marginTop: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  selectText: {
    fontSize: 16,
    color: '#333',
  },
  changeText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  newRecipientButton: {
    alignSelf: 'flex-start',
    marginBottom: 15,
  },
  newRecipientButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  transferButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  transferButtonDisabled: {
    backgroundColor: '#a0c4ff',
  },
  transferButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  transactionDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  amountNegative: {
    color: '#e74c3c', // Red for debits
  },
  amountPositive: {
    color: '#2ecc71', // Green for credits
  },
  transactionStatus: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  noDataText: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
  }
});

export default TransfersScreen;