import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { apiService } from '../../services/ApiService';

export const LoanApplicationScreen = ({ navigation }: any) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    loanType: 'personal',
    amount: '',
    term: '',
    purpose: '',
    employmentStatus: '',
    annualIncome: '',
    monthlyExpenses: '',
  });

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await apiService.applyForLoan({
        loan_type: formData.loanType,
        amount: parseFloat(formData.amount),
        term_months: parseInt(formData.term),
        purpose: formData.purpose,
        employment_status: formData.employmentStatus,
        annual_income: parseFloat(formData.annualIncome),
        monthly_expenses: parseFloat(formData.monthlyExpenses),
      });

      Alert.alert(
        'Application Submitted',
        'Your loan application has been submitted successfully. We will review it and get back to you soon.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      Alert.alert(
        'Submission Failed',
        error.response?.data?.detail || 'Failed to submit loan application'
      );
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <View>
      <Text style={styles.stepTitle}>Loan Details</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Loan Type</Text>
        <View style={styles.radioGroup}>
          {['personal', 'business', 'mortgage'].map(type => (
            <TouchableOpacity
              key={type}
              style={[
                styles.radioButton,
                formData.loanType === type && styles.radioButtonActive,
              ]}
              onPress={() => updateField('loanType', type)}
            >
              <Text
                style={[
                  styles.radioText,
                  formData.loanType === type && styles.radioTextActive,
                ]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Loan Amount ($)</Text>
        <TextInput
          style={styles.input}
          value={formData.amount}
          onChangeText={value => updateField('amount', value)}
          placeholder="Enter amount"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Loan Term (months)</Text>
        <TextInput
          style={styles.input}
          value={formData.term}
          onChangeText={value => updateField('term', value)}
          placeholder="Enter term in months"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Purpose</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.purpose}
          onChangeText={value => updateField('purpose', value)}
          placeholder="Describe the purpose of this loan"
          multiline
          numberOfLines={4}
        />
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View>
      <Text style={styles.stepTitle}>Employment Information</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Employment Status</Text>
        <View style={styles.radioGroup}>
          {['employed', 'self-employed', 'unemployed'].map(status => (
            <TouchableOpacity
              key={status}
              style={[
                styles.radioButton,
                formData.employmentStatus === status && styles.radioButtonActive,
              ]}
              onPress={() => updateField('employmentStatus', status)}
            >
              <Text
                style={[
                  styles.radioText,
                  formData.employmentStatus === status && styles.radioTextActive,
                ]}
              >
                {status.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Annual Income ($)</Text>
        <TextInput
          style={styles.input}
          value={formData.annualIncome}
          onChangeText={value => updateField('annualIncome', value)}
          placeholder="Enter annual income"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Monthly Expenses ($)</Text>
        <TextInput
          style={styles.input}
          value={formData.monthlyExpenses}
          onChangeText={value => updateField('monthlyExpenses', value)}
          placeholder="Enter monthly expenses"
          keyboardType="numeric"
        />
      </View>
    </View>
  );

  const renderStep3 = () => {
    const amount = parseFloat(formData.amount || '0');
    const term = parseInt(formData.term || '0');
    const interestRate = 5.5; // Example rate
    const monthlyPayment = amount > 0 && term > 0
      ? (amount * (interestRate / 100 / 12)) / (1 - Math.pow(1 + (interestRate / 100 / 12), -term))
      : 0;

    return (
      <View>
        <Text style={styles.stepTitle}>Review & Submit</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Loan Type:</Text>
            <Text style={styles.summaryValue}>
              {formData.loanType.charAt(0).toUpperCase() + formData.loanType.slice(1)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount:</Text>
            <Text style={styles.summaryValue}>${formData.amount}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Term:</Text>
            <Text style={styles.summaryValue}>{formData.term} months</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Interest Rate:</Text>
            <Text style={styles.summaryValue}>{interestRate}%</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Monthly Payment:</Text>
            <Text style={[styles.summaryValue, styles.highlightValue]}>
              ${monthlyPayment.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Employment</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Status:</Text>
            <Text style={styles.summaryValue}>
              {formData.employmentStatus.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Annual Income:</Text>
            <Text style={styles.summaryValue}>${formData.annualIncome}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Monthly Expenses:</Text>
            <Text style={styles.summaryValue}>${formData.monthlyExpenses}</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          By submitting this application, you agree to our terms and conditions.
          Your application will be reviewed within 2-3 business days.
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        {[1, 2, 3].map(s => (
          <View
            key={s}
            style={[
              styles.progressDot,
              s <= step && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      <ScrollView style={styles.scrollView}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={handleBack}
        >
          <Text style={styles.buttonSecondaryText}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary, loading && styles.buttonDisabled]}
          onPress={handleNext}
          disabled={loading}
        >
          <Text style={styles.buttonPrimaryText}>
            {step === 3 ? (loading ? 'Submitting...' : 'Submit') : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ddd',
  },
  progressDotActive: {
    backgroundColor: '#007AFF',
  },
  scrollView: {
    flex: 1,
    padding: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  textArea: {
    height: 100,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  radioButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  radioButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  radioText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  radioTextActive: {
    color: '#fff',
  },
  summaryCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  highlightValue: {
    fontSize: 18,
    color: '#007AFF',
  },
  disclaimer: {
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
    marginTop: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 24,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  button: {
    flex: 1,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#007AFF',
  },
  buttonSecondary: {
    backgroundColor: '#f0f0f0',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondaryText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
});

