import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
// Mock imports for required services and UI components
// In a real project, these would be actual files.
import { useAuth } from '../services/AuthService'; // Assuming a context hook for auth
import { useApi } from '../services/ApiService'; // Assuming a context hook for API
import { useNotification } from '../services/NotificationService'; // Assuming a context hook for notifications

// UI Components (Mocked)
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { Tabs, TabItem } from '../components/ui/Tabs';
import { Icon } from '../components/ui/Icon'; // Assuming an Icon component

// --- Type Definitions ---

interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number;
}

interface PortfolioItem {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentValue: number;
  gainLoss: number;
}

interface TradeForm {
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
}

// --- Mock Data and Constants ---

const MOCK_STOCKS: Stock[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 175.45, change: 1.23, changePercent: 0.71, marketCap: 2800000000000 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 135.90, change: -0.55, changePercent: -0.40, marketCap: 1700000000000 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 350.10, change: 2.80, changePercent: 0.81, marketCap: 2600000000000 },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 250.00, change: -5.00, changePercent: -1.96, marketCap: 790000000000 },
];

const MOCK_PORTFOLIO: PortfolioItem[] = [
  { symbol: 'AAPL', quantity: 10, averagePrice: 160.00, currentValue: 1754.50, gainLoss: 154.50 },
  { symbol: 'MSFT', quantity: 5, averagePrice: 340.00, currentValue: 1750.50, gainLoss: 50.50 },
];

const MOCK_WATCHLIST: string[] = ['GOOGL', 'TSLA'];

// --- Utility Functions ---

const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const formatPercent = (value: number) => `${value.toFixed(2)}%`;

// --- Component Definition ---

const StockTradingScreen: React.FC = () => {
  const navigate = useNavigate();
  // Service Hooks (Mocked usage)
  const { isAuthenticated } = useAuth();
  const { fetchData, postData } = useApi();
  const { notify } = useNotification();

  // State Management
  const [activeTab, setActiveTab] = useState<'market' | 'portfolio' | 'watchlist'>('market');
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Trade Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tradeForm, setTradeForm] = useState<TradeForm>({ symbol: '', type: 'BUY', quantity: 0, price: 0 });
  const [formError, setFormError] = useState<string | null>(null);

  // --- Data Fetching (useEffect) ---

  const loadData = useCallback(async () => {
    if (!isAuthenticated) {
      setError('Please log in to view your trading data.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Simulate API calls
      const [stocksData, portfolioData, watchlistData] = await Promise.all([
        fetchData('/stocks/market'), // Mocked API call
        fetchData('/user/portfolio'),
        fetchData('/user/watchlist'),
      ]);

      setStocks(stocksData || MOCK_STOCKS);
      setPortfolio(portfolioData || MOCK_PORTFOLIO);
      setWatchlist(watchlistData || MOCK_WATCHLIST);
    } catch (err) {
      console.error('Failed to load trading data:', err);
      setError('Failed to load trading data. Please try again.');
      notify('error', 'Data loading failed.');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, fetchData, notify]);

  useEffect(() => {
    loadData();

    // Offline/Online status listener
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadData]);

  // --- Event Handlers and Logic ---

  const handleTradeClick = useCallback((symbol: string, price: number) => {
    setTradeForm({ symbol, type: 'BUY', quantity: 1, price });
    setFormError(null);
    setIsModalOpen(true);
  }, []);

  const handleTradeFormChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setTradeForm(prev => ({
      ...prev,
      [name]: name === 'quantity' ? parseInt(value) || 0 : value,
    }));
    setFormError(null);
  }, []);

  const validateTradeForm = useCallback((): boolean => {
    if (!tradeForm.symbol || tradeForm.quantity <= 0) {
      setFormError('Please select a stock and enter a valid quantity.');
      return false;
    }
    // Basic mock validation: check if user has enough funds/shares
    if (tradeForm.type === 'SELL') {
      const holding = portfolio.find(item => item.symbol === tradeForm.symbol);
      if (!holding || holding.quantity < tradeForm.quantity) {
        setFormError(`You only hold ${holding?.quantity || 0} shares of ${tradeForm.symbol}.`);
        return false;
      }
    }
    setFormError(null);
    return true;
  }, [tradeForm, portfolio]);

  const handleExecuteTrade = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateTradeForm()) return;

    try {
      // Simulate trade execution API call
      const response = await postData('/trade/execute', tradeForm);
      if (response.success) {
        notify('success', `${tradeForm.type} order for ${tradeForm.quantity} shares of ${tradeForm.symbol} executed successfully!`);
        setIsModalOpen(false);
        loadData(); // Refresh data
      } else {
        setFormError(response.message || 'Trade execution failed.');
        notify('error', 'Trade failed.');
      }
    } catch (err) {
      setFormError('An unexpected error occurred during trade execution.');
      notify('error', 'Trade failed due to network error.');
    }
  }, [tradeForm, validateTradeForm, postData, notify, loadData]);

  const handleWatchlistToggle = useCallback(async (symbol: string) => {
    const isWatching = watchlist.includes(symbol);
    const endpoint = isWatching ? '/user/watchlist/remove' : '/user/watchlist/add';
    const action = isWatching ? 'Removed from' : 'Added to';

    try {
      const response = await postData(endpoint, { symbol });
      if (response.success) {
        setWatchlist(prev => isWatching ? prev.filter(s => s !== symbol) : [...prev, symbol]);
        notify('info', `${symbol} ${action} watchlist.`);
      } else {
        notify('error', `Failed to update watchlist for ${symbol}.`);
      }
    } catch (err) {
      notify('error', 'Network error while updating watchlist.');
    }
  }, [watchlist, postData, notify]);

  // --- Computed Values ---

  const totalPortfolioValue = useMemo(() =>
    portfolio.reduce((sum, item) => sum + item.currentValue, 0),
    [portfolio]
  );

  const watchlistStocks = useMemo(() =>
    stocks.filter(stock => watchlist.includes(stock.symbol)),
    [stocks, watchlist]
  );

  // --- Render Helpers ---

  const renderStockList = (list: Stock[], showWatchlistToggle: boolean = true) => {
    if (list.length === 0) {
      return <div className="text-center py-8 text-gray-500">No stocks found.</div>;
    }

    return (
      <div className="space-y-3">
        {list.map(stock => {
          const isPositive = stock.change >= 0;
          const changeColor = isPositive ? 'text-green-600' : 'text-red-600';
          const changeIcon = isPositive ? 'arrow-up' : 'arrow-down';

          return (
            <Card key={stock.symbol} className="p-4 flex justify-between items-center shadow-md">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold truncate">{stock.symbol}</h3>
                <p className="text-sm text-gray-500 truncate">{stock.name}</p>
              </div>
              <div className="text-right mx-4">
                <p className="text-lg font-bold">{formatCurrency(stock.price)}</p>
                <p className={`text-sm font-medium ${changeColor}`}>
                  <Icon name={changeIcon} className="inline-block w-3 h-3 mr-1" />
                  {formatCurrency(stock.change)} ({formatPercent(stock.changePercent)})
                </p>
              </div>
              <div className="flex space-x-2">
                {showWatchlistToggle && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleWatchlistToggle(stock.symbol)}
                    aria-label={watchlist.includes(stock.symbol) ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  >
                    <Icon name={watchlist.includes(stock.symbol) ? 'star-filled' : 'star-outline'} className="w-5 h-5" />
                  </Button>
                )}
                <Button size="sm" onClick={() => handleTradeClick(stock.symbol, stock.price)}>Trade</Button>
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderPortfolio = () => {
    if (portfolio.length === 0) {
      return (
        <div className="text-center py-12">
          <Icon name="wallet" className="w-10 h-10 mx-auto text-gray-400 mb-3" />
          <p className="text-lg text-gray-600">Your portfolio is empty.</p>
          <p className="text-sm text-gray-500">Start trading to build your investments!</p>
          <Button className="mt-4" onClick={() => setActiveTab('market')}>Explore Market</Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <Card className="p-4 bg-blue-50 text-blue-800 shadow-lg">
          <p className="text-sm font-medium">Total Portfolio Value</p>
          <h2 className="text-3xl font-bold">{formatCurrency(totalPortfolioValue)}</h2>
        </Card>
        <div className="space-y-3">
          {portfolio.map(item => {
            const stock = stocks.find(s => s.symbol === item.symbol);
            const isPositive = item.gainLoss >= 0;
            const gainLossColor = isPositive ? 'text-green-600' : 'text-red-600';

            return (
              <Card key={item.symbol} className="p-4 flex justify-between items-center shadow-md">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold truncate">{item.symbol}</h3>
                  <p className="text-sm text-gray-500 truncate">{stock?.name || 'N/A'}</p>
                </div>
                <div className="text-right mx-4">
                  <p className="text-base font-medium">Qty: {item.quantity}</p>
                  <p className="text-base font-bold">{formatCurrency(item.currentValue)}</p>
                  <p className={`text-sm font-medium ${gainLossColor}`}>
                    {item.gainLoss > 0 ? '+' : ''}{formatCurrency(item.gainLoss)}
                  </p>
                </div>
                <Button size="sm" onClick={() => handleTradeClick(item.symbol, stock?.price || 0)}>Trade</Button>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  // --- Main Render ---

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <Spinner size="lg" />
        <p className="mt-4 text-gray-600">Loading trading data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center bg-red-100 border border-red-400 text-red-700 rounded-lg m-4">
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p className="mb-4">{error}</p>
        <Button onClick={loadData}>Try Again</Button>
        <Link to="/login" className="ml-4 text-blue-600 hover:underline">Go to Login</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      {/* Header and Offline Indicator (Mobile-first) */}
      <header className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Stock Trading</h1>
        {isOffline && (
          <div className="flex items-center text-sm text-red-500 bg-red-100 p-2 rounded-full">
            <Icon name="wifi-off" className="w-4 h-4 mr-1" />
            Offline
          </div>
        )}
      </header>

      {/* Tabs for Navigation */}
      <Tabs activeTab={activeTab} onTabChange={setActiveTab}>
        <TabItem id="market" title="Market" />
        <TabItem id="portfolio" title="Portfolio" />
        <TabItem id="watchlist" title="Watchlist" />
      </Tabs>

      <main className="mt-4 pb-20"> {/* pb-20 for mobile bottom spacing */}
        {activeTab === 'market' && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Top Market Movers</h2>
            {renderStockList(stocks, true)}
          </section>
        )}

        {activeTab === 'portfolio' && (
          <section>
            <h2 className="text-xl font-semibold mb-4">My Portfolio</h2>
            {renderPortfolio()}
          </section>
        )}

        {activeTab === 'watchlist' && (
          <section>
            <h2 className="text-xl font-semibold mb-4">My Watchlist</h2>
            {renderStockList(watchlistStocks, true)}
            {watchlistStocks.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                Your watchlist is empty. Add stocks from the Market tab.
              </div>
            )}
          </section>
        )}
      </main>

      {/* Trade Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`${tradeForm.type} ${tradeForm.symbol}`}>
        <form onSubmit={handleExecuteTrade} className="space-y-4">
          <div className="flex space-x-4">
            <div className="flex-1">
              <label htmlFor="type" className="block text-sm font-medium text-gray-700">Action</label>
              <select
                id="type"
                name="type"
                value={tradeForm.type}
                onChange={handleTradeFormChange}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">Quantity</label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                value={tradeForm.quantity}
                onChange={handleTradeFormChange}
                placeholder="0"
                required
              />
            </div>
          </div>

          <div className="flex space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Current Price</label>
              <p className="mt-1 p-2 border border-gray-200 rounded-md bg-gray-50">{formatCurrency(tradeForm.price)}</p>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Estimated Total</label>
              <p className="mt-1 p-2 border border-gray-200 rounded-md bg-gray-50 font-bold">
                {formatCurrency(tradeForm.quantity * tradeForm.price)}
              </p>
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded-md">{formError}</p>
          )}

          <div className="flex justify-end space-x-3 pt-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} type="button">Cancel</Button>
            <Button type="submit" variant={tradeForm.type === 'BUY' ? 'primary' : 'danger'}>
              Execute {tradeForm.type}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// Mock components for completeness (assuming they exist in ../components/ui/)
// In a real scenario, these would be imported from a UI library.
const MockComponent: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => <div className={className}>{children}</div>;
const MockButton: React.FC<any> = ({ children, onClick, className, variant = 'primary', size = 'md', ...props }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-md font-medium transition-colors ${className} ${
      variant === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700' :
      variant === 'secondary' ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' :
      variant === 'danger' ? 'bg-red-600 text-white hover:bg-red-700' :
      'text-blue-600 hover:bg-blue-50'
    } ${size === 'sm' ? 'text-sm' : 'text-base'}`}
    {...props}
  >
    {children}
  </button>
);
const MockInput: React.FC<any> = (props) => <input className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" {...props} />;
const MockSpinner: React.FC<any> = () => <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>;
const MockModal: React.FC<any> = ({ isOpen, onClose, title, children }) => isOpen ? (
  <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-md m-4">
      <div className="flex justify-between items-center p-4 border-b">
        <h3 className="text-xl font-semibold">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  </div>
) : null;
const MockTabs: React.FC<any> = ({ activeTab, onTabChange, children }) => (
  <div className="border-b border-gray-200">
    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && child.type === MockTabItem) {
          const isActive = child.props.id === activeTab;
          return (
            <button
              key={child.props.id}
              onClick={() => onTabChange(child.props.id)}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                isActive
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {child.props.title}
            </button>
          );
        }
        return null;
      })}
    </nav>
  </div>
);
const MockTabItem: React.FC<any> = () => null;
const MockIcon: React.FC<any> = ({ name, className }) => <span className={className} role="img" aria-label={name}>*</span>; // Simple mock icon

// Re-exporting mocks to satisfy imports
const Card = MockComponent;
const Button = MockButton;
const Input = MockInput;
const Spinner = MockSpinner;
const Modal = MockModal;
const Tabs = MockTabs;
const TabItem = MockTabItem;
const Icon = MockIcon;

// Mock Service Hooks
const useAuth = () => ({ isAuthenticated: true });
const useApi = () => ({
  fetchData: async (url: string) => {
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
    if (url.includes('market')) return MOCK_STOCKS;
    if (url.includes('portfolio')) return MOCK_PORTFOLIO;
    if (url.includes('watchlist')) return MOCK_WATCHLIST;
    return {};
  },
  postData: async (url: string, data: any) => {
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay
    console.log(`Mock API POST to ${url} with data:`, data);
    return { success: true, message: 'Operation successful' };
  }
});
const useNotification = () => ({
  notify: (type: 'success' | 'error' | 'info', message: string) => console.log(`[${type.toUpperCase()}] Notification: ${message}`)
});


export default StockTradingScreen;

// Approximate lines of code: 350 (including types, mocks, and component logic)