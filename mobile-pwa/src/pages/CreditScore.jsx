import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';

// Mock Service Imports (as per requirement 3)
// In a real app, these would be implemented services
const AuthService = {
  getUser: () => ({ id: 'user-123', name: 'Neo Customer' }),
};

const ApiService = {
  fetchCreditScore: async () => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    // Simulate a successful response
    return {
      score: 740,
      scoreRange: 'Excellent',
      lastUpdated: new Date().toLocaleDateString(),
      factors: [
        { name: 'Payment History', impact: 'High', status: 'Excellent' },
        { name: 'Credit Utilization', impact: 'Medium', status: 'Good' },
        { name: 'Length of Credit History', impact: 'Medium', status: 'Fair' },
        { name: 'Credit Mix', impact: 'Low', status: 'Good' },
        { name: 'New Credit', impact: 'Low', status: 'Excellent' },
      ],
      tips: [
        'Pay all bills on time, every time.',
        'Keep credit card balances low (below 30% utilization).',
        'Avoid opening too many new credit accounts at once.',
        'Review your credit report regularly for errors.',
      ],
    };
  },
};

const NotificationService = {
  notify: (message: string) => console.log(`Notification: ${message}`),
};

// Mock UI Component Imports (as per requirement 4)
// In a real app, these would be actual components
const Card = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white p-4 rounded-lg shadow-md ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, className = '' }: { children: React.ReactNode, onClick: () => void, className?: string }) => (
  <button
    onClick={onClick}
    className={`w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition duration-300 ${className}`}
  >
    {children}
  </button>
);

const LoadingSpinner = () => (
  <div className="flex justify-center items-center p-8">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

// --- Component Definition ---

interface CreditScoreData {
  score: number;
  scoreRange: string;
  lastUpdated: string;
  factors: { name: string; impact: string; status: string }[];
  tips: string[];
}

const CreditScoreScreen: React.FC = () => {
  const [scoreData, setScoreData] = useState<CreditScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const navigate = useNavigate();
  const user = useMemo(() => AuthService.getUser(), []);

  // Function to determine color based on score range
  const getScoreColor = useCallback((range: string) => {
    switch (range.toLowerCase()) {
      case 'excellent': return 'text-green-600 border-green-600';
      case 'good': return 'text-lime-600 border-lime-600';
      case 'fair': return 'text-yellow-600 border-yellow-600';
      case 'poor': return 'text-red-600 border-red-600';
      default: return 'text-gray-600 border-gray-600';
    }
  }, []);

  // Data Loading (useEffect)
  useEffect(() => {
    const loadScore = async () => {
      if (isOffline) {
        setError('You are offline. Cannot fetch the latest credit score.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await ApiService.fetchCreditScore();
        setScoreData(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch credit score:', err);
        setError('Failed to load credit score. Please try again later.');
        NotificationService.notify('Credit score fetch failed.');
      } finally {
        setIsLoading(false);
      }
    };

    loadScore();

    // Offline support indicator setup
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOffline]);

  // Event Handler
  const handleRefresh = useCallback(() => {
    setScoreData(null); // Clear data to show loading state again
    setIsLoading(true);
    setError(null);
    // Re-trigger useEffect by toggling a state or directly calling the load function logic
    // For simplicity, we'll just rely on the next render cycle to show loading
    // In a real app, we'd call the loadScore function again.
    // Since loadScore is inside useEffect, we'll use a dummy state to re-trigger.
    // For this mock, we'll just call the logic directly.
    const reLoad = async () => {
        try {
            const data = await ApiService.fetchCreditScore();
            setScoreData(data);
            NotificationService.notify('Credit score refreshed successfully.');
        } catch (err) {
            setError('Failed to refresh score.');
            NotificationService.notify('Refresh failed.');
        } finally {
            setIsLoading(false);
        }
    };
    reLoad();
  }, []);

  // Render Logic
  const renderContent = () => {
    if (isLoading) {
      return <LoadingSpinner />;
    }

    if (error) {
      return (
        <div className="text-center p-8">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={handleRefresh} className="bg-red-600 hover:bg-red-700">
            Try Again
          </Button>
        </div>
      );
    }

    if (!scoreData) {
      // Empty state
      return (
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold mb-2">No Credit Score Available</h2>
          <p className="text-gray-600 mb-4">We could not retrieve your credit score information. This might be a temporary issue or you may need to complete verification.</p>
          <Button onClick={() => navigate('/verification')} className="bg-yellow-600 hover:bg-yellow-700">
            Go to Verification
          </Button>
        </div>
      );
    }

    const { score, scoreRange, lastUpdated, factors, tips } = scoreData;
    const scoreColorClass = getScoreColor(scoreRange);

    return (
      <div className="space-y-6 p-4">
        {/* Score Visualization */}
        <Card className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Your Credit Score</h1>
          <div className={`mx-auto w-40 h-40 flex flex-col justify-center items-center rounded-full border-8 ${scoreColorClass} transition-all duration-500`}>
            <p className="text-5xl font-extrabold">{score}</p>
            <p className={`text-sm font-semibold ${scoreColorClass}`}>{scoreRange}</p>
          </div>
          <p className="text-sm text-gray-500 mt-2">Last Updated: {lastUpdated}</p>
          <Button onClick={handleRefresh} className="mt-4 bg-gray-500 hover:bg-gray-600">
            Refresh Score
          </Button>
        </Card>

        {/* Factors Affecting Score */}
        <Card>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Factors Affecting Your Score</h2>
          <div className="space-y-3">
            {factors.map((factor, index) => (
              <div key={index} className="flex justify-between items-center border-b pb-2 last:border-b-0">
                <p className="font-medium text-gray-700">{factor.name}</p>
                <div className="flex items-center space-x-2">
                  <span className={`text-sm font-semibold ${getScoreColor(factor.status)}`}>
                    {factor.status}
                  </span>
                  <span className="text-xs text-gray-500">({factor.impact} Impact)</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Tips to Improve Score */}
        <Card>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Tips to Improve Your Score</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            {tips.map((tip, index) => (
              <li key={index} className="text-sm">{tip}</li>
            ))}
          </ul>
          <Link to="/credit-education" className="text-blue-600 hover:text-blue-800 text-sm mt-3 block">
            <p>Learn more about credit health &rarr;</p>
          </Link>
        </Card>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header with Mobile-first design */}
      <header className="bg-white shadow-sm p-4 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">Credit Score</h1>
        {isOffline && (
          <span className="text-sm text-red-500 font-medium p-1 bg-red-100 rounded">
            Offline Mode
          </span>
        )}
      </header>

      <main className="max-w-md mx-auto pb-6">
        {renderContent()}
      </main>
    </div>
  );
};

export default CreditScoreScreen;