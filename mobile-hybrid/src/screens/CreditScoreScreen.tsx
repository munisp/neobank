// File: CreditScoreScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { styles, getStatusColor, chartConfig, chartWidth, chartHeight } from './src/styles/CreditScoreScreenStyles';
import { CreditScoreData, CreditScoreState, ScoreFactor, ImprovementTip } from './src/types/CreditScoreTypes';
import { fetchCreditScoreData } from './src/services/MockApiService'; // Mock service for demonstration

// Mocking the services from src/services
const ApiService = {
  fetchCreditScore: fetchCreditScoreData,
};

// --- Sub-Components ---

interface ScoreDisplayProps {
  score: number;
  range: string;
  lastUpdated: string;
}

const ScoreDisplay: React.FC<ScoreDisplayProps> = ({ score, range, lastUpdated }) => (
  <View style={styles.scoreCard}>
    <Text style={styles.scoreText}>{score}</Text>
    <Text style={styles.rangeText}>{range}</Text>
    <Text style={styles.updateText}>Last updated: {new Date(lastUpdated).toLocaleDateString()}</Text>
  </View>
);

interface ScoreHistoryChartProps {
  data: CreditScoreData;
}

const ScoreHistoryChart: React.FC<ScoreHistoryChartProps> = ({ data }) => {
  const chartData = {
    labels: data.history.map(p => p.month),
    datasets: [
      {
        data: data.history.map(p => p.score),
        color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`, // NeoBank Blue
        strokeWidth: 2,
      },
    ],
  };

  // Determine the min and max score for the Y-axis
  const allScores = data.history.map(p => p.score);
  const minScore = Math.min(...allScores) - 20;
  const maxScore = Math.max(...allScores) + 20;

  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>Score History (Last 6 Months)</Text>
      <LineChart
        data={chartData}
        width={chartWidth}
        height={chartHeight}
        chartConfig={chartConfig}
        bezier
        style={{
          marginVertical: 8,
          borderRadius: 16,
        }}
        yAxisLabel=""
        yAxisSuffix=""
        yAxisInterval={1}
        fromZero={false}
        verticalLabelRotation={-30}
        withHorizontalLabels={true}
        withVerticalLines={false}
        withHorizontalLines={true}
        yLabelsOffset={-5}
        segments={5}
        formatYLabel={(yLabel) => String(Math.round(Number(yLabel)))}
        // Custom y-axis scale
        yAxisMin={minScore}
        yAxisMax={maxScore}
      />
    </View>
  );
};

interface FactorItemProps {
  factor: ScoreFactor;
}

const FactorItem: React.FC<FactorItemProps> = ({ factor }) => {
  const statusStyle = getStatusColor(factor.status);
  return (
    <View style={styles.factorItem}>
      <Text style={styles.factorTitle}>{factor.title}</Text>
      <Text style={[styles.factorStatus, { backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }]}>
        {factor.status}
      </Text>
    </View>
  );
};

interface FactorsAffectingScoreProps {
  factors: ScoreFactor[];
}

const FactorsAffectingScore: React.FC<FactorsAffectingScoreProps> = ({ factors }) => (
  <View>
    <Text style={styles.sectionHeader}>Factors Affecting Your Score</Text>
    <View style={styles.factorsContainer}>
      {factors.map((factor, index) => (
        <FactorItem key={factor.id} factor={factor} />
      ))}
    </View>
  </View>
);

interface ImprovementTipProps {
  tip: ImprovementTip;
}

const ImprovementTipCard: React.FC<ImprovementTipProps> = ({ tip }) => (
  <View style={styles.tipCard}>
    <Text style={styles.tipTitle}>{tip.title}</Text>
    <Text style={styles.tipDescription}>{tip.description}</Text>
  </View>
);

interface ImprovementTipsProps {
  tips: ImprovementTip[];
}

const ImprovementTips: React.FC<ImprovementTipsProps> = ({ tips }) => (
  <View style={styles.tipsContainer}>
    <Text style={styles.sectionHeader}>Improvement Tips</Text>
    {tips.map((tip) => (
      <ImprovementTipCard key={tip.id} tip={tip} />
    ))}
  </View>
);

// --- Main Screen Component ---

const CreditScoreScreen: React.FC = () => {
  const [state, setState] = useState<CreditScoreState>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchScore = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      // Simulate fetching data from a real API service
      // In a real app, this would use ApiService.fetchCreditScore()
      const data = await ApiService.fetchCreditScore();
      setState({ data, loading: false, error: null });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setState({ data: null, loading: false, error: errorMessage });
    }
  }, []);

  useEffect(() => {
    fetchScore();
  }, [fetchScore]);

  // --- Render Logic ---

  if (state.loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10 }}>Loading credit score data...</Text>
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Error: {state.error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchScore}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { data } = state;

  if (!data) {
    // Should not happen if error handling is correct, but good for type safety
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>No data available.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchScore}>
          <Text style={styles.retryButtonText}>Reload</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* 1. Score Display */}
        <ScoreDisplay
          score={data.currentScore}
          range={data.scoreRange}
          lastUpdated={data.lastUpdated}
        />

        {/* 2. Score History Chart */}
        <ScoreHistoryChart data={data} />

        {/* 3. Factors Affecting Score */}
        <FactorsAffectingScore factors={data.factors} />

        {/* 4. Improvement Tips */}
        <ImprovementTips tips={data.improvementTips} />
      </ScrollView>
    </View>
  );
};

export default CreditScoreScreen;

// Supporting files (for context, not part of the main screen code)

// File: src/types/CreditScoreTypes.ts
/*
export interface ScoreHistoryPoint {
  month: string;
  score: number;
}

export interface ScoreFactor {
  id: string;
  title: string;
  impact: 'High' | 'Medium' | 'Low';
  status: 'Excellent' | 'Good' | 'Fair' | 'Poor';
}

export interface ImprovementTip {
  id: string;
  title: string;
  description: string;
}

export interface CreditScoreData {
  currentScore: number;
  scoreRange: string;
  lastUpdated: string;
  history: ScoreHistoryPoint[];
  factors: ScoreFactor[];
  improvementTips: ImprovementTip[];
}

export type CreditScoreState = {
  data: CreditScoreData | null;
  loading: boolean;
  error: string | null;
};
*/

// File: src/services/MockApiService.ts
/*
import { CreditScoreData, ScoreHistoryPoint, ScoreFactor, ImprovementTip } from '../types/CreditScoreTypes';

// Mock data
const mockScoreHistory: ScoreHistoryPoint[] = [
  { month: 'Jan', score: 680 },
  { month: 'Feb', score: 695 },
  { month: 'Mar', score: 710 },
  { month: 'Apr', score: 705 },
  { month: 'May', score: 720 },
  { month: 'Jun', score: 735 },
];

const mockFactors: ScoreFactor[] = [
  { id: '1', title: 'Payment History', impact: 'High', status: 'Excellent' },
  { id: '2', title: 'Credit Utilization', impact: 'Medium', status: 'Good' },
  { id: '3', title: 'Length of Credit History', impact: 'Medium', status: 'Fair' },
  { id: '4', title: 'Credit Mix', impact: 'Low', status: 'Good' },
  { id: '5', title: 'New Credit', impact: 'Low', status: 'Excellent' },
];

const mockTips: ImprovementTip[] = [
  { id: '1', title: 'Pay Bills On Time', description: 'Payment history is the most important factor. Set up auto-pay to avoid missing due dates.' },
  { id: '2', title: 'Keep Balances Low', description: 'Try to use less than 30% of your available credit. Lower is better.' },
  { id: '3', title: 'Avoid Opening Too Many New Accounts', description: 'Each new hard inquiry can temporarily drop your score.' },
];

const mockCreditScoreData: CreditScoreData = {
  currentScore: 735,
  scoreRange: 'Good',
  lastUpdated: new Date().toISOString(),
  history: mockScoreHistory,
  factors: mockFactors,
  improvementTips: mockTips,
};

// Simulates fetching credit score data from an API.
export const fetchCreditScoreData = (): Promise<CreditScoreData> => {
  return new Promise((resolve) => {
    // Simulate network delay
    setTimeout(() => {
      resolve(mockCreditScoreData);
    }, 1500);
  });
};

// Simulates an API call that might fail.
export const fetchCreditScoreDataWithError = (): Promise<CreditScoreData> => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Failed to fetch credit score data. Please try again later.'));
    }, 1500);
  });
};
*/

// File: src/styles/CreditScoreScreenStyles.ts
/*
import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollViewContent: {
    padding: 16,
  },
  // --- Score Display ---
  scoreCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scoreText: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#007AFF', // NeoBank Blue
  },
  rangeText: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 5,
    color: '#333',
  },
  updateText: {
    fontSize: 12,
    color: '#888',
    marginTop: 10,
  },
  // --- Section Headers ---
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    marginTop: 10,
  },
  // --- Chart ---
  chartContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
    marginLeft: 10,
  },
  // --- Factors ---
  factorItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  factorTitle: {
    fontSize: 16,
    color: '#333',
    flex: 2,
  },
  factorStatus: {
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    textAlign: 'center',
  },
  factorsContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // --- Tips ---
  tipCard: {
    backgroundColor: '#E6F0FF', // Light Blue Background
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 5,
  },
  tipDescription: {
    fontSize: 14,
    color: '#333',
  },
  tipsContainer: {
    marginBottom: 20,
  },
  // --- Utility ---
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});

// Helper function to get color based on status
export const getStatusColor = (status: string) => {
  switch (status) {
    case 'Excellent':
      return { backgroundColor: '#4CAF50', color: '#ffffff' }; // Green
    case 'Good':
    case 'Fair':
      return { backgroundColor: '#FFC107', color: '#333333' }; // Amber
    case 'Poor':
      return { backgroundColor: '#F44336', color: '#ffffff' }; // Red
    default:
      return { backgroundColor: '#ccc', color: '#333333' };
  }
};

export const chartConfig = {
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  decimalPlaces: 0, // optional, defaults to 2dp
  color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`, // NeoBank Blue
  labelColor: (opacity = 1) => `rgba(51, 51, 51, ${opacity})`,
  style: {
    borderRadius: 16,
  },
  propsForDots: {
    r: '6',
    strokeWidth: '2',
    stroke: '#007AFF',
  },
};

export const chartWidth = width - 32 - 20; // Screen width - padding - chart padding
export const chartHeight = 220;
*/