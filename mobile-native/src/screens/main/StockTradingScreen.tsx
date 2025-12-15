import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { apiService } from '../../services/ApiService';

interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  exchange: string;
}

interface Portfolio {
  symbol: string;
  shares: number;
  avg_price: number;
  current_price: number;
  total_value: number;
  profit_loss: number;
  profit_loss_percent: number;
}

export const StockTradingScreen = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [shares, setShares] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [stocksData, portfolioData] = await Promise.all([
        apiService.getStocks(),
        apiService.getStockPortfolio(),
      ]);
      setStocks(stocksData);
      setPortfolio(portfolioData);
    } catch (error) {
      console.error('Failed to load stock data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleTrade = async () => {
    if (!selectedStock || !shares) {
      Alert.alert('Error', 'Please select a stock and enter number of shares');
      return;
    }

    const numShares = parseInt(shares);
    if (isNaN(numShares) || numShares <= 0) {
      Alert.alert('Error', 'Please enter a valid number of shares');
      return;
    }

    try {
      await apiService.tradeStock({
        symbol: selectedStock.symbol,
        shares: numShares,
        type: tradeType,
        price: selectedStock.price,
      });

      Alert.alert(
        'Success',
        `Successfully ${tradeType === 'buy' ? 'bought' : 'sold'} ${numShares} shares of ${selectedStock.symbol}`
      );

      setSelectedStock(null);
      setShares('');
      loadData();
    } catch (error: any) {
      Alert.alert(
        'Trade Failed',
        error.response?.data?.detail || 'Failed to execute trade'
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Portfolio Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Portfolio</Text>
        {portfolio.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No stocks in portfolio</Text>
          </View>
        ) : (
          portfolio.map((item, index) => (
            <View key={index} style={styles.portfolioCard}>
              <View style={styles.portfolioHeader}>
                <Text style={styles.portfolioSymbol}>{item.symbol}</Text>
                <Text style={styles.portfolioShares}>{item.shares} shares</Text>
              </View>
              <View style={styles.portfolioDetails}>
                <View>
                  <Text style={styles.portfolioLabel}>Current Value</Text>
                  <Text style={styles.portfolioValue}>
                    ${item.total_value.toFixed(2)}
                  </Text>
                </View>
                <View>
                  <Text style={styles.portfolioLabel}>P/L</Text>
                  <Text
                    style={[
                      styles.portfolioProfit,
                      item.profit_loss < 0 && styles.portfolioLoss,
                    ]}
                  >
                    {item.profit_loss >= 0 ? '+' : ''}
                    ${item.profit_loss.toFixed(2)} (
                    {item.profit_loss_percent.toFixed(2)}%)
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Market Stocks */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Market</Text>
        {stocks.map((stock, index) => (
          <TouchableOpacity
            key={index}
            style={styles.stockCard}
            onPress={() => setSelectedStock(stock)}
          >
            <View style={styles.stockInfo}>
              <Text style={styles.stockSymbol}>{stock.symbol}</Text>
              <Text style={styles.stockName}>{stock.name}</Text>
              <Text style={styles.stockExchange}>{stock.exchange}</Text>
            </View>
            <View style={styles.stockPrice}>
              <Text style={styles.stockPriceValue}>${stock.price.toFixed(2)}</Text>
              <Text
                style={[
                  styles.stockChange,
                  stock.change < 0 && styles.stockChangeNegative,
                ]}
              >
                {stock.change >= 0 ? '+' : ''}
                {stock.change.toFixed(2)} ({stock.change_percent.toFixed(2)}%)
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Trade Modal */}
      {selectedStock && (
        <View style={styles.tradeModal}>
          <View style={styles.tradeHeader}>
            <Text style={styles.tradeTitle}>Trade {selectedStock.symbol}</Text>
            <TouchableOpacity onPress={() => setSelectedStock(null)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tradeTypeContainer}>
            <TouchableOpacity
              style={[
                styles.tradeTypeButton,
                tradeType === 'buy' && styles.tradeTypeButtonActive,
              ]}
              onPress={() => setTradeType('buy')}
            >
              <Text
                style={[
                  styles.tradeTypeText,
                  tradeType === 'buy' && styles.tradeTypeTextActive,
                ]}
              >
                Buy
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tradeTypeButton,
                tradeType === 'sell' && styles.tradeTypeButtonActive,
              ]}
              onPress={() => setTradeType('sell')}
            >
              <Text
                style={[
                  styles.tradeTypeText,
                  tradeType === 'sell' && styles.tradeTypeTextActive,
                ]}
              >
                Sell
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tradeInputGroup}>
            <Text style={styles.tradeLabel}>Number of Shares</Text>
            <TextInput
              style={styles.tradeInput}
              value={shares}
              onChangeText={setShares}
              placeholder="Enter shares"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.tradeSummary}>
            <Text style={styles.tradeSummaryLabel}>Price per share:</Text>
            <Text style={styles.tradeSummaryValue}>
              ${selectedStock.price.toFixed(2)}
            </Text>
          </View>

          {shares && (
            <View style={styles.tradeSummary}>
              <Text style={styles.tradeSummaryLabel}>Total:</Text>
              <Text style={styles.tradeSummaryValue}>
                ${(selectedStock.price * parseInt(shares || '0')).toFixed(2)}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.tradeButton} onPress={handleTrade}>
            <Text style={styles.tradeButtonText}>
              {tradeType === 'buy' ? 'Buy' : 'Sell'} {shares || '0'} Shares
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  portfolioCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  portfolioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  portfolioSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  portfolioShares: {
    fontSize: 14,
    color: '#666',
  },
  portfolioDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  portfolioLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  portfolioValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  portfolioProfit: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  portfolioLoss: {
    color: '#f44336',
  },
  stockCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  stockInfo: {
    flex: 1,
  },
  stockSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  stockName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  stockExchange: {
    fontSize: 12,
    color: '#999',
  },
  stockPrice: {
    alignItems: 'flex-end',
  },
  stockPriceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  stockChange: {
    fontSize: 14,
    color: '#4CAF50',
  },
  stockChangeNegative: {
    color: '#f44336',
  },
  tradeModal: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  tradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  tradeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  closeButton: {
    fontSize: 24,
    color: '#999',
  },
  tradeTypeContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  tradeTypeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  tradeTypeButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  tradeTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  tradeTypeTextActive: {
    color: '#fff',
  },
  tradeInputGroup: {
    marginBottom: 20,
  },
  tradeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  tradeInput: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  tradeSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tradeSummaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  tradeSummaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  tradeButton: {
    height: 50,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  tradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

