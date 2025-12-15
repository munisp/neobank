/**
 * Spending Insights Screen
 * AI-powered spending analytics and insights
 * Revolut/N26-style spending analysis
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { HapticFeedback } from '../../utils/haptics';
import apiService from '../../services/ApiService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SpendingCategory {
  category: string;
  amount: number;
  percentage: number;
  color: string;
  icon: string;
  transactions: number;
}

interface SpendingInsight {
  type: 'warning' | 'info' | 'success';
  title: string;
  description: string;
  icon: string;
}

const SpendingInsightsScreen: React.FC = () => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [totalSpending, setTotalSpending] = useState(0);
  const [categories, setCategories] = useState<SpendingCategory[]>([]);
  const [insights, setInsights] = useState<SpendingInsight[]>([]);
  const [comparisonData, setComparisonData] = useState({
    previousPeriod: 0,
    change: 0,
    changePercentage: 0,
  });

  useEffect(() => {
    loadSpendingData();
  }, [selectedPeriod]);

  const loadSpendingData = async () => {
    setLoading(true);
    try {
      // Fetch spending data from API
      const response = await apiService.getSpendingAnalytics(selectedPeriod);
      
      setTotalSpending(response.total);
      setCategories(response.categories);
      setInsights(response.insights);
      setComparisonData(response.comparison);
    } catch (error) {
      console.error('Failed to load spending data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (period: 'week' | 'month' | 'year') => {
    HapticFeedback.selection();
    setSelectedPeriod(period);
  };

  const renderPeriodSelector = () => {
    const periods: Array<{ key: 'week' | 'month' | 'year'; label: string }> = [
      { key: 'week', label: 'Week' },
      { key: 'month', label: 'Month' },
      { key: 'year', label: 'Year' },
    ];

    return (
      <View style={styles.periodSelector}>
        {periods.map(period => (
          <TouchableOpacity
            key={period.key}
            style={[
              styles.periodButton,
              selectedPeriod === period.key && {
                backgroundColor: theme.colors.primary,
              },
            ]}
            onPress={() => handlePeriodChange(period.key)}
          >
            <Text
              style={[
                styles.periodButtonText,
                {
                  color:
                    selectedPeriod === period.key
                      ? '#FFFFFF'
                      : theme.colors.textSecondary,
                },
              ]}
            >
              {period.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderSpendingOverview = () => {
    const isIncrease = comparisonData.change > 0;

    return (
      <View style={[styles.overviewCard, { backgroundColor: theme.colors.card }]}>
        <Text style={[styles.overviewLabel, { color: theme.colors.textSecondary }]}>
          Total Spending This {selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)}
        </Text>
        <Text style={[styles.overviewAmount, { color: theme.colors.text }]}>
          ${totalSpending.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </Text>
        
        <View style={styles.comparisonRow}>
          <Text style={[styles.comparisonText, { color: isIncrease ? theme.colors.error : theme.colors.success }]}>
            {isIncrease ? '↑' : '↓'} ${Math.abs(comparisonData.change).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Text>
          <Text style={[styles.comparisonPercentage, { color: theme.colors.textSecondary }]}>
            ({Math.abs(comparisonData.changePercentage).toFixed(1)}% vs last {selectedPeriod})
          </Text>
        </View>
      </View>
    );
  };

  const renderCategoryChart = () => {
    const maxAmount = Math.max(...categories.map(c => c.amount));

    return (
      <View style={[styles.chartCard, { backgroundColor: theme.colors.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Spending by Category
        </Text>

        {categories.map((category, index) => {
          const barWidth = (category.amount / maxAmount) * (SCREEN_WIDTH - 120);

          return (
            <View key={index} style={styles.categoryRow}>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                <View style={styles.categoryDetails}>
                  <Text style={[styles.categoryName, { color: theme.colors.text }]}>
                    {category.category}
                  </Text>
                  <Text style={[styles.categoryTransactions, { color: theme.colors.textSecondary }]}>
                    {category.transactions} transactions
                  </Text>
                </View>
              </View>

              <View style={styles.categoryAmountContainer}>
                <View
                  style={[
                    styles.categoryBar,
                    {
                      width: barWidth,
                      backgroundColor: category.color,
                    },
                  ]}
                />
                <Text style={[styles.categoryAmount, { color: theme.colors.text }]}>
                  ${category.amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                </Text>
                <Text style={[styles.categoryPercentage, { color: theme.colors.textSecondary }]}>
                  {category.percentage.toFixed(0)}%
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderInsights = () => {
    const getInsightColor = (type: string) => {
      switch (type) {
        case 'warning':
          return theme.colors.warning;
        case 'success':
          return theme.colors.success;
        default:
          return theme.colors.info;
      }
    };

    return (
      <View style={styles.insightsContainer}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Insights & Recommendations
        </Text>

        {insights.map((insight, index) => (
          <View
            key={index}
            style={[
              styles.insightCard,
              {
                backgroundColor: theme.colors.card,
                borderLeftColor: getInsightColor(insight.type),
              },
            ]}
          >
            <Text style={styles.insightIcon}>{insight.icon}</Text>
            <View style={styles.insightContent}>
              <Text style={[styles.insightTitle, { color: theme.colors.text }]}>
                {insight.title}
              </Text>
              <Text style={[styles.insightDescription, { color: theme.colors.textSecondary }]}>
                {insight.description}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      {renderPeriodSelector()}
      {renderSpendingOverview()}
      {renderCategoryChart()}
      {renderInsights()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  overviewCard: {
    margin: 16,
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  overviewLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  overviewAmount: {
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 12,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  comparisonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  comparisonPercentage: {
    fontSize: 14,
  },
  chartCard: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  categoryRow: {
    marginBottom: 20,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  categoryDetails: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
  },
  categoryTransactions: {
    fontSize: 12,
    marginTop: 2,
  },
  categoryAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBar: {
    height: 8,
    borderRadius: 4,
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 70,
    textAlign: 'right',
  },
  categoryPercentage: {
    fontSize: 12,
    minWidth: 35,
    textAlign: 'right',
  },
  insightsContainer: {
    padding: 16,
  },
  insightCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  insightIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  insightDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});

export default SpendingInsightsScreen;

