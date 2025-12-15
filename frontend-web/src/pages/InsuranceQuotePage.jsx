import React, { useState, useMemo, useCallback } from 'react';
import { CheckCircleIcon, MailIcon, SaveIcon, ArrowRightIcon, RefreshCwIcon, Loader2Icon, DollarSignIcon, ShieldIcon, UserIcon, SendIcon } from 'lucide-react';

// --- 1. TYPESCRIPT DEFINITIONS ---

/**
 * Defines the structure for the user's quote request data.
 */
interface QuoteFormData {
  coverageType: 'auto' | 'home' | 'life' | null;
  deductible: number;
  limit: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
}

/**
 * Defines the structure for a single insurance quote.
 */
interface InsuranceQuote {
  id: string;
  provider: string;
  premium: number;
  deductible: number;
  limit: number;
  features: string[];
}

/**
 * Defines the overall state for the quote process.
 */
interface QuoteState {
  step: number;
  formData: QuoteFormData;
  quotes: InsuranceQuote[];
  isLoading: boolean;
  error: string | null;
  isQuoteSaved: boolean;
  isPolicyApplied: boolean;
}

// --- 2. CONSTANTS AND INITIAL STATE ---

const MAX_STEPS = 4;

const INITIAL_FORM_DATA: QuoteFormData = {
  coverageType: null,
  deductible: 500,
  limit: 100000,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
};

const INITIAL_STATE: QuoteState = {
  step: 1,
  formData: INITIAL_FORM_DATA,
  quotes: [],
  isLoading: false,
  error: null,
  isQuoteSaved: false,
  isPolicyApplied: false,
};

// --- 3. SIMULATED API FUNCTIONS ---

/**
 * Simulates an API call to fetch insurance quotes based on form data.
 * @param data The form data to send to the API.
 * @returns A promise that resolves with an array of simulated quotes.
 */
const fetchQuotesApi = (data: QuoteFormData): Promise<InsuranceQuote[]> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (data.coverageType === 'life' && data.limit > 500000) {
        reject(new Error('API Error: High-risk life insurance quotes require manual review.'));
        return;
      }

      const basePremium = data.coverageType === 'auto' ? 120 : data.coverageType === 'home' ? 80 : 50;
      const quotes: InsuranceQuote[] = [
        {
          id: 'q1',
          provider: 'NeoProtect Insurance',
          premium: basePremium * 1.2 + data.limit / 10000 - data.deductible / 100,
          deductible: data.deductible,
          limit: data.limit,
          features: ['24/7 Claims', 'Roadside Assistance', 'Rental Car Coverage'],
        },
        {
          id: 'q2',
          provider: 'SecureFuture Corp',
          premium: basePremium * 1.0 + data.limit / 12000 - data.deductible / 80,
          deductible: data.deductible + 250,
          limit: data.limit,
          features: ['Digital Policy Management', 'Accident Forgiveness'],
        },
        {
          id: 'q3',
          provider: 'Global Shield Partners',
          premium: basePremium * 1.5 + data.limit / 8000 - data.deductible / 120,
          deductible: data.deductible,
          limit: data.limit * 1.1,
          features: ['Premium Customer Support', 'Identity Theft Protection'],
        },
      ].map(q => ({ ...q, premium: parseFloat(q.premium.toFixed(2)) }));

      resolve(quotes);
    }, 1500);
  });
};

/**
 * Simulates an API call to save or email a quote.
 */
const saveOrEmailQuoteApi = (quoteId: string, email: string): Promise<void> => {
  return new Promise((resolve) => {
    console.log(`Simulating saving/emailing quote ${quoteId} to ${email}`);
    setTimeout(() => resolve(), 800);
  });
};

/**
 * Simulates an API call to apply for a policy.
 */
const applyForPolicyApi = (quoteId: string, data: QuoteFormData): Promise<void> => {
  return new Promise((resolve) => {
    console.log(`Simulating policy application for quote ${quoteId} with data:`, data);
    setTimeout(() => resolve(), 1200);
  });
};

// --- 4. UI COMPONENTS (Tailwind CSS) ---

// A simple button component
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost', loading?: boolean }> = ({ children, variant = 'primary', loading = false, className = '', ...props }) => {
  const baseStyle = 'px-6 py-3 rounded-lg font-semibold transition duration-200 flex items-center justify-center space-x-2';
  const variantStyles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-400',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100',
    ghost: 'bg-transparent text-indigo-600 hover:bg-indigo-50 disabled:text-indigo-300',
  };

  return (
    <button
      className={`${baseStyle} ${variantStyles[variant]} ${className}`}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading && <Loader2Icon className="w-5 h-5 animate-spin" />}
      {children}
    </button>
  );
};

// A simple input component
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string, error?: string }> = ({ label, error, ...props }) => (
  <div className="flex flex-col space-y-1">
    <label htmlFor={props.id} className="text-sm font-medium text-gray-700">
      {label}
    </label>
    <input
      className={`w-full px-4 py-2 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 ${error ? 'border-red-500' : 'border-gray-300'}`}
      {...props}
    />
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

// A component for the step indicator
const StepIndicator: React.FC<{ step: number, maxSteps: number }> = ({ step, maxSteps }) => (
  <div className="flex justify-between items-center mb-8">
    {Array.from({ length: maxSteps }).map((_, index) => {
      const stepNumber = index + 1;
      const isActive = stepNumber === step;
      const isCompleted = stepNumber < step;

      return (
        <React.Fragment key={stepNumber}>
          <div className="flex flex-col items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold transition-colors duration-300 ${isCompleted ? 'bg-green-500' : isActive ? 'bg-indigo-600' : 'bg-gray-300'}`}>
              {isCompleted ? <CheckCircleIcon className="w-5 h-5" /> : stepNumber}
            </div>
            <p className={`mt-2 text-sm ${isActive ? 'text-indigo-600 font-semibold' : 'text-gray-500'}`}>
              {stepNumber === 1 ? 'Coverage' : stepNumber === 2 ? 'Personal Info' : stepNumber === 3 ? 'Quotes' : 'Review'}
            </p>
          </div>
          {stepNumber < maxSteps && (
            <div className={`flex-1 h-1 mx-2 transition-colors duration-300 ${isCompleted ? 'bg-green-500' : 'bg-gray-300'}`} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// --- 5. STEP COMPONENTS ---

// Step 1: Coverage Selection
const StepCoverage: React.FC<{ formData: QuoteFormData, updateFormData: (key: keyof QuoteFormData, value: any) => void, nextStep: () => void }> = ({ formData, updateFormData, nextStep }) => {
  const isFormValid = formData.coverageType !== null;

  const handleSelect = (type: QuoteFormData['coverageType']) => {
    updateFormData('coverageType', type);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">1. Select Your Coverage Type</h2>
      <p className="text-gray-600">Choose the type of insurance you are looking for.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['auto', 'home', 'life'].map((type) => (
          <div
            key={type}
            className={`p-6 border-2 rounded-xl cursor-pointer transition-all duration-200 ${formData.coverageType === type ? 'border-indigo-600 ring-4 ring-indigo-100' : 'border-gray-200 hover:border-indigo-300'}`}
            onClick={() => handleSelect(type as QuoteFormData['coverageType'])}
          >
            <ShieldIcon className={`w-8 h-8 mb-3 ${formData.coverageType === type ? 'text-indigo-600' : 'text-gray-500'}`} />
            <h3 className="text-lg font-semibold capitalize">{type} Insurance</h3>
            <p className="text-sm text-gray-500 mt-1">
              {type === 'auto' ? 'Protect your vehicle and passengers.' : type === 'home' ? 'Secure your property and belongings.' : 'Financial security for your loved ones.'}
            </p>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t flex justify-end">
        <Button onClick={nextStep} disabled={!isFormValid}>
          Next Step <ArrowRightIcon className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};

// Step 2: Personal Information Input
const StepPersonalInfo: React.FC<{ formData: QuoteFormData, updateFormData: (key: keyof QuoteFormData, value: any) => void, nextStep: () => void, prevStep: () => void }> = ({ formData, updateFormData, nextStep, prevStep }) => {
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.firstName) newErrors.firstName = 'First name is required.';
    if (!formData.lastName) newErrors.lastName = 'Last name is required.';
    if (!formData.email || !/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'A valid email is required.';
    if (!formData.phone || !/^\d{10}$/.test(formData.phone.replace(/\D/g, ''))) newErrors.phone = 'A 10-digit phone number is required.';
    if (!formData.address) newErrors.address = 'Address is required.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      nextStep();
    }
  };

  const handleChange = (key: keyof QuoteFormData, value: string) => {
    updateFormData(key, value);
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: '' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">2. Tell Us About Yourself</h2>
      <p className="text-gray-600">We need a few details to generate accurate quotes.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="First Name" id="firstName" type="text" value={formData.firstName} onChange={(e) => handleChange('firstName', e.target.value)} error={errors.firstName} />
        <Input label="Last Name" id="lastName" type="text" value={formData.lastName} onChange={(e) => handleChange('lastName', e.target.value)} error={errors.lastName} />
        <Input label="Email Address" id="email" type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} error={errors.email} />
        <Input label="Phone Number" id="phone" type="tel" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} error={errors.phone} />
      </div>
      <Input label="Street Address" id="address" type="text" value={formData.address} onChange={(e) => handleChange('address', e.target.value)} error={errors.address} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Deductible ($)" id="deductible" type="number" value={formData.deductible} onChange={(e) => handleChange('deductible', parseInt(e.target.value) || 0)} />
        <Input label="Coverage Limit ($)" id="limit" type="number" value={formData.limit} onChange={(e) => handleChange('limit', parseInt(e.target.value) || 0)} />
      </div>

      <div className="pt-4 border-t flex justify-between">
        <Button type="button" variant="secondary" onClick={prevStep}>
          Back
        </Button>
        <Button type="submit">
          Get Quotes <DollarSignIcon className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </form>
  );
};

// Step 3: Quote Comparison and Selection
const StepQuotes: React.FC<{ state: QuoteState, dispatch: (action: Partial<QuoteState>) => void, prevStep: () => void, nextStep: () => void }> = ({ state, dispatch, prevStep, nextStep }) => {
  const { quotes, isLoading, error, formData } = state;
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const selectedQuote = useMemo(() => quotes.find(q => q.id === selectedQuoteId), [quotes, selectedQuoteId]);

  const handleFetchQuotes = useCallback(async () => {
    dispatch({ isLoading: true, error: null, quotes: [] });
    try {
      const newQuotes = await fetchQuotesApi(formData);
      dispatch({ quotes: newQuotes, isLoading: false });
      setSelectedQuoteId(newQuotes[0]?.id || null); // Auto-select the first quote
    } catch (err) {
      dispatch({ error: err instanceof Error ? err.message : 'An unknown error occurred while fetching quotes.', isLoading: false });
    }
  }, [formData, dispatch]);

  // Fetch quotes on component mount if not already fetched
  React.useEffect(() => {
    if (quotes.length === 0 && !isLoading && !error) {
      handleFetchQuotes();
    }
  }, [quotes.length, isLoading, error, handleFetchQuotes]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2Icon className="w-10 h-10 text-indigo-600 animate-spin" />
        <p className="mt-4 text-lg text-gray-600">Calculating the best premiums for you...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-red-600">Quote Calculation Failed</h2>
        <p className="text-red-500 bg-red-50 p-4 rounded-lg border border-red-200">{error}</p>
        <div className="pt-4 border-t flex justify-between">
          <Button type="button" variant="secondary" onClick={prevStep}>
            Go Back to Edit
          </Button>
          <Button onClick={handleFetchQuotes} loading={isLoading}>
            <RefreshCwIcon className="w-4 h-4 mr-2" /> Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-800">No Quotes Found</h2>
        <p className="text-gray-600">We could not generate any quotes based on your criteria. Please go back and adjust your information.</p>
        <div className="pt-4 border-t flex justify-start">
          <Button type="button" variant="secondary" onClick={prevStep}>
            Go Back to Edit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">3. Compare and Select Your Quote</h2>
      <p className="text-gray-600">We found {quotes.length} great options for your {formData.coverageType} insurance.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {quotes.map((quote) => (
          <div
            key={quote.id}
            className={`p-6 border-2 rounded-xl transition-all duration-200 cursor-pointer ${selectedQuoteId === quote.id ? 'border-indigo-600 ring-4 ring-indigo-100 shadow-lg' : 'border-gray-200 hover:border-indigo-300'}`}
            onClick={() => setSelectedQuoteId(quote.id)}
          >
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-bold text-indigo-600">${quote.premium.toLocaleString()}</h3>
              {selectedQuoteId === quote.id && <CheckCircleIcon className="w-6 h-6 text-green-500" />}
            </div>
            <p className="text-sm text-gray-500 mt-1">per month</p>
            <p className="text-lg font-semibold mt-3">{quote.provider}</p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li><span className="font-semibold">Deductible:</span> ${quote.deductible.toLocaleString()}</li>
              <li><span className="font-semibold">Limit:</span> ${quote.limit.toLocaleString()}</li>
              {quote.features.slice(0, 2).map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t flex justify-between">
        <Button type="button" variant="secondary" onClick={prevStep}>
          Back
        </Button>
        <Button onClick={nextStep} disabled={!selectedQuote}>
          Continue with {selectedQuote?.provider} <ArrowRightIcon className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};

// Step 4: Review and Action (Save/Email Quote, Apply for Policy)
const StepReview: React.FC<{ state: QuoteState, dispatch: (action: Partial<QuoteState>) => void, prevStep: () => void }> = ({ state, dispatch, prevStep }) => {
  const { formData, quotes, isLoading, isQuoteSaved, isPolicyApplied } = state;
  const [emailToSave, setEmailToSave] = useState(formData.email);
  const [saveLoading, setSaveLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);

  const selectedQuote = quotes[0]; // Assuming the user selected one in the previous step, or just use the first one for review

  const handleSaveOrEmail = async () => {
    if (!selectedQuote) return;
    setSaveLoading(true);
    dispatch({ error: null, isQuoteSaved: false });
    try {
      await saveOrEmailQuoteApi(selectedQuote.id, emailToSave);
      dispatch({ isQuoteSaved: true });
    } catch (err) {
      dispatch({ error: 'Failed to save/email quote. Please try again.' });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleApplyForPolicy = async () => {
    if (!selectedQuote) return;
    setApplyLoading(true);
    dispatch({ error: null, isPolicyApplied: false });
    try {
      await applyForPolicyApi(selectedQuote.id, formData);
      dispatch({ isPolicyApplied: true });
    } catch (err) {
      dispatch({ error: 'Failed to apply for policy. Please contact support.' });
    } finally {
      setApplyLoading(false);
    }
  };

  if (!selectedQuote) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-red-600">Error: No Quote Selected</h2>
        <p className="text-gray-600">Please go back to the quotes step and select a quote.</p>
        <div className="pt-4 border-t flex justify-start">
          <Button type="button" variant="secondary" onClick={prevStep}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-800">4. Review and Final Actions</h2>

      {/* Quote Summary */}
      <div className="bg-white p-6 rounded-xl shadow-md border border-indigo-100">
        <h3 className="text-xl font-bold text-indigo-600 mb-4">Your Selected Quote</h3>
        <div className="grid grid-cols-2 gap-4 text-gray-700">
          <div><span className="font-semibold">Provider:</span> {selectedQuote.provider}</div>
          <div><span className="font-semibold">Premium:</span> <span className="text-2xl font-bold text-green-600">${selectedQuote.premium.toLocaleString()}</span> /mo</div>
          <div><span className="font-semibold">Deductible:</span> ${selectedQuote.deductible.toLocaleString()}</div>
          <div><span className="font-semibold">Limit:</span> ${selectedQuote.limit.toLocaleString()}</div>
        </div>
      </div>

      {/* Personal Info Summary */}
      <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Your Information</h3>
        <div className="grid grid-cols-2 gap-4 text-gray-700">
          <div><span className="font-semibold">Name:</span> {formData.firstName} {formData.lastName}</div>
          <div><span className="font-semibold">Email:</span> {formData.email}</div>
          <div><span className="font-semibold">Phone:</span> {formData.phone}</div>
          <div><span className="font-semibold">Address:</span> {formData.address}</div>
        </div>
      </div>

      {/* Save/Email Quote */}
      <div className="p-6 bg-indigo-50 rounded-xl border border-indigo-200 space-y-4">
        <h3 className="text-lg font-semibold text-indigo-800 flex items-center"><MailIcon className="w-5 h-5 mr-2" /> Save or Email Quote</h3>
        {isQuoteSaved ? (
          <p className="text-green-600 font-medium flex items-center"><CheckCircleIcon className="w-5 h-5 mr-2" /> Quote successfully saved and emailed to {emailToSave}!</p>
        ) : (
          <>
            <Input label="Email to send quote to" id="emailSave" type="email" value={emailToSave} onChange={(e) => setEmailToSave(e.target.value)} />
            <Button onClick={handleSaveOrEmail} loading={saveLoading} disabled={!emailToSave || saveLoading} variant="ghost" className="w-full">
              <SaveIcon className="w-4 h-4 mr-2" /> Save & Email Quote
            </Button>
          </>
        )}
      </div>

      {/* Apply for Policy */}
      <div className="p-6 bg-green-50 rounded-xl border border-green-200 space-y-4">
        <h3 className="text-lg font-semibold text-green-800 flex items-center"><UserIcon className="w-5 h-5 mr-2" /> Apply for Policy</h3>
        {isPolicyApplied ? (
          <p className="text-green-600 font-medium flex items-center"><CheckCircleIcon className="w-5 h-5 mr-2" /> Application submitted successfully! A representative will contact you shortly.</p>
        ) : (
          <Button onClick={handleApplyForPolicy} loading={applyLoading} disabled={applyLoading} variant="primary" className="w-full bg-green-600 hover:bg-green-700">
            <SendIcon className="w-4 h-4 mr-2" /> Apply Now for ${selectedQuote.premium.toLocaleString()}/mo
          </Button>
        )}
      </div>

      {/* Navigation */}
      <div className="pt-4 border-t flex justify-start">
        <Button type="button" variant="secondary" onClick={prevStep} disabled={applyLoading || saveLoading}>
          Back to Quotes
        </Button>
      </div>
    </div>
  );
};

// --- 6. MAIN COMPONENT ---

/**
 * The main multi-step insurance quote page component.
 */
const InsuranceQuotePage: React.FC = () => {
  const [state, setState] = useState<QuoteState>(INITIAL_STATE);

  // Centralized state update function
  const dispatch = useCallback((action: Partial<QuoteState>) => {
    setState(prevState => ({ ...prevState, ...action }));
  }, []);

  // Function to update form data
  const updateFormData = useCallback((key: keyof QuoteFormData, value: any) => {
    dispatch({ formData: { ...state.formData, [key]: value } });
  }, [state.formData, dispatch]);

  // Navigation functions
  const nextStep = useCallback(() => {
    dispatch({ step: Math.min(state.step + 1, MAX_STEPS) });
  }, [state.step, dispatch]);

  const prevStep = useCallback(() => {
    dispatch({ step: Math.max(state.step - 1, 1) });
  }, [state.step, dispatch]);

  // Render the current step component
  const renderStep = useMemo(() => {
    switch (state.step) {
      case 1:
        return <StepCoverage formData={state.formData} updateFormData={updateFormData} nextStep={nextStep} />;
      case 2:
        return <StepPersonalInfo formData={state.formData} updateFormData={updateFormData} nextStep={nextStep} prevStep={prevStep} />;
      case 3:
        return <StepQuotes state={state} dispatch={dispatch} prevStep={prevStep} nextStep={nextStep} />;
      case 4:
        return <StepReview state={state} dispatch={dispatch} prevStep={prevStep} />;
      default:
        return <div>Step not found.</div>;
    }
  }, [state, updateFormData, nextStep, prevStep, dispatch]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-xl p-6 sm:p-10">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
          NeoBank Insurance Quote
        </h1>
        <p className="text-lg text-gray-500 mb-8">
          Get a personalized quote in just a few simple steps.
        </p>

        <StepIndicator step={state.step} maxSteps={MAX_STEPS} />

        <div className="min-h-[400px]">
          {renderStep}
        </div>

        {/* Global Error Display */}
        {state.error && (
          <div className="mt-8 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg" role="alert">
            <p className="font-bold">Process Error:</p>
            <p className="text-sm">{state.error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InsuranceQuotePage;