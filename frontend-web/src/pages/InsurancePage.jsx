import React, { useState, useEffect, useMemo } from 'react';
import { api, InsuranceProduct, ActivePolicy, QuoteRequest, QuoteResponse, CoverageCalculation } from '../types/insurance';

// --- Utility Components (for better structure and reusability) ---

// Icon placeholders (assuming a library like Lucide or Heroicons is available)
const Icon = ({ name, className = '' }: { name: string, className?: string }) => (
  <span className={`inline-block w-5 h-5 ${className}`} aria-hidden="true">
    {/* Placeholder for a real icon */}
    {name.slice(0, 1)}
  </span>
);

// Loading State Component
const LoadingSpinner = () => (
  <div className="flex justify-center items-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neo-blue-500"></div>
    <p className="ml-3 text-neo-gray-600">Loading data...</p>
  </div>
);

// Error State Component
const ErrorMessage = ({ message }: { message: string }) => (
  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
    <strong className="font-bold">Error: </strong>
    <span className="block sm:inline">{message}</span>
  </div>
);

// Card Component
const Card = ({ title, children, className = '' }: { title: string, children: React.ReactNode, className?: string }) => (
  <div className={`bg-white shadow-lg rounded-xl p-6 ${className}`}>
    <h2 className="text-2xl font-semibold text-neo-blue-800 mb-4 border-b pb-2">{title}</h2>
    {children}
  </div>
);

// --- Feature Components ---

const InsuranceProductCatalog = ({ products }: { products: InsuranceProduct[] }) => (
  <Card title="Insurance Products Catalog">
    <p className="text-neo-gray-600">Browse our comprehensive range of insurance products.</p>
    <div className="mt-4 space-y-4">
      {products.map(product => (
        <div key={product.id} className="p-4 border rounded-lg hover:shadow-md transition duration-150">
          <h3 className="text-xl font-medium text-neo-blue-700">{product.name}</h3>
          <p className="text-sm text-neo-gray-500">{product.description}</p>
          <div className="flex justify-between items-center mt-2">
            <span className="text-sm font-semibold text-neo-green-600">${product.basePremium.toLocaleString()} / year</span>
            <button className="text-sm text-neo-blue-500 hover:text-neo-blue-700 font-medium">View Details</button>
          </div>
        </div>
      ))}
    </div>
  </Card>
);

const ProductComparison = ({ products }: { products: InsuranceProduct[] }) => {
  const [selectedProducts, setSelectedProducts] = useState<InsuranceProduct[]>([]);

  const handleSelect = (product: InsuranceProduct) => {
    setSelectedProducts(prev => 
      prev.some(p => p.id === product.id)
        ? prev.filter(p => p.id !== product.id)
        : [...prev, product].slice(0, 3) // Limit to 3 for comparison
    );
  };

  return (
    <Card title="Product Comparison">
      <p className="text-neo-gray-600 mb-4">Select up to 3 products to compare features and premiums.</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {products.map(product => (
          <button
            key={product.id}
            onClick={() => handleSelect(product)}
            className={`px-3 py-1 text-sm rounded-full transition duration-150 ${
              selectedProducts.some(p => p.id === product.id)
                ? 'bg-neo-blue-500 text-white'
                : 'bg-neo-gray-100 text-neo-gray-700 hover:bg-neo-blue-100'
            }`}
          >
            {product.name}
          </button>
        ))}
      </div>
      
      {selectedProducts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neo-gray-200">
            <thead className="bg-neo-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neo-gray-500 uppercase tracking-wider">Feature</th>
                {selectedProducts.map(p => (
                  <th key={p.id} className="px-6 py-3 text-left text-xs font-medium text-neo-gray-500 uppercase tracking-wider">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neo-gray-200">
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neo-gray-900">Category</td>
                {selectedProducts.map(p => <td key={p.id} className="px-6 py-4 whitespace-nowrap text-sm text-neo-gray-500">{p.category}</td>)}
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neo-gray-900">Base Premium (Annual)</td>
                {selectedProducts.map(p => <td key={p.id} className="px-6 py-4 whitespace-nowrap text-sm text-neo-green-600 font-semibold">${p.basePremium.toLocaleString()}</td>)}
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neo-gray-900">Rating</td>
                {selectedProducts.map(p => <td key={p.id} className="px-6 py-4 whitespace-nowrap text-sm text-neo-gray-500">{p.rating} / 5</td>)}
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neo-gray-900">Key Features</td>
                {selectedProducts.map(p => (
                  <td key={p.id} className="px-6 py-4 text-sm text-neo-gray-500">
                    <ul className="list-disc list-inside space-y-1">
                      {p.features.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const CoverageCalculator = () => {
  const [income, setIncome] = useState(50000);
  const [dependents, setDependents] = useState(1);
  const [result, setResult] = useState<CoverageCalculation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const calcResult = await api.calculateCoverage(income, dependents);
      setResult(calcResult);
    } catch (err) {
      setError('Failed to calculate coverage. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Coverage Calculator (Life Insurance)">
      <p className="text-neo-gray-600 mb-4">Determine the optimal life insurance coverage amount for your needs.</p>
      <div className="space-y-4">
        <div>
          <label htmlFor="income" className="block text-sm font-medium text-neo-gray-700">Annual Income ($)</label>
          <input
            type="number"
            id="income"
            value={income}
            onChange={(e) => setIncome(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-neo-gray-300 shadow-sm focus:border-neo-blue-500 focus:ring-neo-blue-500 sm:text-sm"
            min="10000"
            step="1000"
          />
        </div>
        <div>
          <label htmlFor="dependents" className="block text-sm font-medium text-neo-gray-700">Number of Dependents</label>
          <input
            type="number"
            id="dependents"
            value={dependents}
            onChange={(e) => setDependents(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-neo-gray-300 shadow-sm focus:border-neo-blue-500 focus:ring-neo-blue-500 sm:text-sm"
            min="0"
          />
        </div>
        <button
          onClick={handleCalculate}
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-neo-green-600 hover:bg-neo-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neo-green-500 disabled:opacity-50"
        >
          {loading ? 'Calculating...' : 'Calculate Recommended Coverage'}
        </button>
      </div>
      {error && <ErrorMessage message={error} />}
      {result && (
        <div className="mt-4 p-4 bg-neo-blue-50 rounded-lg border border-neo-blue-200">
          <h3 className="text-lg font-semibold text-neo-blue-800">Recommended Coverage:</h3>
          <p className="text-3xl font-bold text-neo-green-600 my-2">${result.recommendedCoverage.toLocaleString()}</p>
          <p className="text-sm text-neo-gray-600">{result.reasoning}</p>
        </div>
      )}
    </Card>
  );
};

const PremiumEstimator = ({ products }: { products: InsuranceProduct[] }) => {
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id || '');
  const [age, setAge] = useState(30);
  const [location, setLocation] = useState('Suburbia');
  const [estimate, setEstimate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEstimate = async () => {
    if (!selectedProduct) return;
    setLoading(true);
    setError(null);
    setEstimate(null);
    try {
      const result = await api.getPremiumEstimate(selectedProduct, age, location);
      setEstimate(result);
    } catch (err) {
      setError('Failed to get premium estimate. Check your inputs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Premium Estimator">
      <p className="text-neo-gray-600 mb-4">Get a quick, non-binding estimate for a specific product.</p>
      <div className="space-y-4">
        <div>
          <label htmlFor="product" className="block text-sm font-medium text-neo-gray-700">Insurance Product</label>
          <select
            id="product"
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="mt-1 block w-full rounded-md border-neo-gray-300 shadow-sm focus:border-neo-blue-500 focus:ring-neo-blue-500 sm:text-sm"
          >
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
            ))}
          </select>
        </div>
        <div className="flex space-x-4">
          <div className="flex-1">
            <label htmlFor="age" className="block text-sm font-medium text-neo-gray-700">Age</label>
            <input
              type="number"
              id="age"
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border-neo-gray-300 shadow-sm focus:border-neo-blue-500 focus:ring-neo-blue-500 sm:text-sm"
              min="18"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="location" className="block text-sm font-medium text-neo-gray-700">Location (e.g., City/Suburbia)</label>
            <input
              type="text"
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 block w-full rounded-md border-neo-gray-300 shadow-sm focus:border-neo-blue-500 focus:ring-neo-blue-500 sm:text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleEstimate}
          disabled={loading || !selectedProduct}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-neo-blue-600 hover:bg-neo-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neo-blue-500 disabled:opacity-50"
        >
          {loading ? 'Estimating...' : 'Get Premium Estimate'}
        </button>
      </div>
      {error && <ErrorMessage message={error} />}
      {estimate !== null && (
        <div className="mt-4 p-4 bg-neo-green-50 rounded-lg border border-neo-green-200 text-center">
          <h3 className="text-lg font-semibold text-neo-green-800">Estimated Annual Premium:</h3>
          <p className="text-4xl font-extrabold text-neo-green-600 my-2">${estimate.toLocaleString()}</p>
          <p className="text-sm text-neo-gray-600">This is an estimate and not a final quote.</p>
        </div>
      )}
    </Card>
  );
};

const ActivePoliciesOverview = ({ policies }: { policies: ActivePolicy[] }) => (
  <Card title="Active Policies Overview">
    <p className="text-neo-gray-600 mb-4">Your current insurance policies with NeoBank.</p>
    {policies.length === 0 ? (
      <div className="text-center p-8 bg-neo-gray-50 rounded-lg">
        <Icon name="P" className="mx-auto h-12 w-12 text-neo-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-neo-gray-900">No Active Policies</h3>
        <p className="mt-1 text-sm text-neo-gray-500">
          It looks like you don't have any active insurance policies with us yet.
        </p>
      </div>
    ) : (
      <div className="space-y-4">
        {policies.map(policy => (
          <div key={policy.id} className="p-4 border rounded-lg flex justify-between items-center bg-neo-blue-50">
            <div>
              <h3 className="text-lg font-medium text-neo-blue-700">{policy.productName}</h3>
              <p className="text-sm text-neo-gray-500">Policy #: {policy.policyNumber}</p>
              <p className="text-xs text-neo-gray-400">Valid: {policy.startDate} - {policy.endDate}</p>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-neo-green-600">${policy.premium.toLocaleString()}</span>
              <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                policy.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                {policy.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    )}
  </Card>
);

const QuickQuoteButton = ({ products }: { products: InsuranceProduct[] }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [request, setRequest] = useState<QuoteRequest>({
    productId: products[0]?.id || '',
    coverageAmount: 100000,
    term: 10,
    location: 'USA',
  });
  const [quoteResult, setQuoteResult] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRequest(prev => ({ ...prev, [name]: name === 'coverageAmount' || name === 'term' ? Number(value) : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setQuoteResult(null);
    try {
      const result = await api.submitQuickQuote(request);
      setQuoteResult(result);
    } catch (err) {
      setError('Failed to generate quick quote. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = products.find(p => p.id === request.productId);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-8 right-8 z-50 p-4 rounded-full shadow-2xl text-white bg-neo-red-600 hover:bg-neo-red-700 transition duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-neo-red-300"
        aria-label="Get a Quick Quote"
      >
        <Icon name="Q" className="w-8 h-8" />
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-neo-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h3 className="text-xl font-bold text-neo-blue-800">Get a Quick Quote</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neo-gray-400 hover:text-neo-gray-600">
                <Icon name="X" className="w-6 h-6" />
              </button>
            </div>
            
            {quoteResult ? (
              <div className="text-center p-6">
                <h4 className="text-2xl font-bold text-neo-green-600">Quote Received!</h4>
                <p className="text-5xl font-extrabold text-neo-blue-800 my-4">${quoteResult.monthlyPremium.toLocaleString()}<span className="text-xl font-normal text-neo-gray-500">/mo</span></p>
                <p className="text-sm text-neo-gray-600">Estimated Annual Premium: ${quoteResult.premiumEstimate.toLocaleString()}</p>
                <p className="text-sm text-neo-gray-600">Quote ID: {quoteResult.quoteId}</p>
                <p className="text-sm text-neo-gray-600">Valid Until: {quoteResult.validUntil}</p>
                <button
                  onClick={() => { setQuoteResult(null); setRequest(prev => ({...prev, coverageAmount: 100000, term: 10})); }}
                  className="mt-4 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-neo-blue-600 hover:bg-neo-blue-700"
                >
                  Get Another Quote
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="productId" className="block text-sm font-medium text-neo-gray-700">Product of Interest</label>
                  <select
                    id="productId"
                    name="productId"
                    value={request.productId}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-neo-gray-300 shadow-sm focus:border-neo-blue-500 focus:ring-neo-blue-500 sm:text-sm"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="coverageAmount" className="block text-sm font-medium text-neo-gray-700">Desired Coverage Amount ($)</label>
                  <input
                    type="number"
                    id="coverageAmount"
                    name="coverageAmount"
                    value={request.coverageAmount}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-neo-gray-300 shadow-sm focus:border-neo-blue-500 focus:ring-neo-blue-500 sm:text-sm"
                    min="10000"
                    step="10000"
                  />
                </div>
                <div className="flex space-x-4">
                  <div className="flex-1">
                    <label htmlFor="term" className="block text-sm font-medium text-neo-gray-700">Term (Years)</label>
                    <input
                      type="number"
                      id="term"
                      name="term"
                      value={request.term}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-md border-neo-gray-300 shadow-sm focus:border-neo-blue-500 focus:ring-neo-blue-500 sm:text-sm"
                      min="1"
                      max="30"
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="location" className="block text-sm font-medium text-neo-gray-700">Location</label>
                    <input
                      type="text"
                      id="location"
                      name="location"
                      value={request.location}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-md border-neo-gray-300 shadow-sm focus:border-neo-blue-500 focus:ring-neo-blue-500 sm:text-sm"
                    />
                  </div>
                </div>
                {error && <ErrorMessage message={error} />}
                <button
                  type="submit"
                  disabled={loading || !selectedProduct}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-neo-red-600 hover:bg-neo-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neo-red-500 disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Get Quote Now'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};


// --- Main Component ---

// Define a custom color palette for NeoBank's branding using Tailwind CSS classes
// Note: These classes are assumed to be configured in a hypothetical tailwind.config.js
// For this standalone file, we use standard Tailwind classes and prefix them with 'neo-'
// to simulate a custom theme (e.g., neo-blue-500 is just blue-500 in this context).
// In a real Next.js project, these would be defined in the config file.

const InsurancePage: React.FC = () => {
  const [products, setProducts] = useState<InsuranceProduct[]>([]);
  const [policies, setPolicies] = useState<ActivePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productsData, policiesData] = await Promise.all([
          api.fetchProducts(),
          api.fetchActivePolicies(),
        ]);
        setProducts(productsData);
        setPolicies(policiesData);
      } catch (err) {
        console.error('API Fetch Error:', err);
        setError('Failed to load insurance data. Please check your connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Memoize the product list for components that need it
  const productList = useMemo(() => products, [products]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neo-gray-50 p-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neo-gray-50 p-8">
        <ErrorMessage message={error} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neo-gray-50 p-4 sm:p-8">
      {/* Header Section */}
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold text-neo-blue-900">NeoBank Insurance Hub</h1>
        <p className="text-xl text-neo-gray-600 mt-2">Protect your future with our comprehensive insurance solutions.</p>
      </header>

      {/* Main Content Grid */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2/3 width on large screens) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Active Policies Overview */}
          <ActivePoliciesOverview policies={policies} />

          {/* Insurance Products Catalog */}
          <InsuranceProductCatalog products={productList} />

          {/* Product Comparison */}
          <ProductComparison products={productList} />
        </div>

        {/* Right Column (1/3 width on large screens) */}
        <div className="lg:col-span-1 space-y-8">
          {/* Coverage Calculator */}
          <CoverageCalculator />

          {/* Premium Estimator */}
          <PremiumEstimator products={productList} />
        </div>
      </main>

      {/* Quick Quote Button (Fixed position) */}
      <QuickQuoteButton products={productList} />
    </div>
  );
};

// Export the component for use in a Next.js page (e.g., pages/insurance.tsx)
export default InsurancePage;