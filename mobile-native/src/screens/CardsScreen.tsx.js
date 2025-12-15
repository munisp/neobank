import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, NavigationProp, RouteProp } from '@react-navigation/native';

// --- 1. Mock Types and ApiService ---

// Define the type for a single Card object
interface Card {
  id: string;
  lastFour: string;
  cardHolderName: string;
  expiryDate: string; // MM/YY format
  type: 'Visa' | 'Mastercard' | 'Amex' | 'Discover';
  isPrimary: boolean;
  balance: number;
}

// Define the type for the navigation parameters
// Assuming a stack navigator and a route name 'Cards'
type RootStackParamList = {
  Cards: undefined;
  CardDetails: { cardId: string };
  AddCard: undefined;
};

type CardsScreenNavigationProp = NavigationProp<RootStackParamList, 'Cards'>;
type CardsScreenRouteProp = RouteProp<RootStackParamList, 'Cards'>;

// Mock ApiService to simulate network calls
const mockCards: Card[] = [
  { id: 'c1', lastFour: '1234', cardHolderName: 'John Doe', expiryDate: '12/26', type: 'Visa', isPrimary: true, balance: 1500.50 },
  { id: 'c2', lastFour: '5678', cardHolderName: 'John Doe', expiryDate: '08/24', type: 'Mastercard', isPrimary: false, balance: 450.75 },
  { id: 'c3', lastFour: '9012', cardHolderName: 'John Doe', expiryDate: '01/28', type: 'Amex', isPrimary: false, balance: 2300.00 },
];

const ApiService = {
  fetchCards: (): Promise<Card[]> => {
    // Simulate API delay and potential error
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // 10% chance of failure for robust error handling testing
        if (Math.random() < 0.1) {
          reject(new Error('Failed to fetch cards. Please try again.'));
        } else {
          resolve(mockCards);
        }
      }, 1500);
    });
  },
  // Mock function for setting a card as primary
  setPrimaryCard: (cardId: string): Promise<void> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Card ${cardId} set as primary.`);
        resolve();
      }, 500);
    });
  },
};

// --- 2. CardsScreen Component ---

const CardsScreen: React.FC = () => {
  const navigation = useNavigation<CardsScreenNavigationProp>();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch data from the mock API
  const loadCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ApiService.fetchCards();
      setCards(data);
    } catch (err) {
      // Type assertion for error handling
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // Handler for navigating to card details
  const handleCardPress = (card: Card) => {
    // Assuming a 'CardDetails' screen exists in the navigator
    navigation.navigate('CardDetails', { cardId: card.id });
  };

  // Handler for setting a card as primary (PWA feature inference)
  const handleSetPrimary = async (cardId: string) => {
    try {
      await ApiService.setPrimaryCard(cardId);
      // Optimistically update the UI
      setCards(prevCards =>
        prevCards.map(c => ({
          ...c,
          isPrimary: c.id === cardId,
        }))
      );
      Alert.alert('Success', 'Card set as primary successfully.');
    } catch (err) {
      Alert.alert('Error', 'Could not set card as primary.');
    }
  };

  // Handler for adding a new card
  const handleAddCard = () => {
    // Assuming an 'AddCard' screen exists in the navigator
    navigation.navigate('AddCard');
  };

  // --- 3. Render Logic and UI ---

  // Render function for a single card item
  const renderCardItem = ({ item }: { item: Card }) => (
    <TouchableOpacity
      style={styles.cardContainer}
      onPress={() => handleCardPress(item)}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardType}>{item.type}</Text>
        {item.isPrimary && <Text style={styles.primaryTag}>PRIMARY</Text>}
      </View>
      <Text style={styles.cardNumber}>**** **** **** {item.lastFour}</Text>
      <View style={styles.cardDetailsRow}>
        <View>
          <Text style={styles.detailLabel}>Card Holder</Text>
          <Text style={styles.detailValue}>{item.cardHolderName}</Text>
        </View>
        <View style={styles.expiryContainer}>
          <Text style={styles.detailLabel}>Expires</Text>
          <Text style={styles.detailValue}>{item.expiryDate}</Text>
        </View>
      </View>
      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>Current Balance:</Text>
        <Text style={styles.balanceValue}>${item.balance.toFixed(2)}</Text>
      </View>
      {!item.isPrimary && (
        <TouchableOpacity
          style={styles.setPrimaryButton}
          onPress={() => handleSetPrimary(item.id)}
        >
          <Text style={styles.setPrimaryButtonText}>Set as Primary</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  // Render loading state
  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your cards...</Text>
      </View>
    );
  }

  // Render error state
  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadCards}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render empty state
  if (cards.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.emptyText}>No cards found.</Text>
        <Text style={styles.emptySubText}>Add your first card to get started.</Text>
        <TouchableOpacity style={styles.addButton} onPress={handleAddCard}>
          <Text style={styles.addButtonText}>+ Add New Card</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main content render
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Payment Cards</Text>
        <TouchableOpacity style={styles.addButton} onPress={handleAddCard}>
          <Text style={styles.addButtonText}>+ Add Card</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        renderItem={renderCardItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
};

// --- 4. Styling ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
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
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginTop: 15,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
  },
  primaryTag: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#007AFF',
    backgroundColor: '#E6F0FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  cardNumber: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 15,
    color: '#333',
  },
  cardDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  detailLabel: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  expiryContainer: {
    alignItems: 'flex-end',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#555',
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  setPrimaryButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    alignSelf: 'flex-start',
  },
  setPrimaryButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginHorizontal: 15,
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
  },
  retryButton: {
    backgroundColor: '#D32F2F',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  emptySubText: {
    fontSize: 16,
    color: '#888',
    marginBottom: 20,
  },
});

export default CardsScreen;

// Note: This file is named CardsScreen.tsx to align with the TypeScript requirement.
// The user requested CardsScreen.js but also requested TypeScript (.tsx extension).
// The component is exported as default for easy integration into a React Native application.
