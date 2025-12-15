// --- Interfaces and Types ---

/**
 * Represents the type of an account.
 */
export type AccountType = 'Checking' | 'Savings' | 'Credit Card' | 'Investment';

/**
 * Represents a single bank account.
 */
export interface Account {
  id: string;
  name: string;
  balance: number;
  currency: string;
  type: AccountType;
  lastFourDigits: string;
  color: string; // For card styling
}

/**
 * Represents the structure of the data fetched from the API.
 */
export interface AccountsData {
  accounts: Account[];
  totalBalance: number;
}

// --- Mock Data (Simulating ApiService response) ---

const MOCK_ACCOUNTS: Account[] = [
  {
    id: 'acc-1001',
    name: 'Primary Checking',
    balance: 12500.55,
    currency: 'USD',
    type: 'Checking',
    lastFourDigits: '1234',
    color: '#4CAF50', // Green
  },
  {
    id: 'acc-1002',
    name: 'High-Yield Savings',
    balance: 55000.00,
    currency: 'USD',
    type: 'Savings',
    lastFourDigits: '5678',
    color: '#2196F3', // Blue
  },
  {
    id: 'acc-1003',
    name: 'NeoBank Credit',
    balance: -850.75,
    currency: 'USD',
    type: 'Credit Card',
    lastFourDigits: '9012',
    color: '#FF9800', // Orange
  },
  {
    id: 'acc-1004',
    name: 'Stock Portfolio',
    balance: 1500.20,
    currency: 'USD',
    type: 'Investment',
    lastFourDigits: '3456',
    color: '#9C27B0', // Purple
  },
];

export const MOCK_ACCOUNTS_DATA: AccountsData = {
  accounts: MOCK_ACCOUNTS,
  totalBalance: MOCK_ACCOUNTS.reduce((sum, acc) => sum + acc.balance, 0),
};

// --- Service Mock (Simulating ApiService) ---

/**
 * Mock function to simulate fetching accounts data.
 * In a real app, this would use ApiService.
 */
export const fetchAccounts = (): Promise<AccountsData> => {
  return new Promise((resolve) => {
    // Simulate network delay
    setTimeout(() => {
      resolve(MOCK_ACCOUNTS_DATA);
    }, 1000);
  });
};

// Note: The actual component implementation will follow in the next phases.
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';

// Assume these services are available in src/services
// For this implementation, we will use the mock fetchAccounts function defined above.
// import { ApiService } from '../services/ApiService';
// import { AuthService } from '../services/AuthService';
// import { NotificationService } from '../services/NotificationService';
// import { StorageService } from '../services/StorageService';

// --- Constants and Utility Functions ---

const SPACING = 16;
const CARD_HEIGHT = 120;

// Helper function for currency formatting
const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

// --- Account Card Component (Placeholder) ---

interface AccountCardProps {
  account: Account;
  onPress: (account: Account) => void;
}

const AccountCard: React.FC<AccountCardProps> = React.memo(({ account, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: account.color }]}
      onPress={() => onPress(account)}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{account.name}</Text>
        <Text style={styles.cardType}>{account.type}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardBalance}>
          {formatCurrency(account.balance, account.currency)}
        </Text>
        <Text style={styles.cardDetails}>
          **** **** **** {account.lastFourDigits}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// --- Accounts Screen Component ---

interface AccountsScreenProps {
  // Navigation prop placeholder
  navigation: any;
}

const AccountsScreen: React.FC<AccountsScreenProps> = ({ navigation }) => {
  const [accountsData, setAccountsData] = useState<AccountsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to handle navigation to account details
  const handleAccountPress = useCallback((account: Account) => {
    // In a real app, this would navigate:
    // navigation.navigate('AccountDetails', { accountId: account.id });
    console.log('Navigating to details for:', account.name);
  }, []);

  // Function to handle adding a new account
  const handleAddAccount = useCallback(() => {
    // In a real app, this would navigate:
    // navigation.navigate('AddAccount');
    console.log('Navigating to Add Account screen');
  }, []);

  // Placeholder for data fetching logic (to be implemented in Phase 3)
  const loadAccounts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Simulate fetching data from ApiService
      const data = await fetchAccounts();
      setAccountsData(data);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
      setError('Failed to load accounts. Please try again.');
      // NotificationService.showError('Failed to load accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  // Render content based on state (to be refined)
  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading accounts...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadAccounts}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!accountsData || accountsData.accounts.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.noAccountsText}>No accounts found.</Text>
          <Text style={styles.noAccountsSubText}>Time to open a new one!</Text>
        </View>
      );
    }

    // Actual list rendering will be done in Phase 4
    return (
      <FlatList
        data={accountsData.accounts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AccountCard account={item} onPress={handleAccountPress} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            <Text style={styles.totalBalanceLabel}>Total Net Worth</Text>
            <Text style={styles.totalBalanceValue}>
              {formatCurrency(accountsData.totalBalance)}
            </Text>
          </View>
        }
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with Add Account Button */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>My Accounts</Text>
        <TouchableOpacity style={styles.addButton} onPress={handleAddAccount}>
          <Text style={styles.addButtonText}>+ Add Account</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      {renderContent()}
    </View>
  );
};

// --- Stylesheet ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5', // Light background for the screen
    paddingTop: Platform.OS === 'web' ? 0 : 40, // Adjust for mobile status bar
  },
  screenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333333',
  },
  addButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#007AFF', // NeoBank primary color
    borderRadius: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    padding: SPACING,
  },
  headerContainer: {
    marginBottom: SPACING * 1.5,
    padding: SPACING,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  totalBalanceLabel: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 4,
  },
  totalBalanceValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#333333',
  },
  // Card Styles
  card: {
    height: CARD_HEIGHT,
    borderRadius: 12,
    padding: SPACING,
    marginBottom: SPACING,
    justifyContent: 'space-between',
    // Text color will be white for all cards for contrast
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  cardType: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  cardBody: {
    alignItems: 'flex-end',
  },
  cardBalance: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  cardDetails: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  // State Styles
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666666',
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30', // Red for error
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  noAccountsText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 8,
  },
  noAccountsSubText: {
    fontSize: 16,
    color: '#666666',
  },
});

export default AccountsScreen;
