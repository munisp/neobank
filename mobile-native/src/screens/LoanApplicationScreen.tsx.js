import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

// --- Types and Interfaces ---

/**
 * Represents the structure of a loan application form data.
 * This structure is inferred from a typical PWA loan application flow.
 */
interface LoanApplicationData {
  loanAmount: string;
  loanPurpose: string;
  employmentStatus: 'Employed' | 'Self-Employed' | 'Unemployed' | 'Other';
  annualIncome: string;
  creditScoreConsent: boolean;
}

/**
 * Represents the structure of the API response for a loan application submission.
 */
interface LoanApplicationResponse {
  applicationId: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  message: string;
}

// --- Mock API Service (ApiService equivalent) ---

/**
 * A mock service to simulate API calls for the loan application process.
 * In a real application, this would be part of a centralized ApiService.
 */
const ApiService = {
  /**
   * Simulates fetching initial data for the form (e.g., user profile, pre-filled values).
   */
  fetchInitialData: async (): Promise<Partial<LoanApplicationData>> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          loanAmount: '5000',
          loanPurpose: 'Debt Consolidation',
          employmentStatus: 'Employed',
        });
      }, 1000);
    });
  },

  /**
   * Simulates submitting the loan application data.
   * @param data The loan application data to submit.
   */
  submitLoanApplication: async (
    data: LoanApplicationData
  ): Promise<LoanApplicationResponse> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (parseInt(data.loanAmount) > 10000 && data.employmentStatus === 'Unemployed') {
          // Simulate a rejection based on high risk
          reject({ message: 'Application failed: High risk profile.' });
        } else if (!data.creditScoreConsent) {
          // Simulate a business logic error
          reject({ message: 'Application failed: Credit score consent is required.' });
        } else {
          // Simulate a successful submission
          resolve({
            applicationId: `APP-${Date.now()}`,
            status: 'Pending',
            message: 'Your application has been successfully submitted and is under review.',
          });
        }
      }, 2000);
    });
  },
};

// --- Constants and Utility Functions ---

const LOAN_PURPOSES = [
  'Debt Consolidation',
  'Home Improvement',
  'Major Purchase',
  'Other',
];

const EMPLOYMENT_STATUSES: LoanApplicationData['employmentStatus'][] = [
  'Employed',
  'Self-Employed',
  'Unemployed',
  'Other',
];

/**
 * Simple validation function for the form.
 */
const validateForm = (data: LoanApplicationData): boolean => {
  const { loanAmount, annualIncome, creditScoreConsent } = data;
  if (!loanAmount || isNaN(Number(loanAmount)) || Number(loanAmount) <= 0) {
    Alert.alert('Validation Error', 'Please enter a valid loan amount.');
    return false;
  }
  if (!annualIncome || isNaN(Number(annualIncome)) || Number(annualIncome) <= 0) {
    Alert.alert('Validation Error', 'Please enter a valid annual income.');
    return false;
  }
  if (!creditScoreConsent) {
    Alert.alert('Validation Error', 'You must consent to the credit score check.');
    return false;
  }
  return true;
};

// --- Main Screen Component ---

const LoanApplicationScreen: React.FC = () => {
  const navigation = useNavigation();
  const [formData, setFormData] = useState<LoanApplicationData>({
    loanAmount: '',
    loanPurpose: LOAN_PURPOSES[0],
    employmentStatus: 'Employed',
    annualIncome: '',
    creditScoreConsent: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Feature: Fetch initial data (PWA equivalent might pre-fill from user profile)
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const initialData = await ApiService.fetchInitialData();
        setFormData((prev) => ({ ...prev, ...initialData }));
        setError(null);
      } catch (err) {
        setError('Failed to load initial data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    loadInitialData();
  }, []);

  // Feature: Handle form input changes
  const handleInputChange = useCallback(
    (field: keyof LoanApplicationData, value: string | boolean) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
      // Clear error on user interaction
      if (error) setError(null);
    },
    [error]
  );

  // Feature: Handle form submission
  const handleSubmit = async () => {
    if (!validateForm(formData)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await ApiService.submitLoanApplication(formData);
      Alert.alert(
        'Application Submitted',
        `${response.message} Application ID: ${response.applicationId}`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigation integration: Go to a confirmation screen or home
              // Mock navigation back to home for simplicity
              navigation.goBack();
            },
          },
        ]
      );
    } catch (err: any) {
      // Error handling: Display API error message
      const errorMessage = err.message || 'An unexpected error occurred during submission.';
      setError(errorMessage);
      Alert.alert('Submission Failed', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Feature: Loading state display
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading application form...</Text>
      </View>
    );
  }

  // Feature: Error state display
  if (error && !isSubmitting) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            // Simple retry logic: re-trigger initial data load
            setIsLoading(true);
            setError(null);
            // In a real app, you'd re-run the useEffect logic or a dedicated retry function
            // For this mock, we'll just reset and let the useEffect run again (if dependencies were right)
            // Since we can't re-run useEffect easily, we'll just provide a simple message
            Alert.alert('Retry', 'Please reload the screen to try again.');
            setIsLoading(false);
          }}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Feature: Main form rendering
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.header}>Loan Application</Text>
        <Text style={styles.subHeader}>
          Please fill out the details below to apply for your loan.
        </Text>

        {/* Loan Amount Input */}
        <Text style={styles.label}>Loan Amount ($)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="e.g., 5000"
          value={formData.loanAmount}
          onChangeText={(text) => handleInputChange('loanAmount', text)}
        />

        {/* Loan Purpose Picker/Selector */}
        <Text style={styles.label}>Loan Purpose</Text>
        <View style={styles.pickerContainer}>
          {LOAN_PURPOSES.map((purpose) => (
            <TouchableOpacity
              key={purpose}
              style={[
                styles.optionButton,
                formData.loanPurpose === purpose && styles.optionButtonSelected,
              ]}
              onPress={() => handleInputChange('loanPurpose', purpose)}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  formData.loanPurpose === purpose && styles.optionButtonTextSelected,
                ]}
              >
                {purpose}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Employment Status Picker/Selector */}
        <Text style={styles.label}>Employment Status</Text>
        <View style={styles.pickerContainer}>
          {EMPLOYMENT_STATUSES.map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.optionButton,
                formData.employmentStatus === status && styles.optionButtonSelected,
              ]}
              onPress={() => handleInputChange('employmentStatus', status)}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  formData.employmentStatus === status && styles.optionButtonTextSelected,
                ]}
              >
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Annual Income Input */}
        <Text style={styles.label}>Annual Income ($)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="e.g., 60000"
          value={formData.annualIncome}
          onChangeText={(text) => handleInputChange('annualIncome', text)}
        />

        {/* Credit Score Consent Checkbox (Simulated with TouchableOpacity) */}
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => handleInputChange('creditScoreConsent', !formData.creditScoreConsent)}
        >
          <View
            style={[
              styles.checkbox,
              formData.creditScoreConsent && styles.checkboxChecked,
            ]}
          >
            {formData.creditScoreConsent && <Text style={styles.checkMark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>
            I consent to a soft credit score check to determine my eligibility.
          </Text>
        </TouchableOpacity>

        {/* Submission Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Application</Text>
          )}
        </TouchableOpacity>

        {/* Feature: Display API error message */}
        {error && (
          <Text style={styles.submissionErrorText}>
            Submission Error: {error}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 50,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subHeader: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
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
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    marginTop: 8,
    minWidth: '48%', // Allows two per row
    alignItems: 'center',
  },
  optionButtonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#E6F0FF',
  },
  optionButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
  },
  optionButtonTextSelected: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  checkbox: {
    height: 24,
    width: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkMark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  submitButtonDisabled: {
    backgroundColor: '#A9A9A9',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: '#D32F2F',
    textAlign: 'center',
    marginBottom: 20,
  },
  submissionErrorText: {
    fontSize: 14,
    color: '#D32F2F',
    textAlign: 'center',
    marginTop: 15,
    padding: 10,
    backgroundColor: '#FFEBEE',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#D32F2F',
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
});

export default LoanApplicationScreen;
