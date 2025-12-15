import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, ActivityIndicator, Alert, TouchableOpacity, FlatList } from 'react-native';
import { LineChart, PieChart } from 'react-native-chart-kit';
// Mocking the service imports as requested
// In a real app, these would be implemented in src/services
// import { ApiService } from '../services/ApiService'; 

// --- 1. TYPES AND INTERFACES ---

interface SpendingCategory {
  name: string;
  amount: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
}

interface SpendingTrend {
  month: string;
  amount: number;
}

interface TopMerchant {
  id: string;
  name: string;
  totalSpent: number;
  category: string;
}

interface SavingsOpportunity {
  id: string;
  description: string;
  potentialSavings: number;
}

interface SpendingInsights {
  totalSpent: number;
  categories: SpendingCategory[];
  trends: SpendingTrend[];
  topMerchants: TopMerchant[];
  savingsOpportunities: SavingsOpportunity[];
}

// --- 2. MOCK DATA AND SERVICE ---

const MOCK_INSIGHTS: SpendingInsights = {
  totalSpent: 1540.50,
  categories: [
    { name: 'Groceries', amount: 450, color: '#FF6384', legendFontColor: '#7F7F7F', legendFontSize: 15 },
    { name: 'Dining Out', amount: 300, color: '#36A2EB', legendFontColor: '#7F7F7F', legendFontSize: 15 },
    { name: 'Transport', amount: 250, color: '#FFCE56', legendFontColor: '#7F7F7F', legendFontSize: 15 },
    { name: 'Entertainment', amount: 150, color: '#4BC0C0', legendFontColor: '#7F7F7F', legendFontSize: 15 },
    { name: 'Other', amount: 390.50, color: '#9966FF', legendFontColor: '#7F7F7F', legendFontSize: 15 },
  ],
  trends: [
    { month: 'Jan', amount: 1200 },
    { month: 'Feb', amount: 1500 },
    { month: 'Mar', amount: 1350 },
    { month: 'Apr', amount: 1600 },
    { month: 'May', amount: 1540.50 },
  ],
  topMerchants: [
    { id: 'm1', name: 'Whole Foods', totalSpent: 280.50, category: 'Groceries' },
    { id: 'm2', name: 'Uber', totalSpent: 150.00, category: 'Transport' },
    { id: 'm3', name: 'Netflix', totalSpent: 19.99, category: 'Entertainment' },
    { id: 'm4', name: 'Starbucks', totalSpent: 85.00, category: 'Dining Out' },
  ],
  savingsOpportunities: [
    { id: 's1', description: 'Switch to a cheaper phone plan', potentialSavings: 30.00 },
    { id: 's2', description: 'Cancel unused gym membership', potentialSavings: 59.99 },
    { id: 's3', description: 'Cook at home 2 more times a week', potentialSavings: 120.00 },
  ],
};

// Mock function to simulate API call
const fetchSpendingInsights = (): Promise<SpendingInsights> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulate a random error 10% of the time
      if (Math.random() < 0.1) {
        resolve(null as any); // Simulate failure
      } else {
        resolve(MOCK_INSIGHTS);
      }
    }, 1500); // Simulate network delay
  });
};

// --- 3. CONSTANTS AND STYLES ---

const screenWidth = Dimensions.get('window').width;

const chartConfig = {
  backgroundColor: '#fff',
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  decimalPlaces: 0, // optional, defaults to 2dp
  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  style: {
    borderRadius: 16,
  },
  propsForDots: {
    r: '6',
    strokeWidth: '2',
    stroke: '#007AFF',
  },
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f4f7f9',
  },
  header: {
    padding: 20,
    backgroundColor: '#007AFF', // NeoBank primary color
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#fff',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    margin: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 50,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
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
  // Specific styles for sections will be added in later phases
  merchantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  merchantName: {
    fontSize: 16,
    fontWeight: '500',
  },
  merchantSpent: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  opportunityItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  opportunityDescription: {
    fontSize: 16,
    marginBottom: 5,
  },
  opportunitySavings: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28a745', // Green for savings
  },
  noDataText: {
    textAlign: 'center',
    color: '#777',
    padding: 10,
  },
});

// --- 4. MAIN COMPONENT STRUCTURE ---

const SpendingInsightsScreen: React.FC = () => {
  const [insights, setInsights] = useState<SpendingInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSpendingInsights();
      if (data) {
        setInsights(data);
      } else {
        setError('Failed to load spending insights. Please try again.');
      }
    } catch (e) {
      setError('An unexpected error occurred.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  // Render Loading State
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10 }}>Loading your financial insights...</Text>
      </View>
    );
  }

  // Render Error State
  if (error || !insights) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{error || 'No insights available.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadInsights}>
          <Text style={styles.retryButtonText}>Retry Load</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main Content (to be filled in Phase 2, 3, 4)
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Spending Insights</Text>
        <Text style={styles.headerSubtitle}>Total Spent: ${insights.totalSpent.toFixed(2)}</Text>
      </View>

      {/* Category Breakdown (Pie Chart) - Phase 3 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spending by Category</Text>
        {insights.categories.length > 0 ? (
          <PieChart
            data={insights.categories}
            width={screenWidth - 40} // Card width - padding
            height={220}
            chartConfig={chartConfig}
            accessor="amount"
            backgroundColor="transparent"
            paddingLeft="15"
            center={[10, 0]}
            absolute
          />
        ) : (
          <Text style={styles.noDataText}>No category data available.</Text>
        )}
      </View>

      {/* Spending Trends (Line Chart) - Phase 3 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Monthly Spending Trend</Text>
        {insights.trends.length > 0 ? (
          <LineChart
            data={{
              labels: insights.trends.map(t => t.month),
              datasets: [
                {
                  data: insights.trends.map(t => t.amount),
                  color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`, // Blue line
                },
              ],
            }}
            width={screenWidth - 40}
            height={220}
            chartConfig={chartConfig}
            bezier
            style={{
              marginVertical: 8,
              borderRadius: 16,
            }}
          />
        ) : (
          <Text style={styles.noDataText}>No trend data available.</Text>
        )}
      </View>

      {/* Top Merchants - Phase 4 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Top Merchants</Text>
        {insights.topMerchants.length > 0 ? (
          <FlatList
            data={insights.topMerchants}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.merchantItem}>
                <Text style={styles.merchantName}>{item.name}</Text>
                <Text style={styles.merchantSpent}>${item.totalSpent.toFixed(2)}</Text>
              </View>
            )}
            scrollEnabled={false} // Disable FlatList scrolling inside ScrollView
          />
        ) : (
          <Text style={styles.noDataText}>No top merchants found for this period.</Text>
        )}
      </View>

      {/* Savings Opportunities - Phase 4 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Savings Opportunities</Text>
        {insights.savingsOpportunities.length > 0 ? (
          <FlatList
            data={insights.savingsOpportunities}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.opportunityItem}>
                <Text style={styles.opportunityDescription}>{item.description}</Text>
                <Text style={styles.opportunitySavings}>Potential Savings: ${item.potentialSavings.toFixed(2)}</Text>
              </View>
            )}
            scrollEnabled={false}
          />
        ) : (
          <Text style={styles.noDataText}>No savings opportunities identified.</Text>
        )}
      </View>
    </ScrollView>
  );
};

export default SpendingInsightsScreen;