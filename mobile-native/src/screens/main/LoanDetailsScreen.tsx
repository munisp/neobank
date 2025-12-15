import React, { useState, useEffect } from 'react';
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
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ApiService from '../../services/ApiService';

type RootStackParamList = {
  LoanDetails: { loanId: string };
};

type LoanDetailsRouteProp = RouteProp<RootStackParamList, 'LoanDetails'>;
type LoanDetailsNavigationProp = StackNavigationProp<RootStackParamList>;

interface LoanDetails {
  id: string;
  type: string;
  amount: number;
  interestRate: number;
  term: number;
  monthlyPayment: number;
  remainingBalance: number;
  nextPaymentDate: string;
  nextPaymentAmount: number;
  status: 'active' | 'paid' | 'overdue' | 'pending';
  disbursementDate: string;
  maturityDate: string;
  purpose: string;
}

interface PaymentHistory {
  id: string;
  date: string;
  amount: number;
  principal: number;
  interest: number;
  balance: number;
  status: 'paid' | 'pending' | 'overdue';
}

interface AmortizationSchedule {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

const LoanDetailsScreen: React.FC = () => {
  const route = useRoute<LoanDetailsRouteProp>();
  const navigation = useNavigation<LoanDetailsNavigationProp>();
  const { loanId } = route.params;

  const [loan, setLoan] = useState<LoanDetails | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);
  const [amortization, setAmortization] = useState<AmortizationSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'schedule'>('details');

  useEffect(() => {
    fetchLoanDetails();
  }, [loanId]);

  const fetchLoanDetails = async () => {
    try {
      setLoading(true);
      const [loanData, historyData, scheduleData] = await Promise.all([
        ApiService.getLoanDetails(loanId),
        ApiService.getLoanPaymentHistory(loanId),
        ApiService.getLoanAmortizationSchedule(loanId),
      ]);
      setLoan(loanData);
      setPaymentHistory(historyData);
      setAmortization(scheduleData);
    } catch (error) {
      console.error('Error fetching loan details:', error);
      Alert.alert('Error', 'Failed to load loan details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLoanDetails();
  };

  const handleMakePayment = () => {
    if (!loan) return;
    Alert.alert(
      'Make Payment',
      `Pay $${loan.nextPaymentAmount.toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            try {
              await ApiService.makeLoanPayment(loanId, loan.nextPaymentAmount);
              Alert.alert('Success', 'Payment processed successfully');
              fetchLoanDetails();
            } catch (error) {
              Alert.alert('Error', 'Payment failed. Please try again.');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#10B981';
      case 'paid':
        return '#6B7280';
      case 'overdue':
        return '#EF4444';
      case 'pending':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return 'check-circle';
      case 'paid':
        return 'check-all';
      case 'overdue':
        return 'alert-circle';
      case 'pending':
        return 'clock-outline';
      default:
        return 'help-circle';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading loan details...</Text>
      </View>
    );
  }

  if (!loan) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle" size={64} color="#EF4444" />
        <Text style={styles.errorText}>Loan not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderDetailsTab = () => (
    <View style={styles.tabContent}>
      {/* Loan Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={styles.loanType}>{loan.type}</Text>
            <Text style={styles.loanAmount}>{formatCurrency(loan.amount)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(loan.status) }]}>
            <Icon name={getStatusIcon(loan.status)} size={16} color="#FFFFFF" />
            <Text style={styles.statusText}>{loan.status.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.loanPurpose}>{loan.purpose}</Text>
      </View>

      {/* Key Metrics */}
      <View style={styles.metricsContainer}>
        <View style={styles.metricCard}>
          <Icon name="percent" size={24} color="#3B82F6" />
          <Text style={styles.metricLabel}>Interest Rate</Text>
          <Text style={styles.metricValue}>{loan.interestRate}%</Text>
        </View>
        <View style={styles.metricCard}>
          <Icon name="calendar-range" size={24} color="#10B981" />
          <Text style={styles.metricLabel}>Term</Text>
          <Text style={styles.metricValue}>{loan.term} months</Text>
        </View>
        <View style={styles.metricCard}>
          <Icon name="cash" size={24} color="#F59E0B" />
          <Text style={styles.metricLabel}>Monthly Payment</Text>
          <Text style={styles.metricValue}>{formatCurrency(loan.monthlyPayment)}</Text>
        </View>
      </View>

      {/* Payment Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Remaining Balance</Text>
          <Text style={styles.infoValue}>{formatCurrency(loan.remainingBalance)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Next Payment Date</Text>
          <Text style={styles.infoValue}>{formatDate(loan.nextPaymentDate)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Next Payment Amount</Text>
          <Text style={[styles.infoValue, styles.highlightValue]}>
            {formatCurrency(loan.nextPaymentAmount)}
          </Text>
        </View>
      </View>

      {/* Loan Dates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Loan Dates</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Disbursement Date</Text>
          <Text style={styles.infoValue}>{formatDate(loan.disbursementDate)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Maturity Date</Text>
          <Text style={styles.infoValue}>{formatDate(loan.maturityDate)}</Text>
        </View>
      </View>

      {/* Make Payment Button */}
      {loan.status === 'active' && (
        <TouchableOpacity style={styles.paymentButton} onPress={handleMakePayment}>
          <Icon name="credit-card" size={20} color="#FFFFFF" />
          <Text style={styles.paymentButtonText}>Make Payment</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderHistoryTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Payment History</Text>
      {paymentHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="history" size={48} color="#9CA3AF" />
          <Text style={styles.emptyText}>No payment history yet</Text>
        </View>
      ) : (
        paymentHistory.map((payment) => (
          <View key={payment.id} style={styles.paymentCard}>
            <View style={styles.paymentHeader}>
              <Text style={styles.paymentDate}>{formatDate(payment.date)}</Text>
              <View style={[styles.paymentStatus, { backgroundColor: getStatusColor(payment.status) }]}>
                <Text style={styles.paymentStatusText}>{payment.status}</Text>
              </View>
            </View>
            <View style={styles.paymentDetails}>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Total Payment</Text>
                <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Principal</Text>
                <Text style={styles.paymentValue}>{formatCurrency(payment.principal)}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Interest</Text>
                <Text style={styles.paymentValue}>{formatCurrency(payment.interest)}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Remaining Balance</Text>
                <Text style={styles.paymentValue}>{formatCurrency(payment.balance)}</Text>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderScheduleTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Amortization Schedule</Text>
      <View style={styles.scheduleHeader}>
        <Text style={[styles.scheduleHeaderText, { flex: 1 }]}>Month</Text>
        <Text style={[styles.scheduleHeaderText, { flex: 2 }]}>Payment</Text>
        <Text style={[styles.scheduleHeaderText, { flex: 2 }]}>Principal</Text>
        <Text style={[styles.scheduleHeaderText, { flex: 2 }]}>Interest</Text>
        <Text style={[styles.scheduleHeaderText, { flex: 2 }]}>Balance</Text>
      </View>
      <ScrollView style={styles.scheduleList}>
        {amortization.map((item) => (
          <View key={item.month} style={styles.scheduleRow}>
            <Text style={[styles.scheduleCell, { flex: 1 }]}>{item.month}</Text>
            <Text style={[styles.scheduleCell, { flex: 2 }]}>${item.payment.toFixed(0)}</Text>
            <Text style={[styles.scheduleCell, { flex: 2 }]}>${item.principal.toFixed(0)}</Text>
            <Text style={[styles.scheduleCell, { flex: 2 }]}>${item.interest.toFixed(0)}</Text>
            <Text style={[styles.scheduleCell, { flex: 2 }]}>${item.balance.toFixed(0)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Loan Details</Text>
        <TouchableOpacity onPress={handleRefresh}>
          <Icon name="refresh" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'details' && styles.activeTab]}
          onPress={() => setActiveTab('details')}
        >
          <Text style={[styles.tabText, activeTab === 'details' && styles.activeTabText]}>
            Details
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            History
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'schedule' && styles.activeTab]}
          onPress={() => setActiveTab('schedule')}
        >
          <Text style={[styles.tabText, activeTab === 'schedule' && styles.activeTabText]}>
            Schedule
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {activeTab === 'details' && renderDetailsTab()}
        {activeTab === 'history' && renderHistoryTab()}
        {activeTab === 'schedule' && renderScheduleTab()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#3B82F6',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  backButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  loanType: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  loanAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
  },
  loanPurpose: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  metricsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  highlightValue: {
    color: '#3B82F6',
    fontSize: 16,
  },
  paymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  paymentButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  paymentDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  paymentStatus: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  paymentStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  paymentDetails: {
    gap: 8,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  paymentValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#9CA3AF',
  },
  scheduleHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  scheduleHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  scheduleList: {
    maxHeight: 400,
  },
  scheduleRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  scheduleCell: {
    fontSize: 12,
    color: '#6B7280',
  },
});

export default LoanDetailsScreen;

