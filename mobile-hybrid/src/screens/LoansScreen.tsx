// LoansScreenTypes.ts

export interface Payment {
  id: string;
  dueDate: string;
  amount: number;
  status: 'Paid' | 'Upcoming' | 'Overdue';
}

export interface Loan {
  id: string;
  name: string;
  principal: number;
  interestRate: number;
  termMonths: number;
  startDate: string;
  status: 'Active' | 'Paid Off' | 'Default';
  remainingBalance: number;
  nextPaymentDate: string;
  nextPaymentAmount: number;
  paymentSchedule: Payment[];
}

export interface LoansState {
  loans: Loan[];
  loading: boolean;
  error: string | null;
}

// Mock Data
const mockPaymentSchedule: Payment[] = [
  { id: 'p1', dueDate: '2025-11-01', amount: 350.50, status: 'Paid' },
  { id: 'p2', dueDate: '2025-12-01', amount: 350.50, status: 'Upcoming' },
  { id: 'p3', dueDate: '2026-01-01', amount: 350.50, status: 'Upcoming' },
  { id: 'p4', dueDate: '2026-02-01', amount: 350.50, status: 'Upcoming' },
  { id: 'p5', dueDate: '2026-03-01', amount: 350.50, status: 'Upcoming' },
];

export const mockLoans: Loan[] = [
  {
    id: 'l1',
    name: 'Personal Loan',
    principal: 10000.00,
    interestRate: 5.5,
    termMonths: 36,
    startDate: '2025-09-01',
    status: 'Active',
    remainingBalance: 8750.00,
    nextPaymentDate: '2025-12-01',
    nextPaymentAmount: 350.50,
    paymentSchedule: mockPaymentSchedule,
  },
  {
    id: 'l2',
    name: 'Auto Loan',
    principal: 25000.00,
    interestRate: 3.9,
    termMonths: 60,
    startDate: '2024-05-15',
    status: 'Active',
    remainingBalance: 18500.00,
    nextPaymentDate: '2025-12-15',
    nextPaymentAmount: 459.99,
    paymentSchedule: mockPaymentSchedule.slice(0, 3), // Shorter mock
  },
  {
    id: 'l3',
    name: 'Home Equity Loan',
    principal: 50000.00,
    interestRate: 7.0,
    termMonths: 120,
    startDate: '2023-01-01',
    status: 'Paid Off',
    remainingBalance: 0.00,
    nextPaymentDate: 'N/A',
    nextPaymentAmount: 0.00,
    paymentSchedule: [],
  },
];

export const mockErrorState: LoansState = {
  loans: [],
  loading: false,
  error: 'Failed to fetch loan data. Please try again later.',
};

export const mockLoadingState: LoansState = {
  loans: [],
  loading: true,
  error: null,
};

export const mockInitialState: LoansState = {
  loans: mockLoans,
  loading: false,
  error: null,
};

// MockLoanService.ts

import { mockInitialState, LoansState, Loan } from './LoansScreenTypes';

// Mocking the required services (AuthService, ApiService, etc.)
// In a real application, this would use the actual services to make API calls.
const mockApiService = {
  get: (url: string) => {
    console.log(`MockApiService: GET request to ${url}`);
    return new Promise((resolve) => {
      setTimeout(() => {
        if (url.includes('/loans')) {
          resolve({ data: mockInitialState.loans });
        } else {
          resolve({ data: [] });
        }
      }, 500); // Simulate network delay
    });
  },
};

const mockAuthService = {
  getToken: () => 'mock-auth-token',
};

const mockNotificationService = {
  notify: (message: string) => console.log(`Notification: ${message}`),
};

const mockStorageService = {
  get: (key: string) => console.log(`StorageService: Get ${key}`),
  set: (key: string, value: any) => console.log(`StorageService: Set ${key} with ${value}`),
};

export const LoanService = {
  // Simulate fetching all loans for the authenticated user
  async fetchLoans(): Promise<Loan[]> {
    try {
      // Simulate using AuthService and ApiService
      const token = mockAuthService.getToken();
      if (!token) {
        throw new Error('Authentication failed');
      }

      const response: any = await mockApiService.get('/api/v1/loans');
      return response.data as Loan[];
    } catch (error) {
      mockNotificationService.notify('Error fetching loans.');
      console.error('LoanService error:', error);
      throw error;
    }
  },

  // Simulate applying for a new loan
  async applyForLoan(details: any): Promise<boolean> {
    // Simulate using ApiService and NotificationService
    console.log('Applying for loan with details:', details);
    mockNotificationService.notify('Loan application submitted successfully!');
    return true;
  }
};

// LoansScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { LoansState, Loan, Payment } from './LoansScreenTypes';
import { LoanService } from './MockLoanService';

// --- Constants and Responsive Design ---
const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';
const CARD_WIDTH = isWeb && width > 768 ? (width / 2) - 30 : width - 40;

// --- Styling ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 20,
    alignItems: 'center', // Center content for web
  },
  innerContent: {
    width: '100%',
    maxWidth: 1000, // Max width for web
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
    color: '#1a1a1a',
    alignSelf: 'flex-start',
  },
  applyButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 30,
    width: '100%',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 50,
  },
  errorText: {
    color: '#d9534f',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  loanCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 5,
    borderLeftColor: '#007AFF',
  },
  loanName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 5,
  },
  loanBalance: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginTop: 5,
  },
  loanDetailText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  sectionHeader: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 20,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  detailContainer: {
    marginTop: 30,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  detailLabel: {
    fontSize: 16,
    color: '#555',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#ccc',
    marginTop: 10,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  paymentText: {
    fontSize: 14,
    width: '30%',
    textAlign: 'left',
  },
  statusText: (status: Payment['status']) => ({
    fontSize: 14,
    fontWeight: '600',
    color: status === 'Paid' ? '#28a745' : status === 'Upcoming' ? '#007AFF' : '#dc3545',
    width: '30%',
    textAlign: 'right',
  }),
});

// --- Helper Components ---

const LoanCard: React.FC<{ item: Loan; onPress: (loan: Loan) => void }> = ({ item, onPress }) => (
  <TouchableOpacity
    style={styles.loanCard}
    onPress={() => onPress(item)}
  >
    <Text style={styles.loanName}>{item.name}</Text>
    <Text style={styles.loanBalance}>${item.remainingBalance.toFixed(2)}</Text>
    <Text style={styles.loanDetailText}>Remaining Balance</Text>
    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' }}>
      <Text style={styles.loanDetailText}>Next Payment: <Text style={{ fontWeight: '600' }}>${item.nextPaymentAmount.toFixed(2)}</Text></Text>
      <Text style={styles.loanDetailText}>Due Date: <Text style={{ fontWeight: '600' }}>{item.nextPaymentDate}</Text></Text>
    </View>
  </TouchableOpacity>
);

const PaymentSchedule: React.FC<{ schedule: Payment[] }> = ({ schedule }) => {
  const renderPaymentItem = ({ item }: { item: Payment }) => (
    <View style={styles.paymentRow}>
      <Text style={styles.paymentText}>{item.dueDate}</Text>
      <Text style={[styles.paymentText, { textAlign: 'center' }]}>${item.amount.toFixed(2)}</Text>
      <Text style={styles.statusText(item.status)}>{item.status}</Text>
    </View>
  );

  return (
    <View style={{ marginTop: 20 }}>
      <Text style={[styles.sectionHeader, { fontSize: 18, marginTop: 0 }]}>Payment Schedule</Text>
      <View style={styles.paymentHeader}>
        <Text style={[styles.paymentText, { fontWeight: 'bold' }]}>Due Date</Text>
        <Text style={[styles.paymentText, { fontWeight: 'bold', textAlign: 'center' }]}>Amount</Text>
        <Text style={[styles.paymentText, { fontWeight: 'bold', textAlign: 'right' }]}>Status</Text>
      </View>
      <FlatList
        data={schedule}
        renderItem={renderPaymentItem}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        ListEmptyComponent={<Text style={{ paddingVertical: 10 }}>No payment schedule available.</Text>}
      />
    </View>
  );
};

const LoanDetails: React.FC<{ loan: Loan; onClose: () => void }> = ({ loan, onClose }) => (
  <View style={styles.detailContainer}>
    <Text style={[styles.sectionHeader, { marginBottom: 15 }]}>Loan Details: {loan.name}</Text>

    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>Principal Amount</Text>
      <Text style={styles.detailValue}>${loan.principal.toFixed(2)}</Text>
    </View>
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>Interest Rate</Text>
      <Text style={styles.detailValue}>{loan.interestRate}%</Text>
    </View>
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>Term</Text>
      <Text style={styles.detailValue}>{loan.termMonths} months</Text>
    </View>
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>Start Date</Text>
      <Text style={styles.detailValue}>{loan.startDate}</Text>
    </View>
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>Status</Text>
      <Text style={styles.detailValue}>{loan.status}</Text>
    </View>
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>Remaining Balance</Text>
      <Text style={[styles.detailValue, { color: '#007AFF', fontWeight: 'bold' }]}>${loan.remainingBalance.toFixed(2)}</Text>
    </View>

    {loan.paymentSchedule.length > 0 && <PaymentSchedule schedule={loan.paymentSchedule} />}

    <TouchableOpacity
      onPress={onClose}
      style={[styles.applyButton, { backgroundColor: '#6c757d', marginTop: 20, padding: 10 }]}
    >
      <Text style={styles.applyButtonText}>Close Details</Text>
    </TouchableOpacity>
  </View>
);

// --- Main Component Implementation ---

const LoansScreen: React.FC = () => {
  const [state, setState] = useState<LoansState>({
    loans: [],
    loading: true,
    error: null,
  });
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);

  const fetchLoans = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const fetchedLoans = await LoanService.fetchLoans();
      setState({ loans: fetchedLoans, loading: false, error: null });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setState({ loans: [], loading: false, error: errorMessage });
    }
  }, []);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  const handleApplyForLoan = () => {
    // Mock navigation/action
    console.log('Navigating to Apply for Loan screen...');
    LoanService.applyForLoan({ amount: 5000, term: 12 });
  };

  const activeLoans = state.loans.filter(l => l.status === 'Active');
  const paidOffLoans = state.loans.filter(l => l.status === 'Paid Off');

  // --- Render Logic for Loading/Error/Data ---

  if (state.loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10, fontSize: 16, color: '#555' }}>Loading your loan data...</Text>
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={[styles.container, { padding: 20 }]}>
        <Text style={styles.errorText}>Error: {state.error}</Text>
        <TouchableOpacity style={[styles.applyButton, { marginTop: 20 }]} onPress={fetchLoans}>
          <Text style={styles.applyButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Main Screen Content ---

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.innerContent}>
          <Text style={styles.header}>Loans Dashboard</Text>

          <TouchableOpacity style={styles.applyButton} onPress={handleApplyForLoan}>
            <Text style={styles.applyButtonText}>Apply for a New Loan</Text>
          </TouchableOpacity>

          {/* Loan Details Section (Conditional based on selection) */}
          {selectedLoan && (
            <LoanDetails loan={selectedLoan} onClose={() => setSelectedLoan(null)} />
          )}

          {/* Active Loans List */}
          <Text style={styles.sectionHeader}>Active Loans ({activeLoans.length})</Text>
          <FlatList
            data={activeLoans}
            renderItem={({ item }) => <LoanCard item={item} onPress={setSelectedLoan} />}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.loanDetailText}>You have no active loans.</Text>}
          />

          {/* Paid Off Loans */}
          {paidOffLoans.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Paid Off Loans ({paidOffLoans.length})</Text>
              <FlatList
                data={paidOffLoans}
                renderItem={({ item }) => <LoanCard item={item} onPress={setSelectedLoan} />}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default LoansScreen;