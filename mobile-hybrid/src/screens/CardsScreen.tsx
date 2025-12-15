// src/CardsScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { Card, CardStatus, CardAction } from './types';
import { ApiService, NotificationService } from './services/ApiService'; // Assuming services are in src/services/ApiService.ts

// --- Constants and Styles (Simplified for structure) ---

const CARD_ACTIONS: CardAction[] = [
  { id: 'activate', label: 'Activate', icon: 'power' },
  { id: 'deactivate', label: 'Deactivate', icon: 'power-off' },
  { id: 'setPin', label: 'Set PIN', icon: 'key' },
  { id: 'reportLostStolen', label: 'Report Lost/Stolen', icon: 'alert-triangle' },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  },
  cardItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
  },
  cardDetail: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  statusActive: {
    color: 'green',
    fontWeight: 'bold',
  },
  statusInactive: {
    color: 'orange',
    fontWeight: 'bold',
  },
  statusLost: {
    color: 'red',
    fontWeight: 'bold',
  },
  actionButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '80%',
    maxWidth: 400,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  closeButton: {
    backgroundColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    flex: 1,
    alignItems: 'center',
  },
});

// --- Helper Components ---

interface CardItemProps {
  card: Card;
  onSelectCard: (card: Card) => void;
}

const CardItem: React.FC<CardItemProps> = ({ card, onSelectCard }) => {
  const getStatusStyle = (status: CardStatus) => {
    switch (status) {
      case 'active':
        return styles.statusActive;
      case 'inactive':
        return styles.statusInactive;
      case 'lost':
      case 'stolen':
        return styles.statusLost;
      default:
        return {};
    }
  };

  return (
    <TouchableOpacity style={styles.cardItem} onPress={() => onSelectCard(card)}>
      <Text style={styles.cardTitle}>
        {card.cardType} ({card.isVirtual ? 'Virtual' : 'Physical'})
      </Text>
      <Text style={styles.cardDetail}>
        Last 4 Digits: {card.lastFour}
      </Text>
      <Text style={styles.cardDetail}>
        Balance: {card.currency} {card.balance.toFixed(2)}
      </Text>
      <Text style={styles.cardDetail}>
        Status: <Text style={getStatusStyle(card.status)}>{card.status.toUpperCase()}</Text>
      </Text>
    </TouchableOpacity>
  );
};

// --- Action Modals (Simplified) ---

interface ActionModalProps {
  isVisible: boolean;
  card: Card | null;
  modalType: CardAction['id'] | null;
  onClose: () => void;
  onConfirm: (cardId: string, value?: string) => void;
}

const ActionModal: React.FC<ActionModalProps> = ({
  isVisible,
  card,
  modalType,
  onClose,
  onConfirm,
}) => {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    setInputValue('');
  }, [isVisible]);

  if (!card || !modalType) return null;

  let title = '';
  let placeholder = '';
  let isInputRequired = false;
  let keyboardType: 'default' | 'numeric' = 'default';

  switch (modalType) {
    case 'activate':
      title = `Activate Card ending in ${card.lastFour}?`;
      break;
    case 'deactivate':
      title = `Deactivate Card ending in ${card.lastFour}?`;
      break;
    case 'setPin':
      title = `Set PIN for Card ending in ${card.lastFour}`;
      placeholder = 'Enter new 4-digit PIN';
      isInputRequired = true;
      keyboardType = 'numeric';
      break;
    case 'reportLostStolen':
      title = `Report Card ending in ${card.lastFour} as Lost/Stolen?`;
      break;
  }

  const handleConfirm = () => {
    if (isInputRequired && inputValue.length !== 4) {
      NotificationService.error('PIN must be 4 digits.');
      return;
    }
    onConfirm(card.id, inputValue);
    onClose();
  };

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{title}</Text>

          {isInputRequired && (
            <TextInput
              style={styles.input}
              placeholder={placeholder}
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType={keyboardType}
              maxLength={4}
              secureTextEntry={modalType === 'setPin'}
            />
          )}

          <View style={styles.modalButtonContainer}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.actionButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <Text style={styles.actionButtonText}>
                {isInputRequired ? 'Confirm' : 'Yes, Proceed'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// --- Main Screen Component ---

const CardsScreen: React.FC = () => {
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState<CardAction['id'] | null>(null);

  const fetchCards = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const response = await ApiService.getCards();
    if (response.success && response.data) {
      setCards(response.data);
    } else {
      setError(response.error || 'An unknown error occurred while fetching cards.');
      NotificationService.error(response.error || 'Failed to fetch cards.');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  // --- Card Action Handlers ---

  const handleCardAction = (card: Card, actionId: CardAction['id']) => {
    setSelectedCard(card);
    setModalType(actionId);
    setIsModalVisible(true);
  };

  const handleConfirmAction = async (cardId: string, value?: string) => {
    const cardToUpdate = cards.find(c => c.id === cardId);
    if (!cardToUpdate || !modalType) return;

    let response;
    let successMessage = '';

    try {
      switch (modalType) {
        case 'activate':
          response = await ApiService.updateCardStatus(cardId, 'active');
          successMessage = 'Card activated successfully.';
          break;
        case 'deactivate':
          response = await ApiService.updateCardStatus(cardId, 'inactive');
          successMessage = 'Card deactivated successfully.';
          break;
        case 'setPin':
          if (!value) return;
          response = await ApiService.setCardPin(cardId, value);
          successMessage = 'Card PIN set successfully.';
          break;
        case 'reportLostStolen':
          response = await ApiService.reportLostOrStolen(cardId);
          successMessage = 'Card reported lost/stolen successfully.';
          break;
        default:
          return;
      }

      if (response.success && response.data) {
        NotificationService.success(successMessage);
        // Re-fetch cards to update the list
        fetchCards();
      } else {
        NotificationService.error(response.error || `Failed to perform action: ${modalType}`);
      }
    } catch (e) {
      NotificationService.error('An unexpected error occurred.');
    }
  };

  const renderCardItem = ({ item }: { item: Card }) => (
    <CardItem card={item} onSelectCard={setSelectedCard} />
  );

  const renderCardDetails = () => {
    if (!selectedCard) return null;

    const card = selectedCard;
    const isActionDisabled = card.status === 'lost' || card.status === 'stolen';

    return (
      <View style={styles.cardItem}>
        <Text style={styles.header}>Card Details</Text>
        <Text style={styles.cardDetail}>Holder: {card.cardHolderName}</Text>
        <Text style={styles.cardDetail}>Expires: {card.expirationDate}</Text>
        <Text style={styles.cardDetail}>ID: {card.id}</Text>
        <Text style={styles.cardDetail}>Type: {card.cardType}</Text>

        <View style={{ marginTop: 15 }}>
          {CARD_ACTIONS.map(action => {
            let isDisabled = isActionDisabled;
            if (action.id === 'activate' && card.status === 'active') isDisabled = true;
            if (action.id === 'deactivate' && card.status === 'inactive') isDisabled = true;

            return (
              <TouchableOpacity
                key={action.id}
                style={[styles.actionButton, { opacity: isDisabled ? 0.5 : 1, marginBottom: 5 }]}
                onPress={() => handleCardAction(card, action.id)}
                disabled={isDisabled}
              >
                <Text style={styles.actionButtonText}>{action.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.closeButton, { marginTop: 15, marginRight: 0 }]}
          onPress={() => setSelectedCard(null)}
        >
          <Text style={styles.actionButtonText}>Close Details</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // --- Render Logic ---

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10 }}>Loading Cards...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.actionButton} onPress={fetchCards}>
          <Text style={styles.actionButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Cards</Text>

      {selectedCard ? (
        renderCardDetails()
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          renderItem={renderCardItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.cardDetail}>No cards found.</Text>}
        />
      )}

      <ActionModal
        isVisible={isModalVisible}
        card={selectedCard}
        modalType={modalType}
        onClose={() => setIsModalVisible(false)}
        onConfirm={handleConfirmAction}
      />
    </View>
  );
};

export default CardsScreen;
