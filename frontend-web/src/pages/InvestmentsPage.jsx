// InvestmentsPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { fetchInvestmentData, executeTrade, apiEndpointsUsed } from './mockData';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title);

// --- TYPES ---

interface AssetAllocationItem {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

interface PortfolioData {
  totalValue: number;
  gainLoss: number;
  gainLossPercentage: number;
  isPositive: boolean;
}

interface Holding {
  id: number;
  name: string;
  ticker: string;
  quantity: number;
  price: number;
  value: number;
  change: number;
  changePct: number;
}

interface PerformanceData {
  labels: string[];
  portfolio: number[];
  benchmark: number[];
}

interface MarketNewsItem {
  id: number;
  title: string;
  source: string;
  time: string;
}

interface InvestmentData {
  portfolio: PortfolioData;
  allocation: AssetAllocationItem[];
  holdings: Holding[];
  performance: PerformanceData;
  news: MarketNewsItem[];
}

// --- UTILITY COMPONENTS ---

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatPercentage = (percentage: number) => {
  return `${percentage.toFixed(2)}%`;
};

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white p-6 rounded-xl shadow-lg ${className}`}>
    {children}
  </div>
);

const Button: React.FC<{ children: React.ReactNode; onClick: () => void; primary?: boolean; className?: string }> = ({ children, onClick, primary = true, className = '' }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
      primary
        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
        : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
    } ${className}`}
  >
    {children}
  </button>
);

// --- FEATURE COMPONENTS ---

const PortfolioOverview: React.FC<{ data: PortfolioData }> = ({ data }) => {
  const gainLossColor = data.isPositive ? 'text-green-600' : 'text-red-600';
  const sign = data.isPositive ? '+' : '-';

  return (
    <Card>
      <h2 className="text-xl font-bold text-gray-800 mb-4">Portfolio Overview</h2>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <p className="text-sm text-gray-500">Total Portfolio Value</p>
          <p className="text-4xl font-extrabold text-gray-900">{formatCurrency(data.totalValue)}</p>
        </div>
        <div className="mt-4 md:mt-0">
          <p className="text-sm text-gray-500">24h Gain/Loss</p>
          <p className={`text-2xl font-bold ${gainLossColor}`}>
            {sign}{formatCurrency(Math.abs(data.gainLoss))} ({sign}{formatPercentage(Math.abs(data.gainLossPercentage))})
          </p>
        </div>
      </div>
    </Card>
  );
};

const AssetAllocationChart: React.FC<{ data: AssetAllocationItem[] }> = ({ data }) => {
  const chartData = {
    labels: data.map(item => item.name),
    datasets: [
      {
        data: data.map(item => item.value),
        backgroundColor: data.map(item => item.color),
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.label || '';
            const value = context.parsed;
            const percentage = data.find(item => item.name === label)?.percentage || 0;
            return ` ${label}: ${formatCurrency(value)} (${formatPercentage(percentage)})`;
          }
        }
      }
    },
  };

  return (
    <Card className="h-full flex flex-col">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Asset Allocation</h2>
      <div className="flex-grow flex justify-center items-center h-64">
        <Doughnut data={chartData} options={options} />
      </div>
    </Card>
  );
};

const PerformanceGraph: React.FC<{ data: PerformanceData }> = ({ data }) => {
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Portfolio Value',
        data: data.portfolio,
        borderColor: '#4f46e5', // indigo-600
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        tension: 0.4,
        fill: true,
      },
      {
        label: 'Benchmark (S&P 500)',
        data: data.benchmark,
        borderColor: '#9ca3af', // gray-400
        backgroundColor: 'transparent',
        tension: 0.4,
        borderDash: [5, 5],
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Portfolio Performance (Last 12 Months)',
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += formatCurrency(context.parsed.y);
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          callback: function(value: any) {
            return formatCurrency(value);
          }
        }
      }
    }
  };

  return (
    <Card className="col-span-full">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Performance</h2>
      <div className="h-80">
        <Line data={chartData} options={options} />
      </div>
    </Card>
  );
};

const InvestmentProductsList: React.FC<{ holdings: Holding[]; onTrade: (ticker: string, type: 'Buy' | 'Sell') => void }> = ({ holdings, onTrade }) => {
  return (
    <Card className="col-span-full lg:col-span-2">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Your Holdings</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asset</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">24h Change</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {holdings.map((holding) => {
              const changeColor = holding.change > 0 ? 'text-green-600' : holding.change < 0 ? 'text-red-600' : 'text-gray-600';
              const sign = holding.change > 0 ? '+' : '';
              return (
                <tr key={holding.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{holding.name}</div>
                    <div className="text-xs text-gray-500">{holding.ticker}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{holding.quantity}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(holding.value)}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${changeColor}`}>
                    {sign}{formatCurrency(holding.change)} ({sign}{formatPercentage(holding.changePct)})
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <Button primary={true} onClick={() => onTrade(holding.ticker, 'Buy')} className="!py-1 !px-3 !text-xs">Buy</Button>
                      <Button primary={false} onClick={() => onTrade(holding.ticker, 'Sell')} className="!py-1 !px-3 !text-xs">Sell</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const MarketNewsFeed: React.FC<{ news: MarketNewsItem[] }> = ({ news }) => {
  return (
    <Card className="col-span-full lg:col-span-1">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Market News</h2>
      <div className="space-y-4">
        {news.map((item) => (
          <div key={item.id} className="border-b pb-3 last:border-b-0 last:pb-0">
            <p className="text-sm font-semibold text-gray-900 hover:text-indigo-600 cursor-pointer transition-colors">{item.title}</p>
            <p className="text-xs text-gray-500 mt-1">
              <span className="font-medium">{item.source}</span> &bull; {item.time}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
};

// --- MAIN COMPONENT ---

const InvestmentsPage: React.FC = () => {
  const [data, setData] = useState<InvestmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchInvestmentData();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTrade = useCallback(async (ticker: string, type: 'Buy' | 'Sell') => {
    setTradeMessage(`Executing ${type} for ${ticker}...`);
    try {
      // Mock quantity for trade execution
      const quantity = type === 'Buy' ? 10 : 5;
      const result = await executeTrade(ticker, type, quantity);
      setTradeMessage(result.message);
      // In a real app, you would refetch data here: fetchData();
    } catch (err) {
      setTradeMessage(err instanceof Error ? err.message : 'Trade failed.');
    }
    // Clear message after a few seconds
    setTimeout(() => setTradeMessage(null), 5000);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="text-lg font-medium text-indigo-600">Loading investment data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <Card className="bg-red-100 border border-red-400 text-red-700">
          <h2 className="text-xl font-bold mb-2">Error Loading Data</h2>
          <p>{error}</p>
          <Button onClick={fetchData} primary={true} className="mt-4">Try Again</Button>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null; // Should not happen if error handling is correct
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900">My Investments Dashboard</h1>
        <p className="text-gray-500">A comprehensive overview of your portfolio and market activity.</p>
      </header>

      {tradeMessage && (
        <div className={`p-4 mb-4 rounded-lg text-sm font-medium ${tradeMessage.includes('Successfully') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
          {tradeMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Row 1: Overview and Allocation */}
        <div className="lg:col-span-2">
          <PortfolioOverview data={data.portfolio} />
        </div>
        <div className="lg:col-span-1 row-span-2">
          <AssetAllocationChart data={data.allocation} />
        </div>

        {/* Row 2: Performance Graph (Full Width) */}
        <div className="lg:col-span-2">
          <PerformanceGraph data={data.performance} />
        </div>

        {/* Row 3: Holdings List and News Feed */}
        <InvestmentProductsList holdings={data.holdings} onTrade={handleTrade} />
        <MarketNewsFeed news={data.news} />
      </div>
    </div>
  );
};

export default InvestmentsPage;
