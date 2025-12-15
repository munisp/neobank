import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from 'react-query';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../store/AuthContext';
import ApiService from '../../services/ApiService';

interface Loan {
  id: string;
  type: string;
  amount: number;
  outstanding_balance: number;
  interest_rate: number;
  status: string;
  disbursement_date: string;
  maturity_date: string;
  monthly_payment: number;
}

const LoansScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery('loanDashboard', () =>
    ApiService.getLoanDashboard(user?.id || '')
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return '#059669';
      case 'pending':
        return '#f59e0b';
      case 'completed':
        return '#6b7280';
      case 'defaulted':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const formatCurrency = (amount: number) => {
    return `₦${amount.toLocaleString()}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
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
      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Loans</Text>
          <Text style={styles.summaryValue}>{data?.total_loans || 0}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Active Loans</Text>
          <Text style={styles.summaryValue}>{data?.active_loans || 0}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Outstanding</Text>
          <Text style={styles.summaryValue}>
            {formatCurrency(data?.total_outstanding || 0)}
          </Text>
        </View>
      </View>

      {/* Next Payment */}
      {data?.next_payment && (
        <View style={styles.nextPaymentCard}>
          <View style={styles.nextPaymentHeader}>
            <Icon name="event" size={24} color="#059669" />
            <Text style={styles.nextPaymentTitle}>Next Payment</Text>
          </View>
          <View style={styles.nextPaymentDetails}>
            <View>
              <Text style={styles.nextPaymentLabel}>Amount</Text>
              <Text style={styles.nextPaymentAmount}>
                {formatCurrency(data.next_payment.amount)}
              </Text>
            </View>
            <View>
              <Text style={styles.nextPaymentLabel}>Due Date</Text>
              <Text style={styles.nextPaymentDate}>
                {formatDate(data.next_payment.due_date)}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.payNowButton}>
            <Text style={styles.payNowText}>Pay Now</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loans List */}
      <View style={styles.loansSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Loans</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('LoanApplication')}
          >
            <Text style={styles.applyText}>+ Apply</Text>
          </TouchableOpacity>
        </View>

        {data?.loans && data.loans.length > 0 ? (
          data.loans.map((loan: Loan) => (
            <TouchableOpacity
              key={loan.id}
              style={styles.loanCard}
              onPress={() =>
                navigation.navigate('LoanDetails', { loanId: loan.id })
              }
            >
              <View style={styles.loanHeader}>
                <View>
                  <Text style={styles.loanType}>{loan.type}</Text>
                  <Text style={styles.loanAmount}>
                    {formatCurrency(loan.amount)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(loan.status) },
                  ]}
                >
                  <Text style={styles.statusText}>{loan.status}</Text>
                </View>
              </View>

              <View style={styles.loanDetails}>
                <View style={styles.loanDetailItem}>
                  <Text style={styles.loanDetailLabel}>Outstanding</Text>
                  <Text style={styles.loanDetailValue}>
                    {formatCurrency(loan.outstanding_balance)}
                  </Text>
                </View>
                <View style={styles.loanDetailItem}>
                  <Text style={styles.loanDetailLabel}>Interest Rate</Text>
                  <Text style={styles.loanDetailValue}>
                    {loan.interest_rate}%
                  </Text>
                </View>
                <View style={styles.loanDetailItem}>
                  <Text style={styles.loanDetailLabel}>Monthly Payment</Text>
                  <Text style={styles.loanDetailValue}>
                    {formatCurrency(loan.monthly_payment)}
                  </Text>
                </View>
              </View>

              <View style={styles.loanFooter}>
                <Text style={styles.loanDate}>
                  Disbursed: {formatDate(loan.disbursement_date)}
                </Text>
                <Text style={styles.loanDate}>
                  Maturity: {formatDate(loan.maturity_date)}
                </Text>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressContainer}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${
                        ((loan.amount - loan.outstanding_balance) / loan.amount) *
                        100
                      }%`,
                    },
                  ]}
                />
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Icon name="account-balance-wallet" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No loans yet</Text>
            <Text style={styles.emptySubtext}>
              Apply for a loan to get started
            </Text>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={() => navigation.navigate('LoanApplication')}
            >
              <Text style={styles.applyButtonText}>Apply for Loan</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  summaryContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  nextPaymentCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  nextPaymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  nextPaymentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginLeft: 8,
  },
  nextPaymentDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  nextPaymentLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  nextPaymentAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#059669',
  },
  nextPaymentDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  payNowButton: {
    backgroundColor: '#059669',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  payNowText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loansSection: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  applyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
  },
  loanCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  loanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  loanType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  loanAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#059669',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  loanDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  loanDetailItem: {
    flex: 1,
  },
  loanDetailLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
  },
  loanDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  loanFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  loanDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  progressContainer: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#059669',
  },
  emptyState: {
    backgroundColor: '#fff',
    padding: 48,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 24,
  },
  applyButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default LoansScreen;

