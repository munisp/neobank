import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

// --- Type Definitions ---

/**
 * Defines the structure for a single transaction item.
 */
interface Transaction {
  id: string;
  date: string; // ISO date string
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
}

/**
 * Defines the props for the TransactionsScreen component.
 * Assuming it's a screen in a stack navigator.
 */
interface TransactionsScreenProps {}

// --- Mock API Service ---

/**
 * Mock service to simulate fetching transactions from an API.
 * In a real application, this would be an actual service call (e.g., ApiService.getTransactions).
 */
const mockApiService = {
  fetchTransactions: (page: number, pageSize: number): Promise<Transaction[]> => {
    return new Promise((resolve, reject) => {
      // Simulate network delay
      setTimeout(() => {
        if (Math.random() < 0.1 && page === 1) {
          // 10% chance of initial load failure
          reject(new Error('Failed to connect to the transaction service.'));
          return;
        }

        const startIndex = (page - 1) * pageSize;
        const transactions: Transaction[] = [];

        if (startIndex >= 30) {
          // Simulate end of data after 30 items
          resolve([]);
          return;
        }

        for (let i = 0; i < pageSize; i++) {
          const id = String(startIndex + i + 1);
          if (parseInt(id) > 30) break; // Stop at 30 items

          const isDebit = Math.random() > 0.5;
          const amount = parseFloat((Math.random() * 500 + 10).toFixed(2));
          const type = isDebit ? 'debit' : 'credit';
          const categories = ['Groceries', 'Salary', 'Rent', 'Utilities', 'Entertainment'];
          const category = categories[Math.floor(Math.random() * categories.length)];
          const date = new Date(Date.now() - (startIndex + i) * 86400000).toISOString().split('T')[0];

          transactions.push({
            id,
            date,
            description: `Transaction #${id} - ${category}`,
            amount: isDebit ? -amount : amount,
            type,
            category,
          });
        }
        resolve(transactions);
      }, 1500); // 1.5 second delay
    });
  },
};

// --- Component: TransactionItem ---

interface TransactionItemProps {
  item: Transaction;
  onPress: (item: Transaction) => void;
}

const TransactionItem: React.FC<TransactionItemProps> = React.memo(({ item, onPress }) => {
  const isDebit = item.amount < 0;
  const amountColor = isDebit ? styles.debitText : styles.creditText;

  return (
    <TouchableOpacity style={styles.itemContainer} onPress={() => onPress(item)}>
      <View style={styles.itemDetails}>
        <Text style={styles.descriptionText} numberOfLines={1}>
          {item.description}
        </Text>
        <Text style={styles.dateText}>{item.date}</Text>
      </View>
      <Text style={[styles.amountText, amountColor]}>
        {isDebit ? '-' : '+'} ${Math.abs(item.amount).toFixed(2)}
      </Text>
    </TouchableOpacity>
  );
});

// --- Main Component: TransactionsScreen ---

const TransactionsScreen: React.FC<TransactionsScreenProps> = () => {
  const navigation = useNavigation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Function to fetch data from the mock API service
  const fetchTransactions = useCallback(async (pageNumber: number, isInitialLoad: boolean = false) => {
    if (!hasMore && pageNumber > 1) return;

    if (isInitialLoad) {
      setIsLoading(true);
      setError(null);
    } else if (pageNumber === 1) {
      setIsRefreshing(true);
    }

    try {
      const newTransactions = await mockApiService.fetchTransactions(pageNumber, 10);

      if (pageNumber === 1) {
        // Initial load or refresh
        setTransactions(newTransactions);
      } else {
        // Pagination: append new data
        setTransactions(prev => [...prev, ...newTransactions]);
      }

      setPage(pageNumber + 1);
      setHasMore(newTransactions.length > 0);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [hasMore]);

  // Initial data load effect
  useEffect(() => {
    fetchTransactions(1, true);
  }, [fetchTransactions]);

  // Handle pull-to-refresh
  const handleRefresh = () => {
    setPage(1);
    setHasMore(true);
    fetchTransactions(1);
  };

  // Handle infinite scroll (load more)
  const handleLoadMore = () => {
    if (!isLoading && !isRefreshing && hasMore) {
      fetchTransactions(page);
    }
  };

  // Handle navigation to a detail screen (PWA feature parity)
  const handleItemPress = (item: Transaction) => {
    // In a real app, this would navigate to a TransactionDetailScreen
    // navigation.navigate('TransactionDetail', { transactionId: item.id });
    Alert.alert('Transaction Details', `ID: ${item.id}\nDescription: ${item.description}\nAmount: $${item.amount.toFixed(2)}`);
  };

  // --- Render Helpers ---

  const renderItem = ({ item }: { item: Transaction }) => (
    <TransactionItem item={item} onPress={handleItemPress} />
  );

  const renderFooter = () => {
    if (!isLoading && !isRefreshing) return null;
    if (isLoading && transactions.length === 0) return null; // Initial loading is handled by renderLoading

    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#007AFF" />
        <Text style={styles.footerText}>Loading more transactions...</Text>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No transactions found.</Text>
      <Text style={styles.emptySubText}>Pull down to refresh or check your filters.</Text>
    </View>
  );

  // --- Main Render Logic ---

  if (isLoading && transactions.length === 0) {
    // Show full-screen loading indicator only on initial load
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading transactions...</Text>
      </View>
    );
  }

  if (error && transactions.length === 0) {
    // Show full-screen error message if initial load failed
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header/Filter Bar Placeholder (PWA feature parity) */}
      <View style={styles.filterBar}>
        <Text style={styles.filterText}>Filter: All Time | All Categories</Text>
        <TouchableOpacity onPress={() => Alert.alert('Filter', 'Filter/Sort functionality goes here.')}>
          <Text style={styles.filterButtonText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={transactions.length === 0 ? styles.listEmpty : undefined}
        ListEmptyComponent={!isLoading && !isRefreshing && renderEmptyState}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#007AFF" />
        }
      />
    </View>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
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
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
  },
  filterButtonText: {
    fontSize: 20,
    color: '#007AFF',
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemDetails: {
    flex: 1,
    marginRight: 10,
  },
  descriptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  dateText: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  amountText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  debitText: {
    color: '#d9534f', // Red for debits/expenses
  },
  creditText: {
    color: '#5cb85c', // Green for credits/income
  },
  footer: {
    paddingVertical: 20,
    borderTopWidth: 1,
    borderColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  footerText: {
    marginLeft: 10,
    color: '#666',
  },
  listEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 50,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
  },
});

export default TransactionsScreen;