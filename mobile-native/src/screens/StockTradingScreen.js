// --- FILE: src/api/stockApi.ts ---

// src/api/stockApi.ts

// --- 1. Type Definitions (Interfaces) ---

export interface StockQuote {
  symbol: string;
  companyName: string;
  latestPrice: number;
  change: number;
  changePercent: number;
  marketCap: number;
  peRatio: number | null;
  volume: number;
}

export interface ChartDataPoint {
  date: string; // e.g., '2023-10-27' or '10:30 AM'
  price: number;
}

export interface PortfolioHolding {
  symbol: string;
  shares: number;
  averageCost: number;
  currentValue: number;
  totalReturn: number;
  todayReturn: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalGainLoss: number;
  todayGainLoss: number;
}

export interface WatchlistItem {
  symbol: string;
  latestPrice: number;
  changePercent: number;
}

export interface MarketNewsItem {
  id: string;
  headline: string;
  source: string;
  datetime: number; // Unix timestamp
  summary: string;
  url: string;
}

export interface Order {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  status: 'FILLED' | 'PENDING' | 'CANCELLED';
  shares: number;
  price: number;
  timestamp: number;
}

export interface TradingAnalytic {
  metric: string;
  value: string | number;
  description: string;
}

// --- 2. Mock Data ---

const mockQuotes: Record<string, StockQuote> = {
  AAPL: {
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    latestPrice: 175.45,
    change: 1.23,
    changePercent: 0.0071,
    marketCap: 2800000000000,
    peRatio: 28.5,
    volume: 55000000,
  },
  GOOGL: {
    symbol: 'GOOGL',
    companyName: 'Alphabet Inc. (Class A)',
    latestPrice: 135.10,
    change: -0.55,
    changePercent: -0.0041,
    marketCap: 1700000000000,
    peRatio: 25.1,
    volume: 22000000,
  },
  MSFT: {
    symbol: 'MSFT',
    companyName: 'Microsoft Corp.',
    latestPrice: 350.90,
    change: 3.10,
    changePercent: 0.0089,
    marketCap: 2600000000000,
    peRatio: 32.0,
    volume: 30000000,
  },
};

const mockPortfolio: PortfolioHolding[] = [
  {
    symbol: 'AAPL',
    shares: 10,
    averageCost: 160.00,
    currentValue: 1754.50,
    totalReturn: 154.50,
    todayReturn: 12.30,
  },
  {
    symbol: 'MSFT',
    shares: 5,
    averageCost: 340.00,
    currentValue: 1754.50,
    totalReturn: 54.50,
    todayReturn: 15.50,
  },
];

const mockOrders: Order[] = [
  {
    id: 'ORD-001',
    symbol: 'AAPL',
    type: 'BUY',
    status: 'FILLED',
    shares: 10,
    price: 160.00,
    timestamp: Date.now() - 86400000 * 5,
  },
  {
    id: 'ORD-002',
    symbol: 'GOOGL',
    type: 'SELL',
    status: 'CANCELLED',
    shares: 5,
    price: 140.00,
    timestamp: Date.now() - 86400000 * 2,
  },
  {
    id: 'ORD-003',
    symbol: 'MSFT',
    type: 'BUY',
    status: 'FILLED',
    shares: 5,
    price: 340.00,
    timestamp: Date.now() - 86400000 * 1,
  },
];

const mockNews: MarketNewsItem[] = [
  {
    id: 'NWS-001',
    headline: 'Tech Stocks Rally on Strong Earnings Reports',
    source: 'Financial Times',
    datetime: Date.now() - 3600000,
    summary: 'Major technology companies reported better-than-expected quarterly earnings, driving the market higher.',
    url: 'https://example.com/news/1',
  },
  {
    id: 'NWS-002',
    headline: 'Central Bank Holds Rates Steady Amid Inflation Concerns',
    source: 'Reuters',
    datetime: Date.now() - 7200000,
    summary: 'The Federal Reserve announced it would maintain the current interest rate, signaling a cautious approach to inflation.',
    url: 'https://example.com/news/2',
  },
];

const mockAnalytics: TradingAnalytic[] = [
  { metric: 'Win Rate', value: '65%', description: 'Percentage of profitable trades.' },
  { metric: 'Average Gain', value: '$150.25', description: 'Average profit per winning trade.' },
  { metric: 'Total Trades', value: 15, description: 'Total number of executed orders.' },
];

// --- 3. Mock API Service ---

const DELAY = 500; // Simulate network latency

const generateChartData = (symbol: string): ChartDataPoint[] => {
  const data: ChartDataPoint[] = [];
  const basePrice = mockQuotes[symbol]?.latestPrice || 100;
  for (let i = 0; i < 30; i++) {
    const date = new Date(Date.now() - (30 - i) * 86400000).toISOString().split('T')[0];
    const price = basePrice + (Math.random() - 0.5) * 10 * (i / 30);
    data.push({ date, price: parseFloat(price.toFixed(2)) });
  }
  return data;
};

const calculatePortfolioSummary = (holdings: PortfolioHolding[]): PortfolioSummary => {
  const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalGainLoss = holdings.reduce((sum, h) => sum + h.totalReturn, 0);
  const todayGainLoss = holdings.reduce((sum, h) => sum + h.todayReturn, 0);
  return { totalValue, totalGainLoss, todayGainLoss };
};

export const stockApi = {
  // Stock Search and Quotes
  searchStocks: (query: string): Promise<StockQuote[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const results = Object.values(mockQuotes).filter(
          (q) =>
            q.symbol.toLowerCase().includes(query.toLowerCase()) ||
            q.companyName.toLowerCase().includes(query.toLowerCase())
        );
        resolve(results);
      }, DELAY);
    });
  },

  getQuote: (symbol: string): Promise<StockQuote> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const quote = mockQuotes[symbol.toUpperCase()];
        if (quote) {
          resolve(quote);
        } else {
          reject(new Error(`Stock not found for symbol: ${symbol}`));
        }
      }, DELAY);
    });
  },

  // Real-time Price Charts
  getChartData: (symbol: string, range: '1D' | '1W' | '1M' | '1Y'): Promise<ChartDataPoint[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        // In a real app, range would affect the data returned. Here we just return 1M data.
        resolve(generateChartData(symbol));
      }, DELAY);
    });
  },

  // Buy/Sell Stocks
  placeOrder: (symbol: string, type: 'BUY' | 'SELL', shares: number): Promise<Order> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const newOrder: Order = {
          id: `ORD-${Math.floor(Math.random() * 1000)}`,
          symbol: symbol.toUpperCase(),
          type,
          status: 'FILLED',
          shares,
          price: mockQuotes[symbol.toUpperCase()]?.latestPrice || 100,
          timestamp: Date.now(),
        };
        mockOrders.unshift(newOrder); // Add to history
        resolve(newOrder);
      }, DELAY);
    });
  },

  // Portfolio Performance
  getPortfolio: (): Promise<{ summary: PortfolioSummary; holdings: PortfolioHolding[] }> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const summary = calculatePortfolioSummary(mockPortfolio);
        resolve({ summary, holdings: mockPortfolio });
      }, DELAY);
    });
  },

  // Watchlist (Mocked as a subset of quotes)
  getWatchlist: (): Promise<WatchlistItem[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const watchlistSymbols = ['AAPL', 'MSFT'];
        const watchlist = watchlistSymbols.map(s => ({
          symbol: s,
          latestPrice: mockQuotes[s].latestPrice,
          changePercent: mockQuotes[s].changePercent,
        }));
        resolve(watchlist);
      }, DELAY);
    });
  },

  // Market News
  getMarketNews: (): Promise<MarketNewsItem[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(mockNews);
      }, DELAY);
    });
  },

  // Order History
  getOrderHistory: (): Promise<Order[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(mockOrders);
      }, DELAY);
    });
  },

  // Trading Analytics
  getTradingAnalytics: (): Promise<TradingAnalytic[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(mockAnalytics);
      }, DELAY);
    });
  },
};

// --- FILE: StockTradingScreen.tsx ---

// StockTradingScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  stockApi,
  StockQuote,
  ChartDataPoint,
  PortfolioSummary,
  PortfolioHolding,
  WatchlistItem,
  MarketNewsItem,
  Order,
  TradingAnalytic,
} from './src/api/stockApi';

// --- 1. Constants and Utility Functions ---

const { width } = Dimensions.get('window');

const COLORS = {
  primary: '#007AFF', // NeoBank Blue
  secondary: '#34C759', // Green for positive change
  tertiary: '#FF3B30', // Red for negative change
  background: '#F2F2F7', // Light background
  card: '#FFFFFF',
  text: '#000000',
  textSecondary: '#8E8E93',
  border: '#E5E5EA',
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatPercent = (decimal: number): string => {
  return `${(decimal * 100).toFixed(2)}%`;
};

// Mock Icon Component (Replace with a real icon library like react-native-vector-icons)
const Icon = ({ name, style }: { name: string; style?: any }) => (
  <Text style={[{ fontSize: 18, color: COLORS.text }, style]}>{name}</Text>
);

// --- 2. Component Props and State Types ---

interface StockTradingScreenProps {
  // Navigation props or other external props can be defined here
}

interface TradingState {
  isLoading: boolean;
  error: string | null;
  selectedSymbol: string;
  quote: StockQuote | null;
  chartData: ChartDataPoint[];
  portfolioSummary: PortfolioSummary | null;
  portfolioHoldings: PortfolioHolding[];
  watchlist: WatchlistItem[];
  marketNews: MarketNewsItem[];
  orderHistory: Order[];
  tradingAnalytics: TradingAnalytic[];
}

// --- 3. Sub-Components (Simplified for structure) ---

// Placeholder for a real Chart component
const StockChart = ({ data }: { data: ChartDataPoint[] }) => {
  const latestPrice = data.length > 0 ? data[data.length - 1].price : 0;
  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartPrice}>{formatCurrency(latestPrice)}</Text>
      <Text style={styles.chartPlaceholder}>[Real-time Price Chart Placeholder]</Text>
      <View style={styles.chartLine} />
    </View>
  );
};

// Component for displaying a single stock quote
const QuoteDisplay = ({ quote }: { quote: StockQuote }) => {
  const isPositive = quote.changePercent >= 0;
  const changeColor = isPositive ? COLORS.secondary : COLORS.tertiary;

  return (
    <View style={styles.quoteCard}>
      <Text style={styles.quoteSymbol}>{quote.symbol}</Text>
      <Text style={styles.quoteCompany}>{quote.companyName}</Text>
      <View style={styles.quoteRow}>
        <Text style={styles.quotePrice}>{formatCurrency(quote.latestPrice)}</Text>
        <Text style={[styles.quoteChange, { color: changeColor }]}>
          {isPositive ? '▲' : '▼'} {formatCurrency(quote.change)} ({formatPercent(quote.changePercent)})
        </Text>
      </View>
    </View>
  );
};

// Component for the Buy/Sell form
const TradingForm = ({ symbol }: { symbol: string }) => {
  const [shares, setShares] = useState('1');
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePlaceOrder = useCallback(async () => {
    const numShares = parseInt(shares, 10);
    if (isNaN(numShares) || numShares <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid number of shares.');
      return;
    }

    setIsSubmitting(true);
    try {
      const order = await stockApi.placeOrder(symbol, type, numShares);
      Alert.alert('Order Placed', `${type} ${order.shares} shares of ${order.symbol} at ${formatCurrency(order.price)}`);
      // In a real app, you would refresh portfolio/history data here
    } catch (e: any) {
      Alert.alert('Order Failed', e.message || 'Could not place order.');
    } finally {
      setIsSubmitting(false);
    }
  }, [symbol, shares, type]);

  return (
    <View style={styles.tradingForm}>
      <Text style={styles.sectionTitle}>Trade {symbol}</Text>
      <View style={styles.inputGroup}>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="Shares"
          value={shares}
          onChangeText={setShares}
        />
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.tradeButton, type === 'BUY' && styles.buyButtonActive]}
            onPress={() => setType('BUY')}
          >
            <Text style={[styles.tradeButtonText, type === 'BUY' && styles.activeButtonText]}>BUY</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tradeButton, type === 'SELL' && styles.sellButtonActive]}
            onPress={() => setType('SELL')}
          >
            <Text style={[styles.tradeButtonText, type === 'SELL' && styles.activeButtonText]}>SELL</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.submitButton, type === 'BUY' ? styles.buyButton : styles.sellButton]}
        onPress={handlePlaceOrder}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color={COLORS.card} />
        ) : (
          <Text style={styles.submitButtonText}>{type} {symbol}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

// --- 4. Main Component ---

const StockTradingScreen: React.FC<StockTradingScreenProps> = () => {
  const [state, setState] = useState<TradingState>({
    isLoading: true,
    error: null,
    selectedSymbol: 'AAPL', // Default stock
    quote: null,
    chartData: [],
    portfolioSummary: null,
    portfolioHoldings: [],
    watchlist: [],
    marketNews: [],
    orderHistory: [],
    tradingAnalytics: [],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockQuote[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Data Fetching Logic
  const fetchData = useCallback(async (symbol: string) => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const [quote, chartData, portfolio, watchlist, news, history, analytics] = await Promise.all([
        stockApi.getQuote(symbol),
        stockApi.getChartData(symbol, '1M'),
        stockApi.getPortfolio(),
        stockApi.getWatchlist(),
        stockApi.getMarketNews(),
        stockApi.getOrderHistory(),
        stockApi.getTradingAnalytics(),
      ]);

      setState(s => ({
        ...s,
        isLoading: false,
        selectedSymbol: symbol,
        quote,
        chartData,
        portfolioSummary: portfolio.summary,
        portfolioHoldings: portfolio.holdings,
        watchlist,
        marketNews: news,
        orderHistory: history,
        tradingAnalytics: analytics,
      }));
    } catch (e: any) {
      setState(s => ({ ...s, isLoading: false, error: e.message || 'Failed to fetch data' }));
    }
  }, []);

  useEffect(() => {
    fetchData(state.selectedSymbol);
  }, [fetchData, state.selectedSymbol]);

  // Stock Search Logic
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const delaySearch = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await stockApi.searchStocks(searchQuery);
        setSearchResults(results);
      } catch (e) {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delaySearch);
  }, [searchQuery]);

  const handleSelectStock = (symbol: string) => {
    setSearchQuery('');
    setSearchResults([]);
    setState(s => ({ ...s, selectedSymbol: symbol }));
  };

  // --- 5. Render Functions for Sections ---

  const renderPortfolio = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Portfolio Performance</Text>
      {state.portfolioSummary ? (
        <View style={styles.portfolioSummary}>
          <Text style={styles.portfolioValue}>{formatCurrency(state.portfolioSummary.totalValue)}</Text>
          <Text style={[styles.portfolioChange, { color: state.portfolioSummary.todayGainLoss >= 0 ? COLORS.secondary : COLORS.tertiary }]}>
            Today: {formatCurrency(state.portfolioSummary.todayGainLoss)}
          </Text>
        </View>
      ) : <ActivityIndicator color={COLORS.primary} />}
      <FlatList
        data={state.portfolioHoldings}
        keyExtractor={(item) => item.symbol}
        renderItem={({ item }) => (
          <View style={styles.holdingItem}>
            <Text style={styles.holdingSymbol}>{item.symbol}</Text>
            <Text style={styles.holdingShares}>{item.shares} shares</Text>
            <Text style={styles.holdingValue}>{formatCurrency(item.currentValue)}</Text>
          </View>
        )}
      />
    </View>
  );

  const renderWatchlist = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Watchlist</Text>
      <FlatList
        horizontal
        data={state.watchlist}
        keyExtractor={(item) => item.symbol}
        renderItem={({ item }) => {
          const isPositive = item.changePercent >= 0;
          const changeColor = isPositive ? COLORS.secondary : COLORS.tertiary;
          return (
            <TouchableOpacity style={styles.watchlistItem} onPress={() => handleSelectStock(item.symbol)}>
              <Text style={styles.watchlistSymbol}>{item.symbol}</Text>
              <Text style={styles.watchlistPrice}>{formatCurrency(item.latestPrice)}</Text>
              <Text style={[styles.watchlistChange, { color: changeColor }]}>
                {formatPercent(item.changePercent)}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  const renderMarketNews = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Market News</Text>
      {state.marketNews.slice(0, 3).map((item) => (
        <View key={item.id} style={styles.newsItem}>
          <Text style={styles.newsHeadline}>{item.headline}</Text>
          <Text style={styles.newsSource}>{item.source} - {new Date(item.datetime).toLocaleDateString()}</Text>
        </View>
      ))}
    </View>
  );

  const renderOrderHistory = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Order History</Text>
      {state.orderHistory.slice(0, 3).map((order) => (
        <View key={order.id} style={styles.orderItem}>
          <Text style={styles.orderType}>{order.type}</Text>
          <Text style={styles.orderSymbol}>{order.shares}x {order.symbol}</Text>
          <Text style={styles.orderStatus}>{order.status}</Text>
        </View>
      ))}
    </View>
  );

  const renderTradingAnalytics = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Trading Analytics</Text>
      <View style={styles.analyticsGrid}>
        {state.tradingAnalytics.map((analytic) => (
          <View key={analytic.metric} style={styles.analyticCard}>
            <Text style={styles.analyticValue}>{analytic.value}</Text>
            <Text style={styles.analyticMetric}>{analytic.metric}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  // --- 6. Main Render ---

  if (state.isLoading && !state.quote) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Trading Data...</Text>
      </SafeAreaView>
    );
  }

  if (state.error && !state.quote) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.errorText}>Error: {state.error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchData(state.selectedSymbol)}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Stock Search and Quotes */}
        <View style={styles.searchContainer}>
          <Icon name="🔍" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search stocks (e.g., AAPL, GOOGL)"
            placeholderTextColor={COLORS.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {isSearching && <ActivityIndicator color={COLORS.primary} style={styles.searchActivity} />}
        </View>

        {/* Search Results Overlay */}
        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.map((item) => (
              <TouchableOpacity
                key={item.symbol}
                style={styles.searchResultItem}
                onPress={() => handleSelectStock(item.symbol)}
              >
                <Text style={styles.searchResultSymbol}>{item.symbol}</Text>
                <Text style={styles.searchResultName}>{item.companyName}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Selected Stock Details */}
        {state.quote && (
          <>
            <QuoteDisplay quote={state.quote} />
            <StockChart data={state.chartData} />
            <TradingForm symbol={state.selectedSymbol} />
          </>
        )}

        {/* Other Features */}
        {renderPortfolio()}
        {renderWatchlist()}
        {renderMarketNews()}
        {renderOrderHistory()}
        {renderTradingAnalytics()}

        <View style={{ height: 50 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// --- 7. Stylesheet ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 15,
    paddingTop: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.textSecondary,
  },
  errorText: {
    color: COLORS.tertiary,
    fontSize: 16,
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    padding: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.card,
    fontWeight: '600',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 15,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: {
    marginRight: 8,
    color: COLORS.textSecondary,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  searchActivity: {
    marginLeft: 10,
  },
  searchResults: {
    position: 'absolute',
    top: 54, // Below search bar
    left: 15,
    right: 15,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    maxHeight: 200,
  },
  searchResultItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  searchResultSymbol: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchResultName: {
    color: COLORS.textSecondary,
  },

  // Quote Display
  quoteCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quoteSymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  quoteCompany: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  quotePrice: {
    fontSize: 32,
    fontWeight: '300',
    color: COLORS.text,
  },
  quoteChange: {
    fontSize: 18,
    fontWeight: '600',
  },

  // Chart
  chartContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    position: 'absolute',
    top: 15,
    left: 15,
    zIndex: 1,
  },
  chartPlaceholder: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  chartLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: COLORS.border,
  },

  // Trading Form
  tradingForm: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputGroup: {
    flexDirection: 'row',
    marginBottom: 15,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginRight: 10,
    color: COLORS.text,
  },
  buttonGroup: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tradeButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: COLORS.background,
  },
  buyButtonActive: {
    backgroundColor: COLORS.secondary,
  },
  sellButtonActive: {
    backgroundColor: COLORS.tertiary,
  },
  tradeButtonText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  activeButtonText: {
    color: COLORS.card,
  },
  submitButton: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buyButton: {
    backgroundColor: COLORS.secondary,
  },
  sellButton: {
    backgroundColor: COLORS.tertiary,
  },
  submitButtonText: {
    color: COLORS.card,
    fontWeight: 'bold',
    fontSize: 16,
  },

  // General Section
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },

  // Portfolio
  portfolioSummary: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  portfolioValue: {
    fontSize: 36,
    fontWeight: '300',
    color: COLORS.text,
  },
  portfolioChange: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 5,
  },
  holdingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  holdingSymbol: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  holdingShares: {
    color: COLORS.textSecondary,
  },
  holdingValue: {
    fontWeight: '600',
    color: COLORS.text,
  },

  // Watchlist
  watchlistItem: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 10,
    marginRight: 10,
    width: width / 3 - 20, // Approx 3 items per row
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  watchlistSymbol: {
    fontWeight: 'bold',
    fontSize: 16,
    color: COLORS.text,
  },
  watchlistPrice: {
    fontSize: 14,
    color: COLORS.text,
    marginTop: 5,
  },
  watchlistChange: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },

  // Market News
  newsItem: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  newsHeadline: {
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  newsSource: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // Trading Analytics
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  analyticCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    width: '48%', // Two items per row
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  analyticValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  analyticMetric: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 5,
  },

  // Order History
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  orderType: {
    fontWeight: 'bold',
    color: COLORS.primary,
    width: 50,
  },
  orderSymbol: {
    flex: 1,
    color: COLORS.text,
  },
  orderStatus: {
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});

export default StockTradingScreen;