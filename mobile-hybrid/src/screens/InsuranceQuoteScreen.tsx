import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

// --- Mock Service Imports (Assuming they exist in src/services) ---
// In a real project, these would be imported from the actual path.
// For this task, we'll define mock functions to simulate their usage.

interface QuoteResponse {
  quoteId: string;
  premium: number;
  monthlyPayment: number;
  coverageDetails: string;
}

// Mock ApiService for fetching and submitting data
const ApiService = {
  fetchQuoteOptions: async (): Promise<{ coverageTypes: string[], paymentFrequencies: string[] }> => {
    return new Promise(resolve =>
      setTimeout(() =>
        resolve({
          coverageTypes: ['Auto', 'Home', 'Life', 'Health'],
          paymentFrequencies: ['Monthly', 'Quarterly', 'Annually'],
        }),
        500
      )
    );
  },
  calculatePremium: async (data: QuoteState): Promise<QuoteResponse> => {
    // Simulate a complex calculation
    const basePremium = data.coverage.type === 'Auto' ? 150 : data.coverage.type === 'Home' ? 100 : 50;
    const ageFactor = data.personalInfo.age > 30 ? 0.9 : 1.1;
    const premium = Math.round(basePremium * ageFactor * 100) / 100;

    return new Promise(resolve =>
      setTimeout(() =>
        resolve({
          quoteId: `Q-${Date.now()}`,
          premium: premium * (data.coverage.frequency === 'Annually' ? 12 : 1),
          monthlyPayment: premium,
          coverageDetails: `Comprehensive coverage for ${data.coverage.type}`,
        }),
        1500
      )
    );
  },
  submitQuote: async (quote: QuoteResponse): Promise<boolean> => {
    return new Promise(resolve =>
      setTimeout(() => {
        console.log('Quote submitted:', quote);
        resolve(true);
      }, 1000)
    );
  },
};

// Mock NotificationService
const NotificationService = {
  showSuccess: (message: string) => {
    if (Platform.OS === 'web') {
      console.log(`SUCCESS: ${message}`);
    } else {
      Alert.alert('Success', message);
    }
  },
  showError: (message: string) => {
    if (Platform.OS === 'web') {
      console.error(`ERROR: ${message}`);
    } else {
      Alert.alert('Error', message);
    }
  },
};

// --- TypeScript Definitions ---

type Step = 'Coverage' | 'PersonalInfo' | 'Calculation' | 'Summary';

interface CoverageState {
  type: string;
  amount: number;
  frequency: string;
}

interface PersonalInfoState {
  fullName: string;
  email: string;
  age: number;
  address: string;
}

interface QuoteState {
  coverage: CoverageState;
  personalInfo: PersonalInfoState;
}

interface QuoteOptions {
  coverageTypes: string[];
  paymentFrequencies: string[];
}

// --- Initial State ---

const initialQuoteState: QuoteState = {
  coverage: {
    type: 'Auto',
    amount: 50000,
    frequency: 'Monthly',
  },
  personalInfo: {
    fullName: '',
    email: '',
    age: 25,
    address: '',
  },
};

// --- Component Props ---

interface InsuranceQuoteScreenProps {
  // Navigation props would typically be here
  onQuoteComplete?: (quote: QuoteResponse) => void;
}

// --- Step Components ---

interface StepProps {
  quoteState: QuoteState;
  setQuoteState: React.Dispatch<React.SetStateAction<QuoteState>>;
  onNext: () => void;
  onBack: () => void;
  isFirstStep: boolean;
  options: QuoteOptions;
}

const CoverageSelection: React.FC<StepProps> = ({ quoteState, setQuoteState, onNext, isFirstStep, options }) => {
  const { coverage } = quoteState;

  const handleUpdate = useCallback((key: keyof CoverageState, value: any) => {
    setQuoteState(prev => ({
      ...prev,
      coverage: { ...prev.coverage, [key]: value },
    }));
  }, [setQuoteState]);

  const validateAndNext = () => {
    if (!coverage.type || coverage.amount <= 0 || !coverage.frequency) {
      NotificationService.showError('Please select a coverage type, amount, and payment frequency.');
      return;
    }
    onNext();
  };

  return (
    <ScrollView contentContainerStyle={styles.stepContainer}>
      <Text style={styles.title}>1. Select Coverage</Text>

      <Text style={styles.label}>Coverage Type</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={coverage.type}
          onValueChange={(itemValue) => handleUpdate('type', itemValue)}
          style={styles.picker}
        >
          {options.coverageTypes.map(type => (
            <Picker.Item key={type} label={type} value={type} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Coverage Amount ($)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder="e.g., 50000"
        value={String(coverage.amount)}
        onChangeText={(text) => handleUpdate('amount', parseInt(text) || 0)}
      />

      <Text style={styles.label}>Payment Frequency</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={coverage.frequency}
          onValueChange={(itemValue) => handleUpdate('frequency', itemValue)}
          style={styles.picker}
        >
          {options.paymentFrequencies.map(freq => (
            <Picker.Item key={freq} label={freq} value={freq} />
          ))}
        </Picker>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={validateAndNext}>
          <Text style={styles.buttonText}>Next: Personal Info</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const PersonalInfoInput: React.FC<StepProps> = ({ quoteState, setQuoteState, onNext, onBack }) => {
  const { personalInfo } = quoteState;

  const handleUpdate = useCallback((key: keyof PersonalInfoState, value: any) => {
    setQuoteState(prev => ({
      ...prev,
      personalInfo: { ...prev.personalInfo, [key]: value },
    }));
  }, [setQuoteState]);

  const validateAndNext = () => {
    const { fullName, email, age, address } = personalInfo;
    if (!fullName || !email || age < 18 || !address) {
      NotificationService.showError('Please fill in all fields correctly. Age must be 18 or older.');
      return;
    }
    onNext();
  };

  return (
    <ScrollView contentContainerStyle={styles.stepContainer}>
      <Text style={styles.title}>2. Personal Information</Text>

      <Text style={styles.label}>Full Name</Text>
      <TextInput
        style={styles.input}
        placeholder="John Doe"
        value={personalInfo.fullName}
        onChangeText={(text) => handleUpdate('fullName', text)}
      />

      <Text style={styles.label}>Email Address</Text>
      <TextInput
        style={styles.input}
        keyboardType="email-address"
        placeholder="john.doe@example.com"
        value={personalInfo.email}
        onChangeText={(text) => handleUpdate('email', text)}
      />

      <Text style={styles.label}>Age</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder="e.g., 35"
        value={String(personalInfo.age)}
        onChangeText={(text) => handleUpdate('age', parseInt(text) || 0)}
      />

      <Text style={styles.label}>Address</Text>
      <TextInput
        style={styles.input}
        placeholder="123 Main St, Anytown"
        value={personalInfo.address}
        onChangeText={(text) => handleUpdate('address', text)}
        multiline
      />

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onBack}>
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={validateAndNext}>
          <Text style={styles.buttonText}>Next: Calculate Premium</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

interface CalculationStepProps extends StepProps {
  setQuoteResponse: React.Dispatch<React.SetStateAction<QuoteResponse | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

const PremiumCalculation: React.FC<CalculationStepProps> = ({
  quoteState,
  onNext,
  onBack,
  setQuoteResponse,
  setLoading,
}) => {
  const [isCalculating, setIsCalculating] = useState(false);

  const handleCalculate = useCallback(async () => {
    setIsCalculating(true);
    setLoading(true);
    try {
      const response = await ApiService.calculatePremium(quoteState);
      setQuoteResponse(response);
      NotificationService.showSuccess('Premium calculated successfully!');
      onNext();
    } catch (error) {
      NotificationService.showError('Failed to calculate premium. Please try again.');
      console.error(error);
    } finally {
      setIsCalculating(false);
      setLoading(false);
    }
  }, [quoteState, onNext, setQuoteResponse, setLoading]);

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>3. Review and Calculate</Text>
      <View style={styles.reviewBox}>
        <Text style={styles.reviewHeader}>Coverage Details</Text>
        <Text style={styles.reviewText}>Type: {quoteState.coverage.type}</Text>
        <Text style={styles.reviewText}>Amount: ${quoteState.coverage.amount.toLocaleString()}</Text>
        <Text style={styles.reviewText}>Frequency: {quoteState.coverage.frequency}</Text>

        <Text style={styles.reviewHeader}>Personal Details</Text>
        <Text style={styles.reviewText}>Name: {quoteState.personalInfo.fullName}</Text>
        <Text style={styles.reviewText}>Email: {quoteState.personalInfo.email}</Text>
        <Text style={styles.reviewText}>Age: {quoteState.personalInfo.age}</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onBack} disabled={isCalculating}>
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, isCalculating && styles.disabledButton]}
          onPress={handleCalculate}
          disabled={isCalculating}
        >
          {isCalculating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Calculate Premium</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

interface SummaryStepProps extends StepProps {
  quoteResponse: QuoteResponse;
  onQuoteComplete?: (quote: QuoteResponse) => void;
}

const QuoteSummary: React.FC<SummaryStepProps> = ({ quoteResponse, onBack, onQuoteComplete }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const success = await ApiService.submitQuote(quoteResponse);
      if (success) {
        NotificationService.showSuccess('Quote successfully submitted and policy created!');
        if (onQuoteComplete) {
          onQuoteComplete(quoteResponse);
        }
      } else {
        NotificationService.showError('Submission failed. Please contact support.');
      }
    } catch (error) {
      NotificationService.showError('An error occurred during submission.');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }, [quoteResponse, onQuoteComplete]);

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>4. Quote Summary</Text>
      <View style={styles.summaryBox}>
        <Text style={styles.summaryHeader}>Your Estimated Premium</Text>
        <Text style={styles.premiumText}>
          ${quoteResponse.monthlyPayment.toFixed(2)} / month
        </Text>
        <Text style={styles.premiumDetail}>
          Total Premium: ${quoteResponse.premium.toFixed(2)} ({quoteResponse.coverageDetails})
        </Text>
        <Text style={styles.premiumDetail}>Quote ID: {quoteResponse.quoteId}</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onBack} disabled={isSubmitting}>
          <Text style={styles.buttonText}>Back to Review</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, isSubmitting && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Accept & Submit Quote</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// --- Main Screen Component ---

const InsuranceQuoteScreen: React.FC<InsuranceQuoteScreenProps> = ({ onQuoteComplete }) => {
  const [currentStep, setCurrentStep] = useState<Step>('Coverage');
  const [quoteState, setQuoteState] = useState<QuoteState>(initialQuoteState);
  const [quoteResponse, setQuoteResponse] = useState<QuoteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [options, setOptions] = useState<QuoteOptions>({ coverageTypes: [], paymentFrequencies: [] });
  const [isOptionsLoading, setIsOptionsLoading] = useState(true);

  // Fetch initial options on mount
  React.useEffect(() => {
    const fetchOptions = async () => {
      try {
        const fetchedOptions = await ApiService.fetchQuoteOptions();
        setOptions(fetchedOptions);
        // Set initial state based on fetched options
        setQuoteState(prev => ({
          ...prev,
          coverage: {
            ...prev.coverage,
            type: fetchedOptions.coverageTypes[0] || 'Auto',
            frequency: fetchedOptions.paymentFrequencies[0] || 'Monthly',
          },
        }));
      } catch (error) {
        NotificationService.showError('Failed to load quote options.');
      } finally {
        setIsOptionsLoading(false);
      }
    };
    fetchOptions();
  }, []);

  const handleNext = useCallback(() => {
    switch (currentStep) {
      case 'Coverage':
        setCurrentStep('PersonalInfo');
        break;
      case 'PersonalInfo':
        setCurrentStep('Calculation');
        break;
      case 'Calculation':
        if (quoteResponse) {
          setCurrentStep('Summary');
        }
        break;
      default:
        break;
    }
  }, [currentStep, quoteResponse]);

  const handleBack = useCallback(() => {
    switch (currentStep) {
      case 'PersonalInfo':
        setCurrentStep('Coverage');
        break;
      case 'Calculation':
        setCurrentStep('PersonalInfo');
        break;
      case 'Summary':
        setCurrentStep('Calculation');
        break;
      default:
        break;
    }
  }, [currentStep]);

  const stepComponents = useMemo(() => ({
    Coverage: CoverageSelection,
    PersonalInfo: PersonalInfoInput,
    Calculation: PremiumCalculation,
    Summary: QuoteSummary,
  }), []);

  const CurrentStepComponent = stepComponents[currentStep];

  const stepIndex = useMemo(() => {
    const steps: Step[] = ['Coverage', 'PersonalInfo', 'Calculation', 'Summary'];
    return steps.indexOf(currentStep) + 1;
  }, [currentStep]);

  if (isOptionsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading quote options...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Insurance Quote Application</Text>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(stepIndex / 4) * 100}%` }]} />
      </View>
      <Text style={styles.stepIndicator}>Step {stepIndex} of 4: {currentStep}</Text>

      <View style={styles.content}>
        {currentStep === 'Calculation' ? (
          <PremiumCalculation
            quoteState={quoteState}
            setQuoteState={setQuoteState}
            onNext={handleNext}
            onBack={handleBack}
            isFirstStep={false}
            options={options}
            setQuoteResponse={setQuoteResponse}
            setLoading={setIsLoading}
          />
        ) : currentStep === 'Summary' && quoteResponse ? (
          <QuoteSummary
            quoteState={quoteState}
            setQuoteState={setQuoteState}
            onNext={handleNext}
            onBack={handleBack}
            isFirstStep={false}
            options={options}
            quoteResponse={quoteResponse}
            onQuoteComplete={onQuoteComplete}
          />
        ) : (
          <CurrentStepComponent
            quoteState={quoteState}
            setQuoteState={setQuoteState}
            onNext={handleNext}
            onBack={handleBack}
            isFirstStep={currentStep === 'Coverage'}
            options={options}
          />
        )}
      </View>

      {isLoading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.overlayText}>Processing...</Text>
        </View>
      )}
    </View>
  );
};

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
    maxWidth: Platform.OS === 'web' ? 800 : '100%',
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  stepIndicator: {
    fontSize: 16,
    color: '#555',
    marginBottom: 20,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  stepContainer: {
    flexGrow: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
    color: '#007AFF',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 15,
    marginBottom: 5,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: Platform.OS === 'web' ? 12 : 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: {
    height: Platform.OS === 'web' ? 40 : 50,
    width: '100%',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#6c757d',
  },
  disabledButton: {
    backgroundColor: '#a0a0a0',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  reviewBox: {
    padding: 15,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    marginBottom: 20,
  },
  reviewHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
    color: '#333',
  },
  reviewText: {
    fontSize: 16,
    marginBottom: 5,
    color: '#555',
  },
  summaryBox: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#e6f2ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  summaryHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  premiumText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#28a745', // Green for premium
    marginBottom: 5,
  },
  premiumDetail: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  overlayText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 18,
  },
});

export default InsuranceQuoteScreen;