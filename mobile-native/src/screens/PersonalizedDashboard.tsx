import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LineChart, BarChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from '../services/ApiService';
import QuickActions from '../components/QuickActions';
import * as Haptics from 'expo-haptics';

interface DashboardWidget {
  id: string;
  type: 'balance' | 'spending' | 'investments' | 'credit' | 'goals' | 'bills';
  title: string;
  visible: boolean;
  order: number;
}

interface UserPreferences {
  widgets: DashboardWidget[];
  defaultView: 'overview' | 'detailed';
  showQuickActions: boolean;
}

const screenWidth = Dimensions.get('window').width;

export default function PersonalizedDashboard({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({
    widgets: [
      { id: 'balance', type: 'balance', title: 'Total Balance', visible: true, order: 0 },
      { id: 'spending', type: 'spending', title: 'Spending Trends', visible: true, order: 1 },
      { id: 'investments', type: 'investments', title: 'Investments', visible: true, order: 2 },
      { id: 'credit', type: 'credit', title: 'Credit Score', visible: true, order: 3 },
      { id: 'goals', type: 'goals', title: 'Financial Goals', visible: true, order: 4 },
      { id: 'bills', type: 'bills', title: 'Upcoming Bills', visible: true, order: 5 },
    ],
    defaultView: 'overview',
    showQuickActions: true,
  });

  const [dashboardData, setDashboardData] = useState({
    totalBalance: 0,
    spendingData: [] as number[],
    investmentValue: 0,
    creditScore: 0,
    goals: [] as any[],
    upcomingBills: [] as any[],
  });

  useEffect(() => {
    loadPreferences();
    loadDashboardData();
  }, []);

  const loadPreferences = async () => {
    try {
      const stored = await AsyncStorage.getItem('dashboard_preferences');
      if (stored) {
        setPreferences(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const savePreferences = async (newPreferences: UserPreferences) => {
    try {
      await AsyncStorage.setItem('dashboard_preferences', JSON.stringify(newPreferences));
      setPreferences(newPreferences);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  };

  const loadDashboardData = async () => {
    try {
      const response = await ApiService.get('/dashboard/personalized');
      setDashboardData(response.data);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleWidgetVisibility = (widgetId: string) => {
    const updatedWidgets = preferences.widgets.map((widget) =>
      widget.id === widgetId ? { ...widget, visible: !widget.visible } : widget
    );
    savePreferences({ ...preferences, widgets: updatedWidgets });
  };

  const renderBalanceWidget = () => (
    <View style={styles.widget}>
      <View style={styles.widgetHeader}>
        <Text style={styles.widgetTitle}>Total Balance</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Accounts')}>
          <Icon name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>
      </View>
      <Text style={styles.balanceAmount}>${dashboardData.totalBalance.toLocaleString()}</Text>
      <View style={styles.balanceChange}>
        <Icon name="trending-up" size={16} color="#4caf50" />
        <Text style={styles.balanceChangeText}>+2.5% this month</Text>
      </View>
    </View>
  );

  const renderSpendingWidget = () => (
    <View style={styles.widget}>
      <View style={styles.widgetHeader}>
        <Text style={styles.widgetTitle}>Spending Trends</Text>
        <TouchableOpacity onPress={() => navigation.navigate('SpendingInsights')}>
          <Icon name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>
      </View>
      <LineChart
        data={{
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [
            {
              data: dashboardData.spendingData.length > 0 
                ? dashboardData.spendingData 
                : [120, 85, 150, 95, 200, 110, 180],
            },
          ],
        }}
        width={screenWidth - 64}
        height={180}
        chartConfig={{
          backgroundColor: '#fff',
          backgroundGradientFrom: '#fff',
          backgroundGradientTo: '#fff',
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`,
          style: {
            borderRadius: 16,
          },
        }}
        bezier
        style={styles.chart}
      />
    </View>
  );

  const renderInvestmentsWidget = () => (
    <View style={styles.widget}>
      <View style={styles.widgetHeader}>
        <Text style={styles.widgetTitle}>Investments</Text>
        <TouchableOpacity onPress={() => navigation.navigate('StockTrading')}>
          <Icon name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>
      </View>
      <View style={styles.investmentRow}>
        <View>
          <Text style={styles.investmentLabel}>Portfolio Value</Text>
          <Text style={styles.investmentValue}>
            ${dashboardData.investmentValue.toLocaleString()}
          </Text>
        </View>
        <View style={styles.investmentGain}>
          <Icon name="trending-up" size={20} color="#4caf50" />
          <Text style={styles.investmentGainText}>+12.5%</Text>
        </View>
      </View>
    </View>
  );

  const renderCreditWidget = () => (
    <TouchableOpacity
      style={styles.widget}
      onPress={() => navigation.navigate('CreditScore')}
      activeOpacity={0.7}
    >
      <View style={styles.widgetHeader}>
        <Text style={styles.widgetTitle}>Credit Score</Text>
        <Icon name="chevron-right" size={24} color="#666" />
      </View>
      <View style={styles.creditScoreContainer}>
        <Text style={styles.creditScore}>{dashboardData.creditScore || 750}</Text>
        <Text style={styles.creditRating}>Excellent</Text>
      </View>
    </TouchableOpacity>
  );

  const renderGoalsWidget = () => (
    <View style={styles.widget}>
      <View style={styles.widgetHeader}>
        <Text style={styles.widgetTitle}>Financial Goals</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Goals')}>
          <Icon name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>
      </View>
      {dashboardData.goals.length > 0 ? (
        dashboardData.goals.slice(0, 2).map((goal, index) => (
          <View key={index} style={styles.goalItem}>
            <Text style={styles.goalName}>{goal.name}</Text>
            <View style={styles.goalProgress}>
              <View style={styles.goalProgressBar}>
                <View style={[styles.goalProgressFill, { width: `${goal.progress}%` }]} />
              </View>
              <Text style={styles.goalProgressText}>{goal.progress}%</Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>No active goals</Text>
      )}
    </View>
  );

  const renderBillsWidget = () => (
    <View style={styles.widget}>
      <View style={styles.widgetHeader}>
        <Text style={styles.widgetTitle}>Upcoming Bills</Text>
        <TouchableOpacity onPress={() => navigation.navigate('BillReminders')}>
          <Icon name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>
      </View>
      {dashboardData.upcomingBills.length > 0 ? (
        dashboardData.upcomingBills.slice(0, 3).map((bill, index) => (
          <View key={index} style={styles.billItem}>
            <Icon name="receipt" size={20} color="#ff9800" />
            <View style={styles.billInfo}>
              <Text style={styles.billName}>{bill.name}</Text>
              <Text style={styles.billDate}>Due {bill.dueDate}</Text>
            </View>
            <Text style={styles.billAmount}>${bill.amount}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>No upcoming bills</Text>
      )}
    </View>
  );

  const renderWidget = (widget: DashboardWidget) => {
    if (!widget.visible) return null;

    switch (widget.type) {
      case 'balance':
        return renderBalanceWidget();
      case 'spending':
        return renderSpendingWidget();
      case 'investments':
        return renderInvestmentsWidget();
      case 'credit':
        return renderCreditWidget();
      case 'goals':
        return renderGoalsWidget();
      case 'bills':
        return renderBillsWidget();
      default:
        return null;
    }
  };

  const sortedWidgets = [...preferences.widgets].sort((a, b) => a.order - b.order);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good morning</Text>
          <Text style={styles.userName}>John Doe</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('DashboardSettings')}>
          <Icon name="cog-outline" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      {preferences.showQuickActions && <QuickActions />}

      {sortedWidgets.map((widget) => (
        <View key={widget.id}>{renderWidget(widget)}</View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  greeting: {
    fontSize: 14,
    color: '#666',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  widget: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  widgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  widgetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  balanceChange: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceChangeText: {
    fontSize: 14,
    color: '#4caf50',
    marginLeft: 4,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  investmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  investmentLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  investmentValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  investmentGain: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  investmentGainText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4caf50',
    marginLeft: 4,
  },
  creditScoreContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  creditScore: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4caf50',
  },
  creditRating: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  goalItem: {
    marginBottom: 16,
  },
  goalName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  goalProgress: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalProgressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginRight: 12,
  },
  goalProgressFill: {
    height: '100%',
    backgroundColor: '#2196f3',
    borderRadius: 4,
  },
  goalProgressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    width: 40,
    textAlign: 'right',
  },
  billItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  billInfo: {
    flex: 1,
    marginLeft: 12,
  },
  billName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  billDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  billAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

