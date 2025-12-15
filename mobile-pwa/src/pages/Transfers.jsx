import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthService'; // Assuming a context hook for auth state
import ApiService from '../services/ApiService';
import NotificationService from '../services/NotificationService';

// Assuming these UI components exist in ../components/ui/
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorAlert } from '../components/ui/ErrorAlert';
import { OfflineIndicator } from '../components/ui/OfflineIndicator'; // Custom component for requirement 8

const TRANSFER_TYPES = [
  { value: 'internal', label: 'Internal Transfer (NeoBank)' },
  { value: 'external', label: 'External Transfer (Other Bank)' },
];

const Transfers = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth(); // Assuming useAuth provides user info
  
  // State for data fetching
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Form state
  const [formData, setFormData] = useState({
    beneficiaryId: '',
    amount: '',
    transferType: 'internal',
    description: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // --- Data Fetching Logic ---
  const fetchBeneficiaries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Simulate fetching beneficiaries for the current user
      const response = await ApiService.get('/transfers/beneficiaries');
      setBeneficiaries(response.data);
      // Set the first beneficiary as default if available
      if (response.data.length > 0) {
        setFormData(prev => ({ ...prev, beneficiaryId: response.data[0].id }));
      }
    } catch (err) {
      console.error('Failed to fetch beneficiaries:', err);
      setError('Could not load beneficiaries. Please try again.');
      NotificationService.error('Failed to load beneficiaries.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchBeneficiaries();
    } else {
      // Redirect or handle unauthenticated state
      navigate('/login');
    }
  }, [isAuthenticated, fetchBeneficiaries, navigate]);

  // --- Offline/Online Status Handler ---
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

  // --- Form Validation ---
  const validateForm = () => {
    const errors = {};
    const { beneficiaryId, amount, transferType } = formData;

    if (!beneficiaryId) {
      errors.beneficiaryId = 'Please select a beneficiary.';
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      errors.amount = 'Please enter a valid amount greater than 0.';
    }
    if (!transferType) {
      errors.transferType = 'Please select a transfer type.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // --- Event Handlers ---
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for the field on change
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleTransferSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      setShowConfirmation(true);
    }
  };

  const handleConfirmTransfer = async () => {
    setIsSubmitting(true);
    setShowConfirmation(false);
    setError(null);

    try {
      // Simulate API call for transfer
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        sourceAccountId: user.defaultAccountId, // Assuming user object has this
      };
      
      const response = await ApiService.post('/transfers/execute', payload);
      
      // Success notification and navigation
      NotificationService.success('Transfer successful! Reference: ' + response.data.reference);
      navigate('/dashboard', { replace: true }); // Navigate away after success

    } catch (err) {
      console.error('Transfer failed:', err);
      setError(err.response?.data?.message || 'Transfer failed due to an unexpected error.');
      NotificationService.error('Transfer failed. Check details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render Logic ---

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <LoadingSpinner />
        <p className="ml-3 text-gray-600">Loading transfer options...</p>
      </div>
    );
  }

  // 2. Error State (Initial Load)
  if (error && beneficiaries.length === 0) {
    return (
      <div className="p-4 sm:p-6 md:p-8 bg-gray-50 min-h-screen">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Money Transfer</h1>
        <ErrorAlert message={error} />
        <Button onClick={fetchBeneficiaries} className="mt-4 w-full sm:w-auto">
          Try Again
        </Button>
      </div>
    );
  }

  // 3. Empty State (No Beneficiaries)
  if (beneficiaries.length === 0) {
    return (
      <div className="p-4 sm:p-6 md:p-8 bg-gray-50 min-h-screen">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Money Transfer</h1>
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg bg-white">
          <p className="text-lg font-semibold text-gray-700">No Beneficiaries Found</p>
          <p className="text-gray-500 mt-2">Please add a beneficiary before attempting a transfer.</p>
          <Button onClick={() => navigate('/beneficiaries/add')} className="mt-6">
            Add New Beneficiary
          </Button>
        </div>
      </div>
    );
  }

  // 4. Main Content
  const selectedBeneficiary = beneficiaries.find(b => b.id === formData.beneficiaryId);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto p-4 sm:p-6 md:p-8">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-6 text-center">
          New Money Transfer
        </h1>

        <OfflineIndicator isOnline={isOnline} />

        {error && <ErrorAlert message={error} className="mb-4" />}

        <form onSubmit={handleTransferSubmit} className="space-y-6 bg-white p-6 rounded-xl shadow-lg">
          
          {/* Beneficiary Selection */}
          <div>
            <label htmlFor="beneficiaryId" className="block text-sm font-medium text-gray-700 mb-1">
              Select Beneficiary
            </label>
            <Select
              id="beneficiaryId"
              name="beneficiaryId"
              value={formData.beneficiaryId}
              onChange={handleChange}
              options={beneficiaries.map(b => ({ value: b.id, label: `${b.name} (${b.accountNumber})` }))}
              error={formErrors.beneficiaryId}
            />
            {formErrors.beneficiaryId && (
              <p className="mt-1 text-xs text-red-600">{formErrors.beneficiaryId}</p>
            )}
          </div>

          {/* Amount Input */}
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
              Amount (USD)
            </label>
            <Input
              id="amount"
              name="amount"
              type="number"
              placeholder="e.g., 100.00"
              value={formData.amount}
              onChange={handleChange}
              error={formErrors.amount}
              min="0.01"
              step="0.01"
            />
            {formErrors.amount && (
              <p className="mt-1 text-xs text-red-600">{formErrors.amount}</p>
            )}
          </div>

          {/* Transfer Type Selection */}
          <div>
            <label htmlFor="transferType" className="block text-sm font-medium text-gray-700 mb-1">
              Transfer Type
            </label>
            <Select
              id="transferType"
              name="transferType"
              value={formData.transferType}
              onChange={handleChange}
              options={TRANSFER_TYPES}
              error={formErrors.transferType}
            />
            {formErrors.transferType && (
              <p className="mt-1 text-xs text-red-600">{formErrors.transferType}</p>
            )}
          </div>

          {/* Description/Reference Input */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <Input
              id="description"
              name="description"
              type="text"
              placeholder="e.g., Monthly rent"
              value={formData.description}
              onChange={handleChange}
              maxLength={100}
            />
          </div>

          {/* Submit Button */}
          <Button 
            type="submit" 
            disabled={isSubmitting || !isOnline} 
            className="w-full"
          >
            {isSubmitting ? 'Processing...' : 'Review & Transfer'}
          </Button>
        </form>

        {/* Confirmation Modal */}
        <Modal 
          isOpen={showConfirmation} 
          onClose={() => setShowConfirmation(false)}
          title="Confirm Transfer"
        >
          <div className="space-y-4">
            <p className="text-gray-700">
              You are about to transfer <span className="font-bold text-lg">${parseFloat(formData.amount).toFixed(2)}</span> to:
            </p>
            <div className="bg-gray-100 p-3 rounded-lg text-sm">
              <p><strong>Beneficiary:</strong> {selectedBeneficiary?.name}</p>
              <p><strong>Account:</strong> {selectedBeneficiary?.accountNumber}</p>
              <p><strong>Type:</strong> {TRANSFER_TYPES.find(t => t.value === formData.transferType)?.label}</p>
              {formData.description && <p><strong>Description:</strong> {formData.description}</p>}
            </div>
            <p className="text-sm text-red-600 font-medium">
              Please verify all details before confirming. This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3 pt-2">
              <Button variant="secondary" onClick={() => setShowConfirmation(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleConfirmTransfer} 
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Confirming...' : 'Confirm Transfer'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

// Assuming a simple OfflineIndicator component for requirement 8
// This would typically be a global component, but included here for completeness
const OfflineIndicator = ({ isOnline }) => {
  if (isOnline) return null;
  return (
    <div className="p-3 mb-4 text-center text-sm font-medium text-white bg-red-500 rounded-lg shadow-md">
      You are currently offline. Transfers will be processed when connection is restored.
    </div>
  );
};

// Placeholder components for demonstration. In a real PWA, these would be fully implemented.
const Button = ({ children, onClick, type = 'button', disabled = false, className = '', variant = 'primary' }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-semibold transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2";
  const primaryStyle = "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500";
  const secondaryStyle = "bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-500";
  const disabledStyle = "opacity-50 cursor-not-allowed";

  let style = variant === 'primary' ? primaryStyle : secondaryStyle;
  if (disabled) style = disabledStyle;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${style} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({ id, name, type, value, onChange, placeholder, error, ...props }) => (
  <input
    id={id}
    name={name}
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={`w-full p-3 border ${error ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150`}
    {...props}
  />
);

const Select = ({ id, name, value, onChange, options, error }) => (
  <select
    id={id}
    name={name}
    value={value}
    onChange={onChange}
    className={`w-full p-3 border ${error ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white appearance-none transition duration-150`}
  >
    {options.map(option => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm transform transition-all">
        <div className="p-5 border-b flex justify-between items-center">
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            &times;
          </button>
        </div>
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
};

const LoadingSpinner = () => (
  <svg className="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const ErrorAlert = ({ message, className = '' }) => (
  <div className={`p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg ${className}`} role="alert">
    <p className="font-bold">Error</p>
    <p className="text-sm">{message}</p>
  </div>
);

export default Transfers;
