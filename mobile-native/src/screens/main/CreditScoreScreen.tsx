import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { apiService } from '../../services/ApiService';

interface CreditScore {
  score: number;
  rating: string;
  last_updated: string;
  factors: {
    payment_history: number;
    credit_utilization: number;
    credit_age: number;
    credit_mix: number;
    recent_inquiries: number;
  };
  recommendations: string[];
}

export const CreditScoreScreen = () => {
  const [creditData, setCreditData] = useState<CreditScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadCreditScore();
  }, []);

  const loadCreditScore = async () => {
    try {
      const data = await apiService.getCreditScore();
      setCreditData(data);
    } catch (error) {
      console.error('Failed to load credit score:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCreditScore();
  };

  const getScoreColor = (score: number) => {
    if (score >= 750) return '#4CAF50';
    if (score >= 650) return '#FFC107';
    return '#f44336';
  };

  const getRatingText = (rating: string) => {
    const ratings: { [key: string]: string } = {
      excellent: 'Excellent',
      good: 'Good',
      fair: 'Fair',
      poor: 'Poor',
    };
    return ratings[rating] || rating;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!creditData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load credit score</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Credit Score Card */}
      <View style={[styles.scoreCard, { backgroundColor: getScoreColor(creditData.score) }]}>
        <Text style={styles.scoreLabel}>Your Credit Score</Text>
        <Text style={styles.scoreValue}>{creditData.score}</Text>
        <Text style={styles.scoreRating}>{getRatingText(creditData.rating)}</Text>
        <Text style={styles.scoreDate}>
          Last updated: {new Date(creditData.last_updated).toLocaleDateString()}
        </Text>
      </View>

      {/* Score Factors */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Score Factors</Text>

        <View style={styles.factorCard}>
          <View style={styles.factorHeader}>
            <Text style={styles.factorLabel}>Payment History</Text>
            <Text style={styles.factorValue}>{creditData.factors.payment_history}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${creditData.factors.payment_history}%` },
              ]}
            />
          </View>
        </View>

        <View style={styles.factorCard}>
          <View style={styles.factorHeader}>
            <Text style={styles.factorLabel}>Credit Utilization</Text>
            <Text style={styles.factorValue}>{creditData.factors.credit_utilization}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${creditData.factors.credit_utilization}%` },
              ]}
            />
          </View>
        </View>

        <View style={styles.factorCard}>
          <View style={styles.factorHeader}>
            <Text style={styles.factorLabel}>Credit Age</Text>
            <Text style={styles.factorValue}>{creditData.factors.credit_age}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${creditData.factors.credit_age}%` },
              ]}
            />
          </View>
        </View>

        <View style={styles.factorCard}>
          <View style={styles.factorHeader}>
            <Text style={styles.factorLabel}>Credit Mix</Text>
            <Text style={styles.factorValue}>{creditData.factors.credit_mix}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${creditData.factors.credit_mix}%` },
              ]}
            />
          </View>
        </View>

        <View style={styles.factorCard}>
          <View style={styles.factorHeader}>
            <Text style={styles.factorLabel}>Recent Inquiries</Text>
            <Text style={styles.factorValue}>{creditData.factors.recent_inquiries}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${creditData.factors.recent_inquiries}%` },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Recommendations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recommendations</Text>
        {creditData.recommendations.map((rec, index) => (
          <View key={index} style={styles.recommendationCard}>
            <Text style={styles.recommendationIcon}>💡</Text>
            <Text style={styles.recommendationText}>{rec}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#999',
  },
  scoreCard: {
    margin: 16,
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 12,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  scoreRating: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  scoreDate: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  factorCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  factorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  factorLabel: {
    fontSize: 14,
    color: '#666',
  },
  factorValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  recommendationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recommendationIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
});

