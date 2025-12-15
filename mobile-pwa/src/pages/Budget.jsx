import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Mock service imports as required
import * as AuthService from '../services/AuthService';
import * as ApiService from '../services/ApiService';
import * as NotificationService from '../services/NotificationService';

// Mock UI component imports as required
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Icon } from '../components/ui/Icon';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Alert } from '../components/ui/Alert';

// --- Type Definitions for Data Structures ---

interface Budget {
  id: string;
  category: string;
  limit: number;
  spent: number;
  startDate: string;
  endDate: string;
  alertThreshold: number; // Percentage (e.g., 80 for 80%)
}

interface Category {
  id: string;
  name: string;
  icon: string;
}

// --- Mock Data and Services ---

const mockCategories: Category[] = [
  { id: '1', name: 'Groceries', icon: 'shopping-cart' },
  { id: '2', name: 'Housing', icon: 'home' },
  { id: '3', name: 'Transport', icon: 'car' },
  { id: '4', name: 'Entertainment', icon: 'film' },
  { id: '5', name: 'Utilities', icon: 'zap' },
];

const mockBudgets: Budget[] = [
  {
    id: 'b1',
    category: 'Groceries',
    limit: 500,
    spent: 420,
    startDate: '2025-11-01',
    endDate: '2025-11-30',
    alertThreshold: 80,
  },
  {
    id: 'b2',
    category: 'Housing',
    limit: 1500,
    spent: 1000,
    startDate: '2025-11-01',
    endDate: '2025-11-30',
    alertThreshold: 90,
  },
  {
    id: 'b3',
    category: 'Entertainment',
    limit: 200,
    spent: 210, // Over budget
    startDate: '2025-11-01',
    endDate: '2025-11-30',
    alertThreshold: 75,
  },
];

// --- Utility Functions ---

const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

// --- Budget Item Component ---

interface BudgetItemProps {
  budget: Budget;
  onEdit: (budget: Budget) => void;
}

const BudgetItem: React.FC<BudgetItemProps> = ({ budget, onEdit }) => {
  const percentage = (budget.spent / budget.limit) * 100;
  const isOverBudget = percentage > 100;
  const isAlert = percentage >= budget.alertThreshold && percentage <= 100;

  let progressColor = 'bg-green-500';
  if (isOverBudget) {
    progressColor = 'bg-red-500';
  } else if (isAlert) {
    progressColor = 'bg-yellow-500';
  }

  const statusText = isOverBudget
    ? 'Over Budget'
    : isAlert
    ? 'Approaching Limit'
    : 'On Track';

  return (
    <Card className="p-4 mb-4 shadow-md">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 flex items-center">
            <Icon name={mockCategories.find(c => c.name === budget.category)?.icon || 'dollar-sign'} className="w-5 h-5 mr-2 text-indigo-600" />
            {budget.category}
          </h3>
          <p className="text-sm text-gray-500">
            {budget.startDate} - {budget.endDate}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(budget)}
          aria-label={`Edit ${budget.category} budget`}
        >
          <Icon name="edit" className="w-4 h-4" />
        </Button>
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-sm font-medium">
          <span className="text-gray-600">
            Spent: <span className="font-bold">{formatCurrency(budget.spent)}</span>
          </span>
          <span className={`font-bold ${isOverBudget ? 'text-red-600' : 'text-indigo-600'}`}>
            Limit: {formatCurrency(budget.limit)}
          </span>
        </div>
        <ProgressBar percentage={Math.min(percentage, 100)} color={progressColor} className="mt-1" />
        {isOverBudget && (
          <p className="text-xs text-red-500 mt-1">
            Exceeded by {formatCurrency(budget.spent - budget.limit)}
          </p>
        )}
        <p className={`text-xs mt-1 font-medium ${isOverBudget ? 'text-red-600' : isAlert ? 'text-yellow-600' : 'text-green-600'}`}>
          Status: {statusText}
        </p>
      </div>
    </Card>
  );
};

// --- Budget Form Modal Component ---

interface BudgetFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  budgetToEdit: Budget | null;
  onSave: (budget: Budget) => void;
  categories: Category[];
}

const BudgetFormModal: React.FC<BudgetFormModalProps> = ({
  isOpen,
  onClose,
  budgetToEdit,
  onSave,
  categories,
}) => {
  const initialFormState: Omit<Budget, 'spent' | 'id'> = {
    category: categories[0]?.name || '',
    limit: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
    alertThreshold: 80,
  };

  const [formData, setFormData] = useState<Omit<Budget, 'spent' | 'id'>>(initialFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (budgetToEdit) {
      setFormData({
        category: budgetToEdit.category,
        limit: budgetToEdit.limit,
        startDate: budgetToEdit.startDate,
        endDate: budgetToEdit.endDate,
        alertThreshold: budgetToEdit.alertThreshold,
      });
    } else {
      setFormData(initialFormState);
    }
    setErrors({});
  }, [budgetToEdit, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'limit' || name === 'alertThreshold' ? parseFloat(value) || 0 : value,
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.category) newErrors.category = 'Category is required.';
    if (formData.limit <= 0) newErrors.limit = 'Limit must be greater than zero.';
    if (new Date(formData.startDate) >= new Date(formData.endDate)) {
      newErrors.endDate = 'End date must be after start date.';
    }
    if (formData.alertThreshold < 0 || formData.alertThreshold > 100) {
      newErrors.alertThreshold = 'Threshold must be between 0 and 100.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const newBudget: Budget = {
        ...formData,
        id: budgetToEdit?.id || `b${Date.now()}`, // Simple ID generation
        spent: budgetToEdit?.spent || 0, // Keep spent amount if editing, otherwise 0
      };
      onSave(newBudget);
      onClose();
    }
  };

  const title = budgetToEdit ? 'Edit Budget' : 'Create New Budget';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">
            Category
          </label>
          <Select
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="mt-1 block w-full"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </Select>
          {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category}</p>}
        </div>

        <div>
          <label htmlFor="limit" className="block text-sm font-medium text-gray-700">
            Budget Limit ($)
          </label>
          <Input
            id="limit"
            name="limit"
            type="number"
            value={formData.limit}
            onChange={handleChange}
            className="mt-1 block w-full"
            placeholder="e.g., 500.00"
            min="0.01"
            step="0.01"
          />
          {errors.limit && <p className="text-red-500 text-xs mt-1">{errors.limit}</p>}
        </div>

        <div className="flex space-x-4">
          <div className="flex-1">
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
              Start Date
            </label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              value={formData.startDate}
              onChange={handleChange}
              className="mt-1 block w-full"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
              End Date
            </label>
            <Input
              id="endDate"
              name="endDate"
              type="date"
              value={formData.endDate}
              onChange={handleChange}
              className="mt-1 block w-full"
            />
            {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="alertThreshold" className="block text-sm font-medium text-gray-700">
            Alert Threshold (%)
          </label>
          <Input
            id="alertThreshold"
            name="alertThreshold"
            type="number"
            value={formData.alertThreshold}
            onChange={handleChange}
            className="mt-1 block w-full"
            placeholder="e.g., 80"
            min="0"
            max="100"
          />
          {errors.alertThreshold && <p className="text-red-500 text-xs mt-1">{errors.alertThreshold}</p>}
        </div>

        <div className="pt-4">
          <Button type="submit" className="w-full">
            {budgetToEdit ? 'Save Changes' : 'Create Budget'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// --- Main Component ---

const BudgetTrackingScreen: React.FC = () => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const navigate = useNavigate();

  // Handle offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Data Fetching Effect
  const fetchBudgets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Mock API call to fetch budgets and categories
      // const response = await ApiService.get('/budgets');
      // setBudgets(response.budgets);
      // setCategories(response.categories);
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
      setBudgets(mockBudgets);
      setCategories(mockCategories);
    } catch (err) {
      console.error('Failed to fetch budgets:', err);
      setError('Could not load budget data. Please try again.');
      NotificationService.notify('error', 'Failed to load budgets.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  // Event Handlers
  const handleCreateBudget = () => {
    setEditingBudget(null);
    setIsModalOpen(true);
  };

  const handleEditBudget = (budget: Budget) => {
    setEditingBudget(budget);
    setIsModalOpen(true);
  };

  const handleSaveBudget = (newBudget: Budget) => {
    // Mock API call to save/update budget
    // await ApiService.post('/budgets', newBudget);
    if (editingBudget) {
      setBudgets((prev) =>
        prev.map((b) => (b.id === newBudget.id ? newBudget : b))
      );
      NotificationService.notify('success', `Budget for ${newBudget.category} updated successfully.`);
    } else {
      setBudgets((prev) => [...prev, newBudget]);
      NotificationService.notify('success', `New budget for ${newBudget.category} created.`);
    }
    setEditingBudget(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBudget(null);
  };

  // Derived State / Alerts
  const activeAlerts = useMemo(() => {
    return budgets.filter((b) => {
      const percentage = (b.spent / b.limit) * 100;
      return percentage >= b.alertThreshold;
    });
  }, [budgets]);

  // --- Render Logic ---

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <Icon name="loader" className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
        <p className="mt-2 text-gray-600">Loading budgets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="error" title="Error">
          {error}
        </Alert>
        <Button onClick={fetchBudgets} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  // Empty State
  if (budgets.length === 0) {
    return (
      <div className="p-4 text-center h-screen flex flex-col justify-center items-center">
        <Icon name="dollar-sign" className="w-16 h-16 text-gray-300" />
        <h2 className="text-xl font-semibold mt-4 text-gray-700">No Budgets Set Up</h2>
        <p className="text-gray-500 mt-2">
          Start tracking your spending by creating your first budget.
        </p>
        <Button onClick={handleCreateBudget} className="mt-6">
          <Icon name="plus" className="w-5 h-5 mr-2" />
          Create Budget
        </Button>
      </div>
    );
  }

  // Main Content
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Budget Tracking</h1>
        <Button onClick={handleCreateBudget} size="sm">
          <Icon name="plus" className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">New Budget</span>
        </Button>
      </header>

      {isOffline && (
        <Alert variant="warning" title="Offline Mode" className="mb-4">
          You are currently offline. Data may be outdated.
        </Alert>
      )}

      {/* Alerts Section */}
      {activeAlerts.length > 0 && (
        <Card className="p-4 mb-6 bg-yellow-50 border-l-4 border-yellow-400 shadow-sm">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2 flex items-center">
            <Icon name="alert-triangle" className="w-5 h-5 mr-2" />
            Budget Alerts ({activeAlerts.length})
          </h2>
          <ul className="space-y-1 text-sm text-yellow-700">
            {activeAlerts.map((alert) => {
              const percentage = (alert.spent / alert.limit) * 100;
              return (
                <li key={alert.id}>
                  <Link to={`/budget/${alert.id}`} className="underline hover:text-yellow-900">
                    {alert.category}:{' '}
                    {percentage > 100
                      ? 'OVER BUDGET'
                      : `Approaching limit (${percentage.toFixed(0)}%)`}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Spending Summary (Placeholder for more complex chart/data) */}
      <Card className="p-4 mb-6 shadow-lg">
        <h2 className="text-xl font-semibold text-gray-800 mb-3">Monthly Summary</h2>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-indigo-600">
              {formatCurrency(budgets.reduce((sum, b) => sum + b.spent, 0))}
            </p>
            <p className="text-sm text-gray-500">Total Spent</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(budgets.reduce((sum, b) => sum + b.limit, 0))}
            </p>
            <p className="text-sm text-gray-500">Total Budget</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-1">Overall Progress</p>
          <ProgressBar
            percentage={(budgets.reduce((sum, b) => sum + b.spent, 0) / budgets.reduce((sum, b) => sum + b.limit, 0)) * 100}
            color="bg-indigo-500"
          />
        </div>
      </Card>

      {/* Budget List */}
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Active Budgets</h2>
      <div className="space-y-4">
        {budgets.map((budget) => (
          <BudgetItem key={budget.id} budget={budget} onEdit={handleEditBudget} />
        ))}
      </div>

      {/* Budget Create/Edit Modal */}
      <BudgetFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        budgetToEdit={editingBudget}
        onSave={handleSaveBudget}
        categories={categories}
      />
    </div>
  );
};

export default BudgetTrackingScreen;