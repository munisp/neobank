// Mock investment data service for InvestmentsPage.

const investmentData = {
  portfolio: {
    totalValue: 128450.75,
    gainLoss: 8432.1,
    gainLossPercentage: 7.02,
    isPositive: true,
  },
  allocation: [
    { name: 'Stocks', value: 72000, percentage: 56, color: '#4f46e5' },
    { name: 'Bonds', value: 28000, percentage: 22, color: '#16a34a' },
    { name: 'Crypto', value: 15450.75, percentage: 12, color: '#f59e0b' },
    { name: 'Cash', value: 13000, percentage: 10, color: '#64748b' },
  ],
  performance: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    portfolio: [100, 104, 102, 109, 115, 121],
    benchmark: [100, 102, 101, 105, 108, 111],
  },
  holdings: [
    { id: 1, name: 'Apple Inc.', ticker: 'AAPL', quantity: 40, price: 175.45, value: 7018, change: 1.2, changePct: 0.71 },
    { id: 2, name: 'Microsoft Corp.', ticker: 'MSFT', quantity: 18, price: 350.1, value: 6301.8, change: 2.8, changePct: 0.81 },
    { id: 3, name: 'Tesla Inc.', ticker: 'TSLA', quantity: 12, price: 250, value: 3000, change: -5, changePct: -1.96 },
  ],
  news: [
    { id: 1, title: 'Markets rally as inflation cools', source: 'NeoBank Research', time: '2h ago' },
    { id: 2, title: 'Tech earnings beat expectations', source: 'Market Wire', time: '5h ago' },
  ],
};

export async function fetchInvestmentData() {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return investmentData;
}

export async function executeTrade(ticker, type, quantity) {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return { success: true, message: `${type} order for ${quantity} ${ticker} executed.` };
}

export const apiEndpointsUsed = ['/investments/portfolio', '/investments/trade'];
