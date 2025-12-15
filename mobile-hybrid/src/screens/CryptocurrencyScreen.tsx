import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit'; // Mocked for structure

// --- 1. TYPE DEFINITIONS ---

/**
 * Represents a single cryptocurrency asset in the user's portfolio.
 */
interface CryptoAsset {
  id: string;
  name: string;
  symbol: string;
  balance: number;
  usdValue: number;
  change24h: number; // Percentage change
}

/**
 * Represents a top-ranking cryptocurrency.
 */
interface TopCrypto {
  id: string;
  name: string;
  symbol: string;
  price: number;
  marketCap: number;
  change24h: number; // Percentage change
}

/**
 * Represents a news article related to cryptocurrency.
 */
interface NewsItem {
  id: string;
  title: string;
  source: string;
  date: string;
}

/**
 * Represents the overall state of the cryptocurrency screen data.
 */
interface CryptoData {
  portfolio: CryptoAsset[];
  topCryptos: TopCrypto[];
  chartData: {
    labels: string[];
    datasets: {
      data: number[];
    }[];
  };
  newsFeed: NewsItem[];
}

// --- 2. MOCK SERVICES (Replacing src/services) ---

// Mocking the data fetching from an API service
const mockFetchCryptoData = (): Promise<CryptoData> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const mockData: CryptoData = {
        portfolio: [
          { id: 'btc', name: 'Bitcoin', symbol: 'BTC', balance: 0.5, usdValue: 35000, change24h: 2.5 },
          { id: 'eth', name: 'Ethereum', symbol: 'ETH', balance: 5.0, usdValue: 15000, change24h: -1.2 },
        ],
        topCryptos: [
          { id: 'btc', name: 'Bitcoin', symbol: 'BTC', price: 70000, marketCap: 1.3e12, change24h: 2.5 },
          { id: 'eth', name: 'Ethereum', symbol: 'ETH', price: 3000, marketCap: 360e9, change24h: -1.2 },
          { id: 'bnb', name: 'Binance Coin', symbol: 'BNB', price: 600, marketCap: 90e9, change24h: 5.1 },
          { id: 'sol', name: 'Solana', symbol: 'SOL', price: 150, marketCap: 65e9, change24h: -0.5 },
        ],
        chartData: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              data: [
                Math.random() * 100,
                Math.random() * 100,
                Math.random() * 100,
                Math.random() * 100,
                Math.random() * 100,
                Math.random() * 100,
              ],
            },
          ],
        },
        newsFeed: [
          { id: 'n1', title: 'Bitcoin hits new all-time high after ETF approval.', source: 'CryptoNews', date: '2 hours ago' },
          { id: 'n2', title: 'Ethereum scaling solution launches mainnet.', source: 'CoinDesk', date: '1 day ago' },
          { id: 'n3', title: 'Regulatory clarity expected in Q4.', source: 'Bloomberg', date: '3 days ago' },
        ],
      };
      resolve(mockData);
    }, 1500); // Simulate network delay
  });
};

// --- 3. CONSTANTS AND STYLES ---

const { width } = Dimensions.get('window');
const CHART_WIDTH = width * 0.9;

const COLORS = {
  primary: '#007AFF', // Blue for actions
  background: '#F0F2F5', // Light gray background
  card: '#FFFFFF', // White card background
  text: '#1C1C1E', // Dark text
  secondaryText: '#8E8E93', // Gray secondary text
  positive: '#34C759', // Green for positive change
  positive: '#34C759', // Green for positive change
  negative: '#FF3B30', // Red for negative change
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 20,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
  },
  // --- Portfolio Styles ---
  portfolioCard: {
    backgroundColor: COLORS.primary,
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  portfolioTotal: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.card,
  },
  portfolioChange: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.card,
    marginTop: 5,
  },
  // --- Chart Styles ---
  chartContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  // --- Actions Styles ---
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 20,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  buyButton: {
    backgroundColor: COLORS.positive,
  },
  sellButton: {
    backgroundColor: COLORS.negative,
  },
  actionText: {
    color: COLORS.card,
    fontWeight: '600',
    fontSize: 16,
  },
  // --- List Item Styles (Top Cryptos) ---
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  cryptoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cryptoSymbol: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginRight: 10,
  },
  cryptoName: {
    fontSize: 14,
    color: COLORS.secondaryText,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  priceText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  positiveChange: {
    color: COLORS.positive,
  },
  negativeChange: {
    color: COLORS.negative,
  },
  // --- News Feed Styles ---
  newsItem: {
    padding: 20,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  newsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 5,
  },
  newsSource: {
    fontSize: 12,
    color: COLORS.secondaryText,
  },
  // --- State Styles ---
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 50,
  },
  errorText: {
    color: COLORS.negative,
    textAlign: 'center',
    padding: 20,
  },
});

// --- 4. HELPER COMPONENTS ---

const PortfolioSummary: React.FC<{ portfolio: CryptoAsset[] }> = ({ portfolio }) => {
  const totalValue = portfolio.reduce((sum, asset) => sum + asset.usdValue, 0);
  const totalChange = portfolio.reduce((sum, asset) => sum + asset.change24h * asset.usdValue, 0) / totalValue;
  const isPositive = totalChange >= 0;

  return (
    <View style={styles.portfolioCard}>
      <Text style={styles.portfolioChange}>Total Portfolio Value</Text>
      <Text style={styles.portfolioTotal}>${totalValue.toFixed(2)}</Text>
      <Text style={[styles.portfolioChange, { color: COLORS.card }]}>
        {isPositive ? '+' : ''}{totalChange.toFixed(2)}% (24h)
      </Text>
    </View>
  );
};

const CryptoListItem: React.FC<{ item: TopCrypto }> = ({ item }) => {
  const isPositive = item.change24h >= 0;
  const changeStyle = isPositive ? styles.positiveChange : styles.negativeChange;

  return (
    <TouchableOpacity style={styles.listItem} onPress={() => console.log(`View ${item.name}`)}>
      <View style={styles.cryptoInfo}>
        <Text style={styles.cryptoSymbol}>{item.symbol}</Text>
        <Text style={styles.cryptoName}>{item.name}</Text>
      </View>
      <View style={styles.priceContainer}>
        <Text style={styles.priceText}>${item.price.toFixed(2)}</Text>
        <Text style={[styles.changeText, changeStyle]}>
          {isPositive ? '+' : ''}{item.change24h.toFixed(2)}%
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const NewsListItem: React.FC<{ item: NewsItem }> = ({ item }) => (
  <TouchableOpacity style={styles.newsItem} onPress={() => console.log(`Read news: ${item.title}`)}>
    <Text style={styles.newsTitle}>{item.title}</Text>
    <Text style={styles.newsSource}>{item.source} • {item.date}</Text>
  </TouchableOpacity>
);

const ChartComponent: React.FC<{ data: CryptoData['chartData'] }> = ({ data }) => {
  // Mocking the chart configuration for react-native-chart-kit
  const chartConfig = {
    backgroundColor: COLORS.card,
    backgroundGradientFrom: COLORS.card,
    backgroundGradientTo: COLORS.card,
    decimalPlaces: 2,
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`, // Primary color
    labelColor: (opacity = 1) => `rgba(28, 28, 30, ${opacity})`, // Text color
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: COLORS.primary,
    },
  };

  return (
    <View style={styles.chartContainer}>
      {/* In a real app, LineChart from 'react-native-chart-kit' would be used here */}
      {/* Since we cannot install external dependencies, we will render a placeholder */}
      <View style={{ width: CHART_WIDTH, height: 200, backgroundColor: '#E5E5EA', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={styles.secondaryText}>[Price Chart Placeholder]</Text>
        <Text style={styles.secondaryText}>Data Points: {data.datasets[0].data.length}</Text>
      </View>
      {/* <LineChart
        data={data}
        width={CHART_WIDTH}
        height={200}
        chartConfig={chartConfig}
        bezier
        style={{ marginVertical: 8, borderRadius: 16 }}
      /> */}
    </View>
  );
};

const ActionButtons: React.FC = () => {
  const handleAction = (action: 'Buy' | 'Sell') => {
    // In a real app, this would navigate to a transaction screen
    console.log(`${action} button pressed`);
    // Example: NotificationService.showToast(`${action} flow initiated`);
  };

  return (
    <View style={styles.actionsContainer}>
      <TouchableOpacity
        style={[styles.actionButton, styles.buyButton]}
        onPress={() => handleAction('Buy')}
      >
        <Text style={styles.actionText}>Buy</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionButton, styles.sellButton]}
        onPress={() => handleAction('Sell')}
      >
        <Text style={styles.actionText}>Sell</Text>
      </TouchableOpacity>
    </View>
  );
};

// --- 5. MAIN SCREEN COMPONENT ---

const CryptocurrencyScreen: React.FC = () => {
  const [data, setData] = useState<CryptoData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use ApiService (mocked by mockFetchCryptoData)
      const result = await mockFetchCryptoData();
      setData(result);
    } catch (e) {
      console.error('Failed to fetch crypto data:', e);
      // Use NotificationService (mocked by console.error)
      setError('Failed to load cryptocurrency data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 10, color: COLORS.secondaryText }}>Loading market data...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={{ padding: 20, alignItems: 'center' }} onPress={fetchData}>
          <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Tap to Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cryptocurrency</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        
        {/* Portfolio Section */}
        <Text style={styles.sectionTitle}>My Portfolio</Text>
        <PortfolioSummary portfolio={data.portfolio} />

        {/* Price Chart Section */}
        <Text style={styles.sectionTitle}>Market Overview</Text>
        <ChartComponent data={data.chartData} />

        {/* Buy/Sell Actions */}
        <ActionButtons />

        {/* Top Cryptocurrencies Section */}
        <Text style={styles.sectionTitle}>Top Cryptocurrencies</Text>
        <FlatList
          data={data.topCryptos}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CryptoListItem item={item} />}
          scrollEnabled={false} // Since it's inside a ScrollView
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#E5E5EA', marginHorizontal: 20 }} />}
        />

        {/* News Feed Section */}
        <Text style={styles.sectionTitle}>Latest News</Text>
        <FlatList
          data={data.newsFeed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NewsListItem item={item} />}
          scrollEnabled={false} // Since it's inside a ScrollView
        />

      </ScrollView>
    </View>
  );
};

export default CryptocurrencyScreen;
