import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ApiService from '../services/ApiService';
import NotificationService from '../services/NotificationService';

// Mock UI Components - In a real app, these would be imported from ../components/ui/
const Header = ({ title }) => <div className="p-4 bg-blue-600 text-white text-xl font-bold">{title}</div>;
const Card = ({ children }) => <div className="bg-white shadow-lg rounded-lg p-4 m-4">{children}</div>;
const Button = ({ children, onClick, disabled, className = '' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full py-2 px-4 rounded-lg font-semibold transition duration-300 ${
      disabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 text-white'
    } ${className}`}
  >
    {children}
  </button>
);
const Input = ({ label, type = 'text', name, value, onChange, error }) => (
  <div className="mb-4">
    <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={name}>
      {label}
    </label>
    <input
      className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline ${
        error ? 'border-red-500' : ''
      }`}
      id={name}
      type={type}
      name={name}
      value={value}
      onChange={onChange}
    />
    {error && <p className="text-red-500 text-xs italic mt-1">{error}</p>}
  </div>
);
const Select = ({ label, name, value, onChange, options, error }) => (
  <div className="mb-4">
    <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={name}>
      {label}
    </label>
    <select
      className={`shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline ${
        error ? 'border-red-500' : ''
      }`}
      id={name}
      name={name}
      value={value}
      onChange={onChange}
    >
      <option value="">Select an option</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    {error && <p className="text-red-500 text-xs italic mt-1">{error}</p>}
  </div>
);
const LoadingSpinner = () => (
  <div className="flex justify-center items-center p-8">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
  </div>
);
const OfflineIndicator = () => (
  <div className="fixed bottom-0 left-0 right-0 bg-yellow-500 text-white text-center p-2 text-sm">
    You are currently offline. Data may be outdated.
  </div>
);

// --- Component Start ---

const InsuranceQuote = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth(); // Example usage of AuthService
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    productType: '',
    coverageAmount: '',
    deductible: '',
    personalInfo: {
      age: '',
      zipCode: '',
    },
  });
  const [quoteResult, setQuoteResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  // 1. Initial Data Fetch (Product List)
  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Mock API call to get available insurance products
        const response = await ApiService.get('/insurance/products');
        setProducts(response.data || [
          { value: 'auto', label: 'Auto Insurance' },
          { value: 'home', label: 'Home Insurance' },
          { value: 'life', label: 'Life Insurance' },
        ]);
      } catch (err) {
        setError('Failed to load insurance products. Please try again.');
        NotificationService.error('Error loading products.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // 2. Offline/Online Status Handler
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

  // 3. Form Change Handler
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name in prev.personalInfo) {
        return {
          ...prev,
          personalInfo: {
            ...prev.personalInfo,
            [name]: value,
          },
        };
      }
      return { ...prev, [name]: value };
    });
    // Clear validation error on change
    setValidationErrors((prev) => ({ ...prev, [name]: undefined }));
  }, []);

  // 4. Form Validation Logic
  const validateForm = useCallback(() => {
    const errors = {};
    if (!formData.productType) errors.productType = 'Please select an insurance product.';
    if (!formData.coverageAmount || isNaN(formData.coverageAmount) || Number(formData.coverageAmount) <= 0) {
      errors.coverageAmount = 'Coverage amount must be a positive number.';
    }
    if (!formData.personalInfo.age || isNaN(formData.personalInfo.age) || Number(formData.personalInfo.age) < 18) {
      errors.age = 'Age must be 18 or older.';
    }
    if (!formData.personalInfo.zipCode || formData.personalInfo.zipCode.length !== 5) {
      errors.zipCode = 'Please enter a valid 5-digit zip code.';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // 5. Quote Submission Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      NotificationService.warning('Please correct the errors in the form.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setQuoteResult(null);

    try {
      // Mock API call to calculate the quote
      const response = await ApiService.post('/insurance/calculate-quote', formData);
      setQuoteResult(response.data || {
        premium: (Math.random() * 1000 + 500).toFixed(2),
        monthly: (Math.random() * 80 + 40).toFixed(2),
        details: `Quote for ${formData.productType} with $${formData.coverageAmount} coverage.`,
      });
      NotificationService.success('Quote calculated successfully!');
    } catch (err) {
      setError('Failed to calculate quote. Please check your details and try again.');
      NotificationService.error('Quote calculation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Dynamic Form Fields based on Product Selection (Simplified)
  const renderProductSpecificFields = () => {
    switch (formData.productType) {
      case 'auto':
        return (
          <>
            <Input
              label="Vehicle Make/Model"
              name="vehicleModel"
              value={formData.vehicleModel || ''}
              onChange={handleChange}
              error={validationErrors.vehicleModel}
            />
            <Input
              label="Driving History (Years)"
              type="number"
              name="drivingYears"
              value={formData.drivingYears || ''}
              onChange={handleChange}
              error={validationErrors.drivingYears}
            />
          </>
        );
      case 'home':
        return (
          <>
            <Input
              label="Property Value ($)"
              type="number"
              name="propertyValue"
              value={formData.propertyValue || ''}
              onChange={handleChange}
              error={validationErrors.propertyValue}
            />
            <Input
              label="Year Built"
              type="number"
              name="yearBuilt"
              value={formData.yearBuilt || ''}
              onChange={handleChange}
              error={validationErrors.yearBuilt}
            />
          </>
        );
      case 'life':
        return (
          <>
            <Input
              label="Beneficiary Name"
              name="beneficiary"
              value={formData.beneficiary || ''}
              onChange={handleChange}
              error={validationErrors.beneficiary}
            />
            <Select
              label="Health Status"
              name="healthStatus"
              value={formData.healthStatus || ''}
              onChange={handleChange}
              options={[
                { value: 'excellent', label: 'Excellent' },
                { value: 'good', label: 'Good' },
                { value: 'fair', label: 'Fair' },
              ]}
              error={validationErrors.healthStatus}
            />
          </>
        );
      default:
        return <p className="text-gray-500 italic">Select a product to see coverage details.</p>;
    }
  };

  // 7. Render Logic
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Header title="Insurance Quote Generator" />

      {!isOnline && <OfflineIndicator />}

      <main className="flex-grow p-4">
        <Card>
          <h2 className="text-2xl font-bold mb-4 text-blue-800">Get Your Quote</h2>

          {/* Empty State for Products */}
          {products.length === 0 && !isLoading && !error && (
            <div className="text-center p-8 text-gray-500">
              <p className="mb-2">No insurance products are currently available.</p>
              <p>Please check back later or contact support.</p>
            </div>
          )}

          {/* Error State for Products */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
              <strong className="font-bold">Error!</strong>
              <span className="block sm:inline"> {error}</span>
            </div>
          )}

          {/* Main Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              label="Insurance Product"
              name="productType"
              value={formData.productType}
              onChange={handleChange}
              options={products}
              error={validationErrors.productType}
            />

            <Input
              label="Coverage Amount ($)"
              type="number"
              name="coverageAmount"
              value={formData.coverageAmount}
              onChange={handleChange}
              error={validationErrors.coverageAmount}
            />

            <Input
              label="Deductible ($)"
              type="number"
              name="deductible"
              value={formData.deductible}
              onChange={handleChange}
              error={validationErrors.deductible}
            />

            <h3 className="text-lg font-semibold mt-6 mb-2 border-b pb-1">Personal Details</h3>
            <Input
              label="Age"
              type="number"
              name="age"
              value={formData.personalInfo.age}
              onChange={handleChange}
              error={validationErrors.age}
            />
            <Input
              label="Zip Code"
              type="text"
              name="zipCode"
              value={formData.personalInfo.zipCode}
              onChange={handleChange}
              error={validationErrors.zipCode}
            />

            <h3 className="text-lg font-semibold mt-6 mb-2 border-b pb-1">Product Specific Details</h3>
            {renderProductSpecificFields()}

            <Button type="submit" disabled={isLoading || products.length === 0}>
              {isLoading ? 'Calculating...' : 'Calculate Quote'}
            </Button>
          </form>
        </Card>

        {/* Quote Result Display */}
        {quoteResult && (
          <Card>
            <h2 className="text-2xl font-bold mb-4 text-green-600">Your Estimated Quote</h2>
            <div className="text-center py-4 border-b mb-4">
              <p className="text-4xl font-extrabold text-green-700">${quoteResult.premium}</p>
              <p className="text-sm text-gray-500">Estimated Annual Premium</p>
            </div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-lg font-medium">Monthly Payment:</p>
              <p className="text-xl font-bold text-blue-600">${quoteResult.monthly}</p>
            </div>
            <p className="text-sm text-gray-600 italic">{quoteResult.details}</p>
            <div className="mt-4">
              <Link to="/purchase-insurance">
                <Button className="bg-blue-500 hover:bg-blue-600">Proceed to Purchase</Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Loading State for Quote Calculation */}
        {isLoading && !quoteResult && <LoadingSpinner />}

        {/* Example of using useNavigate and Link */}
        <div className="text-center mt-6">
          <Link to="/dashboard" className="text-blue-500 hover:text-blue-700 text-sm">
            Back to Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
};

export default InsuranceQuote;