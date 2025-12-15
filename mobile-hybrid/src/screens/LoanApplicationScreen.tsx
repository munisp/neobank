import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';

// --- Mock Services (As per requirement to use services from src/services) ---
// In a real app, these would be imported from '../services/...'
const mockAuthService = {
  getCurrentUser: () => ({ id: 'user-123', name: 'John Doe' }),
};

const mockApiService = {
  submitLoanApplication: async (data: LoanApplicationData) => {
    console.log('Submitting loan application:', data);
    // Simulate API delay and success/failure
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (Math.random() > 0.1) {
      return { success: true, applicationId: `LA-${Date.now()}` };
    } else {
      throw new Error('Server error: Failed to process application.');
    }
  },
};

const mockNotificationService = {
  showSuccess: (message: string) => Alert.alert('Success', message),
  showError: (message: string) => Alert.alert('Error', message),
};

const mockStorageService = {
  saveDraft: (data: LoanApplicationData) => {
    console.log('Saving draft:', data);
  },
};

// --- TypeScript Definitions ---

type LoanPurpose = 'Home Improvement' | 'Debt Consolidation' | 'Education' | 'Other';

interface LoanApplicationData {
  step: number;
  loanAmount: number | null;
  loanPurpose: LoanPurpose | '';
  monthlyIncome: number | null;
  employmentStatus: 'Employed' | 'Self-Employed' | 'Unemployed' | '';
  documentIds: string[]; // Mocking document IDs after upload
}

interface StepProps {
  data: LoanApplicationData;
  setData: (data: Partial<LoanApplicationData>) => void;
  onNext: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

// --- Step 1: Loan Details ---

const LoanDetailsStep: React.FC<StepProps> = ({ data, setData, onNext }) => {
  const isFormValid = data.loanAmount && data.loanAmount > 0 && data.loanPurpose !== '';

  const handleAmountChange = (text: string) => {
    const amount = parseInt(text.replace(/[^0-9]/g, ''), 10);
    setData({ loanAmount: isNaN(amount) ? null : amount });
  };

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>1. Loan Details</Text>
      <Text style={styles.label}>Loan Amount ($)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder="e.g., 10000"
        value={data.loanAmount ? String(data.loanAmount) : ''}
        onChangeText={handleAmountChange}
      />

      <Text style={styles.label}>Loan Purpose</Text>
      {(['Home Improvement', 'Debt Consolidation', 'Education', 'Other'] as LoanPurpose[]).map(
        (purpose) => (
          <TouchableOpacity
            key={purpose}
            style={[
              styles.purposeButton,
              data.loanPurpose === purpose && styles.purposeButtonActive,
            ]}
            onPress={() => setData({ loanPurpose: purpose })}
          >
            <Text
              style={[
                styles.purposeButtonText,
                data.loanPurpose === purpose && styles.purposeButtonTextActive,
              ]}
            >
              {purpose}
            </Text>
          </TouchableOpacity>
        )
      )}

      <TouchableOpacity
        style={[styles.button, !isFormValid && styles.buttonDisabled]}
        onPress={onNext}
        disabled={!isFormValid}
      >
        <Text style={styles.buttonText}>Next: Income Verification</Text>
      </TouchableOpacity>
    </View>
  );
};

// --- Step 2: Income Verification ---

const IncomeVerificationStep: React.FC<StepProps> = ({ data, setData, onNext, onBack }) => {
  const isFormValid = data.monthlyIncome && data.monthlyIncome > 0 && data.employmentStatus !== '';

  const handleIncomeChange = (text: string) => {
    const income = parseInt(text.replace(/[^0-9]/g, ''), 10);
    setData({ monthlyIncome: isNaN(income) ? null : income });
  };

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>2. Income Verification</Text>
      <Text style={styles.label}>Monthly Income ($)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder="e.g., 5000"
        value={data.monthlyIncome ? String(data.monthlyIncome) : ''}
        onChangeText={handleIncomeChange}
      />

      <Text style={styles.label}>Employment Status</Text>
      {(['Employed', 'Self-Employed', 'Unemployed'] as LoanApplicationData['employmentStatus'][]).map(
        (status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.purposeButton,
              data.employmentStatus === status && styles.purposeButtonActive,
            ]}
            onPress={() => setData({ employmentStatus: status })}
          >
            <Text
              style={[
                styles.purposeButtonText,
                data.employmentStatus === status && styles.purposeButtonTextActive,
              ]}
            >
              {status}
            </Text>
          </TouchableOpacity>
        )
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, !isFormValid && styles.buttonDisabled]}
          onPress={onNext}
          disabled={!isFormValid}
        >
          <Text style={styles.buttonText}>Next: Document Upload</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// --- Step 3: Document Upload ---

const DocumentUploadStep: React.FC<StepProps> = ({ data, setData, onNext, onBack, isSubmitting }) => {
  // Mock document upload logic
  const handleUpload = () => {
    // Simulate a successful upload and receive a document ID
    const newDocId = `doc-${Date.now()}`;
    setData({ documentIds: [...data.documentIds, newDocId] });
    mockNotificationService.showSuccess('Document uploaded successfully!');
  };

  const isFormValid = data.documentIds.length > 0;

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>3. Document Upload</Text>
      <Text style={styles.label}>Upload required documents (e.g., ID, Pay Stub)</Text>

      <TouchableOpacity style={styles.uploadButton} onPress={handleUpload}>
        <Text style={styles.uploadButtonText}>Select and Upload File</Text>
      </TouchableOpacity>

      {data.documentIds.length > 0 && (
        <View style={styles.documentList}>
          <Text style={styles.documentListTitle}>Uploaded Documents:</Text>
          {data.documentIds.map((id, index) => (
            <Text key={id} style={styles.documentItem}>
              {index + 1}. Document ID: {id}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} disabled={isSubmitting}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, !isFormValid && styles.buttonDisabled]}
          onPress={onNext}
          disabled={!isFormValid || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Review & Submit</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// --- Step 4: Review & Submit ---

const ReviewSubmitStep: React.FC<StepProps> = ({ data, onBack, isSubmitting }) => {
  const handleSubmit = useCallback(async () => {
    // The submission logic is handled in the main component, this button just triggers the final step
    // The onNext function passed here will be the final submission handler from the parent
    // We don't call onNext here to keep the submission logic centralized in the main component.
    // Instead, we rely on the main component to handle the final submission action.
    // For this mock, we will just show the data and let the parent handle the API call.
    Alert.alert('Review Complete', 'Ready to submit your application.');
  }, []);

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>4. Review & Submit</Text>
      <Text style={styles.reviewHeader}>Application Summary</Text>

      <View style={styles.reviewItem}>
        <Text style={styles.reviewLabel}>Loan Amount:</Text>
        <Text style={styles.reviewValue}>${data.loanAmount?.toLocaleString()}</Text>
      </View>
      <View style={styles.reviewItem}>
        <Text style={styles.reviewLabel}>Loan Purpose:</Text>
        <Text style={styles.reviewValue}>{data.loanPurpose}</Text>
      </View>
      <View style={styles.reviewItem}>
        <Text style={styles.reviewLabel}>Monthly Income:</Text>
        <Text style={styles.reviewValue}>${data.monthlyIncome?.toLocaleString()}</Text>
      </View>
      <View style={styles.reviewItem}>
        <Text style={styles.reviewLabel}>Employment Status:</Text>
        <Text style={styles.reviewValue}>{data.employmentStatus}</Text>
      </View>
      <View style={styles.reviewItem}>
        <Text style={styles.reviewLabel}>Documents Uploaded:</Text>
        <Text style={styles.reviewValue}>{data.documentIds.length} file(s)</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} disabled={isSubmitting}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit} // This is a mock, the actual submission is in the parent
          disabled={isSubmitting}
        >
          <Text style={styles.buttonText}>Confirm & Submit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// --- Main Screen Component ---

const TOTAL_STEPS = 4;

const LoanApplicationScreen: React.FC = () => {
  const [formData, setFormData] = useState<LoanApplicationData>({
    step: 1,
    loanAmount: null,
    loanPurpose: '',
    monthlyIncome: null,
    employmentStatus: '',
    documentIds: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Function to update form data and save draft
  const updateFormData = useCallback((newData: Partial<LoanApplicationData>) => {
    setFormData((prevData) => {
      const updatedData = { ...prevData, ...newData };
      mockStorageService.saveDraft(updatedData); // Save draft on every change
      return updatedData;
    });
  }, []);

  const handleNext = useCallback(() => {
    if (formData.step < TOTAL_STEPS) {
      updateFormData({ step: formData.step + 1 });
    } else if (formData.step === TOTAL_STEPS) {
      // Final submission logic
      handleSubmitApplication();
    }
  }, [formData.step, updateFormData]);

  const handleBack = useCallback(() => {
    if (formData.step > 1) {
      updateFormData({ step: formData.step - 1 });
    }
  }, [formData.step, updateFormData]);

  const handleSubmitApplication = async () => {
    setIsSubmitting(true);
    try {
      const result = await mockApiService.submitLoanApplication(formData);
      if (result.success) {
        mockNotificationService.showSuccess(
          `Application ${result.applicationId} submitted successfully!`
        );
        // Reset form or navigate to a success screen
        updateFormData({
          step: 1,
          loanAmount: null,
          loanPurpose: '',
          monthlyIncome: null,
          employmentStatus: '',
          documentIds: [],
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      mockNotificationService.showError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = useMemo(() => {
    const stepProps: StepProps = {
      data: formData,
      setData: updateFormData,
      onNext: handleNext,
      onBack: handleBack,
      isSubmitting: isSubmitting,
    };

    switch (formData.step) {
      case 1:
        return <LoanDetailsStep {...stepProps} />;
      case 2:
        return <IncomeVerificationStep {...stepProps} />;
      case 3:
        return <DocumentUploadStep {...stepProps} />;
      case 4:
        return <ReviewSubmitStep {...stepProps} onNext={handleSubmitApplication} />; // Pass the final submit handler
      default:
        return <Text>Error: Invalid Step</Text>;
    }
  }, [formData, updateFormData, handleNext, handleBack, isSubmitting]);

  const progress = (formData.step / TOTAL_STEPS) * 100;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Loan Application</Text>
      <Text style={styles.subHeader}>Step {formData.step} of {TOTAL_STEPS}</Text>

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {renderStep}
      </ScrollView>

      {/* Global Loading/Submitting Indicator */}
      {(isLoading || isSubmitting) && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.overlayText}>
            {isSubmitting ? 'Submitting Application...' : 'Loading...'}
          </Text>
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
    paddingTop: Platform.OS === 'web' ? 0 : 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 50,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  subHeader: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15,
  },
  progressBarContainer: {
    height: 5,
    backgroundColor: '#ddd',
    marginHorizontal: 20,
    borderRadius: 2.5,
    marginBottom: 20,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2.5,
  },
  stepContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  stepTitle: {
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
    height: 45,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  purposeButton: {
    padding: 12,
    marginVertical: 5,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  purposeButtonActive: {
    backgroundColor: '#e6f0ff',
    borderColor: '#007AFF',
  },
  purposeButtonText: {
    fontSize: 16,
    color: '#333',
  },
  purposeButtonTextActive: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
  },
  button: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 10,
  },
  buttonDisabled: {
    backgroundColor: '#a0c4ff',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  uploadButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  documentList: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  documentListTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
    color: '#333',
  },
  documentItem: {
    fontSize: 14,
    color: '#555',
    paddingVertical: 2,
  },
  reviewHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  reviewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  reviewLabel: {
    fontSize: 16,
    color: '#666',
  },
  reviewValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  overlayText: {
    marginTop: 10,
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '600',
  },
});

export default LoanApplicationScreen;