import React, { useState, useEffect, useCallback, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// Mock Service Imports (as required by the prompt)
import AuthService from '../services/AuthService';
import ApiService from '../services/ApiService';
import NotificationService from '../services/NotificationService';

// Mock UI Component Imports (as required by the prompt)
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import OfflineIndicator from '../components/ui/OfflineIndicator';

// Mock Context for demonstration of useContext
const AppContext = React.createContext({ isOnline: true, user: { name: 'NeoBank User' } });

// Mock Data Structure for Accounts
const mockAccounts = [
  { id: 'acc-1001', name: 'Neo Savings', type: 'Savings', balance: 12500.50, currency: 'USD', accountNumber: '**** 1234' },
  { id: 'acc-1002', name: 'Neo Current', type: 'Current', balance: 3450.75, currency: 'USD', accountNumber: '**** 5678' },
  { id: 'acc-1003', name: 'Neo Investment', type: 'Investment', balance: 55000.00, currency: 'USD', accountNumber: '**** 9012' },
];

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isOnline } = useContext(AppContext); // Use mock context

  const navigate = useNavigate();

  // 1. Data Fetching and State Management (useEffect)
  const fetchAccounts = useCallback(async () => {
    if (!isOnline) {
      setError('You are offline. Cannot fetch the latest account data.');
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    try {
      // Simulate API call to fetch accounts
      // const token = AuthService.getToken();
      // const response = await ApiService.get('/accounts', { headers: { Authorization: `Bearer ${token}` } });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Use mock data for now
      const response = { data: mockAccounts };

      setAccounts(response.data);
      setError(null);
      NotificationService.success('Account data loaded successfully.');
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
      setError('Failed to load accounts. Please try again later.');
      NotificationService.error('Failed to load accounts.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isOnline]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // 2. Event Handlers (Feature Parity: View Details, Refresh)
  const handleViewDetails = (accountId) => {
    // Feature Parity: Navigation to a specific account detail screen
    navigate(`/accounts/${accountId}`);
  };

  const handleRefresh = () => {
    if (isRefreshing || isLoading) return;
    setIsRefreshing(true);
    fetchAccounts();
  };

  // 3. Render Logic (Loading, Error, Empty, Data)

  // Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-4">
        <Spinner size="lg" />
        <p className="mt-4 text-lg text-gray-600">Loading your accounts...</p>
      </div>
    );
  }

  // Error State
  if (error && accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-4 text-center">
        <h2 className="text-xl font-semibold text-red-600 mb-4">Error Loading Data</h2>
        <p className="text-gray-700 mb-6">{error}</p>
        <Button onClick={handleRefresh} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing...' : 'Try Again'}
        </Button>
        <OfflineIndicator isOnline={isOnline} />
      </div>
    );
  }

  // Empty State
  if (accounts.length === 0 && !isLoading && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-4 text-center">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">No Accounts Found</h2>
        <p className="text-gray-600 mb-6">It looks like you haven't opened any accounts yet.</p>
        <Link to="/open-account">
          <Button>Open a New Account</Button>
        </Link>
        <OfflineIndicator isOnline={isOnline} />
      </div>
    );
  }

  // Main Content Render
  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      {/* Offline Support Indicator */}
      <OfflineIndicator isOnline={isOnline} />

      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Your Accounts</h1>
        <Button 
          onClick={handleRefresh} 
          disabled={isRefreshing}
          className="flex items-center space-x-1 bg-white text-blue-600 border border-blue-600 hover:bg-blue-50"
        >
          <svg className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
        </Button>
      </header>

      {/* Displaying a general error message if data is partially loaded or stale */}
      {error && accounts.length > 0 && (
        <div className="p-3 mb-4 text-sm text-yellow-700 bg-yellow-100 rounded-lg" role="alert">
          <span className="font-medium">Warning:</span> {error} Displaying cached/stale data.
        </div>
      )}

      <div className="space-y-4">
        {accounts.map((account) => (
          <Card key={account.id} className="p-4 shadow-lg hover:shadow-xl transition duration-300">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold text-gray-800">{account.name}</h2>
                <p className="text-sm text-gray-500">{account.type} Account</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-600">{account.currency} {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-gray-400">Available Balance</p>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
              <p className="text-sm text-gray-600">Account No: {account.accountNumber}</p>
              <Button 
                onClick={() => handleViewDetails(account.id)}
                className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700"
              >
                View Details
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Feature Parity: Quick Actions (e.g., Transfer, Pay Bills) */}
      <div className="mt-8 p-4 bg-white rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Quick Actions</h3>
        <div className="flex justify-around space-x-2">
          <Link to="/transfer" className="flex-1">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700">Transfer</Button>
          </Link>
          <Link to="/pay-bills" className="flex-1">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700">Pay Bills</Button>
          </Link>
          <Link to="/statements" className="flex-1 hidden sm:block">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700">Statements</Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Accounts;