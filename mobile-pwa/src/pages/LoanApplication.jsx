import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { useNotification } from '../hooks/useNotification';

// Simulated UI Components
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import FileUpload from '../components/ui/FileUpload'; // Simulated component for document upload

// --- Types and Constants ---

interface LoanApplicationForm {
  amount: number | '';
  purpose: string;
  term: number | ''; // in months
  monthlyIncome: number | '';
  incomeVerificationFile: File | null;
  idDocumentFile: File | null;
  addressProofFile: File | null;
}

interface LoanPurposeOption {
  value: string;
  label: string;
}

const LOAN_PURPOSES: LoanPurposeOption[] = [
  { value: 'home_improvement', label: 'Home Improvement' },
  { value: 'debt_consolidation', label: 'Debt Consolidation' },
  { value: 'car_purchase', label: 'Car Purchase' },
  { value: 'education', label: 'Education' },
  { value: 'other', label: 'Other' },
];

const INITIAL_FORM_STATE: LoanApplicationForm = {
  amount: '',
  purpose: LOAN_PURPOSES[0].value,
  term: 36,
  monthlyIncome: '',
  incomeVerificationFile: null,
  idDocumentFile: null,
  addressProofFile: null,
};

// --- Component Definition ---

const LoanApplicationScreen: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { submitLoanApplication, getLoanTerms } = useApi();
  const { notify } = useNotification();

  const [formData, setFormData] = useState<LoanApplicationForm>(INITIAL_FORM_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // --- Offline/Online Status Effect ---
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

  // --- Initial Data Loading Effect (e.g., fetching personalized loan terms) ---
  useEffect(() => {
    if (!isAuthenticated) {
      notify('Please log in to apply for a loan.', 'warning');
      navigate('/login');
      return;
    }

    const fetchTerms = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Simulate API call to fetch terms
        const terms = await getLoanTerms();
        // setFormData(prev => ({ ...prev, term: terms.defaultTerm }));
      } catch (err) {
        setError('Failed to load loan terms. Please try again.');
        notify('Error loading loan terms.', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTerms();
  }, [isAuthenticated, navigate, notify, getLoanTerms]);

  // --- Form Validation Logic ---
  const validateForm = useCallback((): boolean => {
    if (formData.amount === '' || formData.amount <= 0) {
      setError('Please enter a valid loan amount.');
      return false;
    }
    if (formData.term === '' || formData.term <= 0) {
      setError('Please select a valid loan term.');
      return false;
    }
    if (!formData.purpose) {
      setError('Please select a loan purpose.');
      return false;
    }
    if (formData.monthlyIncome === '' || formData.monthlyIncome <= 0) {
      setError('Please enter your valid monthly income.');
      return false;
    }
    if (!formData.incomeVerificationFile) {
      setError('Income verification document is required.');
      return false;
    }
    if (!formData.idDocumentFile) {
      setError('ID document is required.');
      return false;
    }
    setError(null);
    return true;
  }, [formData]);

  // --- Event Handlers ---

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const handleFileChange = (name: keyof LoanApplicationForm, file: File | null) => {
    setFormData(prev => ({
      ...prev,
      [name]: file,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      notify('Validation failed. Please check the form.', 'error');
      return;
    }

    if (!isOnline) {
      notify('You are offline. Your application will be saved and submitted when you are back online.', 'info');
      // In a real PWA, you would save the form data to IndexedDB here.
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Simulate API call for submission
      const response = await submitLoanApplication(formData);
      notify('Loan application submitted successfully!', 'success');
      navigate('/application-status', { state: { applicationId: response.id } });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred during submission.';
      setError(errorMessage);
      notify(errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render Logic ---

  const isFormValid = useMemo(() => validateForm(), [validateForm]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <Spinner size="lg" />
        <p className="ml-3 text-lg text-gray-600">Loading application form...</p>
      </div>
    );
  }

  if (error && !isSubmitting) {
    return (
      <div className="p-4 md:p-8 max-w-xl mx-auto">
        <Alert type="error" message={error} />
        <Button onClick={() => window.location.reload()} className="mt-4 w-full">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-3xl mx-auto bg-white shadow-xl rounded-lg">
        <header className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-800 mobile-first:text-3xl">Loan Application</h1>
          <p className="text-sm text-gray-500 mt-1">
            Fill out the form below to apply for a loan. All fields are required.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Offline Indicator */}
          {!isOnline && (
            <Alert
              type="warning"
              message="You are currently offline. Your application will be saved locally and submitted automatically when connection is restored."
            />
          )}

          {/* Loan Details Section */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-700 border-b pb-2">Loan Details</h2>
            <Input
              label="Loan Amount (USD)"
              name="amount"
              type="number"
              placeholder="e.g., 10000"
              value={formData.amount}
              onChange={handleChange}
              min="1000"
              required
              className="mobile-first:text-lg"
            />

            <Select
              label="Loan Purpose"
              name="purpose"
              value={formData.purpose}
              onChange={handleChange}
              options={LOAN_PURPOSES}
              required
            />

            <Input
              label="Loan Term (Months)"
              name="term"
              type="number"
              placeholder="e.g., 36"
              value={formData.term}
              onChange={handleChange}
              min="12"
              max="84"
              required
            />
          </section>

          {/* Income and Verification Section */}
          <section className="space-y-4 pt-4">
            <h2 className="text-xl font-semibold text-gray-700 border-b pb-2">Income & Verification</h2>
            <Input
              label="Estimated Monthly Income (USD)"
              name="monthlyIncome"
              type="number"
              placeholder="e.g., 5000"
              value={formData.monthlyIncome}
              onChange={handleChange}
              min="1"
              required
            />

            <FileUpload
              label="Income Verification Document (e.g., Pay Stubs, Bank Statement)"
              name="incomeVerificationFile"
              onFileChange={(file) => handleFileChange('incomeVerificationFile', file)}
              required
              currentFile={formData.incomeVerificationFile}
            />
          </section>

          {/* Document Upload Section */}
          <section className="space-y-4 pt-4">
            <h2 className="text-xl font-semibold text-gray-700 border-b pb-2">Required Documents</h2>
            <FileUpload
              label="Government ID Document (e.g., Driver's License, Passport)"
              name="idDocumentFile"
              onFileChange={(file) => handleFileChange('idDocumentFile', file)}
              required
              currentFile={formData.idDocumentFile}
            />
            <FileUpload
              label="Proof of Address (e.g., Utility Bill)"
              name="addressProofFile"
              onFileChange={(file) => handleFileChange('addressProofFile', file)}
              required
              currentFile={formData.addressProofFile}
            />
          </section>

          {/* Submission Button */}
          <div className="pt-6">
            <Button
              type="submit"
              disabled={isSubmitting || !isFormValid}
              className="w-full py-3 text-lg mobile-first:py-4"
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Submitting...
                </>
              ) : (
                'Submit Application'
              )}
            </Button>
          </div>
        </form>

        <footer className="p-6 text-center text-xs text-gray-400 border-t mt-4">
          <p>&copy; NeoBank PWA. Your data is secured and encrypted.</p>
        </footer>
      </div>
    </div>
  );
};

export default LoanApplicationScreen;