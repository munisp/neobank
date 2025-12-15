import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';

// --- 1. TYPE DEFINITIONS ---

/**
 * Type for a single insurance policy.
 */
interface Policy {
  id: string;
  policyNumber: string;
  type: 'Auto' | 'Home' | 'Life';
  status: 'Active' | 'Pending' | 'Expired';
  premium: number;
  nextPaymentDate: string;
}

/**
 * Type for the claim submission data.
 */
interface ClaimSubmission {
  policyId: string;
  description: string;
  incidentDate: string;
}

/**
 * Type for the screen's navigation props (assuming a stack navigator).
 */
type RootStackParamList = {
  InsuranceDetail: { policyId: string };
  ClaimForm: undefined;
  // Add other screen names as needed
  Insurance: undefined;
};

type InsuranceScreenNavigationProp = NavigationProp<RootStackParamList, 'Insurance'>;

// --- 2. MOCK API SERVICE ---

/**
 * A mock service to simulate API calls for fetching insurance data.
 * In a real application, this would be a separate file and use \`fetch\` or \`axios\`.
 */
const ApiService = {
  /**
   * Simulates fetching a list of active policies.
   */
  fetchPolicies: (): Promise<Policy[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockPolicies: Policy[] = [
          {
            id: 'p1001',
            policyNumber: 'AUTO-123456',
            type: 'Auto',
            status: 'Active',
            premium: 150.5,
            nextPaymentDate: '2025-12-01',
          },
          {
            id: 'p1002',
            policyNumber: 'HOME-987654',
            type: 'Home',
            status: 'Active',
            premium: 85.0,
            nextPaymentDate: '2025-11-15',
          },
          {
            id: 'p1003',
            policyNumber: 'LIFE-112233',
            type: 'Life',
            status: 'Pending',
            premium: 50.0,
            nextPaymentDate: '2026-01-01',
          },
        ];
        resolve(mockPolicies);
      }, 1500); // Simulate network delay
    });
  },

  /**
   * Simulates submitting a new claim.
   */
  submitClaim: (claim: ClaimSubmission): Promise<{ success: boolean; claimId: string }> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulate a successful claim submission
        resolve({ success: true, claimId: \`CLAIM-\${Math.floor(Math.random() * 10000)}\` });
      }, 1000);
    });
  },
};

// --- 3. COMPONENTS ---

/**
 * Renders a single policy item in the list.
 */
const PolicyItem: React.FC<{ policy: Policy; onPress: (policyId: string) => void }> = ({
  policy,
  onPress,
}) => (
  <TouchableOpacity
    style={styles.policyCard}
    onPress={() => onPress(policy.id)}
    activeOpacity={0.7}>
    <View style={styles.policyHeader}>
      <Text style={styles.policyType}>{policy.type} Insurance</Text>
      <Text style={[styles.policyStatus, policy.status === 'Active' && styles.policyStatusActive]}>
        {policy.status}
      </Text>
    </View>
    <Text style={styles.policyNumber}>Policy No: {policy.policyNumber}</Text>
    <Text style={styles.policyDetail}>
      Premium: \${policy.premium.toFixed(2)} / month
    </Text>
    <Text style={styles.policyDetail}>
      Next Payment: {policy.nextPaymentDate}
    </Text>
  </TouchableOpacity>
);

// --- 4. MAIN SCREEN COMPONENT ---

/**
 * The main screen component for Insurance.
 * Features: Policy list, loading/error states, navigation, and mock API calls.
 */
const InsuranceScreen: React.FC = () => {
  const navigation = useNavigation<InsuranceScreenNavigationProp>();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch policies from the mock API service
  const fetchPolicies = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ApiService.fetchPolicies();
      setPolicies(data);
    } catch (err) {
      // Proper error handling: check error type and display user-friendly message
      console.error('Failed to fetch policies:', err);
      setError('Could not load your policies. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load policies on component mount
  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  // Navigation handler for policy details
  const handlePolicyPress = (policyId: string) => {
    // Navigate to a hypothetical detail screen, passing the policy ID
    // This integrates with the navigation system as required.
    navigation.navigate('InsuranceDetail', { policyId });
  };

  // Handler for the "File a Claim" button
  const handleFileClaim = async () => {
    // In a real app, this would navigate to a ClaimForm screen.
    // For this example, we'll simulate a claim submission directly.
    // navigation.navigate('ClaimForm');

    const mockClaim: ClaimSubmission = {
      policyId: policies[0]?.id || 'p-default',
      description: 'Simulated minor incident.',
      incidentDate: new Date().toISOString().split('T')[0],
    };

    Alert.alert('Simulating Claim Submission', 'Attempting to file a claim for the first policy...');

    try {
      const result = await ApiService.submitClaim(mockClaim);
      if (result.success) {
        Alert.alert('Claim Filed!', \`Your claim was successfully filed with ID: \${result.claimId}\`);
      } else {
        Alert.alert('Submission Failed', 'There was an issue submitting your claim. Please try again.');
      }
    } catch (e) {
      Alert.alert('Error', 'A network error occurred during claim submission.');
    }
  };

  // --- 5. RENDER LOGIC ---

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your insurance policies...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchPolicies}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Insurance Hub</Text>
        <TouchableOpacity style={styles.claimButton} onPress={handleFileClaim}>
          <Text style={styles.claimButtonText}>File a Claim</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Active Policies ({policies.length})</Text>

      {policies.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>You have no active policies.</Text>
          <Text style={styles.emptyText}>Tap "File a Claim" to see a simulated API call.</Text>
        </View>
      ) : (
        <FlatList
          data={policies}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PolicyItem policy={item} onPress={handlePolicyPress} />
          )}
          contentContainerStyle={styles.listContent}
          // Pull-to-refresh implementation for a production-ready screen
          refreshing={isLoading}
          onRefresh={fetchPolicies}
        />
      )}
    </View>
  );
};

// --- 6. STYLING ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333333',
  },
  claimButton: {
    backgroundColor: '#007AFF', // iOS Blue
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#555555',
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 10,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  policyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  policyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  policyType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  policyStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9500', // Orange for pending/expired
  },
  policyStatusActive: {
    color: '#34C759', // Green for active
  },
  policyNumber: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 5,
  },
  policyDetail: {
    fontSize: 14,
    color: '#333333',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555555',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30', // iOS Red
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default InsuranceScreen;