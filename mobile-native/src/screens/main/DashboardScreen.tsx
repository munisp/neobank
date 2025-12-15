import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useQuery } from 'react-query';

import { useAuth } from '../../store/AuthContext';
import { useTheme } from '../../store/ThemeContext';
import { mobileApiService } from '../../services/MobileApiService';
import LoadingSpinner from '../../components/LoadingSpinner';
import TransactionItem from '../../components/TransactionItem';
import QuickActionButton from '../../components/QuickActionButton';

const { width } = Dimensions.get('window');

interface DashboardData {
  user_name: string;
  account_number: string;
  balance: number;
  recent_transactions: Transaction[];
  quick_actions: QuickAction[];
  notifications: Notification[];
  kyc_status: string;
  card_status: string;
}

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  date: string;
  status: string;
  recipient?: string;
  sender?: string;
}

interface QuickAction {
  id: string;
  title: string;
  icon: string;
  description: string;
  enabled: boolean;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  timestamp: string;
}

const DashboardScreen: React.FC = ({ navigation }: any) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: dashboardData,
    isLoading,
    error,
    refetch,
  } = useQuery<DashboardData>('dashboard', mobileApiService.getDashboard, {
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleQuickAction = (actionId: string) => {
    switch (actionId) {
      case 'transfer':
        navigation.navigate('Transfer');
        break;
      case 'pay_bills':
        navigation.navigate('BillPayment');
        break;
      case 'buy_airtime':
        navigation.navigate('Airtime');
        break;
      case 'qr_pay':
        navigation.navigate('QRScanner');
        break;
      case 'request_money':
        Alert.alert('Coming Soon', 'Request money feature will be available soon!');
        break;
      case 'savings':
        Alert.alert('Coming Soon', 'Savings feature will be available soon!');
        break;
      default:
        Alert.alert('Action', `${actionId} selected`);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Icon name="error" size={48} color={theme.colors.error} />
        <Text style={[styles.errorText, { color: theme.colors.error }]}>
          Failed to load dashboard
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => refetch()}
        >
          <Text style={[styles.retryButtonText, { color: theme.colors.white }]}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={[styles.greeting, { color: theme.colors.white }]}>
              {getGreeting()},
            </Text>
            <Text style={[styles.userName, { color: theme.colors.white }]}>
              {dashboardData?.user_name || 'User'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Icon name="notifications" size={24} color={theme.colors.white} />
            {dashboardData?.notifications?.some(n => !n.read) && (
              <View style={styles.notificationBadge} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Balance Card */}
      <View style={[styles.balanceCard, { backgroundColor: theme.colors.white }]}>
        <Text style={[styles.balanceLabel, { color: theme.colors.gray }]}>
          Account Balance
        </Text>
        <Text style={[styles.balanceAmount, { color: theme.colors.text }]}>
          {formatCurrency(dashboardData?.balance || 0)}
        </Text>
        <Text style={[styles.accountNumber, { color: theme.colors.gray }]}>
          {dashboardData?.account_number}
        </Text>
        
        {/* KYC Status */}
        {dashboardData?.kyc_status !== 'verified' && (
          <TouchableOpacity
            style={[styles.kycBanner, { backgroundColor: theme.colors.warning }]}
            onPress={() => navigation.navigate('KYC')}
          >
            <Icon name="warning" size={16} color={theme.colors.white} />
            <Text style={[styles.kycText, { color: theme.colors.white }]}>
              Complete your KYC verification
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Actions */}
      <View style={[styles.section, { backgroundColor: theme.colors.white }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Quick Actions
        </Text>
        <View style={styles.quickActionsGrid}>
          {dashboardData?.quick_actions?.map((action) => (
            <QuickActionButton
              key={action.id}
              icon={action.icon}
              title={action.title}
              onPress={() => handleQuickAction(action.id)}
              enabled={action.enabled}
            />
          ))}
        </View>
      </View>

      {/* Recent Transactions */}
      <View style={[styles.section, { backgroundColor: theme.colors.white }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Recent Transactions
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Transactions')}
          >
            <Text style={[styles.seeAllText, { color: theme.colors.primary }]}>
              See All
            </Text>
          </TouchableOpacity>
        </View>
        {dashboardData?.recent_transactions?.length ? (
          dashboardData.recent_transactions.map((transaction) => (
            <TransactionItem
              key={transaction.id}
              transaction={transaction}
              onPress={() => {
                // Navigate to transaction details
                Alert.alert('Transaction Details', JSON.stringify(transaction, null, 2));
              }}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Icon name="receipt" size={48} color={theme.colors.gray} />
            <Text style={[styles.emptyStateText, { color: theme.colors.gray }]}>
              No recent transactions
            </Text>
          </View>
        )}
      </View>

      {/* Bottom Spacing */}
      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    marginVertical: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 16,
    opacity: 0.9,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  notificationButton: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4444',
  },
  balanceCard: {
    margin: 20,
    marginTop: -40,
    padding: 24,
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  balanceLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  accountNumber: {
    fontSize: 14,
    marginBottom: 16,
  },
  kycBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  kycText: {
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
  section: {
    margin: 20,
    marginTop: 0,
    padding: 20,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '500',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 16,
    marginTop: 16,
  },
  bottomSpacing: {
    height: 20,
  },
});

export default DashboardScreen;
