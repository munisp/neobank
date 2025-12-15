// ====================================================================
// FILE: SpendingInsightsScreen.d.ts
// Description: TypeScript interfaces for data structures and component props.
// ====================================================================
// --- Data Structures for Insights ---

// 1. Spending Breakdown by Category
export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

// 2. Monthly/Weekly Trends
export interface SpendingTrend {
  date: string; // e.g., "2025-10-01" or "Week 40"
  spent: number;
  budget: number;
}

// 3. Budget vs Actual Comparison
export interface BudgetComparison {
  category: string;
  budgeted: number;
  actual: number;
  status: 'under' | 'over' | 'on_track';
}

// 4. Top Merchants
export interface TopMerchant {
  name: string;
  totalSpent: number;
  transactionCount: number;
}

// 5. Spending Patterns
export interface SpendingPattern {
  timeOfDay: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  averageSpent: number;
  transactionCount: number;
}

// 6. Savings Opportunities
export interface SavingsOpportunity {
  id: string;
  title: string;
  description: string;
  potentialSavings: number;
  action: 'Cancel Subscription' | 'Negotiate Rate' | 'Switch Provider';
}

// 7. Financial Health Score
export interface FinancialHealthScore {
  score: number; // e.g., 750/1000
  status: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  recommendation: string;
}

// 8. Actionable Insights
export interface ActionableInsight {
  id: string;
  type: 'alert' | 'tip' | 'goal';
  message: string;
  priority: 'high' | 'medium' | 'low';
}

// --- Main Data Interface ---

export interface SpendingInsightsData {
  breakdown: CategoryBreakdown[];
  trends: SpendingTrend[];
  budgetComparison: BudgetComparison[];
  topMerchants: TopMerchant[];
  spendingPatterns: SpendingPattern[];
  savingsOpportunities: SavingsOpportunity[];
  financialHealth: FinancialHealthScore;
  actionableInsights: ActionableInsight[];
}

// --- Component Props and State ---

export interface SpendingInsightsScreenProps {
  // Any props passed to the screen, e.g., user ID, time range
  userId: string;
  timeRange: 'monthly' | 'weekly';
}

export interface SpendingInsightsState {
  data: SpendingInsightsData | null;
  isLoading: boolean;
  error: string | null;
}

// --- Mock API Service Interface ---

export interface InsightsAPI {
  fetchSpendingInsights(userId: string, timeRange: 'monthly' | 'weekly'): Promise<SpendingInsightsData>;
}

// ====================================================================
// FILE: mockInsightsAPI.ts
// Description: Mock API service for fetching financial insights data.
// ====================================================================
import {
  SpendingInsightsData,
  InsightsAPI,
  CategoryBreakdown,
  SpendingTrend,
  BudgetComparison,
  TopMerchant,
  SpendingPattern,
  SavingsOpportunity,
  FinancialHealthScore,
  ActionableInsight,
} from './SpendingInsightsScreen.d';

// Helper function to generate a random color
const getRandomColor = () => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};

// Mock Data Generation Functions
const mockBreakdown: CategoryBreakdown[] = [
  { category: 'Groceries', amount: 450.5, percentage: 30, color: '#FF6384' },
  { category: 'Restaurants', amount: 300.0, percentage: 20, color: '#36A2EB' },
  { category: 'Transport', amount: 225.25, percentage: 15, color: '#FFCE56' },
  { category: 'Shopping', amount: 150.17, percentage: 10, color: '#4BC0C0' },
  { category: 'Utilities', amount: 150.17, percentage: 10, color: '#9966FF' },
  { category: 'Other', amount: 225.25, percentage: 15, color: getRandomColor() },
];

const mockTrends: SpendingTrend[] = [
  { date: 'Wk 1', spent: 300, budget: 400 },
  { date: 'Wk 2', spent: 450, budget: 400 },
  { date: 'Wk 3', spent: 350, budget: 400 },
  { date: 'Wk 4', spent: 500, budget: 400 },
];

const mockBudgetComparison: BudgetComparison[] = [
  { category: 'Groceries', budgeted: 500, actual: 450.5, status: 'under' },
  { category: 'Restaurants', budgeted: 250, actual: 300.0, status: 'over' },
  { category: 'Shopping', budgeted: 150, actual: 150.17, status: 'on_track' },
];

const mockTopMerchants: TopMerchant[] = [
  { name: 'Amazon', totalSpent: 250.99, transactionCount: 3 },
  { name: 'Starbucks', totalSpent: 85.50, transactionCount: 12 },
  { name: 'Local Grocer', totalSpent: 150.00, transactionCount: 1 },
];

const mockSpendingPatterns: SpendingPattern[] = [
  { timeOfDay: 'Morning', averageSpent: 25.5, transactionCount: 15 },
  { timeOfDay: 'Afternoon', averageSpent: 45.0, transactionCount: 10 },
  { timeOfDay: 'Evening', averageSpent: 75.2, transactionCount: 8 },
  { timeOfDay: 'Night', averageSpent: 15.0, transactionCount: 2 },
];

const mockSavingsOpportunities: SavingsOpportunity[] = [
  {
    id: '1',
    title: 'Cancel Streaming Service',
    description: 'You haven\'t used "StreamFlix" in 3 months.',
    potentialSavings: 15.99,
    action: 'Cancel Subscription',
  },
  {
    id: '2',
    title: 'Lower Internet Bill',
    description: 'Similar plans are available for $20 less per month.',
    potentialSavings: 20.00,
    action: 'Negotiate Rate',
  },
];

const mockFinancialHealth: FinancialHealthScore = {
  score: 780,
  status: 'Good',
  recommendation: 'Keep your credit utilization low to improve your score further.',
};

const mockActionableInsights: ActionableInsight[] = [
  {
    id: 'a1',
    type: 'alert',
    message: 'You are 20% over budget for Restaurants this month.',
    priority: 'high',
  },
  {
    id: 'a2',
    type: 'tip',
    message: 'Consider setting a spending goal for "Shopping" next month.',
    priority: 'medium',
  },
];

const mockSpendingInsightsData: SpendingInsightsData = {
  breakdown: mockBreakdown,
  trends: mockTrends,
  budgetComparison: mockBudgetComparison,
  topMerchants: mockTopMerchants,
  spendingPatterns: mockSpendingPatterns,
  savingsOpportunities: mockSavingsOpportunities,
  financialHealth: mockFinancialHealth,
  actionableInsights: mockActionableInsights,
};

/**
 * Mock implementation of the InsightsAPI.
 * Simulates fetching data from the backend, including a delay and potential error.
 * In a real application, this would be a service layer calling the 36 analytics endpoints.
 */
export const InsightsAPIService: InsightsAPI = {
  fetchSpendingInsights: (userId, timeRange) => {
    console.log(`Mock API call: Fetching ${timeRange} insights for user ${userId}`);

    return new Promise((resolve, reject) => {
      // Simulate network delay
      setTimeout(() => {
        // Simulate a 10% chance of failure
        if (Math.random() < 0.1) {
          reject(new Error('Failed to fetch financial insights. Please try again.'));
          return;
        }

        // Simulate successful data return
        resolve(mockSpendingInsightsData);
      }, 1500); // 1.5 second delay
    });
  },
};

// ====================================================================
// FILE: InsightComponents.tsx
// Description: Helper components for rendering individual financial insights.
// ====================================================================
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import {
  CategoryBreakdown,
  SpendingTrend,
  BudgetComparison,
  TopMerchant,
  SpendingPattern,
  SavingsOpportunity,
} from './SpendingInsightsScreen.d';

const { width } = Dimensions.get('window');
const MAX_WEB_WIDTH = 600;
const CARD_WIDTH = Math.min(width, MAX_WEB_WIDTH) - 32; // Screen width minus padding

// --- Utility Functions ---
const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

// --- 1. Spending Breakdown by Category Component ---

interface BreakdownItemProps {
  item: CategoryBreakdown;
}

const BreakdownItem: React.FC<BreakdownItemProps> = ({ item }) => (
  <View style={breakdownStyles.itemContainer}>
    <View style={[breakdownStyles.colorDot, { backgroundColor: item.color }]} />
    <Text style={breakdownStyles.categoryText}>{item.category}</Text>
    <Text style={breakdownStyles.percentageText}>{item.percentage.toFixed(0)}%</Text>
    <Text style={breakdownStyles.amountText}>{formatCurrency(item.amount)}</Text>
  </View>
);

export const CategoryBreakdownComponent: React.FC<{ data: CategoryBreakdown[] }> = ({ data }) => {
  // Simulate a pie chart with a simple bar representation
  const totalPercentage = data.reduce((sum, item) => sum + item.percentage, 0);

  return (
    <View>
      <View style={breakdownStyles.chartContainer}>
        {data.map((item, index) => (
          <View
            key={index}
            style={{
              height: 20,
              width: `${(item.percentage / totalPercentage) * 100}%`,
              backgroundColor: item.color,
            }}
          />
        ))}
      </View>
      <View style={breakdownStyles.listContainer}>
        {data.map((item, index) => (
          <BreakdownItem key={index} item={item} />
        ))}
      </View>
    </View>
  );
};

const breakdownStyles = StyleSheet.create({
  chartContainer: {
    flexDirection: 'row',
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 15,
  },
  listContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  categoryText: {
    flex: 3,
    fontSize: 14,
    color: '#334155',
  },
  percentageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    color: '#0F172A',
  },
  amountText: {
    flex: 2,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    color: '#0F172A',
  },
});

// --- 2. Monthly/Weekly Trends Component ---

export const SpendingTrendsComponent: React.FC<{ data: SpendingTrend[] }> = ({ data }) => {
  // Simple text-based representation of a line chart
  const maxSpent = Math.max(...data.map(d => d.spent));
  const maxBudget = Math.max(...data.map(d => d.budget));
  const maxVal = Math.max(maxSpent, maxBudget);

  return (
    <View style={trendStyles.container}>
      <Text style={trendStyles.chartTitle}>Spending vs Budget Over Time</Text>
      {data.map((item, index) => (
        <View key={index} style={trendStyles.trendItem}>
          <Text style={trendStyles.trendLabel}>{item.date}</Text>
          <View style={trendStyles.barContainer}>
            <View
              style={[
                trendStyles.spentBar,
                { width: `${(item.spent / maxVal) * 100}%` },
              ]}
            />
            <View
              style={[
                trendStyles.budgetBar,
                { width: `${(item.budget / maxVal) * 100}%` },
              ]}
            />
          </View>
          <Text style={trendStyles.trendValue}>{formatCurrency(item.spent)}</Text>
        </View>
      ))}
      <View style={trendStyles.legend}>
        <View style={[breakdownStyles.colorDot, { backgroundColor: '#36A2EB' }]} />
        <Text style={trendStyles.legendText}>Spent</Text>
        <View style={[breakdownStyles.colorDot, { backgroundColor: '#FFCE56', marginLeft: 10 }]} />
        <Text style={trendStyles.legendText}>Budget</Text>
      </View>
    </View>
  );
};

const trendStyles = StyleSheet.create({
  container: {
    paddingVertical: 5,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 10,
    color: '#64748B',
  },
  trendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  trendLabel: {
    width: 50,
    fontSize: 12,
    color: '#64748B',
  },
  barContainer: {
    flex: 1,
    height: 10,
    marginHorizontal: 10,
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  spentBar: {
    height: '100%',
    backgroundColor: '#36A2EB', // Blue for spent
    position: 'absolute',
    left: 0,
  },
  budgetBar: {
    height: '100%',
    backgroundColor: '#FFCE56', // Yellow for budget
    opacity: 0.5,
    position: 'absolute',
    left: 0,
  },
  trendValue: {
    width: 60,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    color: '#0F172A',
  },
  legend: {
    flexDirection: 'row',
    marginTop: 10,
    alignItems: 'center',
  },
  legendText: {
    fontSize: 12,
    color: '#64748B',
    marginRight: 5,
  },
});

// --- 3. Budget vs Actual Comparison Component ---

const getStatusColor = (status: BudgetComparison['status']) => {
  switch (status) {
    case 'over':
      return '#EF4444'; // Red
    case 'under':
      return '#10B981'; // Green
    case 'on_track':
      return '#F59E0B'; // Yellow
    default:
      return '#64748B';
  }
};

export const BudgetComparisonComponent: React.FC<{ data: BudgetComparison[] }> = ({ data }) => (
  <View style={comparisonStyles.container}>
    {data.map((item, index) => (
      <View key={index} style={comparisonStyles.itemContainer}>
        <Text style={comparisonStyles.categoryText}>{item.category}</Text>
        <View style={comparisonStyles.amountsContainer}>
          <Text style={comparisonStyles.amountText}>{formatCurrency(item.actual)}</Text>
          <Text style={comparisonStyles.budgetedText}>/ {formatCurrency(item.budgeted)}</Text>
        </View>
        <Text style={[comparisonStyles.statusText, { color: getStatusColor(item.status) }]}>
          {item.status.replace('_', ' ').toUpperCase()}
        </Text>
      </View>
    ))}
  </View>
);

const comparisonStyles = StyleSheet.create({
  container: {
    paddingVertical: 5,
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  categoryText: {
    flex: 2,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
  },
  amountsContainer: {
    flex: 2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  amountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  budgetedText: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 4,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'right',
  },
});

// --- 4. Top Merchants Component ---

export const TopMerchantsComponent: React.FC<{ data: TopMerchant[] }> = ({ data }) => (
  <View style={merchantStyles.container}>
    {data.map((item, index) => (
      <View key={index} style={merchantStyles.itemContainer}>
        <Text style={merchantStyles.nameText}>{item.name}</Text>
        <Text style={merchantStyles.countText}>{item.transactionCount} transactions</Text>
        <Text style={merchantStyles.spentText}>{formatCurrency(item.totalSpent)}</Text>
      </View>
    ))}
  </View>
);

const merchantStyles = StyleSheet.create({
  container: {
    paddingVertical: 5,
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  nameText: {
    flex: 3,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
  },
  countText: {
    flex: 2,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  spentText: {
    flex: 2,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    color: '#0F172A',
  },
});

// --- 5. Spending Patterns Component ---

export const SpendingPatternsComponent: React.FC<{ data: SpendingPattern[] }> = ({ data }) => (
  <View style={patternStyles.container}>
    {data.map((item, index) => (
      <View key={index} style={patternStyles.itemContainer}>
        <Text style={patternStyles.timeText}>{item.timeOfDay}</Text>
        <Text style={patternStyles.countText}>{item.transactionCount} transactions</Text>
        <Text style={patternStyles.averageText}>Avg: {formatCurrency(item.averageSpent)}</Text>
      </View>
    ))}
  </View>
);

const patternStyles = StyleSheet.create({
  container: {
    paddingVertical: 5,
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  timeText: {
    flex: 2,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
  },
  countText: {
    flex: 2,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  averageText: {
    flex: 2,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    color: '#0F172A',
  },
});

// --- 6. Savings Opportunities Component ---

export const SavingsOpportunitiesComponent: React.FC<{ data: SavingsOpportunity[] }> = ({ data }) => (
  <View style={savingsStyles.container}>
    {data.map((item, index) => (
      <View key={index} style={savingsStyles.itemContainer}>
        <View style={savingsStyles.textGroup}>
          <Text style={savingsStyles.titleText}>{item.title}</Text>
          <Text style={savingsStyles.descriptionText}>{item.description}</Text>
        </View>
        <View style={savingsStyles.actionGroup}>
          <Text style={savingsStyles.savingsText}>Save {formatCurrency(item.potentialSavings)}</Text>
          <Text style={savingsStyles.actionButton}>
            {item.action}
          </Text>
        </View>
      </View>
    ))}
  </View>
);

const savingsStyles = StyleSheet.create({
  container: {
    paddingVertical: 5,
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  textGroup: {
    flex: 3,
    paddingRight: 10,
  },
  actionGroup: {
    flex: 2,
    alignItems: 'flex-end',
  },
  titleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  descriptionText: {
    fontSize: 12,
    color: '#64748B',
  },
  savingsText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#10B981', // Green for savings
    marginBottom: 4,
  },
  actionButton: {
    fontSize: 12,
    color: '#007AFF', // Blue for action
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});

// ====================================================================
// FILE: SpendingInsightsScreen.tsx
// Description: Core React Native component for the Spending Insights Screen.
// ====================================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import {
  SpendingInsightsScreenProps,
  SpendingInsightsData,
  SpendingInsightsState,
  CategoryBreakdown,
  SpendingTrend,
  BudgetComparison,
  TopMerchant,
  SpendingPattern,
  SavingsOpportunity,
  FinancialHealthScore,
  ActionableInsight,
} from './SpendingInsightsScreen.d';
import { InsightsAPIService } from './mockInsightsAPI';
import {
  CategoryBreakdownComponent,
  SpendingTrendsComponent,
  BudgetComparisonComponent,
  TopMerchantsComponent,
  SpendingPatternsComponent,
  SavingsOpportunitiesComponent,
} from './InsightComponents';

// --- Constants ---
const { width } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web';
const MAX_WEB_WIDTH = 600; // Max width for responsive web view

// --- Helper Components ---

const InsightCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    {children}
  </View>
);

const LoadingState: React.FC = () => (
  <View style={styles.centered}>
    <ActivityIndicator size="large" color="#007AFF" />
    <Text style={styles.loadingText}>Loading your financial insights...</Text>
  </View>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <View style={styles.centered}>
    <Text style={styles.errorText}>Error: {message}</Text>
    <Text style={styles.retryButton} onPress={onRetry}>
      Tap to Retry
    </Text>
  </View>
);

// --- Core Component ---

const SpendingInsightsScreen: React.FC<SpendingInsightsScreenProps> = ({ userId, timeRange }) => {
  const [state, setState] = useState<SpendingInsightsState>({
    data: null,
    isLoading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    setState(prevState => ({ ...prevState, isLoading: true, error: null }));
    try {
      const insightsData = await InsightsAPIService.fetchSpendingInsights(userId, timeRange);
      setState({ data: insightsData, isLoading: false, error: null });
    } catch (e) {
      console.error('API Fetch Error:', e);
      setState({ data: null, isLoading: false, error: e instanceof Error ? e.message : 'An unknown error occurred.' });
    }
  }, [userId, timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    fetchData();
  };

  const { data, isLoading, error } = state;

  // --- Render Logic ---

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchData} />;
  }

  // Data is guaranteed to be present here
  const insights = data as SpendingInsightsData;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />}
      >
        <Text style={styles.header}>Spending Insights ({timeRange === 'monthly' ? 'Monthly' : 'Weekly'})</Text>

        {/* 1. Actionable Insights (Top of the screen for visibility) */}
        <InsightCard title="Actionable Insights">
          {insights.actionableInsights.map((insight) => (
            <Text key={insight.id} style={styles.insightText}>
              [{insight.priority.toUpperCase()}] {insight.message}
            </Text>
          ))}
        </InsightCard>

        {/* 2. Financial Health Score */}
        <InsightCard title="Financial Health Score">
          <Text style={styles.scoreText}>{insights.financialHealth.score}</Text>
          <Text style={styles.statusText}>Status: {insights.financialHealth.status}</Text>
          <Text style={styles.recommendationText}>Tip: {insights.financialHealth.recommendation}</Text>
        </InsightCard>

        {/* 3. Spending Breakdown by Category */}
        <InsightCard title="Spending Breakdown by Category">
          <CategoryBreakdownComponent data={insights.breakdown} />
        </InsightCard>

        {/* 4. Monthly/Weekly Trends */}
        <InsightCard title="Spending Trends">
          <SpendingTrendsComponent data={insights.trends} />
        </InsightCard>

        {/* 5. Budget vs Actual Comparison */}
        <InsightCard title="Budget vs Actual Comparison">
          <BudgetComparisonComponent data={insights.budgetComparison} />
        </InsightCard>

        {/* 6. Top Merchants */}
        <InsightCard title="Top Merchants">
          <TopMerchantsComponent data={insights.topMerchants} />
        </InsightCard>

        {/* 7. Spending Patterns */}
        <InsightCard title="Spending Patterns">
          <SpendingPatternsComponent data={insights.spendingPatterns} />
        </InsightCard>

        {/* 8. Savings Opportunities */}
        <InsightCard title="Savings Opportunities">
          <SavingsOpportunitiesComponent data={insights.savingsOpportunities} />
        </InsightCard>

        {/* Loading indicator for refresh */}
        {isLoading && data && <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 10 }} />}
      </ScrollView>
    </View>
  );
};

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA', // Light background for the screen
    // Responsive design for web
    ...(IS_WEB && {
      alignSelf: 'center',
      width: Math.min(width, MAX_WEB_WIDTH),
    }),
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1E293B',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#64748B',
  },
  errorText: {
    fontSize: 18,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    padding: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#1E293B',
  },
  insightText: {
    fontSize: 14,
    color: '#334155',
    marginBottom: 4,
  },
  scoreText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#059669', // Green for good score
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#334155',
    marginTop: 4,
  },
  recommendationText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
  },
});

export default SpendingInsightsScreen;