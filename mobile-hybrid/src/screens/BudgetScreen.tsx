import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, ActivityIndicator, Alert as RNAlert } from 'react-native';
import { PieChart } from 'react-native-chart-kit';

// --- Interfaces and Mock Data (Assuming this is in a separate file like './BudgetScreenInterfaces') ---

interface BudgetCategory {
  id: string;
  name: string;
  budgeted: number; // Total amount budgeted for this category
  spent: number;    // Total amount spent in this category
  color: string;    // Color for chart visualization
}

interface BudgetSummary {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  percentageSpent: number; // totalSpent / totalBudget * 100
}

interface Alert {
  id: string;
  type: 'warning' | 'danger' | 'info';
  message: string;
}

interface Recommendation {
  id: string;
  title: string;
  description: string;
  action: string; // e.g., "Adjust Budget", "Review Subscriptions"
}

interface BudgetData {
  categories: BudgetCategory[];
  summary: BudgetSummary;
  alerts: Alert[];
  recommendations: Recommendation[];
}

// Mock Data (In a real app, this would be in a service file)
const MOCK_BUDGET_CATEGORIES: BudgetCategory[] = [
  { id: '1', name: 'Groceries', budgeted: 500, spent: 450, color: '#FF6384' },
  { id: '2', name: 'Rent', budgeted: 1500, spent: 1500, color: '#36A2EB' },
  { id: '3', name: 'Entertainment', budgeted: 200, spent: 150, color: '#FFCE56' },
  { id: '4', name: 'Transport', budgeted: 150, spent: 180, color: '#4BC0C0' },
  { id: '5', name: 'Savings', budgeted: 300, spent: 0, color: '#9966FF' },
];

const MOCK_BUDGET_SUMMARY: BudgetSummary = {
  totalBudget: MOCK_BUDGET_CATEGORIES.reduce((sum, cat) => sum + cat.budgeted, 0),
  totalSpent: MOCK_BUDGET_CATEGORIES.reduce((sum, cat) => sum + cat.spent, 0),
  remaining: 2650 - 2280,
  percentageSpent: (2280 / 2650) * 100,
};

const MOCK_ALERTS: Alert[] = [
  { id: 'a1', type: 'danger', message: 'Transport budget exceeded by $30.' },
  { id: 'a2', type: 'warning', message: 'Groceries budget is 90% utilized.' },
];

const MOCK_RECOMMENDATIONS: Recommendation[] = [
  { id: 'r1', title: 'Review Transport', description: 'Consider using public transport more often to stay within budget.', action: 'View Transactions' },
  { id: 'r2', title: 'Increase Savings', description: 'You have $370 remaining. Transfer $100 to your savings goal.', action: 'Transfer Funds' },
];

const MOCK_BUDGET_DATA: BudgetData = {
  categories: MOCK_BUDGET_CATEGORIES,
  summary: MOCK_BUDGET_SUMMARY,
  alerts: MOCK_ALERTS,
  recommendations: MOCK_RECOMMENDATIONS,
};

const fetchBudgetData = (): Promise<BudgetData> => {
  return new Promise((resolve) => {
    // Simulate network delay
    setTimeout(() => {
      resolve(MOCK_BUDGET_DATA);
    }, 1000);
  });
};

// Mocking the services as per requirement:
// Use the services from src/services (AuthService, ApiService, NotificationService, StorageService)
const ApiService = {
  fetchBudgetData: fetchBudgetData,
};

const screenWidth = Dimensions.get('window').width;

// --- Components for Reusability ---

const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <Text style={styles.sectionTitle}>{title}</Text>
);

const BudgetSummaryCard: React.FC<{ summary: BudgetSummary }> = ({ summary }) => {
  const { totalBudget, totalSpent, remaining, percentageSpent } = summary;
  const isOverBudget = remaining < 0;
  const remainingColor = isOverBudget ? styles.dangerText : styles.successText;

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Monthly Budget Overview</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total Budget:</Text>
        <Text style={styles.summaryValue}>${totalBudget.toFixed(2)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total Spent:</Text>
        <Text style={styles.summaryValue}>${totalSpent.toFixed(2)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Remaining:</Text>
        <Text style={[styles.summaryValue, remainingColor]}>
          {isOverBudget ? '-$' : '$'}{Math.abs(remaining).toFixed(2)}
        </Text>
      </View>
      <Text style={styles.percentageText}>{percentageSpent.toFixed(1)}% of budget spent</Text>
    </View>
  );
};

const BudgetChart: React.FC<{ categories: BudgetCategory[] }> = ({ categories }) => {
  const pieChartData = categories.map(cat => ({
    name: cat.name,
    population: cat.spent,
    color: cat.color,
    legendFontColor: '#7F7F7F',
    legendFontSize: 15,
  }));

  return (
    <View style={styles.chartContainer}>
      <SectionTitle title="Spending by Category" />
      <PieChart
        data={pieChartData}
        width={screenWidth - 40}
        height={220}
        chartConfig={chartConfig}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft="15"
        absolute
      />
    </View>
  );
};

const CategoryItem: React.FC<{ category: BudgetCategory }> = ({ category }) => {
  const { name, budgeted, spent, color } = category;
  const percentage = (spent / budgeted) * 100;
  const barWidth = Math.min(percentage, 100);
  const isOverBudget = spent > budgeted;

  return (
    <View style={styles.categoryItem}>
      <Text style={styles.categoryName}>{name}</Text>
      <Text style={styles.categoryAmount}>
        ${spent.toFixed(2)} / ${budgeted.toFixed(2)}
      </Text>
      <View style={styles.progressBarBackground}>
        <View style={[styles.progressBarFill, { width: `${barWidth}%`, backgroundColor: isOverBudget ? '#dc3545' : color }]} />
      </View>
      {isOverBudget && <Text style={styles.overBudgetWarning}>Over Budget!</Text>}
    </View>
  );
};

const AlertItem: React.FC<{ alert: Alert }> = ({ alert }) => {
  const color = alert.type === 'danger' ? '#dc3545' : alert.type === 'warning' ? '#ffc107' : '#17a2b8';
  return (
    <View style={[styles.alertItem, { borderColor: color }]}>
      <Text style={[styles.alertText, { color }]}>{alert.message}</Text>
    </View>
  );
};

const RecommendationItem: React.FC<{ recommendation: Recommendation }> = ({ recommendation }) => (
  <View style={styles.recommendationItem}>
    <Text style={styles.recommendationTitle}>{recommendation.title}</Text>
    <Text style={styles.recommendationDescription}>{recommendation.description}</Text>
    <TouchableOpacity style={styles.recommendationButton} onPress={() => RNAlert.alert('Action', `Performing action: ${recommendation.action}`)}>
      <Text style={styles.recommendationButtonText}>{recommendation.action}</Text>
    </TouchableOpacity>
  </View>
);

// --- Chart Configuration ---

const chartConfig = {
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  strokeWidth: 2, // optional, default 3
  barPercentage: 0.5,
  useShadowColorFromDataset: false, // optional
};

// --- Main Screen Component ---

const BudgetScreen: React.FC = () => {
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Simulate API call using the mock service
        const data = await ApiService.fetchBudgetData();
        setBudgetData(data);
      } catch (err) {
        console.error("Failed to fetch budget data:", err);
        setError("Could not load budget data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading budget data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => RNAlert.alert('Retry', 'Functionality to retry data fetch would be here.')}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!budgetData) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No budget data available.</Text>
      </View>
    );
  }

  const { summary, categories, alerts, recommendations } = budgetData;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.header}>Budget Management</Text>

      {/* 1. Spending vs Budget Summary */}
      <BudgetSummaryCard summary={summary} />

      {/* 2. Charts (Pie Chart for category spending) */}
      <BudgetChart categories={categories} />

      {/* 3. Budget Categories List */}
      <SectionTitle title="Budget Categories" />
      <View style={styles.categoriesList}>
        {categories.map(cat => (
          <CategoryItem key={cat.id} category={cat} />
        ))}
      </View>

      {/* 4. Alerts */}
      {alerts.length > 0 && (
        <>
          <SectionTitle title="Alerts" />
          <View style={styles.alertsContainer}>
            {alerts.map(alert => (
              <AlertItem key={alert.id} alert={alert} />
            ))}
          </View>
        </>
      )}

      {/* 5. Recommendations */}
      {recommendations.length > 0 && (
        <>
          <SectionTitle title="Recommendations" />
          <View style={styles.recommendationsContainer}>
            {recommendations.map(rec => (
              <RecommendationItem key={rec.id} recommendation={rec} />
            ))}
          </View>
        </>
      )}

      <View style={{ height: 50 }} />
    </ScrollView>
  );
};

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa', // Light background for the screen
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#343a40',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6c757d',
  },
  errorText: {
    fontSize: 18,
    color: '#dc3545',
    marginBottom: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007bff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#343a40',
    marginTop: 20,
    marginBottom: 10,
  },
  // Summary Card Styles
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#007bff',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  summaryLabel: {
    fontSize: 16,
    color: '#495057',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  successText: {
    color: '#28a745',
  },
  dangerText: {
    color: '#dc3545',
  },
  percentageText: {
    marginTop: 10,
    fontSize: 14,
    textAlign: 'center',
    color: '#6c757d',
  },
  // Chart Styles
  chartContainer: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // Categories List Styles
  categoriesList: {
    marginBottom: 20,
  },
  categoryItem: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#343a40',
  },
  categoryAmount: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 5,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#e9ecef',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  overBudgetWarning: {
    color: '#dc3545',
    fontSize: 12,
    marginTop: 5,
    fontWeight: 'bold',
  },
  // Alerts Styles
  alertsContainer: {
    marginBottom: 20,
  },
  alertItem: {
    padding: 10,
    borderRadius: 5,
    borderLeftWidth: 5,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  alertText: {
    fontSize: 14,
  },
  // Recommendations Styles
  recommendationsContainer: {
    marginBottom: 20,
  },
  recommendationItem: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 5,
    borderLeftColor: '#17a2b8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  recommendationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#343a40',
    marginBottom: 5,
  },
  recommendationDescription: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 10,
  },
  recommendationButton: {
    backgroundColor: '#17a2b8',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  recommendationButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default BudgetScreen;