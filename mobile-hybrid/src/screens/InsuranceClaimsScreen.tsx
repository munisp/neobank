import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  FlatList,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Mocking the required services from src/services
// In a real application, these would be imported from 'src/services'
interface Claim {
  id: string;
  policyNumber: string;
  claimType: 'Accident' | 'Theft' | 'Damage' | 'Other';
  status: 'Pending' | 'Processing' | 'Approved' | 'Rejected';
  dateFiled: string;
  amount: number;
  description: string;
  documents: string[]; // List of document names
}

interface ClaimForm {
  policyNumber: string;
  claimType: Claim['claimType'];
  description: string;
}

interface ApiService {
  fileClaim: (data: ClaimForm) => Promise<Claim>;
  getClaims: () => Promise<Claim[]>;
  uploadDocument: (claimId: string, file: File) => Promise<string>;
}

interface NotificationService {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
}

// Mock implementation of services for demonstration
const mockApiService: ApiService = {
  fileClaim: async (data: ClaimForm): Promise<Claim> => {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
    const newClaim: Claim = {
      id: `CLM-${Date.now()}`,
      ...data,
      status: 'Pending',
      dateFiled: new Date().toISOString().split('T')[0],
      amount: 0, // Amount is determined later
      documents: [],
    };
    console.log('Claim Filed:', newClaim);
    return newClaim;
  },
  getClaims: async (): Promise<Claim[]> => {
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API delay
    return [
      {
        id: 'CLM-001',
        policyNumber: 'POL-12345',
        claimType: 'Accident',
        status: 'Processing',
        dateFiled: '2025-10-20',
        amount: 5500.0,
        description: 'Minor car accident, fender bender.',
        documents: ['Police Report.pdf', 'Photos.zip'],
      },
      {
        id: 'CLM-002',
        policyNumber: 'POL-67890',
        claimType: 'Theft',
        status: 'Approved',
        dateFiled: '2025-09-15',
        amount: 1200.0,
        description: 'Stolen bicycle from garage.',
        documents: ['Theft Report.pdf'],
      },
      {
        id: 'CLM-003',
        policyNumber: 'POL-12345',
        claimType: 'Damage',
        status: 'Rejected',
        dateFiled: '2025-08-01',
        amount: 0.0,
        description: 'Water damage to basement, claim rejected due to policy exclusion.',
        documents: ['Inspection Report.pdf'],
      },
    ];
  },
  uploadDocument: async (claimId: string, file: File): Promise<string> => {
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
    console.log(`Document uploaded for ${claimId}: ${file.name}`);
    return file.name;
  },
};

const mockNotificationService: NotificationService = {
  notifySuccess: (message: string) => {
    if (Platform.OS === 'web') {
      alert(`SUCCESS: ${message}`);
    } else {
      console.log(`[SUCCESS] ${message}`);
    }
  },
  notifyError: (message: string) => {
    if (Platform.OS === 'web') {
      alert(`ERROR: ${message}`);
    } else {
      console.log(`[ERROR] ${message}`);
    }
  },
};

// --- Component Implementation Starts Here ---

// Define the main component state
interface ScreenState {
  claims: Claim[];
  isLoading: boolean;
  error: string | null;
  activeTab: 'File Claim' | 'Track Status' | 'History';
  claimForm: ClaimForm;
  formErrors: Partial<ClaimForm>;
  newlyFiledClaim: Claim | null;
  isFiling: boolean;
  uploadedFiles: File[]; // State to hold selected files
}

const initialClaimForm: ClaimForm = {
  policyNumber: '',
  claimType: 'Other',
  description: '',
};

const InsuranceClaimsScreen: React.FC = () => {
  // Mock File object for web compatibility in the mock service
  const mockFile = { name: 'mock_document.pdf', size: 1024, type: 'application/pdf' } as unknown as File;
  const [state, setState] = useState<ScreenState>({
    claims: [],
    isLoading: true,
    error: null,
    activeTab: 'File Claim',
    claimForm: initialClaimForm,
    formErrors: {},
    newlyFiledClaim: null,
    isFiling: false,
    uploadedFiles: [],
  });

  // Destructure for easier access
  const { formErrors, uploadedFiles } = state;
  const { claims, isLoading, error, activeTab, claimForm, newlyFiledClaim, isFiling } = state;

  // Function to fetch claim history
  const handleInputChange = (name: keyof ClaimForm, value: string) => {
    setState(s => ({
      ...s,
      claimForm: { ...s.claimForm, [name]: value },
      formErrors: { ...s.formErrors, [name]: undefined }, // Clear error on change
    }));
  };

  const validateForm = (): boolean => {
    const errors: Partial<ClaimForm> = {};
    if (!claimForm.policyNumber.trim()) {
      errors.policyNumber = 'Policy Number is required.';
    }
    if (!claimForm.description.trim()) {
      errors.description = 'Description is required.';
    }

    setState(s => ({ ...s, formErrors: errors }));
    return Object.keys(errors).length === 0;
  };

  const handleSubmitClaim = async () => {
    if (!validateForm()) {
      mockNotificationService.notifyError('Please fill in all required fields.');
      return;
    }

    setState(s => ({ ...s, isFiling: true, error: null }));
    try {
      const newClaim = await mockApiService.fileClaim(claimForm);

      // Upload documents for the new claim
      for (const file of uploadedFiles) {
        await mockApiService.uploadDocument(newClaim.id, file);
      }

      mockNotificationService.notifySuccess(`Claim ${newClaim.id} filed successfully with ${uploadedFiles.length} documents!`);
      setState(s => ({
        ...s,
        newlyFiledClaim: newClaim,
        claimForm: initialClaimForm, // Reset form
        uploadedFiles: [], // Clear uploaded files
        isFiling: false,
        activeTab: 'Track Status', // Switch to track status
      }));
      // Re-fetch claims to update history
      fetchClaims();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to file claim.';
      mockNotificationService.notifyError(errorMessage);
      setState(s => ({ ...s, error: errorMessage, isFiling: false }));
    }
  };

  const handleFileSelect = () => {
    // Mock file selection logic for React Native Web compatibility
    // In a real RN app, you would use a library like react-native-document-picker
    const mockFile1 = { name: 'Police_Report.pdf', size: 1024, type: 'application/pdf' } as unknown as File;
    const mockFile2 = { name: 'Damage_Photos.zip', size: 5120, type: 'application/zip' } as unknown as File;

    // Simulate selecting one or two files
    const newFiles = uploadedFiles.length === 0 ? [mockFile1, mockFile2] : [];

    if (newFiles.length > 0) {
      mockNotificationService.notifySuccess(`${newFiles.length} file(s) selected.`);
    } else {
      mockNotificationService.notifySuccess('Files cleared.');
    }

    setState(s => ({
      ...s,
      uploadedFiles: newFiles,
    }));
  };

  const fetchClaims = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const fetchedClaims = await mockApiService.getClaims();
      setState(s => ({ ...s, claims: fetchedClaims, isLoading: false }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch claims.';
      mockNotificationService.notifyError(errorMessage);
      setState(s => ({ ...s, error: errorMessage, isLoading: false }));
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  // --- UI Components ---

  const TabButton: React.FC<{ title: string; tab: ScreenState['activeTab'] }> = ({ title, tab }) => (
    <TouchableOpacity
      style={[styles.tabButton, activeTab === tab && styles.activeTabButton]}
      onPress={() => setState(s => ({ ...s, activeTab: tab }))}
    >
      <Text style={[styles.tabButtonText, activeTab === tab && styles.activeTabButtonText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Insurance Claims</Text>
      <View style={styles.tabContainer}>
        <TabButton title="File Claim" tab="File Claim" />
        <TabButton title="Track Status" tab="Track Status" />
        <TabButton title="History" tab="History" />
      </View>
    </View>
  );

  // --- Tab Content Implementations ---

  const renderFileClaimTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>File a New Claim</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Policy Number *</Text>
        <TextInput
          style={[styles.input, formErrors.policyNumber && styles.inputError]}
          placeholder="e.g., POL-12345"
          value={claimForm.policyNumber}
          onChangeText={text => handleInputChange('policyNumber', text)}
          editable={!isFiling}
        />
        {formErrors.policyNumber && <Text style={styles.errorTextSmall}>{formErrors.policyNumber}</Text>}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Claim Type *</Text>
        {/* Simple Picker/Dropdown implementation for React Native Web compatibility */}
        <View style={styles.pickerContainer}>
          {['Accident', 'Theft', 'Damage', 'Other'].map(type => (
            <TouchableOpacity
              key={type}
              style={[
                styles.pickerOption,
                claimForm.claimType === type && styles.pickerOptionSelected,
              ]}
              onPress={() => handleInputChange('claimType', type as Claim['claimType'])}
              disabled={isFiling}
            >
              <Text style={styles.pickerOptionText}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Description *</Text>
        <TextInput
          style={[styles.input, styles.textArea, formErrors.description && styles.inputError]}
          placeholder="Briefly describe the incident..."
          value={claimForm.description}
          onChangeText={text => handleInputChange('description', text)}
          multiline
          numberOfLines={4}
          editable={!isFiling}
        />
        {formErrors.description && <Text style={styles.errorTextSmall}>{formErrors.description}</Text>}
      </View>

      {/* Document Upload Implementation */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Supporting Documents (Optional)</Text>
        <TouchableOpacity
          style={[styles.uploadButton, isFiling && styles.uploadButtonDisabled]}
          onPress={handleFileSelect}
          disabled={isFiling}
        >
          <Text style={styles.uploadButtonText}>
            {uploadedFiles.length > 0 ? 'Change Files' : 'Select Files'}
          </Text>
        </TouchableOpacity>
        {uploadedFiles.length > 0 && (
          <View style={styles.fileList}>
            {uploadedFiles.map((file, index) => (
              <Text key={index} style={styles.fileName}>
                • {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </Text>
            ))}
          </View>
        )}
        {uploadedFiles.length === 0 && (
          <Text style={styles.uploadHint}>Max 5 files, PDF/JPG/PNG only.</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.submitButton, isFiling && styles.submitButtonDisabled]}
        onPress={handleSubmitClaim}
        disabled={isFiling}
      >
        {isFiling ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Claim</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const getStatusColor = (status: Claim['status']) => {
    switch (status) {
      case 'Approved':
        return '#34C759'; // Green
      case 'Processing':
        return '#FF9500'; // Orange
      case 'Pending':
        return '#FFCC00'; // Yellow
      case 'Rejected':
        return '#FF3B30'; // Red
      default:
        return '#8e8e93';
    }
  };

  const ClaimItem: React.FC<{ item: Claim }> = ({ item }) => (
    <View style={styles.claimItem}>
      <View style={styles.claimHeader}>
        <Text style={styles.claimId}>Claim ID: {item.id}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.claimDetail}>Policy: {item.policyNumber}</Text>
      <Text style={styles.claimDetail}>Type: {item.claimType}</Text>
      <Text style={styles.claimDetail}>Filed: {item.dateFiled}</Text>
      {item.amount > 0 && (
        <Text style={styles.claimDetail}>Amount: ${item.amount.toFixed(2)}</Text>
      )}
      <Text style={styles.claimDescription} numberOfLines={2}>
        {item.description}
      </Text>
      <Text style={styles.documentCount}>
        Documents: {item.documents.length}
      </Text>
    </View>
  );

  const renderTrackStatusTab = () => {
    // If a claim was just filed, show its status prominently
    if (newlyFiledClaim) {
      return (
        <View style={styles.tabContent}>
          <Text style={styles.sectionTitle}>Your Latest Claim Status</Text>
          <ClaimItem item={newlyFiledClaim} />
          <Text style={styles.subtleText}>
            You can find this and all other claims in the History tab.
          </Text>
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => setState(s => ({ ...s, activeTab: 'History' }))}
          >
            <Text style={styles.historyButtonText}>View All Claims History</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Otherwise, show a prompt
    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>Track Claim Status</Text>
        <Text style={styles.placeholderText}>
          No claim is currently being tracked. File a new claim to see its status here.
        </Text>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => setState(s => ({ ...s, activeTab: 'File Claim' }))}
        >
          <Text style={styles.historyButtonText}>File a New Claim</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderHistoryTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Claim History</Text>
      <FlatList
        data={claims}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ClaimItem item={item} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={() => (
          <Text style={styles.placeholderText}>You have no claim history.</Text>
        )}
      />
    </View>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading claims data...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchClaims}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    switch (activeTab) {
      case 'File Claim':
        return renderFileClaimTab();
      case 'Track Status':
        return renderTrackStatusTab();
      case 'History':
        return renderHistoryTab();
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderHeader()}
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {renderContent()}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    paddingHorizontal: 15,
  },
  contentContainer: {
    paddingBottom: 30,
  },
  header: {
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'web' ? 20 : 0,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1c1c1c',
    marginBottom: 10,
  },
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomColor: '#007AFF',
  },
  tabButtonText: {
    fontSize: 16,
    color: '#8e8e93',
    fontWeight: '600',
  },
  activeTabButtonText: {
    color: '#007AFF',
  },
  tabContent: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1c1c1c',
    marginBottom: 15,
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
    color: '#8e8e93',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
    backgroundColor: '#ffebeb',
    borderRadius: 8,
    margin: 10,
  },
  errorText: {
    fontSize: 16,
    color: '#cc0000',
    marginBottom: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#cc0000',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  // New styles for the form
  formGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#cc0000',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  errorTextSmall: {
    fontSize: 12,
    color: '#cc0000',
    marginTop: 5,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pickerOption: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#007AFF',
    backgroundColor: '#fff',
  },
  pickerOptionSelected: {
    backgroundColor: '#007AFF',
  },
  pickerOptionText: {
    color: '#007AFF',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#a0c8ff',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // New styles for document upload
  uploadButton: {
    backgroundColor: '#34C759', // Green color for upload
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  uploadButtonDisabled: {
    backgroundColor: '#a2e3b5',
  },
  uploadButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  uploadHint: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 5,
  },
  fileList: {
    marginTop: 5,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  fileName: {
    fontSize: 14,
    color: '#333',
    marginBottom: 3,
  },
  placeholderText: {
    color: '#8e8e93',
    fontStyle: 'italic',
    padding: 10,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  // New styles for Claim History and Tracking
  listContent: {
    paddingBottom: 20,
  },
  claimItem: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  claimHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  claimId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1c1c1c',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 15,
  },
  statusText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  claimDetail: {
    fontSize: 14,
    color: '#555',
    marginBottom: 2,
  },
  claimDescription: {
    fontSize: 14,
    color: '#333',
    marginTop: 5,
    fontStyle: 'italic',
  },
  documentCount: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 5,
  },
  subtleText: {
    fontSize: 14,
    color: '#8e8e93',
    textAlign: 'center',
    marginTop: 15,
  },
  historyButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  historyButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default InsuranceClaimsScreen;