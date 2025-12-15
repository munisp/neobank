import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, FlatList, Platform } from 'react-native';
// Mocking service imports as per requirement. In a real app, these would be imported from 'src/services'
// import { ApiService } from 'src/services/ApiService';
// import { AuthService } from 'src/services/AuthService';
// import { NotificationService } from 'src/services/NotificationService';
// import { StorageService } from 'src/services/StorageService';

// --- TypeScript Interfaces ---

interface PolicyHolder {
  name: string;
  address: string;
  phone: string;
}

interface CoverageItem {
  id: string;
  name: string;
  limit: number;
  deductible: number;
}

interface PaymentRecord {
  id: string;
  date: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Failed';
}

interface Document {
  id: string;
  name: string;
  type: 'Policy' | 'Claim' | 'Invoice';
  date: string;
  url: string;
}

interface InsurancePolicy {
  policyNumber: string;
  policyHolder: PolicyHolder;
  productName: string;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Expired' | 'Canceled';
  premiumAmount: number;
  coverage: CoverageItem[];
  paymentHistory: PaymentRecord[];
  documents: Document[];
  renewalDate: string;
  renewalPremium: number;
}

interface ScreenState {
  policy: InsurancePolicy | null;
  loading: boolean;
  error: string | null;
}

// --- Mock Data ---

const MOCK_POLICY_DATA: InsurancePolicy = {
  policyNumber: 'NB-CAR-2025-98765',
  policyHolder: {
    name: 'Jane Doe',
    address: '123 Main St, Anytown, USA',
    phone: '+1 (555) 123-4567',
  },
  productName: 'Comprehensive Auto Insurance',
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  status: 'Active',
  premiumAmount: 1200.50,
  coverage: [
    { id: 'c1', name: 'Collision Coverage', limit: 50000, deductible: 500 },
    { id: 'c2', name: 'Comprehensive Coverage', limit: 50000, deductible: 250 },
    { id: 'c3', name: 'Liability (Bodily Injury)', limit: 300000, deductible: 0 },
    { id: 'c4', name: 'Uninsured Motorist', limit: 100000, deductible: 0 },
  ],
  paymentHistory: [
    { id: 'p1', date: '2025-01-01', amount: 300.12, status: 'Paid' },
    { id: 'p2', date: '2025-04-01', amount: 300.13, status: 'Paid' },
    { id: 'p3', date: '2025-07-01', amount: 300.12, status: 'Paid' },
    { id: 'p4', date: '2025-10-01', amount: 300.13, status: 'Pending' },
  ],
  documents: [
    { id: 'd1', name: 'Policy Schedule 2025', type: 'Policy', date: '2024-12-15', url: '/docs/policy_schedule.pdf' },
    { id: 'd2', name: 'Invoice Q1 2025', type: 'Invoice', date: '2025-01-01', url: '/docs/invoice_q1.pdf' },
    { id: 'd3', name: 'Terms and Conditions', type: 'Policy', date: '2024-11-01', url: '/docs/terms.pdf' },
  ],
  renewalDate: '2026-01-01',
  renewalPremium: 1250.00,
};

// --- Utility Functions (Mocking Service Calls) ---

/**
 * Mock function to simulate fetching policy data from an API.
 * Simulates a network delay and potential error states.
 */
const fetchPolicyData = async (policyId: string): Promise<InsurancePolicy> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (policyId === 'error') {
        reject(new Error('Failed to fetch policy details. Please try again.'));
      } else if (policyId === 'empty') {
        resolve(null as unknown as InsurancePolicy); // Simulate no data found
      } else {
        resolve(MOCK_POLICY_DATA);
      }
    }, 1500); // Simulate 1.5 second network delay
  });
};

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
    color: '#555',
  },
  textRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 14,
    color: '#777',
    flex: 1,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    textAlign: 'right',
    flex: 2,
  },
  // Specific styles
  statusActive: {
    color: '#28a745',
    fontWeight: 'bold',
  },
  statusPending: {
    color: '#ffc107',
    fontWeight: 'bold',
  },
  statusFailed: {
    color: '#dc3545',
    fontWeight: 'bold',
  },
  // Coverage styles
  coverageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#ddd',
  },
  coverageHeaderText: {
    fontWeight: 'bold',
    fontSize: 12,
    color: '#555',
    flex: 1,
    textAlign: 'left',
  },
  coverageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  coverageName: {
    flex: 1.5,
    fontSize: 14,
    color: '#333',
  },
  coverageLimit: {
    flex: 1,
    fontSize: 14,
    textAlign: 'right',
    color: '#333',
  },
  coverageDeductible: {
    flex: 1,
    fontSize: 14,
    textAlign: 'right',
    color: '#333',
  },
  // Payment styles
  paymentStatus: {
    fontWeight: 'bold',
    textAlign: 'right',
    flex: 1,
  },
  // Document styles
  documentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  documentName: {
    fontSize: 14,
    color: '#007bff',
    textDecorationLine: 'underline',
    flex: 2,
  },
  documentType: {
    fontSize: 12,
    color: '#777',
    flex: 1,
    textAlign: 'right',
  },
  // Renewal styles
  renewalButton: {
    backgroundColor: '#007bff',
    padding: 12,
    borderRadius: 6,
    marginTop: 10,
    alignItems: 'center',
  },
  renewalButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // Loading/Error styles
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#dc3545',
    fontSize: 16,
    textAlign: 'center',
    margin: 20,
  },
  // Responsive adjustments for Web
  ...(Platform.OS === 'web' && {
    contentContainer: {
      padding: 20,
      maxWidth: 800, // Max width for better readability on web
      marginHorizontal: 'auto',
    },
    card: {
      padding: 20,
    },
  }),
});

// --- Helper Components ---

const DetailRow: React.FC<{ label: string; value: string | number; valueStyle?: any }> = ({ label, value, valueStyle }) => (
  <View style={styles.textRow}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, valueStyle]}>{value}</Text>
  </View>
);

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

// --- Main Screen Component ---

const InsurancePolicyScreen: React.FC<{ route?: any }> = ({ route }) => {
  // In a real app, policyId would come from route.params or a global state
  const policyId = route?.params?.policyId || 'NB-CAR-2025-98765';

  const [state, setState] = useState<ScreenState>({
    policy: null,
    loading: true,
    error: null,
  });

  const fetchPolicy = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchPolicyData(policyId);
      if (!data) {
        throw new Error('Policy not found.');
      }
      setState({ policy: data, loading: false, error: null });
    } catch (e: any) {
      // In a real app, we would use NotificationService here
      Alert.alert('Error', e.message);
      setState({ policy: null, loading: false, error: e.message });
    }
  }, [policyId]);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  const handleDocumentPress = (doc: Document) => {
    // In a real app, this would use a service to open the URL
    Alert.alert('Document Download', `Simulating download of: ${doc.name} from ${doc.url}`);
    // Example: ApiService.download(doc.url).then(file => StorageService.save(file))
  };

  const handleRenewalPress = () => {
    // In a real app, this would navigate to a renewal screen or initiate a payment
    Alert.alert('Renewal', 'Simulating initiation of policy renewal process.');
  };

  if (state.loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={{ marginTop: 10 }}>Loading policy details...</Text>
      </View>
    );
  }

  if (state.error || !state.policy) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{state.error || 'No policy details available.'}</Text>
        <TouchableOpacity onPress={fetchPolicy} style={{ padding: 10, backgroundColor: '#007bff', borderRadius: 5, marginTop: 10 }}>
          <Text style={{ color: '#fff' }}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { policy } = state;

  // --- Render Sections ---

  const renderPolicyDetails = () => (
    <View style={styles.card}>
      <Text style={styles.title}>Policy Details</Text>
      <DetailRow label="Policy Number" value={policy.policyNumber} />
      <DetailRow label="Product Name" value={policy.productName} />
      <DetailRow label="Start Date" value={policy.startDate} />
      <DetailRow label="End Date" value={policy.endDate} />
      <DetailRow label="Status" value={policy.status} valueStyle={policy.status === 'Active' ? styles.statusActive : styles.statusPending} />
      <DetailRow label="Annual Premium" value={formatCurrency(policy.premiumAmount)} />

      <Text style={styles.subtitle}>Policy Holder</Text>
      <DetailRow label="Name" value={policy.policyHolder.name} />
      <DetailRow label="Address" value={policy.policyHolder.address} />
      <DetailRow label="Phone" value={policy.policyHolder.phone} />
    </View>
  );

  const renderCoverageBreakdown = () => (
    <View style={styles.card}>
      <Text style={styles.title}>Coverage Breakdown</Text>
      <View style={styles.coverageHeader}>
        <Text style={[styles.coverageHeaderText, styles.coverageName]}>Coverage</Text>
        <Text style={[styles.coverageHeaderText, styles.coverageLimit]}>Limit</Text>
        <Text style={[styles.coverageHeaderText, styles.coverageDeductible]}>Deductible</Text>
      </View>
      <FlatList
        data={policy.coverage}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.coverageItem}>
            <Text style={styles.coverageName}>{item.name}</Text>
            <Text style={styles.coverageLimit}>{formatCurrency(item.limit)}</Text>
            <Text style={styles.coverageDeductible}>{formatCurrency(item.deductible)}</Text>
          </View>
        )}
        scrollEnabled={false} // Disable FlatList scrolling inside ScrollView
      />
    </View>
  );

  const renderPaymentHistory = () => (
    <View style={styles.card}>
      <Text style={styles.title}>Payment History</Text>
      <FlatList
        data={policy.paymentHistory}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          let statusStyle = styles.statusActive;
          if (item.status === 'Pending') statusStyle = styles.statusPending;
          if (item.status === 'Failed') statusStyle = styles.statusFailed;

          return (
            <View style={styles.textRow}>
              <Text style={styles.label}>{item.date}</Text>
              <Text style={styles.value}>{formatCurrency(item.amount)}</Text>
              <Text style={[styles.paymentStatus, statusStyle]}>{item.status}</Text>
            </View>
          );
        }}
        scrollEnabled={false}
      />
    </View>
  );

  const renderDocuments = () => (
    <View style={styles.card}>
      <Text style={styles.title}>Documents</Text>
      <FlatList
        data={policy.documents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.documentItem} onPress={() => handleDocumentPress(item)}>
            <Text style={styles.documentName}>{item.name}</Text>
            <Text style={styles.documentType}>{item.type} ({item.date})</Text>
          </TouchableOpacity>
        )}
        scrollEnabled={false}
      />
    </View>
  );

  const renderRenewalInfo = () => (
    <View style={styles.card}>
      <Text style={styles.title}>Renewal Information</Text>
      <DetailRow label="Next Renewal Date" value={policy.renewalDate} />
      <DetailRow label="Estimated Premium" value={formatCurrency(policy.renewalPremium)} />
      <TouchableOpacity style={styles.renewalButton} onPress={handleRenewalPress}>
        <Text style={styles.renewalButtonText}>Renew Policy Now</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {renderPolicyDetails()}
      {renderCoverageBreakdown()}
      {renderPaymentHistory()}
      {renderDocuments()}
      {renderRenewalInfo()}
      <View style={{ height: 50 }} />
    </ScrollView>
  );
};

export default InsurancePolicyScreen;
