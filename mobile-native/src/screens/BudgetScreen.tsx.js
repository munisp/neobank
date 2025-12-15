import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';

// --- Types and Interfaces ---

// Define the structure for a single budget category
interface BudgetCategory {
  id: string;
  name: string;
  limit: number;
  spent: number;
  icon: string; // Placeholder for an icon name or component
}

// Define the structure for the overall budget data
interface BudgetData {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  categories: BudgetCategory[];
}

// Define the structure for the screen's state
interface BudgetState {
  data: BudgetData | null;
  loading: boolean;
  error: string | null;
}

// Define the navigation parameters (assuming a stack navigator)
type RootStackParamList = {
  Budget: undefined;
  AddBudget: undefined;
  BudgetDetail: { budgetId: string };
};

type BudgetScreenNavigationProp = NavigationProp<RootStackParamList, 'Budget'>;

// --- Mock API Service (Replace with actual ApiService) ---

/**
 * Mock ApiService to simulate fetching budget data.
 * In a real application, this would be a separate module (e.g., ApiService.ts)
 * with actual network calls (fetch, axios, etc.).
 */
const ApiService = {
  fetchBudgetData: async (): Promise<BudgetData> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulate a successful response
    const mockData: BudgetData = {
      totalBudget: 3500.0,
      totalSpent: 2150.5,
      remaining: 1349.5,
      categories: [
        { id: '1', name: 'Groceries', limit: 500, spent: 450, icon: '🛒' },
        { id: '2', name: 'Entertainment', limit: 300, spent: 310, icon: '🎬' },
        { id: '3', name: 'Transport', limit: 200, spent: 150, icon: '🚌' },
        { id: '4', name: 'Housing', limit: 1500, spent: 1200, icon: '🏠' },
        { id: '5', name: 'Savings', limit: 1000, spent: 50, icon: '💰' },
      ],
    };

    // Simulate an error 10% of the time for testing
    // if (Math.random() < 0.1) {
    //   throw new Error('Failed to fetch budget data due to server error.');
    // }

    return mockData;
  },
};

// --- Helper Component: BudgetProgressItem ---

interface BudgetProgressItemProps {
  category: BudgetCategory;
  onPress: (budgetId: string) => void;
}

/**
 * Renders a single budget category item with a progress bar.
 */
const BudgetProgressItem: React.FC<BudgetProgressItemProps> = ({ category, onPress }) => {
  const progress = category.spent / category.limit;
  const progressPercentage = Math.min(100, Math.round(progress * 100));
  
  // Determine color based on progress (e.g., red if over budget)
  const progressBarColor = progress > 1 ? '#e74c3c' : '#2ecc71';
  const progressTextColor = progress > 1 ? styles.overspentText : styles.spentText;

  return (
    <TouchableOpacity
      style={styles.categoryItem}
      onPress={() => onPress(category.id)}
      activeOpacity={0.7}
    >
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryIcon}>{category.icon}</Text>
        <Text style={styles.categoryName}>{category.name}</Text>
        <Text style={styles.categoryLimit}>Limit: ${category.limit.toFixed(2)}</Text>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${progressPercentage}%`, backgroundColor: progressBarColor }]} />
      </View>

      <View style={styles.categoryFooter}>
        <Text style={progressTextColor}>Spent: ${category.spent.toFixed(2)}</Text>
        <Text style={styles.progressPercentageText}>{progressPercentage}%</Text>
      </View>
    </TouchableOpacity>
  );
};

// --- Main Screen Component ---

/**
 * The main Budget screen component.
 * Fetches budget data, displays a summary, and lists budget categories.
 */
const BudgetScreen: React.FC = () => {
  const navigation = useNavigation<BudgetScreenNavigationProp>();
  const [state, setState] = useState<BudgetState>({
    data: null,
    loading: true,
    error: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Fetches budget data from the API and updates the component state.
   */
  const loadBudgetData = useCallback(async () => {
    setState(prevState => ({ ...prevState, loading: true, error: null }));
    try {
      const data = await ApiService.fetchBudgetData();
      setState({ data, loading: false, error: null });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setState({ data: null, loading: false, error: errorMessage });
      Alert.alert('Error', 'Failed to load budget data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial data load on component mount
  useEffect(() => {
    loadBudgetData();
  }, [loadBudgetData]);

  // Handle pull-to-refresh
  const onRefresh = () => {
    setRefreshing(true);
    loadBudgetData();
  };

  // Navigation handlers
  const handleAddBudget = () => {
    // Navigate to a screen for adding/editing a budget
    navigation.navigate('AddBudget');
  };

  const handleCategoryPress = (budgetId: string) => {
    // Navigate to a detail screen for a specific budget category
    navigation.navigate('BudgetDetail', { budgetId });
  };

  // --- Render Logic ---

  if (state.loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Loading your budget...</Text>
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {state.error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadBudgetData}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!state.data) {
    // Should be covered by error state, but good for safety
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No budget data available.</Text>
      </View>
    );
  }

  const { totalBudget, totalSpent, remaining, categories } = state.data;
  const remainingColor = remaining < 0 ? styles.negativeRemaining : styles.positiveRemaining;

  return (
    <View style={styles.container}>
      {/* Header and Add Button */}
      <View style={styles.header}>
        <Text style={styles.title}>Monthly Budget</Text>
        <TouchableOpacity style={styles.addButton} onPress={handleAddBudget}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Budget Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Overall Status</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Budget:</Text>
            <Text style={styles.summaryValue}>${totalBudget.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Spent:</Text>
            <Text style={styles.summaryValue}>${totalSpent.toFixed(2)}</Text>
          </View>
          <View style={styles.summarySeparator} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Remaining:</Text>
            <Text style={[styles.summaryValue, remainingColor]}>
              ${Math.abs(remaining).toFixed(2)} {remaining < 0 ? 'Over' : 'Left'}
            </Text>
          </View>
        </View>

        {/* Budget Categories List */}
        <Text style={styles.sectionTitle}>Budget Categories</Text>
        {categories.length > 0 ? (
          categories.map(category => (
            <BudgetProgressItem
              key={category.id}
              category={category}
              onPress={handleCategoryPress}
            />
          ))
        ) : (
          <Text style={styles.noDataText}>No budget categories set up yet.</Text>
        )}
      </ScrollView>
    </View>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7f9', // Light background for the screen
  },
  scrollView: {
    paddingHorizontal: 15,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f4f7f9',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  errorText: {
    fontSize: 18,
    color: '#e74c3c',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#3498db',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  addButton: {
    backgroundColor: '#2ecc71',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    marginVertical: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#34495e',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#7f8c8d',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  summarySeparator: {
    height: 1,
    backgroundColor: '#ecf0f1',
    marginVertical: 5,
  },
  positiveRemaining: {
    color: '#2ecc71',
  },
  negativeRemaining: {
    color: '#e74c3c',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginTop: 10,
    marginBottom: 10,
  },
  categoryItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  categoryName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#34495e',
  },
  categoryLimit: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#ecf0f1',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  categoryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  spentText: {
    fontSize: 14,
    color: '#3498db',
  },
  overspentText: {
    fontSize: 14,
    color: '#e74c3c',
    fontWeight: 'bold',
  },
  progressPercentageText: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  noDataText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#7f8c8d',
  }
});

export default BudgetScreen;