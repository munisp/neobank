// src/pages/TransactionsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';

// Services
import ApiService from '../services/ApiService';
import AuthService from '../services/AuthService';
import NotificationService from '../services/NotificationService';

// UI Components
import { Header, Input, Button, Select, Modal, Icon, Spinner, Card, OfflineIndicator } from '../components/ui';

// Helper function for formatting currency
const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

// Transaction Item Component
const TransactionItem = ({ transaction, onClick }) => {
  const isCredit = transaction.amount > 0;
  const amountColor = isCredit ? 'text-green-600' : 'text-red-600';
  const sign = isCredit ? '+' : '-';

  return (
    <li
      className="flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
      onClick={() => onClick(transaction)}
    >
      <div className="flex items-center space-x-3">
        <div className="p-2 rounded-full bg-gray-100 text-gray-600">
          <Icon name={transaction.icon || 'money'} className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{transaction.description}</p>
          <p className="text-xs text-gray-500">{new Date(transaction.date).toLocaleDateString()}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-semibold ${amountColor}`}>
          {sign} {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
        </p>
        <p className={`text-xs ${transaction.status === 'Pending' ? 'text-yellow-600' : 'text-gray-500'}`}>
          {transaction.status}
        </p>
      </div>
      <Icon name="chevron-right" className="w-4 h-4 text-gray-400" />
    </li>
  );
};

// Transaction Detail Modal Component
const TransactionDetailModal = ({ isOpen, onClose, transaction }) => {
  if (!transaction) return null;

  const isCredit = transaction.amount > 0;
  const amountColor = isCredit ? 'text-green-600' : 'text-red-600';
  const sign = isCredit ? '+' : '-';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transaction Details">
      <div className="space-y-4 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Description:</span>
          <span className="font-medium text-gray-900">{transaction.description}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Amount:</span>
          <span className={`font-bold ${amountColor}`}>
            {sign} {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Date:</span>
          <span className="font-medium text-gray-900">{new Date(transaction.date).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Type:</span>
          <span className="font-medium text-gray-900">{transaction.type}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Category:</span>
          <span className="font-medium text-gray-900">{transaction.category}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Status:</span>
          <span className={`font-medium ${transaction.status === 'Pending' ? 'text-yellow-600' : 'text-green-600'}`}>
            {transaction.status}
          </span>
        </div>
        <div className="pt-2 border-t">
          <p className="text-gray-500 mb-1">Details:</p>
          <p className="text-gray-700 italic">{transaction.details}</p>
        </div>
      </div>
    </Modal>
  );
};

// Filter Modal Component
const FilterModal = ({ isOpen, onClose, onApplyFilters, currentFilters }) => {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: currentFilters,
  });

  const typeOptions = [
    { value: 'All', label: 'All Types' },
    { value: 'Debit', label: 'Debit' },
    { value: 'Credit', label: 'Credit' },
    { value: 'Transfer', label: 'Transfer' },
  ];

  const onSubmit = (data) => {
    onApplyFilters(data);
    onClose();
  };

  const handleReset = () => {
    reset({
      type: 'All',
      minAmount: '',
      maxAmount: '',
    });
    onApplyFilters({ type: 'All', minAmount: '', maxAmount: '' });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter Transactions">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Select
          id="type"
          label="Transaction Type"
          options={typeOptions}
          {...register('type')}
        />
        <Input
          id="minAmount"
          label="Minimum Amount"
          type="number"
          step="0.01"
          placeholder="e.g., 10.00"
          {...register('minAmount', {
            validate: value => !value || !isNaN(value) || 'Must be a number',
          })}
          error={errors.minAmount?.message}
        />
        <Input
          id="maxAmount"
          label="Maximum Amount"
          type="number"
          step="0.01"
          placeholder="e.g., 500.00"
          {...register('maxAmount', {
            validate: value => !value || !isNaN(value) || 'Must be a number',
          })}
          error={errors.maxAmount?.message}
        />
        {/* Date Range filter is omitted for simplicity in this mock, but would be implemented here */}
        <div className="flex justify-between pt-4">
          <Button type="button" variant="secondary" onClick={handleReset}>
            Reset Filters
          </Button>
          <Button type="submit" variant="primary">
            Apply Filters
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// Main Component
const TransactionsPage = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    type: 'All',
    minAmount: '',
    maxAmount: '',
  });
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Check authentication status (for full feature parity)
  useEffect(() => {
    const { isAuthenticated } = AuthService.getAuthStatus();
    if (!isAuthenticated) {
      // In a real app, this would redirect to login
      // navigate('/login');
      NotificationService.showNotification('User not authenticated. Mocking successful login.', 'warning');
    }
  }, [navigate]);

  // Data fetching logic
  const fetchTransactions = useCallback(async (currentFilters, currentSearchQuery) => {
    setLoading(true);
    setError(null);
    try {
      const data = await ApiService.fetchTransactions({
        ...currentFilters,
        search: currentSearchQuery,
      });
      setTransactions(data);
    } catch (err) {
      setError('Failed to fetch transactions. Please try again.');
      NotificationService.showNotification('Failed to load transactions.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and when filters/search change
  useEffect(() => {
    // Debounce search input in a real app, but for simplicity, we fetch immediately
    fetchTransactions(filters, searchQuery);
  }, [filters, searchQuery, fetchTransactions]);

  // Event Handlers
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleApplyFilters = (newFilters) => {
    setFilters(newFilters);
  };

  const handleTransactionClick = (transaction) => {
    setSelectedTransaction(transaction);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedTransaction(null);
  };

  // Render Logic
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-64">
          <Spinner />
          <p className="ml-3 text-gray-500">Loading transactions...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center p-8">
          <Icon name="alert-triangle" className="w-10 h-10 mx-auto text-red-500" />
          <p className="mt-2 text-sm font-medium text-red-700">{error}</p>
          <Button onClick={() => fetchTransactions(filters, searchQuery)} className="mt-4">
            Try Again
          </Button>
        </div>
      );
    }

    if (transactions.length === 0) {
      return (
        <div className="text-center p-8">
          <p className="text-lg font-semibold text-gray-700">No Transactions Found</p>
          <p className="text-sm text-gray-500 mt-2">
            {searchQuery || filters.type !== 'All' || filters.minAmount || filters.maxAmount
              ? 'Try adjusting your search or filters.'
              : 'You have no transactions yet.'}
          </p>
        </div>
      );
    }

    return (
      <ul className="divide-y divide-gray-100">
        {transactions.map((transaction) => (
          <TransactionItem
            key={transaction.id}
            transaction={transaction}
            onClick={handleTransactionClick}
          />
        ))}
      </ul>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header
        title="Transaction History"
        rightContent={
          <Button variant="ghost" onClick={() => setIsFilterModalOpen(true)} className="p-1">
            <Icon name="filter" className="w-6 h-6 text-indigo-600" />
          </Button>
        }
      />

      <div className="p-4 sticky top-16 bg-white z-10 shadow-sm">
        <Input
          type="search"
          placeholder="Search transactions (e.g., Starbucks, Salary)"
          value={searchQuery}
          onChange={handleSearchChange}
          className="w-full"
        />
      </div>

      <main className="flex-grow overflow-y-auto">
        <Card className="m-4 p-0">
          {renderContent()}
        </Card>
      </main>

      <OfflineIndicator />

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApplyFilters={handleApplyFilters}
        currentFilters={filters}
      />

      <TransactionDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
        transaction={selectedTransaction}
      />
    </div>
  );
};

export default TransactionsPage;