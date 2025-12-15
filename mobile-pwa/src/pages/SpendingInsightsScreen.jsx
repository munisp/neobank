import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// Mock imports for required services and UI components
// In a real application, these would be implemented and imported from the specified paths.
import { AuthService } from '../services/AuthService';
import { ApiService } from '../services/ApiService';
import { NotificationService } from '../services/NotificationService';
import {
  Card,
  Spinner,
  Alert,
  Button,
  ChartPlaceholder,
  CategoryList,
  RecommendationCard,
  OfflineIndicator,
  Header,
  Footer,
} from '../components/ui/';

// --- Data Structures (Mocked) ---

interface SpendingCategory {
  id: string;
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

interface SpendingTrend {
  month: string;
  spending: number;
}

interface Recommendation {
  id: string;
  title: string;
  description: string;
  actionLink: string;
}

interface SpendingInsightsData {
  totalSpending: number;
  categories: SpendingCategory[];
  trends: SpendingTrend[];
  recommendations: Recommendation[];
}

// --- Mock Context for Offline Status (Requirement 8) ---
// In a real PWA, this would likely be a global context or a custom hook
// that monitors network status.
interface AppContextType {
  isOnline: boolean;
}
const AppContext = React.createContext<AppContextType>({ isOnline: true });

// --- Mock Data Fetching Function ---
const fetchSpendingInsights = async (): Promise<SpendingInsightsData> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Simulate an error 10% of the time
  if (Math.random() < 0.1) {
    throw new Error('Failed to fetch spending insights. Please try again.');
  }

  // Mock successful data
  return {
    totalSpending: 2450.75,
    categories: [
      { id: '1', name: 'Groceries', amount: 750.50, percentage: 30.6, color: 'bg-red-500' },
      { id: '2', name: 'Rent', amount: 1000.00, percentage: 40.8, color: 'bg-blue-500' },
      { id: '3', name: 'Entertainment', amount: 300.25, percentage: 12.2, color: 'bg-green-500' },
      { id: '4', name: 'Transport', amount: 200.00, percentage: 8.2, color: 'bg-yellow-500' },
      { id: '5', name: 'Other', amount: 100.00, percentage: 4.1, color: 'bg-purple-500' },
    ],
    trends: [
      { month: 'Jan', spending: 1800 },
      { month: 'Feb', spending: 2100 },
      { month: 'Mar', spending: 1950 },
      { month: 'Apr', spending: 2450.75 },
    ],
    recommendations: [
      { id: 'r1', title: 'Cut down on Groceries', description: 'Your grocery spending is 30% of your total. Consider a budget of $600.', actionLink: '/budget-settings' },
      { id: 'r2', title: 'Save on Entertainment', description: 'You spent $300 on entertainment. Look for cheaper alternatives this month.', actionLink: '/savings-tips' },
    ],
  };
};

// --- Component Definition ---

const SpendingInsightsScreen: React.FC = () => {
  const [insights, setInsights] = useState<SpendingInsightsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { isOnline } = useContext(AppContext); // Use mock context

  const navigate = useNavigate(); // Requirement 10

  // Event handler for a recommendation action
  const handleRecommendationAction = useCallback((link: string) => {
    NotificationService.notify(`Navigating to ${link}`);
    navigate(link);
  }, [navigate]);

  // Data fetching logic (Requirement 2, 6)
  useEffect(() => {
    const loadInsights = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Mock authentication check before API call
        if (!AuthService.isAuthenticated()) {
          // In a real app, this would redirect to login
          console.error('User not authenticated. Redirecting...');
          // navigate('/login');
          return;
        }

        const data = await fetchSpendingInsights();
        setInsights(data);
        NotificationService.notify('Spending insights loaded successfully.');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(errorMessage);
        NotificationService.notify(errorMessage, 'error');
      } finally {
        setIsLoading(false);
      }
    };

    loadInsights();
  }, []);

  // --- Render Logic (Requirement 6) ---

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <Spinner />
        <p className="mt-4 text-gray-600">Loading your personalized insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-gray-50 min-h-screen">
        <Header title="Spending Insights" />
        <Alert type="error" message={error} />
        <div className="mt-6 text-center">
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }

  // Empty state (Requirement 6)
  if (!insights || insights.categories.length === 0) {
    return (
      <div className="p-4 bg-gray-50 min-h-screen">
        <Header title="Spending Insights" />
        <div className="flex flex-col items-center justify-center h-[80vh] text-center">
          <h2 className="text-xl font-semibold text-gray-700">No Spending Data Available</h2>
          <p className="mt-2 text-gray-500">It looks like you haven't made any transactions this period. Start spending to see your insights!</p>
          <Link to="/transactions/new" className="mt-4">
            <Button>Record a Transaction</Button>
          </Link>
        </div>
      </div>
    );
  }

  // --- Main Content Render (Requirement 5, 7) ---

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Spending Insights" />

      <main className="p-4 space-y-6 max-w-4xl mx-auto md:p-6">
        {/* Offline Indicator (Requirement 8) */}
        {!isOnline && <OfflineIndicator message="You are currently offline. Data may be outdated." />}

        {/* Total Spending Summary */}
        <Card className="shadow-lg">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Total Spending (Last 30 Days)</h2>
          <p className="text-4xl font-bold text-indigo-600">
            ${insights.totalSpending.toFixed(2)}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            This is a 5% increase from the previous period.
          </p>
        </Card>

        {/* Spending by Category (Charts) */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Spending by Category</h2>
          {/* Placeholder for Pie/Donut Chart (Requirement 1) */}
          <div className="h-48 w-full mb-4">
            <ChartPlaceholder type="Pie" data={insights.categories} />
          </div>
          {/* Category Breakdown List */}
          <CategoryList categories={insights.categories} />
        </Card>

        {/* Spending Trends (Charts) */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Spending Trends</h2>
          <p className="text-sm text-gray-500 mb-4">
            Monthly spending over the last 6 months.
          </p>
          {/* Placeholder for Line Chart (Requirement 1) */}
          <div className="h-64 w-full">
            <ChartPlaceholder type="Line" data={insights.trends} />
          </div>
        </Card>

        {/* Recommendations and Actionable Insights (Requirement 1) */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4">Actionable Recommendations</h2>
          <div className="space-y-3">
            {insights.recommendations.map(rec => (
              <RecommendationCard
                key={rec.id}
                title={rec.title}
                description={rec.description}
                onAction={() => handleRecommendationAction(rec.actionLink)}
              />
            ))}
          </div>
        </section>

        {/* Footer or Navigation Links */}
        <Footer>
          <Link to="/settings/insights" className="text-sm text-indigo-600 hover:text-indigo-800">
            Adjust Insight Preferences
          </Link>
        </Footer>
      </main>
    </div>
  );
};

export default SpendingInsightsScreen;