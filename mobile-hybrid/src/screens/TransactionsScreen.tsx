import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // Assuming Expo/Vector Icons are available

// --- MOCK SERVICE AND TYPES ---

// 1. TypeScript Types
interface Transaction {
  id: string;
  date: string; // ISO Date string
  description: string;
  amount: number;
  currency: string;
  category: 'Food' | 'Transport' | 'Income' | 'Utilities' | 'Other';
  type: 'debit' | 'credit';
}

interface TransactionFilter {
  search: string;
  startDate: string | null;
  endDate: string | null;
  category: string | null;
}

// 2. Mock Services (Simulating src/services/ApiService)
// In a real app, this would be an actual API call using ApiService.
// Error handling would involve NotificationService.showError()
const mockTransactions: Transaction[] = [
  { id: 't1', date: '2025-10-30', description: 'Groceries at Whole Foods', amount: 55.30, currency: 'USD', category: 'Food', type: 'debit' },
  { id: 't2', date: '2025-10-29', description: 'Monthly Salary', amount: 4500.00, currency: 'USD', category: 'Income', type: 'credit' },
  { id: 't3', date: '2025-10-28', description: 'Uber Ride to Airport', amount: 35.50, currency: 'USD', category: 'Transport', type: 'debit' },
  { id: 't4', date: '2025-10-27', description: 'Electricity Bill', amount: 120.00, currency: 'USD', category: 'Utilities', type: 'debit' },
  { id: 't5', date: '2025-10-26', description: 'Dinner with friends', amount: 88.75, currency: 'USD', category: 'Food', type: 'debit' },
  { id: 't6', date: '2025-10-25', description: 'Freelance Payment', amount: 800.00, currency: 'USD', category: 'Income', type: 'credit' },
  { id: 't7', date: '2025-10-24', description: 'Bus fare', amount: 2.50, currency: 'USD', category: 'Transport', type: 'debit' },
  { id: 't8', date: '2025-10-23', description: 'New Monitor', amount: 350.00, currency: 'USD', category: 'Other', type: 'debit' },
];

const fetchTransactions = (filter: TransactionFilter): Promise<Transaction[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const filtered = mockTransactions.filter(t => {
        // Search filter
        const matchesSearch = t.description.toLowerCase().includes(filter.search.toLowerCase());

        // Category filter
        const matchesCategory = filter.category ? t.category === filter.category : true;

        // Date range filter (simplified)
        // In a real app, date comparison would be more robust
        const matchesDate = true; // Skipping complex date logic for this mock

        return matchesSearch && matchesCategory && matchesDate;
      });
      resolve(filtered);
    }, 1000); // Simulate network delay
  });
};

// 3. Mock Navigation Prop (Simulating React Navigation)
type NavigationProp = {
  navigate: (screen: string, params?: any) => void;
};

interface TransactionsScreenProps {
  navigation: NavigationProp;
}

// --- REUSABLE COMPONENTS ---

// Transaction Item Component
const TransactionItem: React.FC<{ transaction: Transaction; onPress: () => void }> = React.memo(({ transaction, onPress }) => {
  const isDebit = transaction.type === 'debit';
  const amountColor = isDebit ? styles.debitText : styles.creditText;
  const sign = isDebit ? '-' : '+';

  return (
    <TouchableOpacity style={styles.itemContainer} onPress={onPress}>
      <View style={styles.iconContainer}>
        <Ionicons name={isDebit ? "arrow-up-circle" : "arrow-down-circle"} size={24} color={isDebit ? "#e74c3c" : "#2ecc71"} />
      </View>
      <View style={styles.detailsContainer}>
        <Text style={styles.descriptionText} numberOfLines={1}>{transaction.description}</Text>
        <Text style={styles.categoryText}>{transaction.category} • {transaction.date}</Text>
      </View>
      <View style={styles.amountContainer}>
        <Text style={[styles.amountText, amountColor]}>
          {sign}{transaction.currency} {transaction.amount.toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// Filter/Search Bar Component
interface FilterBarProps {
  filter: TransactionFilter;
  onSearchChange: (text: string) => void;
  onFilterPress: () => void;
}

const FilterBar: React.FC<FilterBarProps> = ({ filter, onSearchChange, onFilterPress }) => (
  <View style={styles.filterBarContainer}>
    <View style={styles.searchContainer}>
      <Ionicons name="search" size={20} color="#7f8c8d" style={styles.searchIcon} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search transactions..."
        value={filter.search}
        onChangeText={onSearchChange}
        placeholderTextColor="#7f8c8d"
      />
    </View>
    <TouchableOpacity style={styles.filterButton} onPress={onFilterPress}>
      <Ionicons name="options-outline" size={24} color="#3498db" />
    </TouchableOpacity>
  </View>
);

// --- MAIN SCREEN COMPONENT ---

const TransactionsScreen: React.FC<TransactionsScreenProps> = ({ navigation }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TransactionFilter>({
    search: '',
    startDate: null,
    endDate: null,
    category: null,
  });
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false); // For future filter modal

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulate fetching data using the mock service
      const data = await fetchTransactions(filter);
      setTransactions(data);
    } catch (e) {
      console.error('Failed to fetch transactions:', e);
      setError('Failed to load transactions. Please try again.');
      // In a real app, NotificationService.showError('...') would be used
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    // Debounce search input in a real app, but for this example, fetch immediately on filter change
    loadTransactions();
  }, [loadTransactions]);

  const handleSearchChange = (text: string) => {
    setFilter(prev => ({ ...prev, search: text }));
  };

  const handleTransactionPress = (transaction: Transaction) => {
    // Navigate to a hypothetical TransactionDetailsScreen
    navigation.navigate('TransactionDetails', { transactionId: transaction.id });
  };

  const renderItem = ({ item }: { item: Transaction }) => (
    <TransactionItem transaction={item} onPress={() => handleTransactionPress(item)} />
  );

  const keyExtractor = (item: Transaction) => item.id;

  const renderListContent = useMemo(() => {
    if (loading && transactions.length === 0) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3498db" />
          <Text style={styles.loadingText}>Loading transactions...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color="#e74c3c" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadTransactions}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (transactions.length === 0) {
      return (
        <View style={styles.centered}>
          <Ionicons name="cash-outline" size={40} color="#bdc3c7" />
          <Text style={styles.emptyText}>No transactions found.</Text>
          <Text style={styles.emptySubText}>Try adjusting your filters or search term.</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={transactions}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        // Add pull-to-refresh functionality
        onRefresh={loadTransactions}
        refreshing={loading}
      />
    );
  }, [loading, error, transactions, loadTransactions]);

  // Placeholder for a full filter modal (Date Range, Category selection)
  const FilterModal = () => {
    // In a real app, this would contain date pickers and category selectors
    const categories = ['Food', 'Transport', 'Income', 'Utilities', 'Other'];
    return (
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Filter Transactions</Text>
          <View style={styles.categoryPills}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.pill,
                  filter.category === cat && styles.pillActive
                ]}
                onPress={() => setFilter(prev => ({ ...prev, category: prev.category === cat ? null : cat }))}
              >
                <Text style={[styles.pillText, filter.category === cat && styles.pillTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Date Range Pickers would go here */}
          <TouchableOpacity style={styles.closeButton} onPress={() => setIsFilterModalVisible(false)}>
            <Text style={styles.closeButtonText}>Apply Filters</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Transactions</Text>
      <FilterBar
        filter={filter}
        onSearchChange={handleSearchChange}
        onFilterPress={() => setIsFilterModalVisible(true)}
      />
      <View style={styles.listWrapper}>
        {renderListContent}
      </View>
      {isFilterModalVisible && <FilterModal />}
    </View>
  );
};

// --- STYLES ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7f9',
    paddingTop: Platform.OS === 'web' ? 20 : 0, // Responsive padding for web
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  listWrapper: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  // Filter Bar Styles
  filterBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginRight: 10,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      },
      default: {
        elevation: 2,
      },
    }),
  },
  searchIcon: {
    marginRight: 5,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: '#2c3e50',
    // Remove default web outline
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      },
    }),
  },
  filterButton: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#ecf0f1',
  },
  // Item Styles
  itemContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'transform 0.1s ease-in-out',
        ':hover': {
          transform: 'scale(1.01)',
        },
        boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
      },
      default: {
        elevation: 3,
      },
    }),
  },
  iconContainer: {
    marginRight: 15,
  },
  detailsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  descriptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  categoryText: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2,
  },
  amountContainer: {
    marginLeft: 10,
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  debitText: {
    color: '#e74c3c',
  },
  creditText: {
    color: '#2ecc71',
  },
  // State Styles (Loading/Error/Empty)
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#7f8c8d',
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
    color: '#bdc3c7',
  },
  emptySubText: {
    fontSize: 14,
    color: '#bdc3c7',
    marginTop: 5,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#3498db',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  // Modal Styles (for Filter)
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 10, // Ensure modal is on top
  },
  modalContent: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 500 : '100%', // Responsive width
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    ...Platform.select({
      web: {
        maxHeight: '80vh',
      },
    }),
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#2c3e50',
  },
  categoryPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    backgroundColor: '#ecf0f1',
    marginRight: 10,
    marginBottom: 10,
  },
  pillActive: {
    backgroundColor: '#3498db',
  },
  pillText: {
    color: '#2c3e50',
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#ffffff',
  },
  closeButton: {
    backgroundColor: '#2ecc71',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});

export default TransactionsScreen;