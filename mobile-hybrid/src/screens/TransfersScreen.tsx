import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  FlatList,
  Alert,
  Dimensions,
} from 'react-native';
import {
  ApiService,
  AuthService,
  NotificationService,
  Recipient,
  User,
  TransferDetails,
} from './src/services/index';

// --- 1. Types and Interfaces ---

type TransferType = 'instant' | 'standard' | 'scheduled';

interface TransferFormState {
  recipient: Recipient | null;
  amount: string;
  transferType: TransferType;
  scheduleDate: string;
  notes: string;
}

// --- 2. Constants and Helper Functions ---

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

const TRANSFER_TYPES: { label: string; value: TransferType }[] = [
  { label: 'Instant Transfer', value: 'instant' },
  { label: 'Standard Transfer', value: 'standard' },
  { label: 'Scheduled Transfer', value: 'scheduled' },
];

const initialFormState: TransferFormState = {
  recipient: null,
  amount: '',
  transferType: 'instant',
  scheduleDate: new Date().toISOString().split('T')[0], // Today's date
  notes: '',
};

// --- 3. Custom Components (Simplified for a single file) ---

interface RecipientItemProps {
  recipient: Recipient;
  onSelect: (recipient: Recipient) => void;
  isSelected: boolean;
}

const RecipientItem: React.FC<RecipientItemProps> = React.memo(({ recipient, onSelect, isSelected }) => (
  <TouchableOpacity
    style={[styles.recipientItem, isSelected && styles.recipientItemSelected]}
    onPress={() => onSelect(recipient)}
  >
    <Text style={styles.recipientName}>{recipient.name}</Text>
    <Text style={styles.recipientDetails}>{recipient.accountNumber} - {recipient.bankName}</Text>
  </TouchableOpacity>
));

interface TypeSelectorProps {
  currentType: TransferType;
  onSelect: (type: TransferType) => void;
}

const TypeSelector: React.FC<TypeSelectorProps> = ({ currentType, onSelect }) => (
  <View style={styles.typeSelectorContainer}>
    {TRANSFER_TYPES.map((type) => (
      <TouchableOpacity
        key={type.value}
        style={[
          styles.typeSelectorButton,
          currentType === type.value && styles.typeSelectorButtonSelected,
        ]}
        onPress={() => onSelect(type.value)}
      >
        <Text
          style={[
            styles.typeSelectorText,
            currentType === type.value && styles.typeSelectorTextSelected,
          ]}
        >
          {type.label}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

// --- 4. Main Screen Component ---

const TransfersScreen: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [form, setForm] = useState<TransferFormState>(initialFormState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Data Fetching ---

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [currentUser, allRecipients] = await Promise.all([
        AuthService.getCurrentUser(),
        ApiService.getRecipients(),
      ]);
      setUser(currentUser);
      setRecipients(allRecipients);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to load initial data.';
      setError(errorMessage);
      NotificationService.showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Form Handlers ---

  const handleSelectRecipient = useCallback((recipient: Recipient) => {
    setForm((prev) => ({ ...prev, recipient }));
  }, []);

  const handleInputChange = useCallback((field: keyof TransferFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleAmountChange = useCallback((text: string) => {
    // Only allow numbers and a single decimal point
    const cleanText = text.replace(/[^0-9.]/g, '');
    if (cleanText.split('.').length > 2) return; // Prevent multiple decimals
    handleInputChange('amount', cleanText);
  }, [handleInputChange]);

  // --- Submission Logic ---

  const validateForm = useMemo(() => {
    const amount = parseFloat(form.amount);
    if (!form.recipient) return 'Please select a recipient.';
    if (isNaN(amount) || amount <= 0) return 'Please enter a valid amount.';
    if (user && amount > user.balance) return 'Insufficient funds.';
    if (form.transferType === 'scheduled' && new Date(form.scheduleDate) <= new Date()) {
      return 'Scheduled date must be in the future.';
    }
    return null;
  }, [form, user]);

  const handleSubmit = useCallback(async () => {
    const validationError = validateForm;
    if (validationError) {
      Alert.alert('Validation Error', validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const transferDetails: TransferDetails = {
      recipientId: form.recipient!.id,
      amount: parseFloat(form.amount),
      currency: 'USD', // Assuming USD for simplicity
      type: form.transferType,
      scheduleDate: form.transferType === 'scheduled' ? form.scheduleDate : undefined,
      notes: form.notes,
    };

    try {
      const result = await ApiService.submitTransfer(transferDetails);
      if (result.success) {
        NotificationService.showSuccess(result.message);
        Alert.alert('Success', result.message + `\nTransaction ID: ${result.transactionId}`);
        // Reset form and refresh user balance
        setForm(initialFormState);
        fetchData();
      } else {
        setError(result.message);
        NotificationService.showError(result.message);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unexpected error occurred during transfer.';
      setError(errorMessage);
      NotificationService.showError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [form, validateForm, fetchData]);

  // --- Render Logic ---

  if (isLoading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading transfer data...</Text>
      </View>
    );
  }

  if (error && !isSubmitting) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderRecipientList = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Select Recipient</Text>
      <FlatList
        data={recipients}
        keyExtractor={(item) => item.id}
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <RecipientItem
            recipient={item}
            onSelect={handleSelectRecipient}
            isSelected={form.recipient?.id === item.id}
          />
        )}
        style={styles.recipientList}
      />
      {form.recipient && (
        <View style={styles.selectedRecipientBox}>
          <Text style={styles.selectedRecipientText}>
            Selected: {form.recipient.name} ({form.recipient.accountNumber})
          </Text>
        </View>
      )}
    </View>
  );

  const renderAmountInput = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Amount to Transfer</Text>
      <View style={styles.amountInputContainer}>
        <Text style={styles.currencySymbol}>$</Text>
        <TextInput
          style={styles.amountInput}
          value={form.amount}
          onChangeText={handleAmountChange}
          keyboardType="numeric"
          placeholder="0.00"
          placeholderTextColor="#999"
        />
      </View>
      {user && (
        <Text style={styles.balanceText}>
          Available Balance: ${user.balance.toFixed(2)}
        </Text>
      )}
    </View>
  );

  const renderTransferOptions = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Transfer Type</Text>
      <TypeSelector
        currentType={form.transferType}
        onSelect={(type) => handleInputChange('transferType', type)}
      />

      {form.transferType === 'scheduled' && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Schedule Date</Text>
          {/* In a real app, this would be a DatePicker component */}
          <TextInput
            style={styles.input}
            value={form.scheduleDate}
            onChangeText={(text) => handleInputChange('scheduleDate', text)}
            placeholder="YYYY-MM-DD"
            keyboardType={isWeb ? 'default' : 'numbers-and-punctuation'}
          />
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Notes (Optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={form.notes}
          onChangeText={(text) => handleInputChange('notes', text)}
          placeholder="Memo or reference"
          multiline
        />
      </View>
    </View>
  );

  const renderConfirmationButton = () => (
    <View style={styles.buttonContainer}>
      <TouchableOpacity
        style={[styles.submitButton, !validateForm && styles.submitButtonEnabled]}
        onPress={handleSubmit}
        disabled={!!validateForm || isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>
            {form.transferType === 'scheduled' ? 'Schedule Transfer' : 'Confirm Transfer'}
          </Text>
        )}
      </TouchableOpacity>
      {validateForm && (
        <Text style={styles.validationErrorText}>{validateForm}</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <Text style={styles.header}>Money Transfer</Text>
        {renderRecipientList()}
        {renderAmountInput()}
        {renderTransferOptions()}
        {renderConfirmationButton()}
      </ScrollView>
    </View>
  );
};

// --- 5. Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  scrollViewContent: {
    padding: 20,
    maxWidth: isWeb ? 600 : width, // Responsive design for web
    alignSelf: isWeb ? 'center' : 'stretch',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a202c',
    marginBottom: 20,
  },
  section: {
    marginBottom: 25,
    padding: 15,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 15,
  },
  // Recipient List Styles
  recipientList: {
    marginBottom: 10,
  },
  recipientItem: {
    padding: 15,
    marginRight: 10,
    backgroundColor: '#edf2f7',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    width: 150,
  },
  recipientItemSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#e6f0ff',
  },
  recipientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a202c',
  },
  recipientDetails: {
    fontSize: 12,
    color: '#4a5568',
    marginTop: 4,
  },
  selectedRecipientBox: {
    padding: 10,
    backgroundColor: '#f0f4f8',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    marginTop: 10,
  },
  selectedRecipientText: {
    fontSize: 14,
    color: '#2d3748',
    fontWeight: '500',
  },
  // Amount Input Styles
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 10,
  },
  currencySymbol: {
    fontSize: 36,
    fontWeight: '300',
    color: '#4a5568',
    marginRight: 5,
  },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: '300',
    color: '#1a202c',
    padding: 0,
  },
  balanceText: {
    marginTop: 10,
    fontSize: 14,
    color: '#4a5568',
    alignSelf: 'flex-end',
  },
  // Transfer Type Selector Styles
  typeSelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    backgroundColor: '#edf2f7',
    borderRadius: 8,
    padding: 4,
  },
  typeSelectorButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  typeSelectorButtonSelected: {
    backgroundColor: '#007AFF',
  },
  typeSelectorText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4a5568',
  },
  typeSelectorTextSelected: {
    color: '#ffffff',
  },
  // General Input Styles
  inputGroup: {
    marginTop: 15,
  },
  label: {
    fontSize: 14,
    color: '#4a5568',
    marginBottom: 5,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: '#1a202c',
    backgroundColor: '#ffffff',
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // Button and Error Styles
  buttonContainer: {
    marginTop: 20,
    marginBottom: 40,
  },
  submitButton: {
    backgroundColor: '#b3c7e6', // Disabled color
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonEnabled: {
    backgroundColor: '#007AFF', // Enabled color
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  validationErrorText: {
    color: '#e53e3e',
    textAlign: 'center',
    marginTop: 10,
    fontSize: 14,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#4a5568',
  },
  errorText: {
    fontSize: 18,
    color: '#e53e3e',
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#4a5568',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default TransfersScreen;