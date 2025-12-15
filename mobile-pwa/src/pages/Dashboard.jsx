import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { NotificationContext } from '../contexts/NotificationContext';
import LoadingSpinner from '../components/LoadingSpinner';

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const { addNotification } = useContext(NotificationContext);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    accounts: [],
    recentTransactions: [],
    insurancePolicies: [],
    quickStats: {}
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Simulate API calls
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setDashboardData({
        accounts: [
          {
            id: 1,
            name: 'Savings Account',
            type: 'savings',
            balance: 2450000,
            currency: 'NGN',
            accountNumber: '1234567890'
          },
          {
            id: 2,
            name: 'Current Account',
            type: 'current',
            balance: 850000,
            currency: 'NGN',
            accountNumber: '0987654321'
          },
          {
            id: 3,
            name: 'USD Account',
            type: 'foreign',
            balance: 1250,
            currency: 'USD',
            accountNumber: '1122334455'
          }
        ],
        recentTransactions: [
          {
            id: 1,
            type: 'credit',
            amount: 50000,
            currency: 'NGN',
            description: 'Salary Payment',
            date: new Date(Date.now() - 86400000),
            status: 'completed'
          },
          {
            id: 2,
            type: 'debit',
            amount: 15000,
            currency: 'NGN',
            description: 'Insurance Premium - Crop Insurance',
            date: new Date(Date.now() - 172800000),
            status: 'completed'
          },
          {
            id: 3,
            type: 'credit',
            amount: 25000,
            currency: 'NGN',
            description: 'Insurance Payout - Flight Delay',
            date: new Date(Date.now() - 259200000),
            status: 'completed'
          }
        ],
        insurancePolicies: [
          {
            id: 1,
            type: 'crop',
            name: 'Cassava Crop Insurance',
            premium: 15000,
            coverage: 500000,
            status: 'active',
            expiryDate: new Date(Date.now() + 30 * 86400000),
            claimsCount: 0
          },
          {
            id: 2,
            type: 'flight',
            name: 'Flight Delay Insurance',
            premium: 3500,
            coverage: 50000,
            status: 'claimed',
            expiryDate: new Date(Date.now() - 86400000),
            claimsCount: 1
          },
          {
            id: 3,
            type: 'health',
            name: 'Health Micro Insurance',
            premium: 18000,
            coverage: 300000,
            status: 'active',
            expiryDate: new Date(Date.now() + 180 * 86400000),
            claimsCount: 0
          }
        ],
        quickStats: {
          totalBalance: 3300000,
          monthlyIncome: 150000,
          monthlyExpenses: 85000,
          insuranceCoverage: 850000,
          activePolicies: 2,
          pendingClaims: 0
        }
      });
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load dashboard data'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount, currency = 'NGN') => {
    if (currency === 'NGN') {
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0
      }).format(amount);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getInsuranceIcon = (type) => {
    switch (type) {
      case 'crop': return 'wheat';
      case 'flight': return 'plane';
      case 'health': return 'heart-pulse';
      default: return 'shield';
    }
  };

  const getInsuranceColor = (type) => {
    switch (type) {
      case 'crop': return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'flight': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'health': return 'text-red-600 bg-red-100 dark:bg-red-900/20';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display">
              Welcome back, {user?.name || 'User'}!
            </h1>
            <p className="text-primary-100 mt-1">
              Your financial overview for {new Date().toLocaleDateString('en-NG', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
          <div className="hidden md:block">
            <div className="h-16 w-16 bg-white/20 rounded-full flex items-center justify-center">
              <i data-lucide="trending-up" className="h-8 w-8"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="h-12 w-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
              <i data-lucide="wallet" className="h-6 w-6 text-green-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Balance</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(dashboardData.quickStats.totalBalance)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <i data-lucide="shield-check" className="h-6 w-6 text-blue-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Insurance Coverage</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(dashboardData.quickStats.insuranceCoverage)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
              <i data-lucide="file-text" className="h-6 w-6 text-purple-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Policies</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {dashboardData.quickStats.activePolicies}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="h-12 w-12 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg flex items-center justify-center">
              <i data-lucide="clock" className="h-6 w-6 text-yellow-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Pending Claims</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {dashboardData.quickStats.pendingClaims}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accounts Overview */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Account Overview
                </h2>
                <Link
                  to="/banking"
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-500 text-sm font-medium"
                >
                  View all
                </Link>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {dashboardData.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex items-center">
                      <div className="h-10 w-10 bg-primary-100 dark:bg-primary-900/20 rounded-lg flex items-center justify-center">
                        <i data-lucide="building-2" className="h-5 w-5 text-primary-600"></i>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {account.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {account.accountNumber}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(account.balance, account.currency)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                        {account.type} account
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          {/* Quick Actions Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Quick Actions
              </h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <Link
                  to="/transfers"
                  className="flex flex-col items-center p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                >
                  <i data-lucide="send" className="h-6 w-6 text-primary-600 mb-2"></i>
                  <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                    Send Money
                  </span>
                </Link>
                
                <Link
                  to="/insurance/quote"
                  className="flex flex-col items-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                >
                  <i data-lucide="shield-plus" className="h-6 w-6 text-green-600 mb-2"></i>
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    Get Insurance
                  </span>
                </Link>
                
                <Link
                  to="/cards"
                  className="flex flex-col items-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                >
                  <i data-lucide="credit-card" className="h-6 w-6 text-purple-600 mb-2"></i>
                  <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    Cards
                  </span>
                </Link>
                
                <Link
                  to="/investments"
                  className="flex flex-col items-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
                >
                  <i data-lucide="trending-up" className="h-6 w-6 text-yellow-600 mb-2"></i>
                  <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                    Invest
                  </span>
                </Link>
              </div>
            </div>
          </div>

          {/* Insurance Policies Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Insurance Policies
                </h2>
                <Link
                  to="/insurance"
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-500 text-sm font-medium"
                >
                  View all
                </Link>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {dashboardData.insurancePolicies.slice(0, 3).map((policy) => (
                  <div
                    key={policy.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex items-center">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${getInsuranceColor(policy.type)}`}>
                        <i data-lucide={getInsuranceIcon(policy.type)} className="h-4 w-4"></i>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {policy.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatCurrency(policy.coverage)} coverage
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        policy.status === 'active'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : policy.status === 'claimed'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                      }`}>
                        {policy.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Transactions
            </h2>
            <Link
              to="/banking"
              className="text-primary-600 dark:text-primary-400 hover:text-primary-500 text-sm font-medium"
            >
              View all
            </Link>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {dashboardData.recentTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    transaction.type === 'credit'
                      ? 'bg-green-100 dark:bg-green-900/20'
                      : 'bg-red-100 dark:bg-red-900/20'
                  }`}>
                    <i
                      data-lucide={transaction.type === 'credit' ? 'arrow-down-left' : 'arrow-up-right'}
                      className={`h-5 w-5 ${
                        transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                      }`}
                    ></i>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {transaction.description}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {transaction.date.toLocaleDateString('en-NG')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-semibold ${
                    transaction.type === 'credit'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}>
                    {transaction.type === 'credit' ? '+' : '-'}
                    {formatCurrency(transaction.amount, transaction.currency)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {transaction.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

