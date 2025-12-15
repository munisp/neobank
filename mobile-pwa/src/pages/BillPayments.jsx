import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Assume a context for user/app state, though not explicitly required, it's common in PWAs
// import { useAppContext } from '../context/AppContext'; 

// Service Imports
import AuthService from '../services/AuthService';
import ApiService from '../services/ApiService';
import NotificationService from '../services/NotificationService';

// UI Component Imports (Assumed to exist)
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { Alert } from '../components/ui/Alert';
import { Icon } from '../components/ui/Icon'; // Assuming an Icon component for mobile-first design

// --- Type Definitions (Mock Data Structures) ---

interface Biller {
  id: string;
  name: string;
  accountNumber: string;
}

interface PaymentHistoryItem {
  id: string;
  billerName: string;
  amount: number;
  date: string;
  status: 'Completed' | 'Pending' | 'Failed';
}

interface BillReminder {
  id: string;
  billerName: string;
  amount: number;
  dueDate: string;
  frequency: 'Monthly' | 'Weekly' | 'Bi-Weekly';
  isDue: boolean;
}

// --- Component Definition ---

const BillRemindersScreen: React.FC = () => {
  const navigate = useNavigate();
  // const { isOnline } = useAppContext(); // Assuming isOnline comes from a context for offline indicator

  // --- State Management ---
  const [billers, setBillers] = useState<Biller[]>([]);
  const [history, setHistory] = useState<PaymentHistoryItem[]>([]);
  const [reminders, setReminders] = useState<BillReminder[]>([]);
  
  const [selectedBillerId, setSelectedBillerId] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Mock online status for demonstration
  const isOnline = true; 

  // --- Data Fetching (useEffect) ---

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Simulate API calls to fetch data
      // NOTE: In a real PWA, this would involve actual API calls and potentially IndexedDB for offline
      const [billerData, historyData, reminderData] = await Promise.all([
        ApiService.get('/billers'),
        ApiService.get('/payments/history'),
        ApiService.get('/reminders'),
      ]);

      setBillers(billerData.data as Biller[]);
      setHistory(historyData.data as PaymentHistoryItem[]);
      setReminders(reminderData.data as BillReminder[]);
      
      if (billerData.data.length > 0) {
        setSelectedBillerId(billerData.data[0].id);
      }

    } catch (err) {
      console.error('Failed to fetch bill data:', err);
      setError('Failed to load bill payment data. Please try again.');
      NotificationService.notify('error', 'Data load failed.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Event Handlers and Logic ---

  const validateForm = (): boolean => {
    if (!selectedBillerId) {
      setFormError('Please select a biller.');
      return false;
    }
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setFormError('Please enter a valid payment amount.');
      return false;
    }
    setFormError(null);
    return true;
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const amount = parseFloat(paymentAmount);
      const selectedBiller = billers.find(b => b.id === selectedBillerId);

      if (!selectedBiller) {
        setFormError('Selected biller not found.');
        setIsSubmitting(false);
        return;
      }

      // Simulate payment API call
      const response = await ApiService.post('/payments/bill', {
        billerId: selectedBillerId,
        amount: amount,
        // Add authentication token from AuthService if needed
        token: AuthService.getToken(), 
      });

      if (response.success) {
        NotificationService.notify('success', `Payment of $${amount.toFixed(2)} to ${selectedBiller.name} successful!`);
        setPaymentAmount(''); // Clear form
        fetchData(); // Refresh history and reminders
      } else {
        throw new Error(response.message || 'Payment failed due to an unknown error.');
      }

    } catch (err) {
      console.error('Payment submission failed:', err);
      setFormError(`Payment failed: ${err instanceof Error ? err.message : 'Server error'}`);
      NotificationService.notify('error', 'Payment failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddReminder = () => {
    // Navigate to a dedicated screen for adding/editing reminders
    navigate('/bill-reminders/add');
  };

  // --- Render Helpers ---

  const renderPaymentForm = () => (
    <Card className="p-4 shadow-lg bg-white">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Make a Payment</h2>
      <form onSubmit={handlePaymentSubmit} className="space-y-4">
        {formError && <Alert type="error" message={formError} />}
        
        <div className="flex flex-col">
          <label htmlFor="biller-select" className="text-sm font-medium text-gray-700 mb-1">Select Biller</label>
          <Select
            id="biller-select"
            value={selectedBillerId}
            onChange={(e) => setSelectedBillerId(e.target.value)}
            className="w-full"
            disabled={billers.length === 0 || isSubmitting}
          >
            {billers.length === 0 ? (
              <option value="" disabled>No billers available</option>
            ) : (
              billers.map((biller) => (
                <option key={biller.id} value={biller.id}>
                  {biller.name} (Acc: {biller.accountNumber})
                </option>
              ))
            )}
          </Select>
        </div>

        <div className="flex flex-col">
          <label htmlFor="amount-input" className="text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
          <Input
            id="amount-input"
            type="number"
            placeholder="0.00"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            className="w-full"
            disabled={isSubmitting}
            min="0.01"
            step="0.01"
          />
        </div>

        <Button 
          type="submit" 
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition duration-150"
          disabled={isSubmitting || billers.length === 0 || !isOnline}
        >
          {isSubmitting ? <Spinner size="sm" /> : 'Pay Bill'}
        </Button>
        {!isOnline && <p className="text-sm text-red-500 mt-2">Cannot process payment while offline.</p>}
      </form>
    </Card>
  );

  const renderReminders = () => (
    <Card className="p-4 shadow-lg bg-white">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Bill Reminders</h2>
        <Button 
          onClick={handleAddReminder} 
          className="bg-green-500 hover:bg-green-600 text-white text-sm py-1 px-3 rounded-full flex items-center"
        >
          <Icon name="Plus" className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>
      
      {reminders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Icon name="BellOff" className="w-8 h-8 mx-auto mb-2" />
          <p>No active bill reminders. Set one up today!</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reminders.map((reminder) => (
            <li 
              key={reminder.id} 
              className={`p-3 rounded-lg border ${reminder.isDue ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'} flex justify-between items-center`}
            >
              <div>
                <p className="font-medium text-gray-800">{reminder.billerName}</p>
                <p className="text-sm text-gray-600">Due: {reminder.dueDate} ({reminder.frequency})</p>
              </div>
              <div className="text-right">
                <p className={`font-bold ${reminder.isDue ? 'text-red-600' : 'text-blue-600'}`}>${reminder.amount.toFixed(2)}</p>
                <Link to={`/bill-reminders/edit/${reminder.id}`} className="text-xs text-blue-500 hover:text-blue-700">Edit</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const renderHistory = () => (
    <Card className="p-4 shadow-lg bg-white">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Payment History</h2>
      
      {history.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Icon name="Clock" className="w-8 h-8 mx-auto mb-2" />
          <p>No payment history found.</p>
        </div>
      ) : (
        <ul className="space-y-3 max-h-64 overflow-y-auto">
          {history.map((item) => (
            <li 
              key={item.id} 
              className="p-3 rounded-lg border border-gray-100 bg-gray-50 flex justify-between items-center"
            >
              <div>
                <p className="font-medium text-gray-800">{item.billerName}</p>
                <p className="text-xs text-gray-500">{item.date}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-700">${item.amount.toFixed(2)}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  item.status === 'Completed' ? 'bg-green-100 text-green-800' :
                  item.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {item.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  // --- Main Render ---

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <Spinner size="lg" />
        <p className="ml-3 text-gray-600">Loading bill payment data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-gray-50 min-h-screen">
        <Alert type="error" message={error} className="mb-4" />
        <Button onClick={fetchData} className="w-full bg-red-600 hover:bg-red-700 text-white">
          Try Reloading Data
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      {/* Header for Mobile-First Design */}
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bill Payments</h1>
        <div className="flex items-center space-x-2">
          {/* Offline Support Indicator */}
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${
            isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
          <Link to="/settings/billers" className="text-blue-600 hover:text-blue-800">
            <Icon name="Settings" className="w-6 h-6" />
          </Link>
        </div>
      </header>

      <div className="space-y-6">
        {/* Payment Form Section */}
        {renderPaymentForm()}

        {/* Bill Reminders Section */}
        {renderReminders()}

        {/* Payment History Section */}
        {renderHistory()}
      </div>

      {/* Empty State Example (If all data was empty, though handled in sub-renders) */}
      {billers.length === 0 && history.length === 0 && reminders.length === 0 && !isLoading && (
        <div className="text-center py-16 text-gray-500">
          <Icon name="Wallet" className="w-12 h-12 mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Welcome to Bill Payments</h2>
          <p className="mt-2">Start by adding a biller to make your first payment.</p>
          <Button onClick={() => navigate('/settings/billers')} className="mt-4 bg-blue-500 hover:bg-blue-600 text-white">
            Add Biller
          </Button>
        </div>
      )}
    </div>
  );
};

export default BillRemindersScreen;