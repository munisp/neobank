import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LineChart, PieChart, BarChart } from 'react-native-chart-kit';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ApiService from '../../services/ApiService';

const { width } = Dimensions.get('window');

interface SpendingCategory {
  name: string;
  amount: number;
  percentage: number;
  color: string;
  icon: string;
}

interface SpendingTrend {
  month: string;
  amount: number;
}

interface Insight {
  id: string;
  type: 'warning' | 'tip' | 'achievement';
  title: string;
  description: string;
  icon: string;
}

export default function SpendingInsightsScreen() {
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [categories, setCategories] = useState<SpendingCategory[]>([]);
  const [trends, setTrends] = useState<SpendingTrend[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [totalSpending, setTotalSpending] = useState(0);
  const [comparedToPrevious, setComparedToPrevious] = useState(0);

  useEffect(() => {
    loadData();
  }, [selectedPeriod]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getSpendingInsights(selectedPeriod);
      
      setCategories(data.categories);
      setTrends(data.trends);
      setInsights(data.insights);
      setTotalSpending(data.totalSpending);
      setComparedToPrevious(data.comparedToPrevious);
    } catch (error) {
      console.error('Failed to load spending insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPieChartData = () => {
    return categories.map((cat) => ({
      name: cat.name,
      population: cat.amount,
      color: cat.color,
      legendFontColor: '#7F7F7F',
      legendFontSize: 12,
    }));
  };

  const getLineChartData = () => {
    return {
      labels: trends.map((t) => t.month),
      datasets: [
        {
          data: trends.map((t) => t.amount),
          color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
  };

  const renderPeriodSelector = () => (
    <View style={styles.periodSelector}>
      {(['week', 'month', 'year'] as const).map((period) => (
        <TouchableOpacity
          key={period}
          style={[
            styles.periodButton,
            selectedPeriod === period && styles.periodButtonActive,
          ]}
          onPress={() => setSelectedPeriod(period)}
        >
          <Text
            style={[
              styles.periodButtonText,
              selectedPeriod === period && styles.periodButtonTextActive,
            ]}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderTotalSpending = () => (
    <View style={styles.totalCard}>
      <Text style={styles.totalLabel}>Total Spending</Text>
      <Text style={styles.totalAmount}>${totalSpending.toLocaleString()}</Text>
      <View style={styles.comparisonRow}>
        <Icon
          name={comparedToPrevious >= 0 ? 'arrow-up' : 'arrow-down'}
          size={16}
          color={comparedToPrevious >= 0 ? '#f44336' : '#4caf50'}
        />
        <Text
          style={[
            styles.comparisonText,
            { color: comparedToPrevious >= 0 ? '#f44336' : '#4caf50' },
          ]}
        >
          {Math.abs(comparedToPrevious)}% vs last {selectedPeriod}
        </Text>
      </View>
    </View>
  );

  const renderCategoryBreakdown = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Spending by Category</Text>
      <PieChart
        data={getPieChartData()}
        width={width - 32}
        height={220}
        chartConfig={{
          color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
        }}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft="15"
        absolute
      />
      <View style={styles.categoriesList}>
        {categories.map((category, index) => (
          <View key={index} style={styles.categoryItem}>
            <View style={styles.categoryLeft}>
              <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
              <Icon name={category.icon} size={24} color={category.color} />
              <Text style={styles.categoryName}>{category.name}</Text>
            </View>
            <View style={styles.categoryRight}>
              <Text style={styles.categoryAmount}>${category.amount.toLocaleString()}</Text>
              <Text style={styles.categoryPercentage}>{category.percentage}%</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderTrends = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Spending Trends</Text>
      <LineChart
        data={getLineChartData()}
        width={width - 32}
        height={220}
        chartConfig={{
          backgroundColor: '#ffffff',
          backgroundGradientFrom: '#ffffff',
          backgroundGradientTo: '#ffffff',
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
          style: {
            borderRadius: 16,
          },
          propsForDots: {
            r: '6',
            strokeWidth: '2',
            stroke: '#4caf50',
          },
        }}
        bezier
        style={styles.chart}
      />
    </View>
  );

  const renderInsights = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>AI Insights</Text>
      {insights.map((insight) => (
        <View key={insight.id} style={styles.insightCard}>
          <View
            style={[
              styles.insightIcon,
              {
                backgroundColor:
                  insight.type === 'warning'
                    ? '#fff3e0'
                    : insight.type === 'tip'
                    ? '#e3f2fd'
                    : '#e8f5e9',
              },
            ]}
          >
            <Icon
              name={insight.icon}
              size={24}
              color={
                insight.type === 'warning'
                  ? '#ff9800'
                  : insight.type === 'tip'
                  ? '#2196f3'
                  : '#4caf50'
              }
            />
          </View>
          <View style={styles.insightContent}>
            <Text style={styles.insightTitle}>{insight.title}</Text>
            <Text style={styles.insightDescription}>{insight.description}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4caf50" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {renderPeriodSelector()}
      {renderTotalSpending()}
      {renderCategoryBreakdown()}
      {renderTrends()}
      {renderInsights()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#ffffff',
    marginBottom: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#4caf50',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#ffffff',
  },
  totalCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    marginBottom: 8,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  comparisonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  section: {
    backgroundColor: '#ffffff',
    padding: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  categoriesList: {
    marginTop: 16,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  categoryRight: {
    alignItems: 'flex-end',
  },
  categoryAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  categoryPercentage: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  insightCard: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 12,
  },
  insightIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  insightDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

