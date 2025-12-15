import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { PieChart, LineChart } from 'react-native-chart-kit';
// Assuming services are available, though not implemented here
// import { ApiService } from '../services/ApiService'; 

// --- TypeScript Interfaces ---

interface InvestmentSummary {
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
}

interface AssetAllocationItem {
  name: string;
  population: number; // Value in the portfolio
  color: string;
  legendFontColor: string;
  legendFontSize: number;
}

interface InvestmentProduct {
  id: string;
  name: string;
  symbol: string;
  value: number;
  gainLoss: number;
  gainLossPercent: number;
}

interface PerformanceData {
  labels: string[];
  datasets: {
    data: number[];
    color: (opacity: number) => string;
    strokeWidth: number;
  }[];
}

interface InvestmentsData {
  summary: InvestmentSummary;
  allocation: AssetAllocationItem[];
  products: InvestmentProduct[];
  performance: PerformanceData;
}

// --- Mock Data ---

const MOCK_DATA: InvestmentsData = {
  summary: {
    totalValue: 45230.55,
    dailyChange: 125.80,
    dailyChangePercent: 0.28,
  },
  allocation: [
    { name: 'Stocks', population: 25000, color: '#4CAF50', legendFontColor: '#7F7F7F', legendFontSize: 15 },
    { name: 'Bonds', population: 10000, color: '#2196F3', legendFontColor: '#7F7F7F', legendFontSize: 15 },
    { name: 'Real Estate', population: 5000, color: '#FF9800', legendFontColor: '#7F7F7F', legendFontSize: 15 },
    { name: 'Cash', population: 5230.55, color: '#9E9E9E', legendFontColor: '#7F7F7F', legendFontSize: 15 },
  ],
  products: [
    { id: '1', name: 'Global Tech Fund', symbol: 'GTF', value: 15000, gainLoss: 350, gainLossPercent: 2.39 },
    { id: '2', name: 'US Treasury Bond ETF', symbol: 'USTB', value: 10000, gainLoss: -50, gainLossPercent: -0.5 },
    { id: '3', name: 'S&P 500 Index', symbol: 'SPX', value: 10000, gainLoss: 100, gainLossPercent: 1.01 },
    { id: '4', name: 'Emerging Markets', symbol: 'EMG', value: 5000, gainLoss: -10, gainLossPercent: -0.2 },
  ],
  performance: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        data: [20000, 21000, 25000, 23000, 24500, 25500],
        color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`, // Green
        strokeWidth: 2,
      },
    ],
  },
};

// --- Constants ---

const screenWidth = Dimensions.get('window').width;
const chartConfig = {
  backgroundColor: '#ffffff',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  decimalPlaces: 0, // optional, defaults to 2dp
  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  style: {
    borderRadius: 16,
  },
  propsForDots: {
    r: '6',
    strokeWidth: '2',
    stroke: '#4CAF50',
  },
};

// --- Components ---

const PortfolioSummary: React.FC<{ summary: InvestmentSummary }> = ({ summary }) => {
  const isPositive = summary.dailyChange >= 0;
  const changeColor = isPositive ? styles.positiveText : styles.negativeText;
  const changeSign = isPositive ? '+' : '';

  return (
    <View style={styles.summaryContainer}>
      <Text style={styles.summaryTitle}>Total Portfolio Value</Text>
      <Text style={styles.summaryValue}>${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
      <View style={styles.changeRow}>
        <Text style={[styles.changeText, changeColor]}>
          {changeSign}${Math.abs(summary.dailyChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Text style={[styles.changeText, changeColor]}>
          ({changeSign}{Math.abs(summary.dailyChangePercent).toFixed(2)}%) Today
        </Text>
      </View>
    </View>
  );
};

const AssetAllocationChart: React.FC<{ data: AssetAllocationItem[] }> = ({ data }) => {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Asset Allocation</Text>
      <PieChart
        data={data}
        width={screenWidth - 40} // Full width minus padding
        height={220}
        chartConfig={chartConfig}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft="15"
        center={[10, 0]}
        absolute
      />
    </View>
  );
};

const InvestmentProductRow: React.FC<{ product: InvestmentProduct }> = ({ product }) => {
  const isPositive = product.gainLoss >= 0;
  const changeColor = isPositive ? styles.positiveText : styles.negativeText;
  const changeSign = isPositive ? '+' : '';

  return (
    <TouchableOpacity style={styles.productRow}>
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productSymbol}>{product.symbol}</Text>
      </View>
      <View style={styles.productValue}>
        <Text style={styles.productValueText}>${product.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        <Text style={[styles.productChangeText, changeColor]}>
          {changeSign}{Math.abs(product.gainLossPercent).toFixed(2)}%
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const PerformanceChart: React.FC<{ data: PerformanceData }> = ({ data }) => {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>6-Month Performance</Text>
      <LineChart
        data={data}
        width={screenWidth - 40}
        height={220}
        chartConfig={{
          ...chartConfig,
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`, // Line color
          labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
        }}
        bezier
        style={{
          marginVertical: 8,
          borderRadius: 16,
        }}
      />
    </View>
  );
};

// --- Main Screen Component ---

const InvestmentsScreen: React.FC = () => {
  const [data, setData] = useState<InvestmentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simulate data fetching
  const fetchInvestmentsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // In a real app, this would be an API call:
      // const response = await ApiService.get('/investments');
      // setData(response.data);
      
      // Using mock data for implementation
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
      setData(MOCK_DATA);
    } catch (e) {
      console.error('Failed to fetch investment data:', e);
      setError('Could not load investment data. Please try again.');
      Alert.alert('Error', 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvestmentsData();
  }, [fetchInvestmentsData]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading portfolio data...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{error || 'No data available.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchInvestmentsData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      
      {/* Portfolio Overview */}
      <PortfolioSummary summary={data.summary} />

      {/* Asset Allocation Chart */}
      <AssetAllocationChart data={data.allocation} />

      {/* Performance Chart */}
      <PerformanceChart data={data.performance} />

      {/* Investment Products List */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My Products</Text>
        {data.products.map((product) => (
          <InvestmentProductRow key={product.id} product={product} />
        ))}
      </View>

      <View style={{ height: 50 }} /> {/* Spacer for bottom */}
    </ScrollView>
  );
};

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 20,
  },
  center: {
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
    marginBottom: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Summary Styles
  summaryContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 16,
    color: '#757575',
    marginBottom: 5,
  },
  summaryValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeText: {
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 5,
  },
  positiveText: {
    color: '#4CAF50', // Green
  },
  negativeText: {
    color: '#F44336', // Red
  },

  // Card Styles (for charts and lists)
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    padding: 10,
    paddingBottom: 15,
  },

  // Product List Styles
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  productSymbol: {
    fontSize: 14,
    color: '#757575',
    marginTop: 2,
  },
  productValue: {
    alignItems: 'flex-end',
  },
  productValueText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  productChangeText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
});

export default InvestmentsScreen;