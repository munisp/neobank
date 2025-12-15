// src/api/insuranceApi.ts

// --- 1. Data Structures (TypeScript Interfaces) ---

/**
 * Interface for the data collected in the initial quote request form.
 */
export interface InsuranceFormState {
  coverageType: 'auto' | 'home' | 'life' | '';
  zipCode: string;
  startDate: string; // YYYY-MM-DD
  details: {
    // Auto-specific details
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: number;
    // Home-specific details
    propertyType?: 'house' | 'condo' | 'apartment';
    squareFootage?: number;
  };
}

/**
 * Interface for the personal details required for policy application or sharing.
 */
export interface PersonalDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/**
 * Interface for a single insurance quote option.
 */
export interface QuoteOption {
  id: string;
  provider: string;
  premium: number; // Monthly premium in USD
  coverageDetails: string[];
  rating: number; // 1-5 star rating
  policyUrl: string;
}

/**
 * Interface for the response from the quote comparison API.
 */
export interface QuoteComparisonResponse {
  quotes: QuoteOption[];
  disclaimer: string;
}

// --- 2. Mock API Implementation ---

const MOCK_QUOTES: QuoteOption[] = [
  {
    id: 'Q-1001',
    provider: 'SecureShield Insurance',
    premium: 125.50,
    coverageDetails: ['Full Comprehensive', 'Roadside Assistance', 'Rental Car Coverage'],
    rating: 4.5,
    policyUrl: 'https://secureshield.com/policy/Q-1001',
  },
  {
    id: 'Q-1002',
    provider: 'NeoProtect Assurance',
    premium: 98.75,
    coverageDetails: ['Liability Only', 'Basic Medical Payments'],
    rating: 3.8,
    policyUrl: 'https://neoprotect.com/policy/Q-1002',
  },
  {
    id: 'Q-1003',
    provider: 'GlobalGuard',
    premium: 155.00,
    coverageDetails: ['Full Comprehensive', 'Accident Forgiveness', 'New Car Replacement'],
    rating: 4.9,
    policyUrl: 'https://globalguard.com/policy/Q-1003',
  },
];

/**
 * Simulates fetching a list of insurance quotes based on form data.
 * @param formData The data from the quote request form.
 * @returns A promise that resolves with a list of quote options.
 */
export const fetchQuotes = async (formData: InsuranceFormState): Promise<QuoteComparisonResponse> => {
  console.log('API Call: fetchQuotes with data:', formData);
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  if (formData.zipCode === '99999') {
    throw new Error('API Error: Service not available in this zip code.');
  }

  // Simple mock logic: return all quotes, but adjust premium based on coverage type
  const quotes = MOCK_QUOTES.map(quote => ({
    ...quote,
    premium: quote.premium * (formData.coverageType === 'home' ? 1.5 : 1),
  }));

  return {
    quotes,
    disclaimer: 'Premiums are estimates. Final rate is subject to underwriting review.',
  };
};

/**
 * Simulates saving a selected quote to the user's account.
 * @param quoteId The ID of the quote to save.
 * @returns A promise that resolves with a success message.
 */
export const saveQuote = async (quoteId: string): Promise<string> => {
  console.log('API Call: saveQuote for ID:', quoteId);
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const quote = MOCK_QUOTES.find(q => q.id === quoteId);
  if (!quote) {
    throw new Error(`Quote with ID ${quoteId} not found.`);
  }

  return `Quote from ${quote.provider} (ID: ${quoteId}) has been successfully saved to your account.`;
};

/**
 * Simulates the policy application process.
 * @param quoteId The ID of the quote to apply for.
 * @param personalDetails The user's personal information.
 * @returns A promise that resolves with the policy number.
 */
export const applyForPolicy = async (quoteId: string, personalDetails: PersonalDetails): Promise<string> => {
  console.log('API Call: applyForPolicy for ID:', quoteId, 'with details:', personalDetails);
  await new Promise(resolve => setTimeout(resolve, 2000));

  if (personalDetails.email.includes('fail')) {
    throw new Error('Application Error: Failed to process application. Please contact support.');
  }

  const policyNumber = `POL-${Math.floor(Math.random() * 1000000)}`;
  return policyNumber;
};

/**
 * Simulates sending the quote details via email.
 * @param quoteId The ID of the quote to share.
 * @param recipientEmail The email address to send the quote to.
 * @returns A promise that resolves with a success message.
 */
export const shareQuoteViaEmail = async (quoteId: string, recipientEmail: string): Promise<string> => {
  console.log('API Call: shareQuoteViaEmail for ID:', quoteId, 'to:', recipientEmail);
  await new Promise(resolve => setTimeout(resolve, 1000));

  if (!recipientEmail.includes('@')) {
    throw new Error('Share Error: Invalid recipient email address.');
  }

  return `Quote ID ${quoteId} successfully shared with ${recipientEmail}.`;
};

// src/components/InsuranceQuoteScreen.tsx
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  InsuranceFormState,
  PersonalDetails,
  QuoteOption,
  fetchQuotes,
  saveQuote,
  applyForPolicy,
  shareQuoteViaEmail,
} from '../api/insuranceApi';

// --- Types and Constants ---

type ScreenStep = 'FORM' | 'QUOTES' | 'DETAILS' | 'CONFIRMATION';

interface InsuranceQuoteScreenProps {
  // Optional props for navigation or theme can be added here
}

const COVERAGE_OPTIONS = [
  { label: 'Auto Insurance', value: 'auto' as const },
  { label: 'Home Insurance', value: 'home' as const },
  { label: 'Life Insurance', value: 'life' as const },
];

// --- Initial State ---

const initialFormState: InsuranceFormState = {
  coverageType: '' as const,
  zipCode: '',
  startDate: new Date().toISOString().split('T')[0], // Today's date
  details: {},
};

const initialPersonalDetails: PersonalDetails = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
};

// --- Main Component ---

const InsuranceQuoteScreen: React.FC<InsuranceQuoteScreenProps> = () => {
  const [step, setStep] = useState<ScreenStep>('FORM');
  const [formData, setFormData] = useState<InsuranceFormState>(initialFormState);
  const [personalDetails, setPersonalDetails] = useState<PersonalDetails>(initialPersonalDetails);
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<QuoteOption | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policyNumber, setPolicyNumber] = useState<string | null>(null);

  // --- Handlers ---

  const handleFormChange = useCallback((field: keyof InsuranceFormState, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  }, []);

  const handleDetailChange = useCallback((field: keyof PersonalDetails, value: string) => {
    setPersonalDetails(prev => ({ ...prev, [field]: value }));
    setError(null);
  }, []);

  // --- Validation Helpers ---

  const validateForm = (): boolean => {
    if (!formData.coverageType) {
      setError('Please select a coverage type.');
      return false;
    }
    if (!/^\d{5}$/.test(formData.zipCode)) {
      setError('Please enter a valid 5-digit zip code.');
      return false;
    }
    if (!formData.startDate) {
      setError('Please select a start date.');
      return false;
    }

    // Dynamic details validation
    if (formData.coverageType === 'auto') {
      if (!formData.details.vehicleMake || !formData.details.vehicleModel || !formData.details.vehicleYear) {
        setError('Please provide vehicle make, model, and year.');
        return false;
      }
      if (formData.details.vehicleYear < 1900 || formData.details.vehicleYear > new Date().getFullYear() + 1) {
        setError('Please enter a valid vehicle year.');
        return false;
      }
    } else if (formData.coverageType === 'home') {
      if (!formData.details.propertyType || !formData.details.squareFootage || formData.details.squareFootage <= 0) {
        setError('Please provide property type and valid square footage.');
        return false;
      }
    }

    setError(null);
    return true;
  };

  const validatePersonalDetails = (): boolean => {
    if (!personalDetails.firstName || !personalDetails.lastName) {
      setError('First and Last name are required.');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(personalDetails.email)) {
      setError('Please enter a valid email address.');
      return false;
    }
    if (!/^\+?\d{10,15}$/.test(personalDetails.phone.replace(/[\s()-]/g, ''))) {
      setError('Please enter a valid phone number.');
      return false;
    }
    setError(null);
    return true;
  };

  const handleQuoteRequest = useCallback(async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchQuotes(formData);
      setQuotes(response.quotes);
      setStep('QUOTES');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching quotes.');
    } finally {
      setIsLoading(false);
    }
  }, [formData]);

  const handleSelectQuote = useCallback((quote: QuoteOption) => {
    setSelectedQuote(quote);
    setStep('DETAILS');
  }, []);

  const handleApplyForPolicy = useCallback(async () => {
    if (!selectedQuote) return;
    if (!validatePersonalDetails()) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const pNumber = await applyForPolicy(selectedQuote.id, personalDetails);
      setPolicyNumber(pNumber);
      setStep('CONFIRMATION');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred during application.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedQuote, personalDetails]);

  // Placeholder for other features (will be implemented in later phases)
  const handleSaveQuote = useCallback(async (quoteId: string) => {
    setIsLoading(true);
    try {
      const message = await saveQuote(quoteId);
      Alert.alert('Success', message);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save quote.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleShareQuote = useCallback(async (quoteId: string) => {
    Alert.prompt(
      'Share Quote',
      'Enter the recipient\'s email address to share this quote:',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Share',
          onPress: async (email) => {
            if (email && /\S+@\S+\.\S+/.test(email)) {
              setIsLoading(true);
              try {
                const message = await shareQuoteViaEmail(quoteId, email);
                Alert.alert('Success', message);
              } catch (err) {
                Alert.alert('Error', err instanceof Error ? err.message : 'Failed to share quote.');
              } finally {
                setIsLoading(false);
              }
            } else if (email) {
              Alert.alert('Error', 'Please enter a valid email address.');
            }
          },
        },
      ],
      'plain-text',
      '', // Initial value
      'email-address' // Keyboard type hint
    );
  }, [])

  // --- UI Rendering Logic ---

  const renderHeader = (title: string) => (
    <View style={styles.header}>
      <Text style={styles.headerText}>{title}</Text>
      {step !== 'FORM' && (
        <TouchableOpacity onPress={() => setStep('FORM')} style={styles.backButton}>
          <Text style={styles.backButtonText}>{'< Back'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderStepContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Processing request...</Text>
        </View>
      );
    }

    switch (step) {
      case 'FORM':
        return renderQuoteRequestForm();
      case 'QUOTES':
        return renderQuoteComparison();
      case 'DETAILS':
        return renderPersonalDetailsForm();
      case 'CONFIRMATION':
        return renderConfirmationScreen();
      default:
        return null;
    }
  };

  // Placeholder functions for each step (to be implemented in Phase 3 & 4)
  const renderQuoteRequestForm = () => (
    <View style={styles.contentContainer}>
      {renderHeader('Get Your Insurance Quote')}
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Text style={styles.label}>Coverage Type</Text>
      {/* Coverage Options */}
      <View style={styles.optionContainer}>
        {COVERAGE_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionButton,
              formData.coverageType === option.value && styles.optionButtonSelected,
            ]}
            onPress={() => handleFormChange('coverageType', option.value)}
          >
            <Text style={[
              styles.optionText,
              formData.coverageType === option.value && styles.optionTextSelected,
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Zip Code</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., 90210"
        keyboardType="numeric"
        maxLength={5}
        value={formData.zipCode}
        onChangeText={(text) => handleFormChange('zipCode', text.replace(/[^0-9]/g, ''))}
      />

      <Text style={styles.label}>Coverage Start Date</Text>
      <TextInput
        style={styles.input}
        placeholder="YYYY-MM-DD"
        value={formData.startDate}
        onChangeText={(text) => handleFormChange('startDate', text)}
      />

      {/* Dynamic Details Input */}
      {formData.coverageType === 'auto' && (
        <View style={styles.dynamicDetailsContainer}>
          <Text style={styles.subHeader}>Vehicle Details</Text>
          <Text style={styles.label}>Vehicle Make</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Toyota"
            value={formData.details.vehicleMake || ''}
            onChangeText={(text) => setFormData(prev => ({ ...prev, details: { ...prev.details, vehicleMake: text } }))}
          />
          <Text style={styles.label}>Vehicle Model</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Camry"
            value={formData.details.vehicleModel || ''}
            onChangeText={(text) => setFormData(prev => ({ ...prev, details: { ...prev.details, vehicleModel: text } }))}
          />
          <Text style={styles.label}>Vehicle Year</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 2020"
            keyboardType="numeric"
            maxLength={4}
            value={formData.details.vehicleYear ? String(formData.details.vehicleYear) : ''}
            onChangeText={(text) => setFormData(prev => ({ ...prev, details: { ...prev.details, vehicleYear: parseInt(text) || undefined } }))}
          />
        </View>
      )}

      {formData.coverageType === 'home' && (
        <View style={styles.dynamicDetailsContainer}>
          <Text style={styles.subHeader}>Property Details</Text>
          <Text style={styles.label}>Property Type</Text>
          <View style={styles.optionContainer}>
            {['house', 'condo', 'apartment'].map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.optionButton,
                  formData.details.propertyType === type && styles.optionButtonSelected,
                ]}
                onPress={() => setFormData(prev => ({ ...prev, details: { ...prev.details, propertyType: type as 'house' | 'condo' | 'apartment' } }))}
              >
                <Text style={[
                  styles.optionText,
                  formData.details.propertyType === type && styles.optionTextSelected,
                ]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Square Footage</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 1500"
            keyboardType="numeric"
            value={formData.details.squareFootage ? String(formData.details.squareFootage) : ''}
            onChangeText={(text) => setFormData(prev => ({ ...prev, details: { ...prev.details, squareFootage: parseInt(text) || undefined } }))}
          />
        </View>
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={handleQuoteRequest} disabled={isLoading}>
        <Text style={styles.primaryButtonText}>Calculate Premium</Text>
      </TouchableOpacity>
    </View>
  );

  const renderQuoteComparison = () => (
    <View style={styles.contentContainer}>
      {renderHeader('Compare Quotes')}
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Text style={styles.subHeader}>We found {quotes.length} options for you.</Text>
      <ScrollView style={styles.quoteList}>
        {quotes.map(quote => (
          <View key={quote.id} style={styles.quoteCard}>
            <Text style={styles.quoteProvider}>{quote.provider}</Text>
            <Text style={styles.quotePremium}>${quote.premium.toFixed(2)} / month</Text>
            <View style={styles.coverageDetails}>
              {quote.coverageDetails.map((detail, index) => (
                <Text key={index} style={styles.detailText}>• {detail}</Text>
              ))}
            </View>
            <View style={styles.quoteActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => handleSaveQuote(quote.id)}>
                <Text style={styles.secondaryButtonText}>Save Quote</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => handleShareQuote(quote.id)}>
                <Text style={styles.secondaryButtonText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButtonSmall} onPress={() => handleSelectQuote(quote)}>
                <Text style={styles.primaryButtonText}>Select & Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  const renderPersonalDetailsForm = () => (
    <View style={styles.contentContainer}>
      {renderHeader('Your Details')}
      <Text style={styles.subHeader}>Final step to secure your quote.</Text>
      {selectedQuote && (
        <View style={styles.selectedQuoteSummary}>
          <Text style={styles.summaryText}>Selected: {selectedQuote.provider}</Text>
          <Text style={styles.summaryText}>Premium: ${selectedQuote.premium.toFixed(2)}/mo</Text>
        </View>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Text style={styles.label}>First Name</Text>
      <TextInput
        style={styles.input}
        placeholder="John"
        value={personalDetails.firstName}
        onChangeText={(text) => handleDetailChange('firstName', text)}
      />
      <Text style={styles.label}>Last Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Doe"
        value={personalDetails.lastName}
        onChangeText={(text) => handleDetailChange('lastName', text)}
      />
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        placeholder="john.doe@example.com"
        keyboardType="email-address"
        value={personalDetails.email}
        onChangeText={(text) => handleDetailChange('email', text)}
      />
      <Text style={styles.label}>Phone Number</Text>
      <TextInput
        style={styles.input}
        placeholder="(555) 555-5555"
        keyboardType="phone-pad"
        value={personalDetails.phone}
        onChangeText={(text) => handleDetailChange('phone', text)}
      />

      <TouchableOpacity style={styles.primaryButton} onPress={handleApplyForPolicy} disabled={isLoading}>
        <Text style={styles.primaryButtonText}>Apply for Policy</Text>
      </TouchableOpacity>
    </View>
  );

  const renderConfirmationScreen = () => (
    <View style={styles.contentContainer}>
      {renderHeader('Application Confirmed!')}
      <Text style={styles.subHeader}>Thank you for choosing NeoBank Insurance.</Text>
      <View style={styles.confirmationBox}>
        <Text style={styles.confirmationText}>
          Congratulations, your application for the {selectedQuote?.provider} policy has been submitted.
        </Text>
        <Text style={styles.confirmationPolicyNumber}>
          Your Policy Number: {policyNumber}
        </Text>
        <Text style={styles.confirmationTextSmall}>
          A representative will contact you within 24 hours to finalize your policy details.
        </Text>
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('FORM')}>
        <Text style={styles.primaryButtonText}>Start New Quote</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      {renderStepContent()}
    </ScrollView>
  );
};

// --- Styling (Basic React Native StyleSheet) ---

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f7f9', // Light background for the screen
  },
  scrollContent: {
    paddingBottom: 40,
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a237e', // NeoBank primary color
  },
  subHeader: {
    fontSize: 18,
    color: '#333',
    marginBottom: 15,
  },
  backButton: {
    padding: 5,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 15,
    marginBottom: 5,
  },
  input: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  errorText: {
    color: '#d32f2f',
    marginBottom: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  // --- Buttons ---
  primaryButton: {
    backgroundColor: '#007AFF', // Standard blue for primary action
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryButtonSmall: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    borderColor: '#007AFF',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 10,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  // --- Options ---
  optionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  optionButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    minWidth: '30%',
    alignItems: 'center',
    marginVertical: 5,
    marginHorizontal: 2, // Added for better spacing in flexWrap
  },
  optionButtonSelected: {
    backgroundColor: '#e3f2fd', // Light blue background
    borderColor: '#007AFF',
  },
  optionText: {
    color: '#333',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  // --- Quotes ---
  quoteList: {
    maxHeight: 400, // Limit height for scrollability
  },
  quoteCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quoteProvider: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a237e',
    marginBottom: 5,
  },
  quotePremium: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2e7d32', // Green for premium
    marginBottom: 10,
  },
  coverageDetails: {
    marginBottom: 10,
  },
  detailText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  quoteActions: {
    flexDirection: 'row',
    justifyContent: 'space-between', // Changed to space-between
    alignItems: 'center',
    marginTop: 10,
  },
  // --- Details/Confirmation ---
  selectedQuoteSummary: {
    backgroundColor: '#fffde7', // Light yellow background
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 5,
    borderLeftColor: '#ffeb3b',
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  confirmationBox: {
    backgroundColor: '#e8f5e9', // Light green background
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  confirmationText: {
    fontSize: 18,
    textAlign: 'center',
    color: '#388e3c',
    marginBottom: 15,
  },
  confirmationPolicyNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1b5e20',
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  confirmationTextSmall: {
    fontSize: 14,
    textAlign: 'center',
    color: '#555',
  },
  dynamicDetailsContainer: {
    marginTop: 10,
    padding: 15,
    backgroundColor: '#e8eaf6', // Light blue-grey background for dynamic section
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#1a237e',
  }
});

export default InsuranceQuoteScreen;