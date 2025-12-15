import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit'; // Assuming a chart library is available
import { SafeAreaView } from 'react-native-safe-area-context';

// --- 1. TypeScript Interfaces ---

/**
 * Interface for a single cryptocurrency.
 */
interface CryptoCurrency {
  id: string;
  name: string;
  symbol: string;
  price: number;
  change24h: number; // Percentage change in the last 24 hours
  marketCap: number;
  chartData: number[]; // Simplified array of price points for a small chart
}

/**
 * Interface for a user's portfolio holding.
 */
interface PortfolioHolding extends CryptoCurrency {
  quantity: number;
  value: number;
}

/**
 * Interface for a transaction history item.
 */
interface Transaction {
  id: string;
  type: 'Buy' | 'Sell' | 'Transfer';
  symbol: string;
  amount: number;
  price: number;
  date: string;
  status: 'Completed' | 'Pending' | 'Failed';
}

/**
 * Interface for a news item.
 */
interface NewsItem {
  id: string;
  title: string;
  source: string;
  date: string;
  url: string;
}

/**
 * Interface for a price alert.
 */
interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: 'Above' | 'Below';
  isActive: boolean;
}

// --- 2. Simulated API Functions (Placeholder for NeoBank Investment Endpoints) ---

const API_DELAY = 800;

const mockPortfolio: PortfolioHolding[] = [
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    price: 65000.0,
    change24h: 2.5,
    marketCap: 1280000000000,
    quantity: 0.5,
    value: 32500.0,
    chartData: [60000, 61500, 63000, 62500, 64000, 65000],
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    price: 3500.0,
    change24h: -1.2,
    marketCap: 420000000000,
    quantity: 5.0,
    value: 17500.0,
    chartData: [3600, 3550, 3580, 3520, 3480, 3500],
  },
];

const mockTopCryptos: CryptoCurrency[] = [
  ...mockPortfolio,
  {
    id: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    price: 150.0,
    change24h: 5.1,
    marketCap: 65000000000,
    chartData: [140, 145, 148, 152, 149, 150],
  },
  {
    id: 'dogecoin',
    name: 'Dogecoin',
    symbol: 'DOGE',
    price: 0.15,
    change24h: -0.5,
    marketCap: 21000000000,
    chartData: [0.16, 0.155, 0.158, 0.152, 0.15, 0.15],
  },
];

const mockTransactions: Transaction[] = [
  {
    id: 't1',
    type: 'Buy',
    symbol: 'BTC',
    amount: 0.1,
    price: 64500.0,
    date: '2025-10-28',
    status: 'Completed',
  },
  {
    id: 't2',
    type: 'Sell',
    symbol: 'ETH',
    amount: 2.0,
    price: 3550.0,
    date: '2025-10-27',
    status: 'Completed',
  },
  {
    id: 't3',
    type: 'Transfer',
    symbol: 'SOL',
    amount: 10.0,
    price: 148.0,
    date: '2025-10-26',
    status: 'Pending',
  },
];

const mockNews: NewsItem[] = [
  {
    id: 'n1',
    title: 'Bitcoin hits new all-time high amidst institutional adoption.',
    source: 'Crypto Daily',
    date: '2025-10-29',
    url: 'https://example.com/news/1',
  },
  {
    id: 'n2',
    title: 'Ethereum upgrade promises lower gas fees.',
    source: 'Tech News',
    date: '2025-10-28',
    url: 'https://example.com/news/2',
  },
];

const mockAlerts: PriceAlert[] = [
  {
    id: 'a1',
    symbol: 'BTC',
    targetPrice: 70000,
    condition: 'Above',
    isActive: true,
  },
  {
    id: 'a2',
    symbol: 'ETH',
    targetPrice: 3000,
    condition: 'Below',
    isActive: false,
  },
];

const fetchPortfolio = (): Promise<PortfolioHolding[]> =>
  new Promise((resolve) => setTimeout(() => resolve(mockPortfolio), API_DELAY));

const fetchTopCryptos = (): Promise<CryptoCurrency[]> =>
  new Promise((resolve) => setTimeout(() => resolve(mockTopCryptos), API_DELAY));

const fetchTransactions = (): Promise<Transaction[]> =>
  new Promise((resolve) => setTimeout(() => resolve(mockTransactions), API_DELAY));

const fetchNews = (): Promise<NewsItem[]> =>
  new Promise((resolve) => setTimeout(() => resolve(mockNews), API_DELAY));

const fetchAlerts = (): Promise<PriceAlert[]> =>
  new Promise((resolve) => setTimeout(() => resolve(mockAlerts), API_DELAY));

// --- 3. Utility Functions ---

const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: amount < 1 ? 4 : 2,
  }).format(amount);
};

const formatPercentage = (percentage: number): string => {
  const sign = percentage > 0 ? '+' : '';
  return `${sign}${percentage.toFixed(2)}%`;
};

// --- 4. Component Implementation ---

const CryptocurrencyScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioHolding[]>([]);
  const [topCryptos, setTopCryptos] = useState<CryptoCurrency[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0); // Cash balance for buying

  const totalPortfolioValue = portfolio.reduce((sum, item) => sum + item.value, 0);
  const totalBalance = totalPortfolioValue + walletBalance;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        portfolioData,
        topCryptosData,
        transactionsData,
        newsData,
        alertsData,
      ] = await Promise.all([
        fetchPortfolio(),
        fetchTopCryptos(),
        fetchTransactions(),
        fetchNews(),
        fetchAlerts(),
      ]);

      setPortfolio(portfolioData);
      setTopCryptos(topCryptosData);
      setTransactions(transactionsData);
      setNews(newsData);
      setAlerts(alertsData);
      setWalletBalance(5000.0); // Simulated cash balance
    } catch (err) {
      console.error('Failed to fetch crypto data:', err);
      setError('Failed to load cryptocurrency data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Sub-Components (Renderers) ---

  const renderLoadingOrError = () => {
    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading Crypto Data...</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  };

  const PortfolioOverview = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Total Balance</Text>
      <Text style={styles.totalBalanceText}>{formatCurrency(totalBalance)}</Text>
      <Text style={styles.subText}>
        Wallet: {formatCurrency(walletBalance)} | Crypto: {formatCurrency(totalPortfolioValue)}
      </Text>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionButton} onPress={() => Alert.alert('Buy Crypto', 'Navigate to Buy screen.')}>
          <Text style={styles.actionButtonText}>Buy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => Alert.alert('Sell Crypto', 'Navigate to Sell screen.')}>
          <Text style={styles.actionButtonText}>Sell</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const PriceChart = ({ data }: { data: CryptoCurrency[] }) => {
    if (data.length === 0) return null;

    // Use BTC as the main chart for the overview
    const mainCrypto = data.find(c => c.symbol === 'BTC') || data[0];
    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 2,
      color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`, // Blue color
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: {
        borderRadius: 16,
      },
      propsForDots: {
        r: '4',
        strokeWidth: '2',
        stroke: '#007AFF',
      },
    };

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{mainCrypto.name} Price Chart (6h)</Text>
        <LineChart
          data={{
            labels: ['-5h', '-4h', '-3h', '-2h', '-1h', 'Now'],
            datasets: [{ data: mainCrypto.chartData }],
          }}
          width={styles.chartContainer.width as number}
          height={220}
          chartConfig={chartConfig}
          bezier
          style={styles.chartStyle}
        />
      </View>
    );
  };

  const CryptoListItem = ({ item }: { item: CryptoCurrency }) => (
    <TouchableOpacity style={styles.listItem} onPress={() => Alert.alert('Details', `View details for ${item.name}`)}>
      <View style={styles.listItemLeft}>
        <Text style={styles.symbolText}>{item.symbol}</Text>
        <Text style={styles.nameText}>{item.name}</Text>
      </View>
      <View style={styles.listItemCenter}>
        {/* Mini Chart Placeholder */}
        <View style={styles.miniChartPlaceholder} />
      </View>
      <View style={styles.listItemRight}>
        <Text style={styles.priceText}>{formatCurrency(item.price)}</Text>
        <Text style={[styles.changeText, { color: item.change24h >= 0 ? '#34C759' : '#FF3B30' }]}>
          {formatPercentage(item.change24h)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const TopCryptocurrencies = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Top Cryptocurrencies</Text>
      <FlatList
        data={topCryptos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CryptoListItem item={item} />}
        scrollEnabled={false}
      />
    </View>
  );

  const TransactionHistory = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Transaction History</Text>
      {transactions.map((t) => (
        <View key={t.id} style={styles.transactionItem}>
          <View>
            <Text style={styles.transactionTitle}>{t.type} {t.symbol}</Text>
            <Text style={styles.transactionDate}>{t.date} @ {formatCurrency(t.price)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.transactionAmount}>{t.amount} {t.symbol}</Text>
            <Text style={[styles.transactionStatus, { color: t.status === 'Completed' ? '#34C759' : '#FF9500' }]}>
              {t.status}
            </Text>
          </View>
        </View>
      ))}
      <TouchableOpacity style={styles.seeAllButton} onPress={() => Alert.alert('History', 'View full transaction history.')}>
        <Text style={styles.seeAllButtonText}>See All Transactions</Text>
      </TouchableOpacity>
    </View>
  );

  const CryptoNewsFeed = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Crypto News Feed</Text>
      {news.map((n) => (
        <TouchableOpacity key={n.id} style={styles.newsItem} onPress={() => Alert.alert('News', `Open news link: ${n.url}`)}>
          <Text style={styles.newsTitle}>{n.title}</Text>
          <Text style={styles.newsSource}>{n.source} - {n.date}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const PriceAlerts = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Price Alerts</Text>
      {alerts.map((a) => (
        <View key={a.id} style={styles.alertItem}>
          <View>
            <Text style={styles.alertTitle}>{a.symbol} {a.condition} {formatCurrency(a.targetPrice)}</Text>
            <Text style={styles.alertStatus}>Status: {a.isActive ? 'Active' : 'Inactive'}</Text>
          </View>
          <TouchableOpacity onPress={() => Alert.alert('Alert Action', `Toggle alert ${a.id}`)}>
            <Text style={styles.alertToggleButton}>{a.isActive ? 'Deactivate' : 'Activate'}</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.seeAllButton} onPress={() => Alert.alert('Alerts', 'Manage all price alerts.')}>
        <Text style={styles.seeAllButtonText}>Manage Alerts</Text>
      </TouchableOpacity>
    </View>
  );

  // --- Main Render ---

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.header}>Cryptocurrency Overview</Text>

        {renderLoadingOrError()}

        {!loading && !error && (
          <>
            {/* Feature 1 & 7: Crypto Portfolio Overview & Wallet Balance */}
            <PortfolioOverview />

            {/* Feature 3: Price Charts */}
            <PriceChart data={topCryptos} />

            {/* Feature 2: Top Cryptocurrencies List */}
            <TopCryptocurrencies />

            {/* Feature 4: Buy/Sell Crypto (Action buttons in PortfolioOverview) */}

            {/* Feature 8: Transaction History */}
            <TransactionHistory />

            {/* Feature 6: Price Alerts */}
            <PriceAlerts />

            {/* Feature 5: Crypto News Feed */}
            <CryptoNewsFeed />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// --- 5. Styles (Responsive/Native Components) ---

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f2f5', // Light background for the whole screen
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1c1c1e',
    marginBottom: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#636366',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  // Card Styles
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1c1c1e',
    marginBottom: 10,
  },
  totalBalanceText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  subText: {
    fontSize: 14,
    color: '#636366',
    marginBottom: 15,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#E5E5EA',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 16,
  },
  // Chart Styles
  chartContainer: {
    width: 350, // Placeholder width, adjust for actual screen size
    alignSelf: 'center',
  },
  chartStyle: {
    marginVertical: 8,
    borderRadius: 16,
  },
  // List Styles
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1c1c1e',
    marginBottom: 15,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  listItemLeft: {
    flex: 2,
  },
  listItemCenter: {
    flex: 1,
    alignItems: 'center',
  },
  listItemRight: {
    flex: 2,
    alignItems: 'flex-end',
  },
  symbolText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  nameText: {
    fontSize: 14,
    color: '#636366',
  },
  priceText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  changeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  miniChartPlaceholder: {
    width: '80%',
    height: 30,
    backgroundColor: '#E5E5EA', // Placeholder for a mini chart
    borderRadius: 4,
  },
  // Transaction Styles
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1c1c1e',
  },
  transactionDate: {
    fontSize: 12,
    color: '#636366',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1c1c1e',
  },
  transactionStatus: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  // News Styles
  newsItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  newsTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
  },
  newsSource: {
    fontSize: 12,
    color: '#636366',
    marginTop: 4,
  },
  // Alert Styles
  alertItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1c1c1e',
  },
  alertStatus: {
    fontSize: 12,
    color: '#636366',
    marginTop: 4,
  },
  alertToggleButton: {
    color: '#FF9500',
    fontWeight: 'bold',
  },
  // General Buttons
  seeAllButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  seeAllButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 16,
  }
});

export default CryptocurrencyScreen;