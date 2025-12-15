// TradingPage.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

// --- TYPES ---

/**
 * @typedef {Object} PriceData
 * @property {number} t - Timestamp (milliseconds)
 * @property {number} p - Price
 */

/**
 * @typedef {Object} Stock
 * @property {string} symbol - Stock or Crypto symbol (e.g., 'AAPL', 'BTC')
 * @property {string} name - Company or Asset name (e.g., 'Apple Inc.', 'Bitcoin')
 * @property {number} price - Current price
 * @property {number} change - Price change in currency
 * @property {number} changePercent - Price change in percentage
 * @property {PriceData[]} history - Historical price data
 */

/**
 * @typedef {Object} Order
 * @property {string} id
 * @property {string} symbol
 * @property {'BUY' | 'SELL'} type
 * @property {number} quantity
 * @property {number} price
 * @property {string} date
 * @property {'FILLED' | 'PENDING' | 'CANCELLED'} status
 */

/**
 * @typedef {Object} MarketData
 * @property {string} index - Index name (e.g., 'S&P 500')
 * @property {number} value - Current value
 * @property {number} change - Change in value
 * @property {number} changePercent - Change in percentage
 */

// --- MOCK API UTILITIES ---

/**
 * Mock API endpoint for fetching stock data.
 * @param {string} symbol
 * @returns {Promise<Stock>}
 */
const fetchStockData = async (symbol) => {
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay

  const mockHistory = Array.from({ length: 30 }, (_, i) => ({
    t: Date.now() - (30 - i) * 24 * 60 * 60 * 1000, // Last 30 days
    p: 150 + Math.random() * 50 * (i / 30) + (symbol === 'BTC' ? 30000 : 0),
  }));

  const basePrice = mockHistory[mockHistory.length - 1].p;
  const changePercent = parseFloat((Math.random() * 10 - 5).toFixed(2));
  const change = parseFloat((basePrice * (changePercent / 100)).toFixed(2));

  return {
    symbol: symbol.toUpperCase(),
    name: symbol === 'AAPL' ? 'Apple Inc.' : symbol === 'BTC' ? 'Bitcoin' : `${symbol} Corp.`,
    price: parseFloat(basePrice.toFixed(2)),
    change: change,
    changePercent: changePercent,
    history: mockHistory,
  };
};

/**
 * Mock API endpoint for searching stocks.
 * @param {string} query
 * @returns {Promise<Stock[]>}
 */
const searchStocks = async (query) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const allStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'BTC', 'ETH'];
  const results = allStocks
    .filter(s => s.toLowerCase().includes(query.toLowerCase()))
    .map(s => ({ symbol: s, name: `${s} Corp.`, price: 0, change: 0, changePercent: 0, history: [] }));
  return results;
};

/**
 * Mock API endpoint for placing an order.
 * @param {Object} orderDetails
 * @param {string} orderDetails.symbol
 * @param {'BUY' | 'SELL'} orderDetails.type
 * @param {number} orderDetails.quantity
 * @param {number} orderDetails.price
 * @returns {Promise<Order>}
 */
const placeOrder = async (orderDetails) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  if (Math.random() < 0.1) {
    throw new Error('Transaction failed due to insufficient funds.');
  }
  return {
    id: `ORD-${Date.now()}`,
    ...orderDetails,
    date: new Date().toISOString(),
    status: 'FILLED',
  };
};

/**
 * Mock API endpoint for fetching order history.
 * @returns {Promise<Order[]>}
 */
const fetchOrderHistory = async () => {
  await new Promise(resolve => setTimeout(resolve, 600));
  const mockOrders = [
    { id: 'ORD-1', symbol: 'AAPL', type: 'BUY', quantity: 10, price: 175.50, date: '2025-10-20', status: 'FILLED' },
    { id: 'ORD-2', symbol: 'BTC', type: 'SELL', quantity: 0.5, price: 65000.00, date: '2025-10-25', status: 'FILLED' },
    { id: 'ORD-3', symbol: 'MSFT', type: 'BUY', quantity: 5, price: 400.10, date: '2025-11-01', status: 'PENDING' },
  ];
  return mockOrders;
};

/**
 * Mock API endpoint for fetching market data.
 * @returns {Promise<MarketData[]>}
 */
const fetchMarketData = async () => {
  await new Promise(resolve => setTimeout(resolve, 400));
  const mockData = [
    { index: 'S&P 500', value: 5200.50, change: 15.20, changePercent: 0.29 },
    { index: 'NASDAQ', value: 16500.10, change: -50.80, changePercent: -0.31 },
    { index: 'DOW', value: 39000.00, change: 100.00, changePercent: 0.26 },
  ];
  return mockData;
};

// --- COMPONENTS ---

/**
 * @param {{ stock: Stock }} props
 */
const PriceChart = ({ stock }) => {
  const chartData = useMemo(() => ({
    labels: stock.history.map(d => new Date(d.t)),
    datasets: [
      {
        label: `${stock.symbol} Price`,
        data: stock.history.map(d => d.p),
        borderColor: stock.changePercent >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)', // green or red
        backgroundColor: stock.changePercent >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
        tension: 0.1,
        pointRadius: 0,
        fill: true,
      },
    ],
  }), [stock]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day' },
        grid: { display: false },
        ticks: { maxTicksLimit: 7 },
      },
      y: {
        beginAtZero: false,
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        ticks: {
          callback: function(value) {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
          }
        }
      },
    },
  };

  return (
    <div className="h-96 w-full">
      <Line data={chartData} options={options} />
    </div>
  );
};

/**
 * @param {{ onSelect: (symbol: string) => void }} props
 */
const StockSearch = ({ onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const handler = setTimeout(async () => {
      try {
        const data = await searchStocks(query);
        setResults(data);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [query]);

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search stock or crypto (e.g., AAPL, BTC)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-neo-green focus:border-neo-green text-white"
      />
      {query.length >= 2 && (
        <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {loading && <div className="p-3 text-center text-gray-400">Searching...</div>}
          {!loading && results.length === 0 && <div className="p-3 text-center text-gray-400">No results found.</div>}
          {results.map((stock) => (
            <div
              key={stock.symbol}
              className="p-3 hover:bg-gray-700 cursor-pointer flex justify-between items-center"
              onClick={() => {
                onSelect(stock.symbol);
                setQuery('');
                setResults([]);
              }}
            >
              <span className="font-semibold text-white">{stock.symbol}</span>
              <span className="text-sm text-gray-400">{stock.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * @param {{ stock: Stock, onOrderPlaced: (order: Order) => void }} props
 */
const BuySellInterface = ({ stock, onOrderPlaced }) => {
  const [type, setType] = useState('BUY');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const estimatedCost = useMemo(() => (quantity * stock.price).toFixed(2), [quantity, stock.price]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const order = await placeOrder({
        symbol: stock.symbol,
        type: type,
        quantity: quantity,
        price: stock.price,
      });
      setSuccess(`${type} order for ${quantity} shares of ${stock.symbol} placed successfully!`);
      onOrderPlaced(order);
    } catch (err) {
      setError(err.message || 'An unknown error occurred during the transaction.');
    } finally {
      setLoading(false);
    }
  }, [stock, type, quantity, onOrderPlaced]);

  return (
    <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
      <h3 className="text-xl font-semibold mb-4 text-white">{stock.symbol} - Trade</h3>
      <div className="flex mb-4">
        <button
          className={`flex-1 p-2 rounded-l-lg font-bold transition-colors ${
            type === 'BUY' ? 'bg-neo-green text-gray-900' : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          onClick={() => setType('BUY')}
        >
          BUY
        </button>
        <button
          className={`flex-1 p-2 rounded-r-lg font-bold transition-colors ${
            type === 'SELL' ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          onClick={() => setType('SELL')}
        >
          SELL
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400 mb-1">Quantity</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
            required
          />
        </div>

        <div className="mb-4 p-3 bg-gray-700 rounded-lg">
          <p className="text-sm text-gray-400">Current Price: <span className="font-semibold text-white">${stock.price.toFixed(2)}</span></p>
          <p className="text-lg font-bold text-white">
            Estimated Cost: <span className="text-neo-green">${estimatedCost}</span>
          </p>
        </div>

        {error && <div className="p-3 mb-3 text-sm text-red-400 bg-red-900/50 rounded-lg">{error}</div>}
        {success && <div className="p-3 mb-3 text-sm text-neo-green bg-neo-green/20 rounded-lg">{success}</div>}

        <button
          type="submit"
          disabled={loading}
          className={`w-full p-3 rounded-lg font-bold transition-colors ${
            loading
              ? 'bg-gray-500 cursor-not-allowed'
              : type === 'BUY'
              ? 'bg-neo-green text-gray-900 hover:bg-neo-green/80'
              : 'bg-red-500 text-white hover:bg-red-400'
          }`}
        >
          {loading ? 'Processing...' : `${type} ${stock.symbol}`}
        </button>
      </form>
    </div>
  );
};

/**
 * @param {{ orders: Order[] }} props
 */
const OrderHistory = ({ orders }) => {
  return (
    <div className="p-4 bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
      <h3 className="text-xl font-semibold mb-4 text-white">Order History</h3>
      <table className="min-w-full divide-y divide-gray-700 text-white">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Symbol</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Qty</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Price</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-gray-700 transition-colors">
              <td className="px-4 py-2 whitespace-nowrap font-medium">{order.symbol}</td>
              <td className={`px-4 py-2 whitespace-nowrap font-bold ${order.type === 'BUY' ? 'text-neo-green' : 'text-red-500'}`}>
                {order.type}
              </td>
              <td className="px-4 py-2 whitespace-nowrap">{order.quantity}</td>
              <td className="px-4 py-2 whitespace-nowrap">${order.price.toFixed(2)}</td>
              <td className={`px-4 py-2 whitespace-nowrap font-semibold ${
                order.status === 'FILLED' ? 'text-neo-green' : order.status === 'PENDING' ? 'text-yellow-500' : 'text-gray-500'
              }`}>
                {order.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <p className="text-center py-4 text-gray-400">No recent orders.</p>}
    </div>
  );
};

/**
 * @param {{ watchlist: Stock[], onSelect: (symbol: string) => void, onRemove: (symbol: string) => void }} props
 */
const Watchlist = ({ watchlist, onSelect, onRemove }) => {
  return (
    <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
      <h3 className="text-xl font-semibold mb-4 text-white">Watchlist</h3>
      <div className="space-y-3">
        {watchlist.map((stock) => (
          <div
            key={stock.symbol}
            className="flex justify-between items-center p-2 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
            onClick={() => onSelect(stock.symbol)}
          >
            <div>
              <p className="font-bold text-white">{stock.symbol}</p>
              <p className="text-sm text-gray-400">{stock.name}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-white">${stock.price.toFixed(2)}</p>
              <p className={`text-sm font-semibold ${stock.changePercent >= 0 ? 'text-neo-green' : 'text-red-500'}`}>
                {stock.changePercent >= 0 ? '▲' : '▼'} {stock.changePercent.toFixed(2)}%
              </p>
            </div>
            <button
              className="text-gray-500 hover:text-red-500 ml-2"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(stock.symbol);
              }}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      {watchlist.length === 0 && <p className="text-center py-4 text-gray-400">Watchlist is empty.</p>}
    </div>
  );
};

/**
 * @param {{ data: MarketData[] }} props
 */
const MarketDataComponent = ({ data }) => {
  return (
    <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
      <h3 className="text-xl font-semibold mb-4 text-white">Market Data</h3>
      <div className="space-y-3">
        {data.map((index) => (
          <div key={index.index} className="flex justify-between items-center p-2 border-b border-gray-700 last:border-b-0">
            <p className="font-bold text-white">{index.index}</p>
            <div className="text-right">
              <p className="font-bold text-white">{index.value.toFixed(2)}</p>
              <p className={`text-sm font-semibold ${index.changePercent >= 0 ? 'text-neo-green' : 'text-red-500'}`}>
                {index.changePercent >= 0 ? '+' : ''}{index.changePercent.toFixed(2)}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * @param {{ stock: Stock }} props
 */
const TradingAnalytics = ({ stock }) => {
  const latestPrice = stock.price;
  const high = Math.max(...stock.history.map(d => d.p)).toFixed(2);
  const low = Math.min(...stock.history.map(d => d.p)).toFixed(2);
  const avg = (stock.history.reduce((sum, d) => sum + d.p, 0) / stock.history.length).toFixed(2);

  return (
    <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
      <h3 className="text-xl font-semibold mb-4 text-white">Trading Analytics ({stock.symbol})</h3>
      <div className="grid grid-cols-2 gap-4 text-white">
        <div className="p-3 bg-gray-700 rounded-lg">
          <p className="text-sm text-gray-400">Current Price</p>
          <p className="text-xl font-bold">${latestPrice.toFixed(2)}</p>
        </div>
        <div className="p-3 bg-gray-700 rounded-lg">
          <p className="text-sm text-gray-400">24h Change</p>
          <p className={`text-xl font-bold ${stock.changePercent >= 0 ? 'text-neo-green' : 'text-red-500'}`}>
            {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
          </p>
        </div>
        <div className="p-3 bg-gray-700 rounded-lg">
          <p className="text-sm text-gray-400">30-Day High</p>
          <p className="text-xl font-bold">${high}</p>
        </div>
        <div className="p-3 bg-gray-700 rounded-lg">
          <p className="text-sm text-gray-400">30-Day Low</p>
          <p className="text-xl font-bold">${low}</p>
        </div>
        <div className="p-3 bg-gray-700 rounded-lg col-span-2">
          <p className="text-sm text-gray-400">30-Day Avg. Price</p>
          <p className="text-xl font-bold">${avg}</p>
        </div>
      </div>
    </div>
  );
};

// --- MAIN PAGE COMPONENT ---

/**
 * @returns {JSX.Element}
 */
const TradingPage = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [stock, setStock] = useState(/** @type {Stock | null} */ (null));
  const [loadingStock, setLoadingStock] = useState(true);
  const [stockError, setStockError] = useState('');

  const [watchlist, setWatchlist] = useState(/** @type {Stock[]} */ ([]));
  const [orderHistory, setOrderHistory] = useState(/** @type {Order[]} */ ([]));
  const [marketData, setMarketData] = useState(/** @type {MarketData[]} */ ([]));
  const [loadingMarket, setLoadingMarket] = useState(true);

  // 1. Fetch selected stock data
  useEffect(() => {
    const loadStock = async () => {
      if (!selectedSymbol) return;
      setLoadingStock(true);
      setStockError('');
      try {
        const data = await fetchStockData(selectedSymbol);
        setStock(data);
      } catch (error) {
        setStockError(`Failed to load data for ${selectedSymbol}.`);
        setStock(null);
      } finally {
        setLoadingStock(false);
      }
    };
    loadStock();
  }, [selectedSymbol]);

  // 2. Initial data loads (Order History, Market Data)
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [orders, market] = await Promise.all([
          fetchOrderHistory(),
          fetchMarketData(),
        ]);
        setOrderHistory(orders);
        setMarketData(market);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setLoadingMarket(false);
      }
    };
    loadInitialData();
  }, []);

  // 3. Watchlist management
  const handleAddToWatchlist = useCallback(async (symbol) => {
    if (watchlist.some(s => s.symbol === symbol)) return;
    try {
      const newStock = await fetchStockData(symbol);
      setWatchlist(prev => [...prev, newStock]);
    } catch (error) {
      console.error('Failed to add to watchlist:', error);
    }
  }, [watchlist]);

  const handleRemoveFromWatchlist = useCallback((symbol) => {
    setWatchlist(prev => prev.filter(s => s.symbol !== symbol));
  }, []);

  // 4. Order placement handler
  const handleOrderPlaced = useCallback((newOrder) => {
    setOrderHistory(prev => [newOrder, ...prev]);
  }, []);

  // 5. Initial Watchlist population (e.g., from user settings)
  useEffect(() => {
    handleAddToWatchlist('MSFT');
    handleAddToWatchlist('BTC');
  }, [handleAddToWatchlist]);


  const isPositive = stock?.changePercent >= 0;
  const priceColor = isPositive ? 'text-neo-green' : 'text-red-500';

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8">
      <Head>
        <title>Active Trader - NeoBank</title>
      </Head>

      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-white">Active Trader Dashboard</h1>
        <p className="text-gray-400">Real-time trading and market analysis.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Main Trading View (Chart, Buy/Sell, Search) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Stock Search */}
          <StockSearch onSelect={setSelectedSymbol} />

          {/* Main Stock Info and Chart */}
          <div className="bg-gray-800 rounded-lg shadow-xl p-6">
            {loadingStock ? (
              <div className="h-96 flex items-center justify-center text-gray-400">Loading {selectedSymbol} data...</div>
            ) : stockError ? (
              <div className="h-96 flex items-center justify-center text-red-500">{stockError}</div>
            ) : stock ? (
              <>
                {/* Price Header */}
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-4xl font-bold text-white">{stock.symbol}</h2>
                    <p className="text-lg text-gray-400">{stock.name}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-5xl font-extrabold ${priceColor}`}>
                      ${stock.price.toFixed(2)}
                    </p>
                    <p className={`text-xl font-semibold ${priceColor}`}>
                      {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)} ({stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
                    </p>
                  </div>
                </div>

                {/* Chart */}
                <PriceChart stock={stock} />

                {/* Trading Analytics (Responsive placement) */}
                <div className="mt-6 block xl:hidden">
                  <TradingAnalytics stock={stock} />
                </div>

                {/* Buy/Sell Interface (Responsive placement) */}
                <div className="mt-6 block xl:hidden">
                  <BuySellInterface stock={stock} onOrderPlaced={handleOrderPlaced} />
                </div>
              </>
            ) : (
              <div className="h-96 flex items-center justify-center text-gray-400">Select a symbol to view trading data.</div>
            )}
          </div>

          {/* Order History (Full width on smaller screens) */}
          <OrderHistory orders={orderHistory} />
        </div>

        {/* Right Column: Side Panels (Watchlist, Market Data, Analytics, Buy/Sell) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Buy/Sell Interface (Desktop placement) */}
          {stock && (
            <div className="hidden xl:block">
              <BuySellInterface stock={stock} onOrderPlaced={handleOrderPlaced} />
            </div>
          )}

          {/* Watchlist */}
          <Watchlist
            watchlist={watchlist}
            onSelect={setSelectedSymbol}
            onRemove={handleRemoveFromWatchlist}
          />

          {/* Market Data */}
          {loadingMarket ? (
            <div className="p-4 bg-gray-800 rounded-lg shadow-lg text-center text-gray-400">Loading Market Data...</div>
          ) : (
            <MarketDataComponent data={marketData} />
          )}

          {/* Trading Analytics (Desktop placement) */}
          {stock && (
            <div className="hidden xl:block">
              <TradingAnalytics stock={stock} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TradingPage;