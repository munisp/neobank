import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Platform,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import {
  DashboardData,
  Account,
  Transaction,
  Insight,
  QuickAction,
  ChartData,
} from './src/types';
import { ApiService } from './src/services/ApiService';
import { commonStyles, Colors, Typography, Layout } from './src/styles/common';

// --- Constants and Mock Data for Quick Actions ---
const MOCK_QUICK_ACTIONS: QuickAction[] = [
  { id: 'send', name: 'Send', icon: 'paper-plane' },
  { id: 'request', name: 'Request', icon: 'hand-holding-usd' },
  { id: 'deposit', name: 'Deposit', icon: 'money-check-alt' },
  { id: 'pay', name: 'Pay Bills', icon: 'receipt' },
];

// --- Helper Components ---

// A simple icon component placeholder (in a real app, this would use a library like FontAwesome or Ionicons)
const Icon = ({ name, color = Colors.primary, size = 24 }: { name: string, color?: string, size?: number }) => (
  <View style={{ width: size, height: size, backgroundColor: color, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: Colors.card, fontSize: size * 0.5, fontWeight: 'bold' }}>{name[0].toUpperCase()}</Text>
  </View>
);

const AccountOverviewCard: React.FC<{ account: Account }> = ({ account }) => (
  <View style={[styles.accountCard, commonStyles.card]}>
    <Text style={styles.accountName}>{account.name}</Text>
    <Text style={styles.accountBalance}>
      {account.currency === 'USD' ? '$' : ''}
      {account.balance.toFixed(2)}
    </Text>
    <Text style={styles.accountType}>{account.type}</Text>
  </View>
);

const QuickActionItem: React.FC<{ action: QuickAction }> = ({ action }) => (
  <TouchableOpacity style={styles.quickActionItem} onPress={() => console.log(`Action: ${action.name}`)}>
    <Icon name={action.icon} size={40} />
    <Text style={styles.quickActionText}>{action.name}</Text>
  </TouchableOpacity>
);

const InsightCard: React.FC<{ insight: Insight }> = ({ insight }) => {
  const color = insight.type === 'warning' ? Colors.warning : insight.type === 'success' ? Colors.success : Colors.primary;
  return (
    <View style={[styles.insightCard, commonStyles.card, { borderColor: color, borderLeftWidth: 4 }]}>
      <Text style={[Typography.title, { color }]}>{insight.title}</Text>
      <Text style={Typography.body}>{insight.description}</Text>
    </View>
  );
};

const TransactionItem: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
  const isCredit = transaction.type === 'credit';
  const amountStyle = { color: isCredit ? Colors.success : Colors.danger };
  const sign = isCredit ? '+' : '-';

  return (
    <View style={[commonStyles.row, commonStyles.spaceBetween, styles.transactionItem]}>
      <View>
        <Text style={Typography.body}>{transaction.description}</Text>
        <Text style={Typography.caption}>{transaction.category} - {new Date(transaction.date).toLocaleDateString()}</Text>
      </View>
      <Text style={[Typography.title, amountStyle]}>
        {sign}{transaction.amount.toFixed(2)}
      </Text>
    </View>
  );
};

// --- Main Screen Component ---

const DashboardScreen: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dashboardData = await ApiService.fetchDashboardData();
      setData(dashboardData);
    } catch (e) {
      console.error(e);
      setError('Failed to fetch dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const renderContent = () => {
    if (loading) {
      return (
        <View style={commonStyles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 10 }}>Loading Dashboard...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={commonStyles.center}>
          <Text style={{ color: Colors.danger, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!data) {
      return <Text style={commonStyles.center}>No data available.</Text>;
    }

    const { accounts, recentActivity, insights, spendingChart } = data;

    return (
      <ScrollView style={commonStyles.container} contentContainerStyle={styles.scrollContent}>
        {/* Account Overview */}
        <Text style={commonStyles.sectionTitle}>Account Overview</Text>
        <FlatList
          data={accounts}
          renderItem={({ item }) => <AccountOverviewCard account={item} />}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.accountList}
        />

        {/* Quick Actions */}
        <Text style={commonStyles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsContainer}>
          {MOCK_QUICK_ACTIONS.map((action) => (
            <QuickActionItem key={action.id} action={action} />
          ))}
        </View>

        {/* Insights */}
        <Text style={commonStyles.sectionTitle}>Insights</Text>
        <View>
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </View>

        {/* Spending Chart (Placeholder for Phase 4) */}
        <Text style={commonStyles.sectionTitle}>Spending Trend</Text>
        <View style={[commonStyles.card, styles.chartContainer]}>
          <LineChart
            data={spendingChart}
            width={Dimensions.get('window').width - (Layout.padding * 2) - (Layout.margin * 2)} // Screen width minus padding and card margin
            height={220}
            yAxisLabel="$"
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: Colors.card,
              backgroundGradientFrom: Colors.card,
              backgroundGradientTo: Colors.card,
              decimalPlaces: 0, // optional, defaults to 2dp
              color: (opacity = 1) => Colors.primary,
              labelColor: (opacity = 1) => Colors.subtext,
              style: {
                borderRadius: 16,
              },
              propsForDots: {
                r: "6",
                strokeWidth: "2",
                stroke: Colors.primary
              }
            }}
            bezier
            style={{
              marginVertical: 8,
              borderRadius: Layout.borderRadius,
            }}
          />
        </View>

        {/* Recent Activity */}
        <Text style={commonStyles.sectionTitle}>Recent Activity</Text>
        <View style={commonStyles.card}>
          {recentActivity.map((tx) => (
            <TransactionItem key={tx.id} transaction={tx} />
          ))}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={commonStyles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <TouchableOpacity onPress={() => console.log('Notifications')}>
          <Icon name="bell" color={Colors.text} size={20} />
        </TouchableOpacity>
      </View>
      {renderContent()}
    </View>
  );
};

// --- Styles ---

const styles = StyleSheet.create({
  header: {
    padding: Layout.padding,
    paddingTop: Platform.OS === 'web' ? Layout.padding : 40, // Adjust for mobile status bar
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  headerTitle: {
    ...Typography.header,
  },
  scrollContent: {
    paddingBottom: 50,
  },
  accountList: {
    paddingHorizontal: Layout.padding,
    paddingVertical: 5,
  },
  accountCard: {
    width: Dimensions.get('window').width * 0.8,
    marginRight: Layout.margin,
    padding: Layout.padding * 1.5,
    backgroundColor: Colors.primary,
  },
  accountName: {
    ...Typography.body,
    color: Colors.card,
    opacity: 0.8,
  },
  accountBalance: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.card,
    marginVertical: 5,
  },
  accountType: {
    ...Typography.caption,
    color: Colors.card,
    opacity: 0.7,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Layout.padding,
    ...commonStyles.card,
    marginHorizontal: Layout.padding,
    marginBottom: Layout.margin,
  },
  quickActionItem: {
    alignItems: 'center',
    width: '20%',
  },
  quickActionText: {
    ...Typography.caption,
    marginTop: 5,
    textAlign: 'center',
  },
  insightCard: {
    marginHorizontal: Layout.padding,
    marginBottom: Layout.margin,
  },
  transactionItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  chartContainer: {
    marginHorizontal: Layout.padding,
    padding: 0, // Remove padding for chart to use full card width
    height: 220,
    overflow: 'hidden', // To ensure chart corners are rounded
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Layout.borderRadius,
  },
  retryButtonText: {
    color: Colors.card,
    fontWeight: 'bold',
  },
});

export default DashboardScreen;
