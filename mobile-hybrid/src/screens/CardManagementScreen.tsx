import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

// --- MOCK SERVICE INTERFACES ---
// In a real application, these would be imported from src/services/ApiService, etc.

interface Card {
  id: string;
  lastFour: string;
  cardholderName: string;
  status: 'active' | 'frozen' | 'expired';
  currentLimit: number;
  dailyLimit: number;
  currency: string;
  isVirtual: boolean;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: 'debit' | 'credit';
}

interface CardDetails {
  card: Card;
  transactions: Transaction[];
}

// Mock service functions
const mockFetchCardDetails = async (cardId: string): Promise<CardDetails> => {
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
  const mockCard: Card = {
    id: cardId,
    lastFour: '4321',
    cardholderName: 'John Doe',
    status: 'active',
    currentLimit: 1500,
    dailyLimit: 5000,
    currency: 'USD',
    isVirtual: false,
  };

  const mockTransactions: Transaction[] = [
    { id: 't1', date: '2025-11-01', description: 'Amazon Purchase', amount: 45.99, currency: 'USD', type: 'debit' },
    { id: 't2', date: '2025-10-31', description: 'Coffee Shop', amount: 4.50, currency: 'USD', type: 'debit' },
    { id: 't3', date: '2025-10-30', description: 'Salary Deposit', amount: 2500.00, currency: 'USD', type: 'credit' },
    { id: 't4', date: '2025-10-29', description: 'Netflix Subscription', amount: 19.99, currency: 'USD', type: 'debit' },
  ];

  return { card: mockCard, transactions: mockTransactions };
};

const mockToggleFreeze = async (cardId: string, isFrozen: boolean): Promise<'active' | 'frozen'> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return isFrozen ? 'active' : 'frozen';
};

const mockUpdateLimit = async (cardId: string, newLimit: number): Promise<number> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return newLimit;
};

// --- COMPONENT STATE AND PROPS ---

interface CardManagementScreenProps {
  route: {
    params: {
      cardId: string;
    };
  };
}

interface CardManagementState {
  card: Card | null;
  transactions: Transaction[];
  isLoading: boolean;
  isFreezing: boolean;
  isUpdatingLimit: boolean;
  error: string | null;
}

// --- STYLES AND CONSTANTS ---

const COLORS = {
  primary: '#007AFF',
  danger: '#FF3B30',
  background: '#F2F2F7',
  card: '#FFFFFF',
  text: '#000000',
  secondaryText: '#8E8E93',
  separator: '#C6C6C8',
};

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

// --- HELPER COMPONENTS ---

const CardView: React.FC<{ card: Card }> = ({ card }) => (
  <View style={styles.cardContainer}>
    <Text style={styles.cardTitle}>NeoBank Card</Text>
    <Text style={styles.cardStatus}>
      Status: <Text style={{ color: card.status === 'frozen' ? COLORS.danger : COLORS.primary }}>
        {card.status.toUpperCase()}
      </Text>
    </Text>
    <Text style={styles.cardLastFour}>**** **** **** {card.lastFour}</Text>
    <Text style={styles.cardHolder}>{card.cardholderName}</Text>
  </View>
);

const TransactionItem: React.FC<{ transaction: Transaction }> = ({ transaction }) => (
  <View style={styles.transactionItem}>
    <View>
      <Text style={styles.transactionDescription}>{transaction.description}</Text>
      <Text style={styles.transactionDate}>{transaction.date}</Text>
    </View>
    <Text style={[
      styles.transactionAmount,
      { color: transaction.type === 'debit' ? COLORS.text : COLORS.primary }
    ]}>
      {transaction.type === 'debit' ? '-' : '+'} {transaction.currency} {transaction.amount.toFixed(2)}
    </Text>
  </View>
);

const ControlButton: React.FC<{ title: string; onPress: () => void; icon: string; isDanger?: boolean; isLoading?: boolean }> = ({
  title,
  onPress,
  icon,
  isDanger = false,
  isLoading = false,
}) => (
  <TouchableOpacity
    style={[styles.controlButton, isDanger && styles.dangerButton]}
    onPress={onPress}
    disabled={isLoading}
  >
    {isLoading ? (
      <ActivityIndicator color={COLORS.card} />
    ) : (
      <>
        {/* In a real app, this would be an Icon component */}
        <Text style={styles.controlIcon}>{icon}</Text>
        <Text style={styles.controlButtonText}>{title}</Text>
      </>
    )}
  </TouchableOpacity>
);

// --- MAIN SCREEN COMPONENT ---

const CardManagementScreen: React.FC<CardManagementScreenProps> = ({ route }) => {
  const { cardId } = route.params || { cardId: 'mock-card-123' }; // Fallback for testing
  const navigation = useNavigation();

  const [state, setState] = useState<CardManagementState>({
    card: null,
    transactions: [],
    isLoading: true,
    isFreezing: false,
    isUpdatingLimit: false,
    error: null,
  });

  const fetchCardData = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const data = await mockFetchCardDetails(cardId);
      setState(s => ({ ...s, card: data.card, transactions: data.transactions, isLoading: false }));
    } catch (e) {
      console.error('Failed to fetch card data:', e);
      setState(s => ({ ...s, error: 'Failed to load card details. Please try again.', isLoading: false }));
    }
  }, [cardId]);

  useEffect(() => {
    fetchCardData();
  }, [fetchCardData]);

  const handleToggleFreeze = async () => {
    if (!state.card) return;

    setState(s => ({ ...s, isFreezing: true, error: null }));
    try {
      const newStatus = await mockToggleFreeze(cardId, state.card.status === 'frozen');
      setState(s => ({
        ...s,
        card: s.card ? { ...s.card, status: newStatus } : null,
        isFreezing: false,
      }));
      // In a real app, NotificationService.showSuccess('Card status updated') would be used
    } catch (e) {
      console.error('Failed to toggle freeze:', e);
      setState(s => ({ ...s, error: 'Failed to update card status.', isFreezing: false }));
    }
  };

  const handleUpdateLimit = async (newLimit: number) => {
    if (!state.card) return;

    setState(s => ({ ...s, isUpdatingLimit: true, error: null }));
    try {
      const updatedLimit = await mockUpdateLimit(cardId, newLimit);
      setState(s => ({
        ...s,
        card: s.card ? { ...s.card, currentLimit: updatedLimit } : null,
        isUpdatingLimit: false,
      }));
      // In a real app, NotificationService.showSuccess('Limit updated') would be used
    } catch (e) {
      console.error('Failed to update limit:', e);
      setState(s => ({ ...s, error: 'Failed to update card limit.', isUpdatingLimit: false }));
    }
  };

  const renderContent = () => {
    if (state.isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading card details...</Text>
        </View>
      );
    }

    if (state.error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{state.error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchCardData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!state.card) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Card not found.</Text>
        </View>
      );
    }

    const isFrozen = state.card.status === 'frozen';
    const freezeButtonTitle = isFrozen ? 'Unfreeze Card' : 'Freeze Card';
    const freezeButtonIcon = isFrozen ? '🔓' : '🔒';

    return (
      <ScrollView style={styles.scrollViewContent} contentContainerStyle={styles.contentContainer}>
        {/* Card Display */}
        <CardView card={state.card} />

        {/* Card Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Card Controls</Text>
          <View style={styles.controlsRow}>
            <ControlButton
              title={freezeButtonTitle}
              onPress={handleToggleFreeze}
              icon={freezeButtonIcon}
              isDanger={!isFrozen}
              isLoading={state.isFreezing}
            />
            <ControlButton
              title="Set Daily Limit"
              onPress={() => handleUpdateLimit(state.card!.currentLimit === 1500 ? 2500 : 1500)} // Mock limit update
              icon="💰"
              isLoading={state.isUpdatingLimit}
            />
            <ControlButton
              title="View PIN"
              onPress={() => alert('PIN viewing feature coming soon!')}
              icon="🔑"
            />
          </View>
        </View>

        {/* Limits Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Limits</Text>
          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Daily Spending Limit:</Text>
            <Text style={styles.limitValue}>
              {state.card.currency} {state.card.currentLimit.toFixed(2)} / {state.card.dailyLimit.toFixed(2)}
            </Text>
          </View>
          <Text style={styles.limitHint}>
            Your limit resets every 24 hours. Tap "Set Daily Limit" to adjust.
          </Text>
        </View>

        {/* Transactions List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <FlatList
            data={state.transactions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <TransactionItem transaction={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            scrollEnabled={false} // Nested FlatList, so disable its scrolling
            ListEmptyComponent={<Text style={styles.emptyText}>No recent transactions.</Text>}
          />
          <TouchableOpacity style={styles.viewAllButton} onPress={() => alert('Navigate to full transactions list')}>
            <Text style={styles.viewAllButtonText}>View All Transactions →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Card Management</Text>
      {renderContent()}
    </View>
  );
};

// --- STYLESHEET ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    padding: 15,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.separator,
    textAlign: isWeb ? 'center' : 'left',
  },
  scrollViewContent: {
    flex: 1,
  },
  contentContainer: {
    padding: isWeb ? 20 : 15,
    alignItems: isWeb ? 'center' : 'stretch',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.secondaryText,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 16,
    marginBottom: 10,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.card,
    fontWeight: 'bold',
  },
  section: {
    width: isWeb ? Math.min(width * 0.8, 600) : '100%',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: COLORS.text,
  },

  // Card View Styles
  cardContainer: {
    width: isWeb ? Math.min(width * 0.8, 600) : '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 15,
    padding: 20,
    marginBottom: 25,
    aspectRatio: 1.6, // Standard card ratio
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  cardTitle: {
    color: COLORS.card,
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardStatus: {
    color: COLORS.card,
    fontSize: 14,
    fontWeight: '500',
  },
  cardLastFour: {
    color: COLORS.card,
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
  },
  cardHolder: {
    color: COLORS.card,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'right',
  },

  // Controls Styles
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  controlButton: {
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    width: '30%',
  },
  dangerButton: {
    backgroundColor: COLORS.danger,
  },
  controlIcon: {
    fontSize: 24,
    marginBottom: 5,
    color: COLORS.card,
  },
  controlButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.card,
    textAlign: 'center',
  },

  // Limits Styles
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.separator,
  },
  limitLabel: {
    fontSize: 16,
    color: COLORS.text,
  },
  limitValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  limitHint: {
    fontSize: 12,
    color: COLORS.secondaryText,
    marginTop: 10,
  },

  // Transactions Styles
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  transactionDate: {
    fontSize: 12,
    color: COLORS.secondaryText,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.separator,
    marginLeft: 0,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 20,
    color: COLORS.secondaryText,
  },
  viewAllButton: {
    marginTop: 15,
    alignItems: 'center',
  },
  viewAllButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  }
});

export default CardManagementScreen;
