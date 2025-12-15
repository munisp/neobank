import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons'; // Assuming @expo/vector-icons is available for icons

// --- 1. TypeScript Interfaces ---

interface AccountSummary {
  id: string;
  accountName: string;
  accountNumber: string;
  balance: number;
  currency: string;
}

interface Transaction {
  id: string;
  date: string; // ISO date string or formatted date
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
}

interface QuickAction {
  id: string;
  iconName: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}

// --- 2. Mock Services (Simulating src/services usage) ---

// Mocking the structure of ApiService/AuthService for data fetching
const MOCK_ACCOUNT_SUMMARY: AccountSummary = {
  id: 'acc-123',
  accountName: 'Primary Checking',
  accountNumber: '**** 1234',
  balance: 12543.89,
  currency: 'USD',
};

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 't1', date: '2025-11-01', description: 'Starbucks', amount: 5.50, type: 'debit', category: 'Food' },
  { id: 't2', date: '2025-10-31', description: 'Salary Deposit', amount: 3500.00, type: 'credit', category: 'Income' },
  { id: 't3', date: '2025-10-30', description: 'Amazon Prime', amount: 14.99, type: 'debit', category: 'Subscription' },
  { id: 't4', date: '2025-10-29', description: 'Gym Membership', amount: 49.99, type: 'debit', category: 'Health' },
  { id: 't5', date: '2025-10-28', description: 'Transfer to Savings', amount: 500.00, type: 'debit', category: 'Transfer' },
];

// Simulate API call delay and potential error
const fetchBankingData = (): Promise<{ summary: AccountSummary, transactions: Transaction[] }> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Simulate a 10% chance of failure
      if (Math.random() < 0.1) {
        reject(new Error('Failed to fetch banking data. Please try again.'));
      } else {
        resolve({
          summary: MOCK_ACCOUNT_SUMMARY,
          transactions: MOCK_TRANSACTIONS,
        });
      }
    }, 1500); // 1.5 second delay
  });
};

// --- 3. Component Implementation (To be completed in next phases) ---

// --- 4. UI Components ---

// Helper to format currency
const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

// Account Summary Card Component
const AccountSummaryCard: React.FC<{ summary: AccountSummary }> = ({ summary }) => (
  <View style={componentStyles.summaryCard}>
    <Text style={componentStyles.summaryAccountName}>{summary.accountName}</Text>
    <Text style={componentStyles.summaryAccountNumber}>{summary.accountNumber}</Text>
    <Text style={componentStyles.summaryBalanceLabel}>Current Balance</Text>
    <Text style={componentStyles.summaryBalance}>
      {formatCurrency(summary.balance, summary.currency)}
    </Text>
    <TouchableOpacity style={componentStyles.viewDetailsButton}>
      <Text style={componentStyles.viewDetailsButtonText}>View Details</Text>
    </TouchableOpacity>
  </View>
);

// Quick Actions Component
const QuickActions: React.FC = () => {
  const { width } = Dimensions.get('window');
  const isLargeScreen = width > 768;

  // Mock function for navigation/action
  const handleAction = (label: string) => {
    console.log(`Action: ${label} pressed`);
    // In a real app, this would use a navigation service
    // e.g., NavigationService.navigate(label);
  };

  const quickActions: QuickAction[] = [
    { id: '1', iconName: 'send', label: 'Transfer', onPress: () => handleAction('Transfer') },
    { id: '2', iconName: 'credit-card', label: 'Pay Bill', onPress: () => handleAction('Pay Bill') },
    { id: '3', iconName: 'dollar-sign', label: 'Deposit', onPress: () => handleAction('Deposit') },
    { id: '4', iconName: 'bar-chart-2', label: 'Budget', onPress: () => handleAction('Budget') },
    // Add more actions for a more realistic hub
    { id: '5', iconName: 'file-text', label: 'Statements', onPress: () => handleAction('Statements') },
    { id: '6', iconName: 'settings', label: 'Settings', onPress: () => handleAction('Settings') },
  ];

  const actionStyle = isLargeScreen
    ? { width: '15%', marginVertical: 10 } // 6 items in a row on large screen
    : { width: '25%', marginVertical: 10 }; // 4 items in a row on small screen

  return (
    <View style={[componentStyles.quickActionsContainer, isLargeScreen && componentStyles.quickActionsContainerWeb]}>
      {quickActions.map((action) => (
        <TouchableOpacity key={action.id} style={[componentStyles.quickActionButton, actionStyle]} onPress={action.onPress}>
          <View style={componentStyles.quickActionIconCircle}>
            <Feather name={action.iconName} size={24} color="#007AFF" />
          </View>
          <Text style={componentStyles.quickActionLabel}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// Transaction Item Component
const TransactionItem: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
  const isDebit = transaction.type === 'debit';
  const sign = isDebit ? '-' : '+';
  const color = isDebit ? '#D32F2F' : '#388E3C';

  return (
    <View style={componentStyles.transactionItem}>
      <View style={componentStyles.transactionIcon}>
        <Feather name={isDebit ? 'arrow-up-right' : 'arrow-down-left'} size={20} color={color} />
      </View>
      <View style={componentStyles.transactionDetails}>
        <Text style={componentStyles.transactionDescription} numberOfLines={1}>{transaction.description}</Text>
        <Text style={componentStyles.transactionCategory}>{transaction.category} • {transaction.date}</Text>
      </View>
      <Text style={[componentStyles.transactionAmount, { color }]}>
        {sign}{formatCurrency(transaction.amount, MOCK_ACCOUNT_SUMMARY.currency)}
      </Text>
    </View>
  );
};

// Recent Transactions List Component
const RecentTransactionsList: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => (
  <View style={componentStyles.transactionsListContainer}>
    <Text style={styles.sectionHeader}>Recent Transactions</Text>
    {transactions.length > 0 ? (
      transactions.map((t) => <TransactionItem key={t.id} transaction={t} />)
    ) : (
      <Text style={componentStyles.noTransactionsText}>No recent transactions found.</Text>
    )}
    <TouchableOpacity style={componentStyles.viewAllButton}>
      <Text style={componentStyles.viewAllButtonText}>View All Transactions</Text>
    </TouchableOpacity>
  </View>
);

// --- 5. Main Component ---

const BankingScreen: React.FC = () => {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchBankingData();
      setSummary(data.summary);
      setTransactions(data.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading banking data...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {summary && <AccountSummaryCard summary={summary} />}
        <Text style={styles.sectionHeader}>Quick Actions</Text>
        <QuickActions />
        <RecentTransactionsList transactions={transactions} />
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {renderContent()}
    </View>
  );
};

const componentStyles = StyleSheet.create({
  // Account Summary Card Styles
  summaryCard: {
    backgroundColor: '#007AFF', // Primary Blue
    borderRadius: 15,
    padding: 25,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 8,
  },
  summaryAccountName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 5,
  },
  summaryAccountNumber: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 20,
  },
  summaryBalanceLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    // Web compatibility for text alignment
    ...Platform.select({
      web: { userSelect: 'none' as any },
    }),
  },
  summaryBalance: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
  },
  viewDetailsButton: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  viewDetailsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },

  // Quick Actions Styles
  quickActionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap', // Allow wrapping for responsiveness
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  quickActionsContainerWeb: {
    justifyContent: 'flex-start', // Align left on web
    paddingHorizontal: 10,
  },
  quickActionButton: {
    alignItems: 'center',
    // Width is now controlled dynamically in the component
  },
  quickActionIconCircle: {
    backgroundColor: '#E6F0FF', // Light blue background
    padding: 12,
    borderRadius: 30,
    marginBottom: 5,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
  },

  // Transactions List Styles
  transactionsListContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  transactionIcon: {
    marginRight: 15,
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
  transactionDetails: {
    flex: 1,
    marginRight: 10,
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
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
  noTransactionsText: {
    textAlign: 'center',
    color: '#999',
    paddingVertical: 20,
  },
  viewAllButton: {
    marginTop: 15,
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  viewAllButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 15,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
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
    fontSize: 18,
    color: '#D32F2F',
    textAlign: 'center',
    marginBottom: 20,
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
  headerText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    marginTop: 10,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  }
});

export default BankingScreen;