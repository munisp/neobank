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

interface Crypto {
  symbol: string;
  name: string;
  price: number;
  change_24h: number;
  change_percent_24h: number;
  market_cap: number;
}

interface CryptoHolding {
  symbol: string;
  amount: number;
  avg_price: number;
  current_price: number;
  total_value: number;
  profit_loss: number;
  profit_loss_percent: number;
}

export const CryptocurrencyScreen = () => {
  const [cryptos, setCryptos] = useState<Crypto[]>([]);
  const [holdings, setHoldings] = useState<CryptoHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCrypto, setSelectedCrypto] = useState<Crypto | null>(null);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [cryptosData, holdingsData] = await Promise.all([
        apiService.getCryptocurrencies(),
        apiService.getCryptoHoldings(),
      ]);
      setCryptos(cryptosData);
      setHoldings(holdingsData);
    } catch (error) {
      console.error('Failed to load crypto data:', error);
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
    if (!selectedCrypto || !amount) {
      Alert.alert('Error', 'Please select a cryptocurrency and enter amount');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    try {
      await apiService.tradeCrypto({
        symbol: selectedCrypto.symbol,
        amount: numAmount,
        type: tradeType,
        price: selectedCrypto.price,
      });

      Alert.alert(
        'Success',
        `Successfully ${tradeType === 'buy' ? 'bought' : 'sold'} ${numAmount} ${selectedCrypto.symbol}`
      );

      setSelectedCrypto(null);
      setAmount('');
      loadData();
    } catch (error: any) {
      Alert.alert(
        'Trade Failed',
        error.response?.data?.detail || 'Failed to execute trade'
      );
    }
  };

  const formatMarketCap = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toFixed(2)}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.total_value, 0);
  const totalProfitLoss = holdings.reduce((sum, h) => sum + h.profit_loss, 0);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Portfolio Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Portfolio Value</Text>
        <Text style={styles.summaryValue}>${totalPortfolioValue.toFixed(2)}</Text>
        <Text
          style={[
            styles.summaryChange,
            totalProfitLoss < 0 && styles.summaryChangeNegative,
          ]}
        >
          {totalProfitLoss >= 0 ? '+' : ''}${totalProfitLoss.toFixed(2)} (24h)
        </Text>
      </View>

      {/* Holdings */}
      {holdings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Holdings</Text>
          {holdings.map((holding, index) => (
            <View key={index} style={styles.holdingCard}>
              <View style={styles.holdingHeader}>
                <Text style={styles.holdingSymbol}>{holding.symbol}</Text>
                <Text style={styles.holdingAmount}>
                  {holding.amount.toFixed(8)}
                </Text>
              </View>
              <View style={styles.holdingDetails}>
                <View>
                  <Text style={styles.holdingLabel}>Value</Text>
                  <Text style={styles.holdingValue}>
                    ${holding.total_value.toFixed(2)}
                  </Text>
                </View>
                <View>
                  <Text style={styles.holdingLabel}>P/L</Text>
                  <Text
                    style={[
                      styles.holdingProfit,
                      holding.profit_loss < 0 && styles.holdingLoss,
                    ]}
                  >
                    {holding.profit_loss >= 0 ? '+' : ''}$
                    {holding.profit_loss.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Market */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Market</Text>
        {cryptos.map((crypto, index) => (
          <TouchableOpacity
            key={index}
            style={styles.cryptoCard}
            onPress={() => setSelectedCrypto(crypto)}
          >
            <View style={styles.cryptoInfo}>
              <Text style={styles.cryptoSymbol}>{crypto.symbol}</Text>
              <Text style={styles.cryptoName}>{crypto.name}</Text>
              <Text style={styles.cryptoMarketCap}>
                MCap: {formatMarketCap(crypto.market_cap)}
              </Text>
            </View>
            <View style={styles.cryptoPrice}>
              <Text style={styles.cryptoPriceValue}>
                ${crypto.price.toFixed(2)}
              </Text>
              <Text
                style={[
                  styles.cryptoChange,
                  crypto.change_24h < 0 && styles.cryptoChangeNegative,
                ]}
              >
                {crypto.change_24h >= 0 ? '+' : ''}
                {crypto.change_percent_24h.toFixed(2)}%
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Trade Modal */}
      {selectedCrypto && (
        <View style={styles.tradeModal}>
          <View style={styles.tradeHeader}>
            <Text style={styles.tradeTitle}>Trade {selectedCrypto.symbol}</Text>
            <TouchableOpacity onPress={() => setSelectedCrypto(null)}>
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
            <Text style={styles.tradeLabel}>Amount ({selectedCrypto.symbol})</Text>
            <TextInput
              style={styles.tradeInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="Enter amount"
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.tradeSummary}>
            <Text style={styles.tradeSummaryLabel}>Price:</Text>
            <Text style={styles.tradeSummaryValue}>
              ${selectedCrypto.price.toFixed(2)}
            </Text>
          </View>

          {amount && (
            <View style={styles.tradeSummary}>
              <Text style={styles.tradeSummaryLabel}>Total:</Text>
              <Text style={styles.tradeSummaryValue}>
                ${(selectedCrypto.price * parseFloat(amount || '0')).toFixed(2)}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.tradeButton} onPress={handleTrade}>
            <Text style={styles.tradeButtonText}>
              {tradeType === 'buy' ? 'Buy' : 'Sell'} {selectedCrypto.symbol}
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
  summaryCard: {
    backgroundColor: '#007AFF',
    margin: 16,
    padding: 24,
    borderRadius: 16,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  summaryChange: {
    fontSize: 16,
    color: '#4CAF50',
  },
  summaryChangeNegative: {
    color: '#ff6b6b',
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
  holdingCard: {
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
  holdingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  holdingSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  holdingAmount: {
    fontSize: 14,
    color: '#666',
  },
  holdingDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  holdingLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  holdingValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  holdingProfit: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  holdingLoss: {
    color: '#f44336',
  },
  cryptoCard: {
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
  cryptoInfo: {
    flex: 1,
  },
  cryptoSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  cryptoName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  cryptoMarketCap: {
    fontSize: 12,
    color: '#999',
  },
  cryptoPrice: {
    alignItems: 'flex-end',
  },
  cryptoPriceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  cryptoChange: {
    fontSize: 14,
    color: '#4CAF50',
  },
  cryptoChangeNegative: {
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

