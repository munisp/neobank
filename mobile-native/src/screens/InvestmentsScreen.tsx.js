// InvestmentsScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  InvestmentsData,
  Investment,
  InvestmentsScreenProps,
  fetchInvestments,
  formatCurrency,
  formatPercentage,
} from './InvestmentsTypesAndApi'; // Assuming the types and API are in a local file

// Define the initial state for the data
const initialData: InvestmentsData = {
  summary: {
    totalValue: 0,
    totalGainLoss: 0,
    totalGainLossPercentage: 0,
    assetCount: 0,
  },
  investments: [],
};

// --- 1. Main Component ---

const InvestmentsScreen: React.FC<InvestmentsScreenProps> = () => {
  const navigation = useNavigation();
  const [data, setData] = useState<InvestmentsData>(initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches investment data from the mock API service.
   * @param isPullToRefresh - Flag to indicate if the call is from pull-to-refresh.
   */
  const loadInvestments = useCallback(async (isPullToRefresh = false) => {
    if (!isPullToRefresh) {
      setIsLoading(true);
      setError(null);
    } else {
      setIsRefreshing(true);
    }

    try {
      // For demonstration, we can randomly trigger an error
      const shouldFail = Math.random() < 0.1; // 10% chance of failure
      const result = await fetchInvestments(shouldFail);
      setData(result);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      // Optionally show an alert on error
      if (!isPullToRefresh) {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Load data on component mount
  useEffect(() => {
    loadInvestments();
  }, [loadInvestments]);

  // --- 2. Helper Components for UI ---

  /**
   * Renders the portfolio summary section.
   */
  const SummaryCard: React.FC = () => {
    const { totalValue, totalGainLoss, totalGainLossPercentage } = data.summary;
    const isPositive = totalGainLoss >= 0;
    const gainLossStyle = isPositive ? styles.positiveText : styles.negativeText;

    return (
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Total Portfolio Value</Text>
        <Text style={styles.totalValueText}>{formatCurrency(totalValue)}</Text>
        <View style={styles.gainLossContainer}>
          <Text style={[styles.gainLossText, gainLossStyle]}>
            {isPositive ? '+' : ''}
            {formatCurrency(totalGainLoss)} ({formatPercentage(totalGainLossPercentage)})
          </Text>
        </View>
        <Text style={styles.lastUpdatedText}>Last updated: {new Date().toLocaleTimeString()}</Text>
      </View>
    );
  };

  /**
   * Renders a single investment item in the list.
   */
  const InvestmentItem: React.FC<{ item: Investment }> = ({ item }) => {
    const isPositive = item.gainLoss >= 0;
    const gainLossStyle = isPositive ? styles.positiveText : styles.negativeText;

    const handlePress = () => {
      // Navigate to a detail screen (mocked)
      navigation.navigate('InvestmentDetail', { investmentId: item.id });
    };

    return (
      <TouchableOpacity style={styles.investmentItem} onPress={handlePress}>
        <View style={styles.itemLeft}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemSymbol}>{item.symbol}</Text>
        </View>
        <View style={styles.itemRight}>
          <Text style={styles.itemValue}>{formatCurrency(item.currentValue)}</Text>
          <Text style={[styles.itemGainLoss, gainLossStyle]}>
            {isPositive ? '+' : ''}
            {formatPercentage(item.gainLossPercentage)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // --- 3. Render Logic (Loading, Error, Data) ---

  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Investments...</Text>
      </View>
    );
  }

  if (error && data.investments.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Failed to load data.</Text>
        <Text style={styles.errorDetails}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadInvestments()}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- 4. Main Screen Render ---

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadInvestments(true)} />
        }
      >
        <SummaryCard />

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>My Assets ({data.summary.assetCount})</Text>
        </View>

        {data.investments.length > 0 ? (
          data.investments.map((item) => (
            <InvestmentItem key={item.id} item={item} />
          ))
        ) : (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No investments found.</Text>
            <Text style={styles.noDataSubText}>Start by adding a new asset to your portfolio.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// --- 5. Styling ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5', // Light background for the whole screen
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 15,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D32F2F', // Red for error
    marginBottom: 5,
  },
  errorDetails: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
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

  // Summary Card Styles
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  totalValueText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  gainLossContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  gainLossText: {
    fontSize: 18,
    fontWeight: '600',
  },
  positiveText: {
    color: '#4CAF50', // Green
  },
  negativeText: {
    color: '#F44336', // Red
  },
  lastUpdatedText: {
    fontSize: 12,
    color: '#999',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingTop: 10,
    marginTop: 10,
  },

  // Investment List Styles
  listHeader: {
    marginBottom: 10,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  investmentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  itemLeft: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  itemSymbol: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  itemGainLoss: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  noDataContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginTop: 10,
  },
  noDataText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 5,
  },
  noDataSubText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  }
});

export default InvestmentsScreen;