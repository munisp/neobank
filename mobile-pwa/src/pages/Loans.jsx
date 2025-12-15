import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Mock imports for required services
import * as AuthService from '../services/AuthService';
import * as ApiService from '../services/ApiService';
import * as NotificationService from '../services/NotificationService';

// Mock imports for required UI components
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Alert } from '../components/ui/Alert';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';

// --- Type Definitions (Mocked for demonstration) ---
interface Loan {
  id: string;
  name: string;
  amount: number;
  balance: number;
  interestRate: number;
  status: 'Active' | 'Paid Off' | 'Pending';
  nextPaymentDate: string;
  nextPaymentAmount: number;
}

interface RepaymentScheduleItem {
  id: number;
  dueDate: string;
  principal: number;
  interest: number;
  totalPayment: number;
  status: 'Paid' | 'Due' | 'Overdue';
}

interface NewLoanApplication {
  loanType: string;
  amount: number;
  term: number; // in months
}

// --- Mock Data and API Functions ---
const mockLoans: Loan[] = [
  {
    id: 'L1001',
    name: 'Home Mortgage',
    amount: 350000,
    balance: 150000,
    interestRate: 3.5,
    status: 'Active',
    nextPaymentDate: '2025-12-01',
    nextPaymentAmount: 1250.50,
  },
  {
    id: 'L1002',
    name: 'Car Loan',
    amount: 25000,
    balance: 5000,
    interestRate: 5.9,
    status: 'Active',
    nextPaymentDate: '2025-11-15',
    nextPaymentAmount: 450.00,
  },
  {
    id: 'L1003',
    name: 'Personal Loan',
    amount: 10000,
    balance: 0,
    interestRate: 7.0,
    status: 'Paid Off',
    nextPaymentDate: 'N/A',
    nextPaymentAmount: 0,
  },
];

const mockSchedule: RepaymentScheduleItem[] = [
  { id: 1, dueDate: '2025-10-01', principal: 800, interest: 450.5, totalPayment: 1250.5, status: 'Paid' },
  { id: 2, dueDate: '2025-11-01', principal: 805, interest: 445.5, totalPayment: 1250.5, status: 'Paid' },
  { id: 3, dueDate: '2025-12-01', principal: 810, interest: 440.5, totalPayment: 1250.5, status: 'Due' },
  { id: 4, dueDate: '2026-01-01', principal: 815, interest: 435.5, totalPayment: 1250.5, status: 'Due' },
];

// --- Component Definition ---

const LoansScreen: React.FC = () => {
  const navigate = useNavigate();

  // State for data fetching
  const [loans, setLoans] = useState<Loan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // State for loan details modal
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [schedule, setSchedule] = useState<RepaymentScheduleItem[]>([]);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  // State for new loan application modal
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [newLoanData, setNewLoanData] = useState<NewLoanApplication>({
    loanType: 'Personal',
    amount: 0,
    term: 12,
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Event Handlers for Offline Status ---
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Data Fetching Effect ---
  const fetchLoans = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Mock API call using ApiService
      // const response = await ApiService.get('/loans');
      // setLoans(response.data);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
      setLoans(mockLoans);
    } catch (err) {
      console.error('Failed to fetch loans:', err);
      setError('Could not load your loan information. Please try again.');
      NotificationService.notify('Error fetching loans', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  // --- Loan Details Logic ---
  const fetchLoanDetails = useCallback(async (loanId: string) => {
    setIsDetailsLoading(true);
    try {
      // Mock API call for loan details and schedule
      // const response = await ApiService.get(`/loans/${loanId}/schedule`);
      // setSchedule(response.data.schedule);
      await new Promise(resolve => setTimeout(resolve, 500));
      setSchedule(mockSchedule);
    } catch (err) {
      console.error('Failed to fetch schedule:', err);
      NotificationService.notify('Error fetching repayment schedule', 'error');
      setSchedule([]);
    } finally {
      setIsDetailsLoading(false);
    }
  }, []);

  const handleViewDetails = (loan: Loan) => {
    setSelectedLoan(loan);
    fetchLoanDetails(loan.id);
  };

  const handleCloseDetails = () => {
    setSelectedLoan(null);
    setSchedule([]);
  };

  // --- New Loan Application Logic ---
  const handleNewLoanChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewLoanData(prev => ({ ...prev, [name]: name === 'amount' || name === 'term' ? Number(value) : value }));
    // Clear validation error for the field on change
    setValidationErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateNewLoanForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!newLoanData.loanType) {
      errors.loanType = 'Loan type is required.';
    }
    if (newLoanData.amount <= 0) {
      errors.amount = 'Amount must be greater than zero.';
    }
    if (newLoanData.term < 6 || newLoanData.term > 60) {
      errors.term = 'Term must be between 6 and 60 months.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNewLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateNewLoanForm()) {
      NotificationService.notify('Please correct the form errors.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      // Mock API call to submit new loan application
      // await ApiService.post('/loans/apply', newLoanData);
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      NotificationService.notify('Loan application submitted successfully!', 'success');
      setIsApplyModalOpen(false);
      setNewLoanData({ loanType: 'Personal', amount: 0, term: 12 }); // Reset form
      // Optionally, refetch loans to show pending application
      // fetchLoans(); 
    } catch (err) {
      console.error('Loan application failed:', err);
      setError('Failed to submit loan application. Please try again.');
      NotificationService.notify('Loan application failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render Helpers ---

  const renderLoanCard = (loan: Loan) => (
    <Card key={loan.id} className="mb-4 p-4 shadow-lg transition duration-300 ease-in-out hover:shadow-xl">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{loan.name}</h3>
          <p className="text-sm text-gray-500">ID: {loan.id}</p>
        </div>
        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
          loan.status === 'Active' ? 'bg-green-100 text-green-800' :
          loan.status === 'Paid Off' ? 'bg-blue-100 text-blue-800' :
          'bg-yellow-100 text-yellow-800'
        }`}>
          {loan.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <p className="text-gray-600">Balance:</p>
        <p className="font-medium text-right">${loan.balance.toFixed(2)}</p>
        
        <p className="text-gray-600">Next Payment:</p>
        <p className="font-medium text-right text-red-600">
          ${loan.nextPaymentAmount.toFixed(2)} on {loan.nextPaymentDate}
        </p>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={() => handleViewDetails(loan)}>
          View Details
        </Button>
      </div>
    </Card>
  );

  const renderScheduleTable = () => (
    <div className="mt-4 overflow-x-auto">
      <h4 className="text-md font-semibold mb-2">Repayment Schedule</h4>
      {isDetailsLoading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : schedule.length === 0 ? (
        <p className="text-sm text-gray-500">No repayment schedule available.</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Principal</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Interest</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {schedule.map((item) => (
              <tr key={item.id} className={item.status === 'Overdue' ? 'bg-red-50' : ''}>
                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{item.dueDate}</td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 text-right">${item.principal.toFixed(2)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 text-right">${item.interest.toFixed(2)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">${item.totalPayment.toFixed(2)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    item.status === 'Paid' ? 'bg-green-100 text-green-800' :
                    item.status === 'Due' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Loan Management</h1>
        <Button onClick={() => setIsApplyModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
          Apply for New Loan
        </Button>
      </header>

      {/* Offline Indicator */}
      {!isOnline && (
        <Alert type="warning" title="Offline Mode" description="You are currently offline. Data shown may be outdated." className="mb-4" />
      )}

      {/* Error Handling */}
      {error && (
        <Alert type="error" title="Data Error" description={error} className="mb-4" />
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-64">
          <Spinner size="lg" />
          <p className="mt-2 text-gray-600">Loading your loans...</p>
        </div>
      ) : loans.length === 0 ? (
        /* Empty State */
        <div className="text-center py-10 border-2 border-dashed border-gray-300 rounded-lg">
          <h2 className="text-xl font-semibold text-gray-700">No Loans Found</h2>
          <p className="mt-2 text-gray-500">It looks like you don't have any active or past loans with us.</p>
          <Button onClick={() => setIsApplyModalOpen(true)} className="mt-4 bg-green-600 hover:bg-green-700 text-white">
            Start a New Application
          </Button>
        </div>
      ) : (
        /* Loan List */
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Your Loans ({loans.filter(l => l.status === 'Active').length} Active)</h2>
          {loans.map(renderLoanCard)}
        </section>
      )}

      {/* Loan Details Modal */}
      <Modal 
        isOpen={!!selectedLoan} 
        onClose={handleCloseDetails} 
        title={selectedLoan ? `${selectedLoan.name} Details` : 'Loan Details'}
      >
        {selectedLoan && (
          <div className="p-4">
            <div className="grid grid-cols-2 gap-4 text-sm mb-4 border-b pb-4">
              <p className="text-gray-600">Original Amount:</p>
              <p className="font-medium text-right">${selectedLoan.amount.toFixed(2)}</p>
              
              <p className="text-gray-600">Current Balance:</p>
              <p className="font-bold text-right text-blue-600 text-lg">${selectedLoan.balance.toFixed(2)}</p>
              
              <p className="text-gray-600">Interest Rate:</p>
              <p className="font-medium text-right">{selectedLoan.interestRate.toFixed(2)}%</p>
              
              <p className="text-gray-600">Status:</p>
              <p className="font-medium text-right">{selectedLoan.status}</p>
            </div>
            
            {/* Repayment Schedule */}
            {renderScheduleTable()}

            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="outline" onClick={handleCloseDetails}>Close</Button>
              {selectedLoan.status === 'Active' && (
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  Make a Payment
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* New Loan Application Modal */}
      <Modal 
        isOpen={isApplyModalOpen} 
        onClose={() => setIsApplyModalOpen(false)} 
        title="Apply for a New Loan"
      >
        <form onSubmit={handleNewLoanSubmit} className="p-4">
          <div className="mb-4">
            <label htmlFor="loanType" className="block text-sm font-medium text-gray-700">Loan Type</label>
            <Select
              id="loanType"
              name="loanType"
              value={newLoanData.loanType}
              onChange={handleNewLoanChange}
              className="mt-1 block w-full"
              error={validationErrors.loanType}
            >
              <option value="Personal">Personal Loan</option>
              <option value="Auto">Auto Loan</option>
              <option value="Mortgage">Mortgage</option>
            </Select>
            {validationErrors.loanType && <p className="text-red-500 text-xs mt-1">{validationErrors.loanType}</p>}
          </div>

          <div className="mb-4">
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Loan Amount ($)</label>
            <Input
              id="amount"
              name="amount"
              type="number"
              placeholder="e.g., 10000"
              value={newLoanData.amount || ''}
              onChange={handleNewLoanChange}
              className="mt-1 block w-full"
              error={validationErrors.amount}
            />
            {validationErrors.amount && <p className="text-red-500 text-xs mt-1">{validationErrors.amount}</p>}
          </div>

          <div className="mb-6">
            <label htmlFor="term" className="block text-sm font-medium text-gray-700">Loan Term (Months)</label>
            <Input
              id="term"
              name="term"
              type="number"
              placeholder="e.g., 36"
              value={newLoanData.term || ''}
              onChange={handleNewLoanChange}
              className="mt-1 block w-full"
              error={validationErrors.term}
            />
            {validationErrors.term && <p className="text-red-500 text-xs mt-1">{validationErrors.term}</p>}
          </div>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" type="button" onClick={() => setIsApplyModalOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? <Spinner size="sm" className="mr-2" /> : 'Submit Application'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default LoansScreen;