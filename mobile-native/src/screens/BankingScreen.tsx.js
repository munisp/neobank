import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import ApiService from '../services/ApiService';
import { BankingData, Account, Transaction } from '../types/banking';

// Mock navigation prop type for standalone screen
type BankingScreenProps = {
  navigation: {
    navigate: (screen: string, params?: any) => void;
    setOptions: (options: any) => void;
  };
};

// --- Helper Components ---

interface AccountCardProps {
  account: Account;
  onPress: (account: Account) => void;
}

const AccountCard: React.FC<AccountCardProps> = ({ account, onPress }) => (
  <TouchableOpacity style={styles.card} onPress={() => onPress(account)}>
    <View style={styles.cardHeader}>
      <Text style={styles.accountName}>{account.name}</Text>
      <Text style={styles.accountType}>{account.type}</Text>
    </View>
    <Text style={styles.balanceText}>
      {account.currency} {account.balance.toFixed(2)}
    </Text>
    <Text style={styles.lastUpdated}>
      Last updated: {new Date(account.lastUpdated).toLocaleDateString()}
    </Text>
  </TouchableOpacity>
);

interface TransactionRowProps {
  transaction: Transaction;
}

const TransactionRow: React.FC<TransactionRowProps> = ({ transaction }) => {
  const isCredit = transaction.type === 'credit';
  const amountStyle = isCredit ? styles.creditAmount : styles.debitAmount;

  return (
    <View style={styles.transactionRow}>
      <View style={styles.transactionDetails}>
        <Text style={styles.transactionDescription}>{transaction.description}</Text>
        <Text style={styles.transactionCategory}>{transaction.category} - {transaction.date}</Text>
      </View>
      <Text style={[styles.transactionAmount, amountStyle]}>
        {isCredit ? '+' : '-'} {transaction.amount.toFixed(2)}
      </Text>
    </View>
  );
};

// --- Main Screen Component ---

const BankingScreen: React.FC<BankingScreenProps> = ({ navigation }) => {
  const [data, setData] = useState<BankingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch data from the API service
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await ApiService.fetchBankingData();
      setData(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      Alert.alert('Error', `Failed to load banking data: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle pull-to-refresh
  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchData();
  }, [fetchData]);

  // Handle navigation to a detailed account view (PWA feature parity)
  const handleAccountPress = (account: Account) => {
    // In a real app, this would navigate to a detailed screen
    navigation.navigate('AccountDetail', { accountId: account.id, accountName: account.name });
  };

  // Set navigation options (e.g., header title)
  useEffect(() => {
    navigation.setOptions({
      title: 'My Banking Dashboard',
    });
  }, [navigation]);

  // --- Render Logic ---

  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading financial data...</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Ensure data is available before rendering the main content
  if (!data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No data available.</Text>
      </View>
    );
  }

  // --- Main Content Render ---

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      {/* Total Balance Section (Key PWA feature) */}
      <View style={styles.totalBalanceContainer}>
        <Text style={styles.totalBalanceLabel}>Total Portfolio Balance</Text>
        <Text style={styles.totalBalanceValue}>
          USD {data.totalBalance.toFixed(2)}
        </Text>
      </View>

      {/* Accounts Section */}
      <Text style={styles.sectionTitle}>My Accounts</Text>
      <View style={styles.accountsList}>
        {data.accounts.map((account) => (
          <AccountCard key={account.id} account={account} onPress={handleAccountPress} />
        ))}
      </View>

      {/* Quick Actions Section (PWA feature parity) */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickActionsContainer}>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Transfer')}>
          <Text style={styles.actionButtonText}>Transfer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('PayBills')}>
          <Text style={styles.actionButtonText}>Pay Bills</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Deposit')}>
          <Text style={styles.actionButtonText}>Deposit</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Transactions Section */}
      <Text style={styles.sectionTitle}>Recent Transactions</Text>
      <View style={styles.transactionsList}>
        {data.recentTransactions.map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} />
        ))}
        <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('TransactionsHistory')}>
          <Text style={styles.viewAllButtonText}>View All Transactions</Text>
        </TouchableOpacity>
      </View>

      {/* Footer/Disclaimer (PWA feature parity) */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Data as of {new Date().toLocaleTimeString()}
        </Text>
        <Text style={styles.footerTextSmall}>
          Balances may not reflect pending transactions.
        </Text>
      </View>
    </ScrollView>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5', // Light background for a clean look
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: '#D32F2F',
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
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Total Balance
  totalBalanceContainer: {
    backgroundColor: '#fff',
    padding: 20,
    margin: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  totalBalanceLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  totalBalanceValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A237E', // Deep blue for emphasis
  },
  // Sections
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  // Account Cards
  accountsList: {
    paddingHorizontal: 10,
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 5,
    borderLeftColor: '#007AFF', // Primary color accent
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  accountName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  accountType: {
    fontSize: 14,
    color: '#666',
  },
  balanceText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A237E',
    marginVertical: 5,
  },
  lastUpdated: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
  },
  // Quick Actions
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: '#E3F2FD', // Light blue background
    padding: 15,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  // Transactions
  transactionsList: {
    backgroundColor: '#fff',
    marginHorizontal: 10,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  transactionCategory: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  creditAmount: {
    color: '#4CAF50', // Green for credit
  },
  debitAmount: {
    color: '#D32F2F', // Red for debit
  },
  viewAllButton: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  viewAllButtonText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  // Footer
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
  footerTextSmall: {
    fontSize: 10,
    color: '#ccc',
    marginTop: 5,
  },
});

export default BankingScreen;