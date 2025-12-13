import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import ApiService from '../services/ApiService';
import AuthService from '../services/AuthService';
import NotificationService from '../services/NotificationService';
import { AppContext } from '../context/AppContext';
import { Card, Button, Chart, Spinner, ErrorMessage, EmptyState, OfflineIndicator, Icon, Tab, TabPanel } from '../components/ui/';

const Investments = () => {
  const [portfolio, setPortfolio] = useState(null);
  const [exchanges, setExchanges] = useState([]);
  const [commodities, setCommodities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();

  const { isOffline } = useContext(AppContext) || { isOffline: false };

  const fetchPortfolioData = useCallback(async () => {
    if (isOffline) {
      setIsLoading(false);
      setError('You are offline. Cannot fetch the latest portfolio data.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [portfolioData, exchangesData, commoditiesData] = await Promise.all([
        ApiService.getPortfolio(),
        ApiService.getExchanges(),
        ApiService.getCommodities(),
      ]);
      
      setPortfolio(portfolioData);
      setExchanges(exchangesData.exchanges || []);
      setCommodities(commoditiesData.commodities || []);

      NotificationService.success('Portfolio data updated successfully.');
    } catch (err) {
      console.error('Error fetching portfolio:', err);
      setError('Failed to load investment portfolio. Please try again.');
      NotificationService.error('Failed to load portfolio.');
    } finally {
      setIsLoading(false);
    }
  }, [isOffline]);

  useEffect(() => {
    // Check authentication status first (feature parity with native)
    if (!AuthService.isAuthenticated()) {
      navigate('/login');
      return;
    }
    fetchPortfolioData();
  }, [fetchPortfolioData, navigate]);

  const handleRefresh = () => {
    fetchPortfolioData();
  };

  const handleAssetClick = (symbol) => {
    navigate(`/investments/asset/${symbol}`);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const renderPortfolioSummary = () => {
    if (!portfolio) return null;

    const isPositive = portfolio.performance >= 0;
    const performanceColor = isPositive ? 'text-green-500' : 'text-red-500';
    const performanceIcon = isPositive ? 'arrow-up' : 'arrow-down';

    return (
      <Card className="p-4 mb-4 shadow-lg">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-gray-500">Total Portfolio Value</p>
            <h2 className="text-3xl font-bold text-gray-900 mt-1">
              {formatCurrency(portfolio.totalValue)}
            </h2>
          </div>
          <Button onClick={handleRefresh} variant="ghost" className="p-2">
            <Icon name="refresh" className="w-5 h-5 text-gray-500" />
          </Button>
        </div>
        <div className="mt-3 flex items-center">
          <Icon name={performanceIcon} className={`w-4 h-4 mr-1 ${performanceColor}`} />
          <p className={`text-lg font-semibold ${performanceColor}`}>
            {portfolio.performance.toFixed(2)}%
          </p>
          <span className="text-sm text-gray-500 ml-2">({portfolio.performancePeriod})</span>
        </div>
      </Card>
    );
  };

  const renderPerformanceChart = () => {
    if (!portfolio || !portfolio.chartData) return null;
    return (
      <Card className="p-4 mb-4 shadow-lg">
        <h3 className="text-xl font-semibold mb-3">Performance Over Time</h3>
        {/* Chart component from UI library, assuming it handles chart rendering */}
        <Chart data={portfolio.chartData} type="line" />
        <div className="flex justify-around mt-4 text-sm text-gray-600">
          <Tab 
            isActive={portfolio.performancePeriod === '7d'} 
            onClick={() => {/* setActivePeriod('7d') */}}
          >
            7D
          </Tab>
          <Tab 
            isActive={portfolio.performancePeriod === '30d'} 
            onClick={() => {/* setActivePeriod('30d') */}}
          >
            30D
          </Tab>
          <Tab 
            isActive={portfolio.performancePeriod === '1y'} 
            onClick={() => {/* setActivePeriod('1y') */}}
          >
            1Y
          </Tab>
          <Tab 
            isActive={portfolio.performancePeriod === 'all'} 
            onClick={() => {/* setActivePeriod('all') */}}
          >
            ALL
          </Tab>
        </div>
      </Card>
    );
  };

  const renderAssetList = (assets) => (
    <div className="space-y-2">
      {assets.map((asset) => {
        const isPositive = asset.change >= 0;
        const changeColor = isPositive ? 'text-green-500' : 'text-red-500';
        const changeSign = isPositive ? '+' : '';

        return (
          <Card 
            key={asset.id} 
            className="p-3 flex justify-between items-center active:bg-gray-50 cursor-pointer"
            onClick={() => handleAssetClick(asset.symbol)}
          >
            <div className="flex items-center">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                <Icon name={asset.type === 'Stock' ? 'stock' : 'crypto'} className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{asset.name}</p>
                <p className="text-sm text-gray-500">{asset.symbol}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-900">{formatCurrency(asset.value)}</p>
              <p className={`text-sm ${changeColor}`}>
                {changeSign}{asset.change.toFixed(2)}%
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <Spinner size="lg" />
          <p className="ml-3 text-gray-600">Loading portfolio data...</p>
        </div>
      );
    }

    if (error) {
      return (
        <ErrorMessage 
          title="Connection Error" 
          message={error} 
          onRetry={handleRefresh} 
        />
      );
    }

    if (!portfolio || portfolio.assets.length === 0) {
      return (
        <EmptyState
          title="No Investments Found"
          message="It looks like you haven't made any investments yet. Start building your portfolio!"
          action={<Button onClick={() => navigate('/investments/explore')}>Explore Assets</Button>}
        />
      );
    }

    const stocks = portfolio.assets.filter(a => a.type === 'Stock');
    const crypto = portfolio.assets.filter(a => a.type === 'Crypto');

    return (
      <>
        {renderPortfolioSummary()}
        {renderPerformanceChart()}

        <Card className="p-0 mb-4 shadow-lg">
          <div className="flex border-b border-gray-200">
            <Tab isActive={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
              Overview
            </Tab>
            <Tab isActive={activeTab === 'stocks'} onClick={() => setActiveTab('stocks')}>
              Stocks ({stocks.length})
            </Tab>
            <Tab isActive={activeTab === 'crypto'} onClick={() => setActiveTab('crypto')}>
              Crypto ({crypto.length})
            </Tab>
          </div>
          <div className="p-4">
            <TabPanel isActive={activeTab === 'overview'}>
              <h3 className="text-xl font-semibold mb-3">All Assets</h3>
              {renderAssetList(portfolio.assets)}
            </TabPanel>
            <TabPanel isActive={activeTab === 'stocks'}>
              <h3 className="text-xl font-semibold mb-3">Stock Holdings</h3>
              {stocks.length > 0 ? renderAssetList(stocks) : <p className="text-gray-500">No stock holdings.</p>}
            </TabPanel>
            <TabPanel isActive={activeTab === 'crypto'}>
              <h3 className="text-xl font-semibold mb-3">Crypto Holdings</h3>
              {crypto.length > 0 ? renderAssetList(crypto) : <p className="text-gray-500">No crypto holdings.</p>}
            </TabPanel>
          </div>
        </Card>

        <div className="p-4">
          <Button onClick={() => navigate('/investments/explore')} className="w-full">
            Explore & Invest
          </Button>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pt-0">
      {/* Mobile-first: Fixed header for navigation and title */}
      <header className="sticky top-0 bg-white shadow-md p-4 z-10">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Investments</h1>
          <Link to="/settings" className="text-blue-600">
            <Icon name="settings" className="w-6 h-6" />
          </Link>
        </div>
        {/* Offline Indicator - Feature Parity */}
        <OfflineIndicator isOffline={isOffline} className="mt-2" />
      </header>

      <main className="mt-4 pb-20">
        {renderContent()}
      </main>

      {/* Mobile-first: Fixed bottom navigation (optional, but common in PWAs) */}
      {/* Assuming a separate BottomNav component is used here in a real app */}
    </div>
  );
};

// Assuming Icon, Tab, TabPanel are simple UI components that accept props and apply Tailwind classes
// Example of a simple Icon component (not included in final code, just for context)
/*
const Icon = ({ name, className }) => {
  // Logic to render different SVG icons based on 'name'
  return <svg className={className} />;
};
*/

export default Investments;
