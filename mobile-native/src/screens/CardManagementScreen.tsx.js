import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Platform,
} from 'react-native';
import { Card, ApiService } from './src/types'; // Assuming src/types.ts is in the same directory or accessible

// --- Constants and Utility Functions ---

const CARD_TYPE_COLORS: { [key: string]: string } = {
  Visa: '#4A90E2',
  Mastercard: '#F5A623',
  Amex: '#7ED321',
  Discover: '#BD10E0',
};

const STATUS_COLORS: { [key: string]: string } = {
  active: '#4CAF50',
  frozen: '#FF9800',
  pending: '#2196F3',
};

// --- Card Component ---

interface CardItemProps {
  card: Card;
  onToggleFreeze: (cardId: string, isFrozen: boolean) => void;
  onDelete: (cardId: string) => void;
}

const CardItem: React.FC<CardItemProps> = ({ card, onToggleFreeze, onDelete }) => {
  const isFrozen = card.status === 'frozen';
  const cardColor = CARD_TYPE_COLORS[card.cardType] || '#333';

  return (
    <View style={[styles.cardContainer, { borderColor: cardColor }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardType}>{card.cardType}</Text>
        <Text style={[styles.cardStatus, { color: STATUS_COLORS[card.status] }]}>
          {card.status.toUpperCase()}
        </Text>
      </View>

      <Text style={styles.cardNumber}>**** **** **** {card.lastFour}</Text>

      <View style={styles.cardDetails}>
        <View>
          <Text style={styles.detailLabel}>Expires</Text>
          <Text style={styles.detailValue}>{card.expirationDate}</Text>
        </View>
        <View>
          <Text style={styles.detailLabel}>Holder</Text>
          <Text style={styles.detailValue}>{card.holderName}</Text>
        </View>
        {card.isPrimary && (
          <View style={styles.primaryBadge}>
            <Text style={styles.primaryText}>PRIMARY</Text>
          </View>
        )}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: isFrozen ? '#4CAF50' : '#FF9800' }]}
          onPress={() => onToggleFreeze(card.id, !isFrozen)}
          disabled={card.status === 'pending'} // Cannot freeze/unfreeze a pending card
        >
          <Text style={styles.actionText}>{isFrozen ? 'Unfreeze' : 'Freeze'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => onDelete(card.id)}
        >
          <Text style={styles.actionText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// --- Main Screen Component ---

// Mock navigation prop type for simplicity, in a real app this would be more specific
type NavigationProp = {
  navigate: (screen: string) => void;
  // Add other navigation methods as needed
};

interface CardManagementScreenProps {
  navigation?: NavigationProp; // Optional navigation prop
}

const CardManagementScreen: React.FC<CardManagementScreenProps> = ({ navigation }) => {
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  /**
   * Fetches the list of cards from the API.
   */
  const fetchCards = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedCards = await ApiService.fetchCards();
      setCards(fetchedCards);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to load cards: ${errorMessage}`);
      Alert.alert('Error', `Failed to load cards: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  /**
   * Handles freezing or unfreezing a card.
   * @param cardId The ID of the card to modify.
   * @param freeze True to freeze, false to unfreeze.
   */
  const handleToggleFreeze = useCallback(async (cardId: string, freeze: boolean) => {
    setIsActionLoading(true);
    try {
      const response = await ApiService.toggleFreezeCard(cardId, freeze);
      if (response.success && response.newStatus) {
        // Update the local state with the new status
        setCards(prevCards =>
          prevCards.map(card =>
            card.id === cardId ? { ...card, status: response.newStatus! } : card
          )
        );
        Alert.alert('Success', response.message);
      } else {
        Alert.alert('Action Failed', response.message);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      Alert.alert('Error', `Failed to perform action: ${errorMessage}`);
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  /**
   * Handles deleting a card.
   * @param cardId The ID of the card to delete.
   */
  const handleDeleteCard = useCallback((cardId: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this card? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsActionLoading(true);
            try {
              const response = await ApiService.deleteCard(cardId);
              if (response.success) {
                // Remove the card from the local state
                setCards(prevCards => prevCards.filter(card => card.id !== cardId));
                Alert.alert('Success', response.message);
              } else {
                Alert.alert('Deletion Failed', response.message);
              }
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
              Alert.alert('Error', `Failed to delete card: ${errorMessage}`);
            } finally {
              setIsActionLoading(false);
            }
          },
        },
      ]
    );
  }, []);

  /**
   * Handles adding a new card.
   */
  const handleAddCard = useCallback(async () => {
    setIsActionLoading(true);
    try {
      const response = await ApiService.addCard();
      if (response.success) {
        // Re-fetch cards to get the newly added card and update the list
        await fetchCards();
        Alert.alert('Success', response.message);
      } else {
        Alert.alert('Action Failed', response.message);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      Alert.alert('Error', `Failed to add card: ${errorMessage}`);
    } finally {
      setIsActionLoading(false);
    }
  }, [fetchCards]);

  // --- Render Logic ---

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your cards...</Text>
      </View>
    );
  }

  if (error && cards.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchCards}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Card Management</Text>
        <TouchableOpacity style={styles.addButton} onPress={handleAddCard} disabled={isActionLoading}>
          <Text style={styles.addButtonText}>+ Add Card</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {cards.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>You have no cards linked yet.</Text>
            <Text style={styles.emptyText}>Tap "Add Card" to get started.</Text>
          </View>
        ) : (
          cards.map(card => (
            <CardItem
              key={card.id}
              card={card}
              onToggleFreeze={handleToggleFreeze}
              onDelete={handleDeleteCard}
            />
          ))
        )}
      </ScrollView>

      {/* Overlay for action loading state */}
      {isActionLoading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.overlayText}>Processing...</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  container: {
    flex: 1,
    paddingHorizontal: 15,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 15,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 5, // Used to show card type color
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardType: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  cardStatus: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardNumber: {
    fontSize: 22,
    fontWeight: '500',
    marginVertical: 10,
    letterSpacing: 1,
    color: '#555',
  },
  cardDetails: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 15,
  },
  detailLabel: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase',
    marginRight: 20,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginRight: 20,
  },
  primaryBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 15,
    marginLeft: 'auto',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingTop: 10,
  },
  actionButton: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#E53935', // Red color for delete
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  errorText: {
    fontSize: 16,
    color: '#D32F2F',
    textAlign: 'center',
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginBottom: 5,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // Ensure it's on top
  },
  overlayText: {
    color: '#FFFFFF',
    marginTop: 10,
    fontSize: 18,
  },
});

export default CardManagementScreen;