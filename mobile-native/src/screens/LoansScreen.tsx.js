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
import { StackScreenProps } from '@react-navigation/stack';

// --- Type Definitions (Matching hypothetical PWA/API structure) ---

// Define the structure for a single loan item
interface Loan {
  id: string;
  name: string;
  amount: number;
  interestRate: number;
  dueDate: string;
  status: 'Active' | 'Paid Off' | 'Overdue';
  nextPaymentAmount: number;
  nextPaymentDate: string;
}

// Define the structure for the API response data
interface LoansData {
  totalLoans: number;
  totalOutstandingBalance: number;
  loans: Loan[];
}

// Define the structure for the navigation parameters
// Assuming a root stack with a 'LoanDetail' screen
type RootStackParamList = {
  Loans: undefined;
  LoanDetail: { loanId: string };
  // ... other screens
};

type LoansScreenProps = StackScreenProps<RootStackParamList, 'Loans'>;

// --- Mock API Service (Replace with actual ApiService implementation) ---

const ApiService = {
  fetchLoans: async (): Promise<LoansData> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock data based on a hypothetical PWA implementation
    const mockLoans: Loan[] = [
      {
        id: 'L001',
        name: 'Personal Loan',
        amount: 15000.00,
        interestRate: 4.5,
        dueDate: '2028-10-01',
        status: 'Active',
        nextPaymentAmount: 350.50,
        nextPaymentDate: '2025-12-01',
      },
      {
        id: 'L002',
        name: 'Car Loan',
        amount: 25000.00,
        interestRate: 3.9,
        dueDate: '2030-05-15',
        status: 'Active',
        nextPaymentAmount: 510.75,
        nextPaymentDate: '2025-12-15',
      },
      {
        id: 'L003',
        name: 'Student Loan',
        amount: 5000.00,
        interestRate: 6.2,
        dueDate: '2026-01-20',
        status: 'Overdue',
        nextPaymentAmount: 150.00,
        nextPaymentDate: '2025-11-20',
      },
      {
        id: 'L004',
        name: 'Home Equity Line of Credit',
        amount: 0.00,
        interestRate: 5.0,
        dueDate: 'N/A',
        status: 'Paid Off',
        nextPaymentAmount: 0.00,
        nextPaymentDate: 'N/A',
      },
    ];

    return {
      totalLoans: mockLoans.length,
      totalOutstandingBalance: mockLoans.reduce((sum, loan) => sum + (loan.status !== 'Paid Off' ? loan.amount : 0), 0),
      loans: mockLoans,
    };
  },
};

// --- Loan Card Component ---

interface LoanCardProps {
  loan: Loan;
  onPress: (loanId: string) => void;
}

const LoanCard: React.FC<LoanCardProps> = ({ loan, onPress }) => {
  const statusStyle =
    loan.status === 'Overdue'
      ? styles.statusOverdue
      : loan.status === 'Paid Off'
      ? styles.statusPaidOff
      : styles.statusActive;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(loan.id)}>
      <View style={styles.cardHeader}>
        <Text style={styles.loanName}>{loan.name}</Text>
        <Text style={[styles.loanStatus, statusStyle]}>{loan.status}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Amount:</Text>
          <Text style={styles.detailValue}>${loan.amount.toFixed(2)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Interest Rate:</Text>
          <Text style={styles.detailValue}>{loan.interestRate.toFixed(2)}%</Text>
        </View>
        {loan.status !== 'Paid Off' && (
          <>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Next Payment:</Text>
              <Text style={styles.detailValue}>${loan.nextPaymentAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Due Date:</Text>
              <Text style={styles.detailValue}>{loan.nextPaymentDate}</Text>
            </View>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

// --- Loans Screen Component ---

const LoansScreen: React.FC<LoansScreenProps> = ({ navigation }) => {
  const [loansData, setLoansData] = useState<LoansData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch loan data from the API
  const fetchLoans = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ApiService.fetchLoans();
      setLoansData(data);
    } catch (e) {
      console.error('Failed to fetch loans:', e);
      setError('Could not load loan data. Please try again.');
      Alert.alert('Error', 'Failed to fetch loans. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  // Handler for navigating to the detail screen
  const handleLoanPress = (loanId: string) => {
    // Proper navigation integration
    navigation.navigate('LoanDetail', { loanId });
  };

  // Render logic for loading state
  if (isLoading && !loansData) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your loans...</Text>
      </View>
    );
  }

  // Render logic for error state
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchLoans}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render logic for empty state
  if (!loansData || loansData.loans.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>You have no loans to display.</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => Alert.alert('Action', 'Navigate to New Loan Application')}>
          <Text style={styles.addButtonText}>Apply for a New Loan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main content rendering
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        // Pull-to-refresh functionality
        <RefreshControl refreshing={isLoading} onRefresh={fetchLoans} />
      }
    >
      <View style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>Total Outstanding Balance</Text>
        <Text style={styles.summaryValue}>
          ${loansData.totalOutstandingBalance.toFixed(2)}
        </Text>
        <Text style={styles.summarySubtitle}>Across {loansData.totalLoans} accounts</Text>
      </View>

      <Text style={styles.sectionTitle}>Your Loan Accounts</Text>
      {loansData.loans.map(loan => (
        <LoanCard key={loan.id} loan={loan} onPress={handleLoanPress} />
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Data last updated: {new Date().toLocaleTimeString()}</Text>
      </View>
    </ScrollView>
  );
};

// --- Styling with StyleSheet ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5', // Light background for the screen
  },
  contentContainer: {
    padding: 15,
  },
  centered: {
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
    color: '#D32F2F', // Red color for error
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: '#4CAF50', // Green color for action
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  summaryBox: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF', // Primary blue color
  },
  summarySubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderLeftWidth: 5,
    borderLeftColor: '#007AFF', // Default border color
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  loanName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  loanStatus: {
    fontSize: 14,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 15,
    overflow: 'hidden',
    color: '#fff',
  },
  statusActive: {
    backgroundColor: '#4CAF50', // Green
  },
  statusPaidOff: {
    backgroundColor: '#9E9E9E', // Gray
  },
  statusOverdue: {
    backgroundColor: '#FF9800', // Orange/Amber
  },
  cardBody: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
});

export default LoansScreen;