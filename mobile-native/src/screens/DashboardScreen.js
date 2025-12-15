import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';

// --- Type Definitions ---

// Assuming a simple navigation stack for demonstration
type RootStackParamList = {
  Dashboard: undefined;
  Details: { itemId: string };
  Settings: undefined;
};

type DashboardScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'Dashboard'
>;

interface DashboardScreenProps {
  navigation: DashboardScreenNavigationProp;
}

// Simulated Data Structures
interface KPI {
  id: string;
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
}

interface ActivityItem {
  id: string;
  description: string;
  timestamp: string;
}

interface DashboardData {
  kpis: KPI[];
  recentActivity: ActivityItem[];
  userName: string;
}

// --- Simulated API Service ---

/**
 * A simulated ApiService to fetch dashboard data.
 * In a real application, this would be an actual service making network requests.
 */
const ApiService = {
  fetchDashboardData: (): Promise<DashboardData> => {
    return new Promise((resolve) => {
      // Simulate network delay
      setTimeout(() => {
        const mockData: DashboardData = {
          userName: 'Alex Johnson',
          kpis: [
            {
              id: 'sales',
              title: 'Total Sales',
              value: '$12,450',
              change: '+5.2%',
              isPositive: true,
            },
            {
              id: 'users',
              title: 'New Users',
              value: '850',
              change: '-1.8%',
              isPositive: false,
            },
            {
              id: 'revenue',
              title: 'Total Revenue',
              value: '$45,120',
              change: '+12.1%',
              isPositive: true,
            },
          ],
          recentActivity: [
            {
              id: '1',
              description: 'Order #9876 processed successfully.',
              timestamp: '2 minutes ago',
            },
            {
              id: '2',
              description: 'New user registered: Jane Doe.',
              timestamp: '1 hour ago',
            },
            {
              id: '3',
              description: 'Server maintenance scheduled for 03/15.',
              timestamp: 'Yesterday',
            },
          ],
        };
        resolve(mockData);
      }, 1500);
    });
  },
  // Simulate an API call that might fail
  fetchFailingData: (): Promise<DashboardData> => {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Failed to connect to the analytics service.'));
      }, 1000);
    });
  },
};

// --- Components ---

const Header: React.FC<{ userName: string; onSettingsPress: () => void }> = ({
  userName,
  onSettingsPress,
}) => (
  <View style={styles.headerContainer}>
    <View>
      <Text style={styles.greetingText}>Welcome back,</Text>
      <Text style={styles.userNameText}>{userName}</Text>
    </View>
    <TouchableOpacity onPress={onSettingsPress} style={styles.settingsButton}>
      {/* In a real app, this would be an Icon component */}
      <Text style={styles.settingsIcon}>⚙️</Text>
    </TouchableOpacity>
  </View>
);

const KPIItem: React.FC<KPI> = ({ title, value, change, isPositive }) => (
  <View style={styles.kpiCard}>
    <Text style={styles.kpiTitle}>{title}</Text>
    <Text style={styles.kpiValue}>{value}</Text>
    <Text
      style={[
        styles.kpiChange,
        { color: isPositive ? '#4CAF50' : '#F44336' },
      ]}
    >
      {change}
    </Text>
  </View>
);

const ActivityCard: React.FC<{ activity: ActivityItem[] }> = ({ activity }) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>Recent Activity</Text>
    {activity.map((item) => (
      <View key={item.id} style={styles.activityItem}>
        <Text style={styles.activityDescription}>{item.description}</Text>
        <Text style={styles.activityTimestamp}>{item.timestamp}</Text>
      </View>
    ))}
    <TouchableOpacity style={styles.viewAllButton}>
      <Text style={styles.viewAllText}>View All Activity</Text>
    </TouchableOpacity>
  </View>
);

// --- Main Screen Component ---

const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Function to fetch data from the simulated API service
  const fetchData = useCallback(async (showLoadingIndicator: boolean = true) => {
    if (showLoadingIndicator) {
      setIsLoading(true);
    }
    setError(null);
    try {
      // Use the successful API call for the main load
      const result = await ApiService.fetchDashboardData();
      setData(result);
    } catch (err) {
      // Proper error handling: check if err is an Error object
      const errorMessage =
        err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      Alert.alert('Error', `Failed to load dashboard data: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial data load on component mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle pull-to-refresh action
  const onRefresh = () => {
    setIsRefreshing(true);
    fetchData(false); // Don't show full screen loader on refresh
  };

  // Navigation integration
  const handleSettingsPress = () => {
    // Navigate to a hypothetical Settings screen
    navigation.navigate('Settings');
  };

  // Loading State
  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  // Error State
  if (error && !data) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>
          Could not load dashboard. Please try again.
        </Text>
        <Text style={styles.errorDetail}>{error}</Text>
        <TouchableOpacity
          onPress={() => fetchData()}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>Retry Load</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main Content
  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header Section */}
      <Header
        userName={data?.userName || 'User'}
        onSettingsPress={handleSettingsPress}
      />

      {/* KPIs Section */}
      <View style={styles.kpiContainer}>
        {data?.kpis.map((kpi) => (
          <KPIItem key={kpi.id} {...kpi} />
        ))}
      </View>

      {/* Chart Placeholder (Simulating a data visualization component) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sales Performance (Last 7 Days)</Text>
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartText}>[Chart Component Placeholder]</Text>
        </View>
      </View>

      {/* Recent Activity Section */}
      {data?.recentActivity && (
        <ActivityCard activity={data.recentActivity} />
      )}

      {/* Additional Navigation/Action Buttons (PWA Feature Parity) */}
      <View style={styles.actionButtonContainer}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Details', { itemId: 'reports' })}
        >
          <Text style={styles.actionButtonText}>View Reports</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Details', { itemId: 'new_order' })}
        >
          <Text style={styles.actionButtonText}>Create New Order</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA', // Light background for a modern look
    padding: 16,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D32F2F',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greetingText: {
    fontSize: 16,
    color: '#666',
  },
  userNameText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  settingsButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
  },
  settingsIcon: {
    fontSize: 20,
  },
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  kpiCard: {
    width: '48%', // Two cards per row
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  kpiTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  kpiChange: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 5,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  chartPlaceholder: {
    height: 200,
    backgroundColor: '#E8EAF6', // Light blue background for contrast
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartText: {
    color: '#7986CB',
    fontSize: 16,
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  activityDescription: {
    fontSize: 14,
    color: '#333',
    flexShrink: 1,
    marginRight: 10,
  },
  activityTimestamp: {
    fontSize: 12,
    color: '#999',
  },
  viewAllButton: {
    marginTop: 15,
    alignSelf: 'flex-start',
  },
  viewAllText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  actionButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    width: '48%',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default DashboardScreen;