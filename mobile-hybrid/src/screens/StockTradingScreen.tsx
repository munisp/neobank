import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert, TextInput, FlatList } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

// --- MOCK SERVICE IMPORTS ---
// In a real application, these would be imported from 'src/services'
// For this task, we define mock structures to satisfy the requirement.

interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

interface ChartDataPoint {
  date: string;
  price: number;
}

interface Order {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
  timestamp: string;
}

interface WatchlistItem {
  symbol: string;
  price: number;
  changePercent: number;
}

// Mock ApiService for data fetching
const ApiService = {
  fetchStockDetails: (symbol: string): Promise<Stock> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          symbol,
          name: `${symbol} Corp.`,
          price: parseFloat((Math.random() * 1000).toFixed(2)),
          change: parseFloat((Math.random() * 10 - 5).toFixed(2)),
          changePercent: parseFloat((Math.random() * 5 - 2.5).toFixed(2)),
        });
      }, 500);
    });
  },
  fetchChartData: (symbol: string, range: string): Promise<ChartDataPoint[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const data: ChartDataPoint[] = Array.from({ length: 30 }, (_, i) => ({
          date: `Day ${i + 1}`,
          price: 100 + Math.sin(i / 5) * 20 + Math.random() * 10,
        }));
        resolve(data);
      }, 500);
    });
  },
  fetchWatchlist: (): Promise<WatchlistItem[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          { symbol: 'AAPL', price: 150.25, changePercent: 1.25 },
          { symbol: 'GOOGL', price: 2800.50, changePercent: -0.55 },
          { symbol: 'TSLA', price: 850.75, changePercent: 3.10 },
        ]);
      }, 500);
    });
  },
  fetchOrderHistory: (): Promise<Order[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          { id: '1', symbol: 'AAPL', type: 'BUY', quantity: 10, price: 149.00, status: 'FILLED', timestamp: '2025-10-01' },
          { id: '2', symbol: 'GOOGL', type: 'SELL', quantity: 5, price: 2805.00, status: 'FILLED', timestamp: '2025-10-05' },
          { id: '3', symbol: 'TSLA', type: 'BUY', quantity: 2, price: 840.00, status: 'PENDING', timestamp: '2025-10-10' },
        ]);
      }, 500);
    });
  },
  placeOrder: (order: Omit<Order, 'id' | 'status' | 'timestamp'>): Promise<Order> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.1) { // 90% success rate
          resolve({
            ...order,
            id: Date.now().toString(),
            status: 'PENDING',
            timestamp: new Date().toISOString().split('T')[0],
          });
        } else {
          reject(new Error('Order placement failed due to market volatility.'));
        }
      }, 1000);
    });
  }
};

// Mock NotificationService for alerts
const NotificationService = {
  showSuccess: (message: string) => Alert.alert('Success', message),
  showError: (message: string) => Alert.alert('Error', message),
};

// Mock StorageService and AuthService are not directly used for data, but are included for completeness
const StorageService = {
  getItem: (key: string) => Promise.resolve(null),
  setItem: (key: string, value: string) => Promise.resolve(),
};

const AuthService = {
  isAuthenticated: () => true,
};

// --- COMPONENT START ---

// Get screen width for responsive chart
const screenWidth = Dimensions.get('window').width;

// Chart configuration for React Native Chart Kit
const chartConfig = {
  backgroundColor: '#ffffff',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  decimalPlaces: 2,
  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  style: {
    borderRadius: 16,
  },
  propsForDots: {
    r: '0', // Hide dots
    strokeWidth: '2',
    stroke: '#ffa726',
  },
};

// Default stock symbol
const DEFAULT_SYMBOL = 'AAPL';

// --- StockTradingScreen Component Definition ---

const StockTradingScreen: React.FC = () => {
  const [currentSymbol, setCurrentSymbol] = useState<string>(DEFAULT_SYMBOL);
  const [stock, setStock] = useState<Stock | null>(null);
  const [chartPoints, setChartPoints] = useState<ChartDataPoint[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // State for the trading interface
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState<string>('1');

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Helper function to format percentage
  const formatPercentage = (amount: number) => {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}${amount.toFixed(2)}%`;
  };

  // Function to fetch all data
  const fetchData = useCallback(async (symbol: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const [stockData, chartData, watchlistData, orderHistoryData] = await Promise.all([
        ApiService.fetchStockDetails(symbol),
        ApiService.fetchChartData(symbol, '1D'),
        ApiService.fetchWatchlist(),
        ApiService.fetchOrderHistory(),
      ]);

      setStock(stockData);
      setChartPoints(chartData);
      setWatchlist(watchlistData);
      setOrderHistory(orderHistoryData);
    } catch (err) {
      setError('Failed to fetch trading data.');
      NotificationService.showError('Failed to load data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(currentSymbol);
  }, [currentSymbol, fetchData]);

  // Function to handle stock search/selection
  const handleSymbolChange = (symbol: string) => {
    if (symbol && symbol !== currentSymbol) {
      setCurrentSymbol(symbol.toUpperCase());
    }
  };

  // Function to handle order placement
  const handlePlaceOrder = async () => {
    if (!stock) return;

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      NotificationService.showError('Please enter a valid quantity.');
      return;
    }

    try {
      const newOrder = await ApiService.placeOrder({
        symbol: stock.symbol,
        type: tradeType,
        quantity: qty,
        price: stock.price,
      });
      NotificationService.showSuccess(`${tradeType} order for ${qty} shares of ${stock.symbol} placed successfully!`);
      // Refresh order history to show the new pending order
      const updatedHistory = await ApiService.fetchOrderHistory();
      setOrderHistory(updatedHistory);
      setQuantity('1'); // Reset quantity
    } catch (err) {
      NotificationService.showError(err instanceof Error ? err.message : 'An unknown error occurred during order placement.');
    }
  };

  // Render functions for sub-components
  const renderStockSearch = () => {
    return (
      <View style={styles.card}>
        <Text style={styles.header}>Stock Search</Text>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Enter Stock Symbol (e.g., GOOGL)"
            placeholderTextColor="#999"
            onSubmitEditing={(e) => handleSymbolChange(e.nativeEvent.text)}
            returnKeyType="search"
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => handleSymbolChange(currentSymbol)}
          >
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>
        {stock && (
          <View style={styles.stockHeader}>
            <Text style={styles.stockSymbol}>{stock.symbol}</Text>
            <Text style={styles.stockName}>{stock.name}</Text>
            <Text style={[styles.stockPrice, { color: stock.change >= 0 ? '#4CAF50' : '#F44336' }]}>
              {formatCurrency(stock.price)}
            </Text>
            <Text style={[styles.stockChange, { color: stock.change >= 0 ? '#4CAF50' : '#F44336' }]}>
              {formatPercentage(stock.changePercent)} ({formatCurrency(stock.change)})
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderStockChart = () => {
    if (!chartPoints.length) return null;

    const data = {
      labels: chartPoints.map((p, i) => (i % 5 === 0 ? p.date.replace('Day ', '') : '')), // Show fewer labels
      datasets: [
        {
          data: chartPoints.map((p) => p.price),
          color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`, // Blue line
          strokeWidth: 2,
        },
      ],
    };

    return (
      <View style={styles.card}>
        <Text style={styles.header}>Price Chart ({currentSymbol})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <LineChart
            data={data}
            width={Math.max(screenWidth - 30, 600)} // Ensure chart is wide enough for detail
            height={220}
            chartConfig={{
              ...chartConfig,
              color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
              backgroundGradientFrom: '#f8f8f8',
              backgroundGradientTo: '#ffffff',
            }}
            bezier
            style={styles.chartStyle}
          />
        </ScrollView>
      </View>
    );
  };

  const renderBuySellInterface = () => {
    if (!stock) return null;

    const totalCost = (parseFloat(quantity) || 0) * stock.price;

    return (
      <View style={styles.card}>
        <Text style={styles.header}>Trade {stock.symbol}</Text>
        <View style={styles.tradeTypeContainer}>
          <TouchableOpacity
            style={[styles.tradeButton, tradeType === 'BUY' && styles.buyButtonActive]}
            onPress={() => setTradeType('BUY')}
          >
            <Text style={[styles.tradeButtonText, tradeType === 'BUY' && styles.tradeButtonTextActive]}>BUY</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tradeButton, tradeType === 'SELL' && styles.sellButtonActive]}
            onPress={() => setTradeType('SELL')}
          >
            <Text style={[styles.tradeButtonText, tradeType === 'SELL' && styles.tradeButtonTextActive]}>SELL</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tradeInputRow}>
          <Text style={styles.tradeLabel}>Quantity:</Text>
          <TextInput
            style={styles.tradeInput}
            keyboardType="numeric"
            value={quantity}
            onChangeText={setQuantity}
            placeholder="0"
          />
        </View>

        <View style={styles.tradeInfoRow}>
          <Text style={styles.tradeLabel}>Current Price:</Text>
          <Text style={styles.tradeValue}>{formatCurrency(stock.price)}</Text>
        </View>

        <View style={styles.tradeInfoRow}>
          <Text style={styles.tradeLabel}>Estimated Total:</Text>
          <Text style={styles.tradeValue}>{formatCurrency(totalCost)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.placeOrderButton, tradeType === 'BUY' ? styles.buyColor : styles.sellColor]}
          onPress={handlePlaceOrder}
          disabled={!quantity || parseFloat(quantity) <= 0}
        >
          <Text style={styles.placeOrderButtonText}>Place {tradeType} Order</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderWatchlist = () => {
    const renderWatchlistItem = ({ item }: { item: WatchlistItem }) => (
      <TouchableOpacity style={styles.watchlistItem} onPress={() => handleSymbolChange(item.symbol)}>
        <View>
          <Text style={styles.watchlistSymbol}>{item.symbol}</Text>
          <Text style={styles.watchlistPrice}>{formatCurrency(item.price)}</Text>
        </View>
        <Text style={[styles.watchlistChange, { color: item.changePercent >= 0 ? '#4CAF50' : '#F44336' }]}>
          {formatPercentage(item.changePercent)}
        </Text>
      </TouchableOpacity>
    );

    return (
      <View style={styles.card}>
        <Text style={styles.header}>Watchlist</Text>
        <FlatList
          data={watchlist}
          keyExtractor={(item) => item.symbol}
          renderItem={renderWatchlistItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          scrollEnabled={false} // Since it's inside a ScrollView
        />
      </View>
    );
  };

  const renderOrderHistory = () => {
    const renderOrderItem = ({ item }: { item: Order }) => (
      <View style={styles.orderItem}>
        <View style={styles.orderItemRow}>
          <Text style={[styles.orderType, item.type === 'BUY' ? styles.buyColor : styles.sellColor]}>
            {item.type}
          </Text>
          <Text style={styles.orderSymbol}>{item.symbol} ({item.quantity} shares)</Text>
          <Text style={styles.orderPrice}>{formatCurrency(item.price)}</Text>
        </View>
        <View style={styles.orderItemRow}>
          <Text style={styles.orderTimestamp}>{item.timestamp}</Text>
          <Text style={[styles.orderStatus, item.status === 'FILLED' ? styles.filledStatus : item.status === 'PENDING' ? styles.pendingStatus : styles.cancelledStatus]}>
            {item.status}
          </Text>
        </View>
      </View>
    );

    return (
      <View style={styles.card}>
        <Text style={styles.header}>Order History</Text>
        <FlatList
          data={orderHistory}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          scrollEnabled={false}
        />
      </View>
    );
  };

  if (isLoading && !stock) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading trading data...</Text>
      </View>
    );
  }

  if (error && !stock) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchData(currentSymbol)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderStockSearch()}
        {renderStockChart()}
        {renderBuySellInterface()}
        {renderWatchlist()}
        {renderOrderHistory()}
      </ScrollView>
    </View>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5', // Light background for the whole screen
  },
  scrollContent: {
    padding: 15,
    maxWidth: 1000, // Max width for web compatibility
    alignSelf: 'center',
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#D32F2F',
    textAlign: 'center',
    marginBottom: 15,
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
  // Placeholder styles for sub-components (will be detailed in Phase 5)
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  // Stock Search Styles
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginRight: 10,
    backgroundColor: '#f9f9f9',
  },
  searchButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  stockHeader: {
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  stockSymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  stockName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  stockPrice: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  stockChange: {
    fontSize: 18,
    fontWeight: '600',
  },

  // Chart Styles
  chartStyle: {
    marginVertical: 8,
    borderRadius: 8,
  },

  // Trade Interface Styles
  tradeTypeContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    borderRadius: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  tradeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  tradeButtonText: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  buyButtonActive: {
    backgroundColor: '#4CAF50',
  },
  sellButtonActive: {
    backgroundColor: '#F44336',
  },
  tradeButtonTextActive: {
    color: '#fff',
  },
  tradeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  tradeLabel: {
    fontSize: 16,
    color: '#333',
    width: 120,
  },
  tradeInput: {
    flex: 1,
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    backgroundColor: '#f9f9f9',
  },
  tradeInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tradeValue: {
    fontWeight: 'bold',
    color: '#333',
  },
  placeOrderButton: {
    marginTop: 15,
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  placeOrderButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buyColor: {
    backgroundColor: '#4CAF50',
  },
  sellColor: {
    backgroundColor: '#F44336',
  },

  // Watchlist Styles
  watchlistItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  watchlistSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  watchlistPrice: {
    fontSize: 14,
    color: '#666',
  },
  watchlistChange: {
    fontSize: 16,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
  },

  // Order History Styles
  orderItem: {
    paddingVertical: 10,
  },
  orderItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  orderType: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    color: '#fff',
  },
  orderSymbol: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 10,
  },
  orderPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  orderTimestamp: {
    fontSize: 12,
    color: '#999',
  },
  orderStatus: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  filledStatus: {
    color: '#4CAF50',
  },
  pendingStatus: {
    color: '#FFC107',
  },
  cancelledStatus: {
    color: '#9E9E9E',
  },
});

export default StockTradingScreen;