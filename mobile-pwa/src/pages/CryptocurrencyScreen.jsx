import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthService from '../services/AuthService';
import ApiService from '../services/ApiService';
import NotificationService from '../services/NotificationService';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Alert from '../components/ui/Alert';

// Mock Icons for visual appeal (assuming a library like react-icons is available or custom icons are used)
const Icon = ({ name, className = '' }) => {
  const icons = {
    btc: '₿', eth: 'Ξ', sol: '◎', doge: 'Ð', up: '▲', down: '▼',
    portfolio: '💼', market: '📈', trade: '🔁', offline: '🔌',
  };
  return <span className={`inline-block w-4 h-4 text-center ${className}`}>{icons[name] || '•'}</span>;
};

const CryptocurrencyScreen = () => {
  const navigate = useNavigate();
  const [cryptoList, setCryptoList] = useState([]);
  const [marketTrends, setMarketTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [tradeAction, setTradeAction] = useState('buy'); // 'buy' or 'sell'
  const [selectedCrypto, setSelectedCrypto] = useState(null);
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState(null);
  const [tradeSuccess, setTradeSuccess] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // --- Data Fetching and Initialization ---

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 1. Full feature parity: Check authentication and redirect if not logged in
    if (!AuthService.isAuthenticated()) {
      navigate('/login');
      return;
    }

    fetchData();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [navigate]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch crypto list and market trends
      const [list, trends] = await Promise.all([
        ApiService.fetchCryptoList(),
        ApiService.fetchMarketTrends(),
      ]);
      setCryptoList(list);
      setMarketTrends(trends);
    } catch (err) {
      console.error('Failed to fetch crypto data:', err);
      // 6. Error handling
      setError('Failed to load cryptocurrency data. Please try again.');
      NotificationService.showError('Data loading failed.');
    } finally {
      // 6. Loading states
      setLoading(false);
    }
  };

  // --- Computed Values ---

  // Portfolio calculation
  const totalPortfolioValue = useMemo(() => {
    return cryptoList.reduce((sum, crypto) => sum + (crypto.holdings * crypto.price), 0);
  }, [cryptoList]);

  // Search/Filter for crypto list
  const filteredCryptoList = useMemo(() => {
    if (!searchTerm) return cryptoList;
    return cryptoList.filter(crypto =>
      crypto.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      crypto.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [cryptoList, searchTerm]);

  // --- Event Handlers ---

  const handleTradeSubmit = async (e) => {
    e.preventDefault();
    setTradeLoading(true);
    setTradeError(null);
    setTradeSuccess(null);

    // 9. Form validation
    if (!selectedCrypto || !tradeAmount || isNaN(parseFloat(tradeAmount)) || parseFloat(tradeAmount) <= 0) {
      setTradeError('Please select a crypto and enter a valid amount.');
      setTradeLoading(false);
      return;
    }

    const amount = parseFloat(tradeAmount);
    const symbol = selectedCrypto.symbol;

    try {
      let result;
      if (tradeAction === 'buy') {
        result = await ApiService.buyCrypto(symbol, amount);
      } else {
        // Simple validation for sell: check if user has enough holdings (mocked)
        if (amount > selectedCrypto.holdings) {
          setTradeError(`Cannot sell ${amount} ${symbol}. You only hold ${selectedCrypto.holdings}.`);
          setTradeLoading(false);
          return;
        }
        result = await ApiService.sellCrypto(symbol, amount);
      }

      setTradeSuccess(result.message);
      NotificationService.showSuccess(result.message);
      // Re-fetch data to update portfolio
      fetchData();
      // Reset form
      setTradeAmount('');
      setSelectedCrypto(null);

    } catch (err) {
      const errorMessage = err.message || `Failed to process ${tradeAction} order.`;
      setTradeError(errorMessage);
      NotificationService.showError(errorMessage);
    } finally {
      setTradeLoading(false);
    }
  };

  // --- Render Helpers ---

  const renderPortfolioSummary = () => (
    <Card className="mb-6 bg-indigo-600 text-white">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center"><Icon name="portfolio" className="mr-2" /> My Portfolio</h2>
        {/* 10. Navigation using react-router-dom Link */}
        <Link to="/portfolio-details" className="text-sm underline opacity-80 hover:opacity-100">
          View Details
        </Link>
      </div>
      <p className="text-3xl font-extrabold mt-2">${totalPortfolioValue.toFixed(2)}</p>
      <p className="text-sm opacity-80">Total Value (USD)</p>
    </Card>
  );

  const renderMarketTrends = () => (
    <Card className="mb-6">
      <h2 className="text-xl font-bold mb-3 flex items-center"><Icon name="market" className="mr-2 text-green-600" /> Market Trends</h2>
      {marketTrends ? (
        <>
          <p className="text-sm mb-2">Sentiment: <span className="font-semibold text-green-600">{marketTrends.sentiment}</span></p>
          <div className="space-y-1">
            <h3 className="text-md font-semibold">Top News:</h3>
            {marketTrends.news.map(item => (
              <p key={item.id} className="text-xs text-gray-600 truncate">
                • {item.title} (<span className="font-medium">{item.source}</span>)
              </p>
            ))}
          </div>
        </>
      ) : (
        // 6. Empty states
        <p className="text-sm text-gray-500">No market trend data available.</p>
      )}
    </Card>
  );

  const renderTradeForm = () => (
    <Card className="mb-6">
      <h2 className="text-xl font-bold mb-4 flex items-center"><Icon name="trade" className="mr-2 text-indigo-600" /> Quick Trade</h2>
      <div className="flex mb-4 space-x-2">
        <Button
          variant={tradeAction === 'buy' ? 'primary' : 'secondary'}
          onClick={() => setTradeAction('buy')}
          className="flex-1"
        >
          Buy
        </Button>
        <Button
          variant={tradeAction === 'sell' ? 'danger' : 'secondary'}
          onClick={() => setTradeAction('sell')}
          className="flex-1"
        >
          Sell
        </Button>
      </div>

      <form onSubmit={handleTradeSubmit} className="space-y-4">
        {tradeError && <Alert message={tradeError} type="error" />}
        {tradeSuccess && <Alert message={tradeSuccess} type="success" />}

        <div className="relative">
          <select
            value={selectedCrypto ? selectedCrypto.symbol : ''}
            onChange={(e) => setSelectedCrypto(cryptoList.find(c => c.symbol === e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Select Cryptocurrency</option>
            {cryptoList.map(crypto => (
              <option key={crypto.id} value={crypto.symbol}>
                {crypto.name} ({crypto.symbol})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
          </div>
        </div>

        <Input
          type="number"
          placeholder="Amount to Trade"
          value={tradeAmount}
          onChange={(e) => setTradeAmount(e.target.value)}
          min="0.00000001"
          step="any"
          required
        />

        <Button type="submit" disabled={tradeLoading || !isOnline} className="w-full">
          {tradeLoading ? <LoadingSpinner /> : `${tradeAction === 'buy' ? 'Execute Buy' : 'Execute Sell'}`}
        </Button>
      </form>
    </Card>
  );

  const renderCryptoList = () => (
    <Card>
      <h2 className="text-xl font-bold mb-4">Crypto Prices</h2>
      <Input
        type="text"
        placeholder="Search crypto (e.g., BTC, Bitcoin)"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="mb-4"
      />
      {filteredCryptoList.length === 0 && !loading && (
        // 6. Empty states
        <Alert message="No cryptocurrencies found matching your search." type="info" />
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price (USD)</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">24h %</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Holdings</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredCryptoList.map((crypto) => {
              const isPositive = crypto.change24h >= 0;
              const changeColor = isPositive ? 'text-green-600' : 'text-red-600';
              const changeIcon = isPositive ? 'up' : 'down';
              return (
                <tr key={crypto.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedCrypto(crypto)}>
                  <td className="px-3 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Icon name={crypto.symbol.toLowerCase()} className="mr-2 text-lg" />
                      <div className="text-sm font-medium text-gray-900">{crypto.name}</div>
                      <div className="ml-2 text-xs text-gray-500">{crypto.symbol}</div>
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                    ${crypto.price.toFixed(2)}
                  </td>
                  <td className={`px-3 py-4 whitespace-nowrap text-right text-sm font-medium ${changeColor} hidden sm:table-cell`}>
                    <Icon name={changeIcon} className="mr-1" />
                    {crypto.change24h.toFixed(2)}%
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                    {crypto.holdings.toFixed(4)} {crypto.symbol}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  // --- Main Render ---

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <LoadingSpinner />
        <p className="mt-4 text-gray-600">Loading crypto data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8 min-h-screen bg-gray-50">
        <Alert message={error} type="error" className="mb-4" />
        <Button onClick={fetchData}>Retry Loading</Button>
      </div>
    );
  }

  return (
    // 7. Mobile-first responsive design (p-4, md:p-8, grid-cols-1, lg:grid-cols-3)
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900">Cryptocurrency Trading</h1>
        {/* 8. Offline support indicators */}
        {!isOnline && (
          <div className="mt-2 text-sm text-red-500 flex items-center">
            <Icon name="offline" className="mr-1" /> You are currently offline. Data may be outdated and trading is disabled.
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Portfolio, Trends, and Trade Form */}
        <div className="lg:col-span-1 space-y-6">
          {renderPortfolioSummary()}
          {renderMarketTrends()}
          {renderTradeForm()}
        </div>

        {/* Right Column: Crypto List */}
        <div className="lg:col-span-2">
          {renderCryptoList()}
        </div>
      </div>

      <footer className="mt-8 text-center text-sm text-gray-500">
        <p>Data provided by NeoBank Crypto API. Prices are delayed by 15 minutes.</p>
      </footer>
    </div>
  );
};

export default CryptocurrencyScreen;
