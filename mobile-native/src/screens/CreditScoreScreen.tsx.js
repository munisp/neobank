import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { LineChart } from 'react-native-chart-kit'; // Assuming a chart library is available

// --- Type Definitions (Mocking external types) ---

// Define the structure for the credit score data
interface CreditScoreTrend {
  date: string;
  score: number;
}

interface CreditScoreData {
  score: number;
  scoreRange: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  lastUpdated: string;
  trend: CreditScoreTrend[];
  factors: string[];
}

// Define the structure for the API service response
interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

// Mock the ApiService
const ApiService = {
  fetchCreditScore: async (): Promise<ApiResponse<CreditScoreData>> => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock data
    const mockData: CreditScoreData = {
      score: 750,
      scoreRange: 'Good',
      lastUpdated: new Date().toLocaleDateString(),
      trend: [
        { date: 'Jan', score: 680 },
        { date: 'Feb', score: 700 },
        { date: 'Mar', score: 720 },
        { date: 'Apr', score: 750 },
      ],
      factors: [
        'Payment History: Excellent',
        'Credit Utilization: Low',
        'Length of Credit History: Good',
        'Total Accounts: 5',
      ],
    };

    // Simulate success
    return { data: mockData, error: null, loading: false };

    // // Simulate error
    // return { data: null, error: 'Failed to fetch credit score data.', loading: false };
  },
};

// Define the navigation prop type (assuming a RootStackParamList)
type RootStackParamList = {
  CreditScore: undefined;
  CreditReport: undefined; // Example of a related screen
};

type CreditScoreScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'CreditScore'
>;

interface Props {
  navigation: CreditScoreScreenNavigationProp;
}

// --- Constants ---
const { width } = Dimensions.get('window');
const CHART_WIDTH = width * 0.9;
const CHART_HEIGHT = 220;

// --- CreditScoreScreen Component ---
const CreditScoreScreen: React.FC<Props> = ({ navigation }) => {
  const [scoreData, setScoreData] = useState<CreditScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await ApiService.fetchCreditScore();
      if (response.error) {
        setError(response.error);
        Alert.alert('Error', response.error);
      } else if (response.data) {
        setScoreData(response.data);
      }
    } catch (e) {
      const errorMessage = 'An unexpected error occurred while fetching data.';
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScore();
  }, [fetchScore]);

  // Function to handle navigation to a detailed report screen
  const handleViewReport = () => {
    // In a real app, this would navigate to a detailed report screen
    navigation.navigate('CreditReport');
  };

  // Render Loading State
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Credit Score...</Text>
      </View>
    );
  }

  // Render Error State
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchScore}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render Main Content
  if (!scoreData) {
    // Should not happen if error handling is correct, but good for safety
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No data available.</Text>
      </View>
    );
  }

  // Prepare data for the LineChart
  const chartData = {
    labels: scoreData.trend.map(t => t.date),
    datasets: [
      {
        data: scoreData.trend.map(t => t.score),
        color: (opacity = 1) => `rgba(134, 65, 244, ${opacity})`, // optional
        strokeWidth: 2, // optional
      },
    ],
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Credit Score</Text>
        <Text style={styles.lastUpdated}>Last Updated: {scoreData.lastUpdated}</Text>
      </View>

      {/* Current Score Display */}
      <View style={styles.scoreCard}>
        <Text style={styles.scoreRange}>{scoreData.scoreRange}</Text>
        <Text style={styles.scoreValue}>{scoreData.score}</Text>
        <Text style={styles.scoreLabel}>FICO Score</Text>
      </View>

      {/* Score Trend Chart */}
      <View style={styles.chartContainer}>
        <Text style={styles.sectionTitle}>Score Trend (Last 4 Months)</Text>
        <LineChart
          data={chartData}
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
          chartConfig={{
            backgroundColor: '#ffffff',
            backgroundGradientFrom: '#ffffff',
            backgroundGradientTo: '#ffffff',
            decimalPlaces: 0, // optional, defaults to 2dp
            color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            style: {
              borderRadius: 16,
            },
            propsForDots: {
              r: '6',
              strokeWidth: '2',
              stroke: '#007AFF',
            },
          }}
          bezier
          style={styles.chart}
        />
      </View>

      {/* Factors Affecting Score */}
      <View style={styles.factorsContainer}>
        <Text style={styles.sectionTitle}>Factors Affecting Your Score</Text>
        {scoreData.factors.map((factor, index) => (
          <View key={index} style={styles.factorItem}>
            <Text style={styles.factorText}>• {factor}</Text>
          </View>
        ))}
      </View>

      {/* Action Button */}
      <TouchableOpacity style={styles.button} onPress={handleViewReport}>
        <Text style={styles.buttonText}>View Full Credit Report</Text>
      </TouchableOpacity>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
};

// --- Styling ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  contentContainer: {
    padding: 20,
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: 'red',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    width: '100%',
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  lastUpdated: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  scoreCard: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minWidth: 180,
  },
  scoreRange: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF', // Blue for 'Good'
    marginBottom: 5,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: '900',
    color: '#333',
  },
  scoreLabel: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  chartContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  factorsContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  factorItem: {
    paddingVertical: 5,
  },
  factorText: {
    fontSize: 16,
    color: '#555',
  },
  button: {
    backgroundColor: '#1E90FF', // Dodger Blue
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default CreditScoreScreen;