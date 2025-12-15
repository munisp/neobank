// InsurancePolicyScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  Linking,
  TextInput, // Added TextInput for beneficiary editing
} from 'react-native';
import {
  Policy,
  Coverage,
  Payment,
  Document,
  Beneficiary,
  RenewalInfo,
  PolicyData,
  PolicySection,
} from './types';
import {
  fetchPolicyDetails,
  fetchCoverageBreakdown,
  fetchPaymentHistory,
  fetchPolicyDocuments,
  fetchBeneficiaries,
  fetchRenewalInfo,
  updateBeneficiaries,
  downloadPolicy,
  contactAgent,
} from './mockApi';

// --- Mock Navigation/Routing Props ---
// In a real app, this would come from React Navigation
const mockRoute = {
  params: {
    policyId: 'POL-NB-987654', // Policy ID to fetch
  },
};

// --- Helper Components (Mocked for simplicity) ---

// Simple Modal component for editing beneficiaries
const Modal = ({ visible, onClose, children }) => {
  if (!visible) return null;
  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
          <Text style={styles.modalCloseText}>X</Text>
        </TouchableOpacity>
        {children}
      </View>
    </View>
  );
};

const Icon = ({ name, style }) => <Text style={[{ fontSize: 20 }, style]}>{name}</Text>;
const Button = ({ title, onPress, style, disabled = false }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.button, style, disabled && styles.buttonDisabled]}
    disabled={disabled}
  >
    <Text style={styles.buttonText}>{title}</Text>
  </TouchableOpacity>
);
const Card = ({ title, children, style }) => (
  <View style={[styles.card, style]}>
    {title && <Text style={styles.cardTitle}>{title}</Text>}
    {children}
  </View>
);
const Separator = () => <View style={styles.separator} />;

// --- Main Component ---

const InsurancePolicyScreen = () => {
  const policyId = mockRoute.params.policyId;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [policyData, setPolicyData] = useState<PolicyData>({
    policy: null,
    coverages: [],
    payments: [],
    documents: [],
    beneficiaries: [],
    renewalInfo: null,
  });
  const [activeSection, setActiveSection] = useState<PolicySection>('Details');
  const [isBeneficiaryModalVisible, setIsBeneficiaryModalVisible] = useState(false);
  const [tempBeneficiaries, setTempBeneficiaries] = useState<Beneficiary[]>([]);
  const [isUpdatingBeneficiaries, setIsUpdatingBeneficiaries] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [
        policy,
        coverages,
        payments,
        documents,
        beneficiaries,
        renewalInfo,
      ] = await Promise.all([
        fetchPolicyDetails(policyId),
        fetchCoverageBreakdown(policyId),
        fetchPaymentHistory(policyId),
        fetchPolicyDocuments(policyId),
        fetchBeneficiaries(policyId),
        fetchRenewalInfo(policyId),
      ]);

      setPolicyData({
        policy,
        coverages,
        payments,
        documents,
        beneficiaries,
        renewalInfo,
      });
    } catch (err) {
      console.error(err);
      setError(err.message || 'An unknown error occurred while fetching policy data.');
    } finally {
      setIsLoading(false);
    }
  }, [policyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Action Handlers ---

  const handleDownloadPolicy = async (document: Document) => {
    Alert.alert(
      'Confirm Download',
      `Do you want to download "${document.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: async () => {
            try {
              // In a real app, this would trigger a native download or open the URL
              await downloadPolicy(document.url);
              Alert.alert('Success', `${document.name} download simulated.`);
              // For web/mobile, you might use Linking.openURL(document.url)
              if (Platform.OS === 'web') {
                Linking.openURL(document.url);
              }
            } catch (e) {
              Alert.alert('Error', 'Failed to initiate download.');
            }
          },
        },
      ]
    );
  };

  const handleContactAgent = async () => {
    try {
      await contactAgent(policyId);
      Alert.alert('Success', 'Agent contact request sent. They will call you shortly.');
    } catch (e) {
      Alert.alert('Error', 'Failed to contact agent.');
    }
  };

  const handleUpdateBeneficiaries = async () => {
    const totalPercentage = tempBeneficiaries.reduce((sum, b) => sum + (b.percentage || 0), 0);
    if (totalPercentage !== 100) {
      Alert.alert('Error', `Beneficiary percentages must total 100%. Current total: ${totalPercentage}%`);
      return;
    }

    setIsUpdatingBeneficiaries(true);
    try {
      await updateBeneficiaries(policyId, tempBeneficiaries);
      Alert.alert('Success', 'Beneficiaries updated successfully.');
      setIsBeneficiaryModalVisible(false);
      // Re-fetch data to show updated list
      await fetchData();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update beneficiaries.');
    } finally {
      setIsUpdatingBeneficiaries(false);
    }
  };

  const openBeneficiaryModal = () => {
    setTempBeneficiaries([...policyData.beneficiaries]);
    setIsBeneficiaryModalVisible(true);
  };

  const updateTempBeneficiary = (index: number, key: keyof Beneficiary, value: any) => {
    const newTemps = [...tempBeneficiaries];
    newTemps[index] = { ...newTemps[index], [key]: value };
    setTempBeneficiaries(newTemps);
  };

  // --- Render Functions ---

  const renderLoading = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>Loading Policy Details...</Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.centerContainer}>
      <Icon name="⚠️" style={styles.errorIcon} />
      <Text style={styles.errorText}>Error:</Text>
      <Text style={styles.errorTextDetail}>{error}</Text>
      <Button title="Try Again" onPress={fetchData} style={styles.retryButton} />
    </View>
  );

  const renderHeader = (policy: Policy) => (
    <View style={styles.header}>
      <Text style={styles.policyName}>{policy.name}</Text>
      <Text style={styles.policyId}>Policy ID: {policy.id}</Text>
      <View style={[styles.statusBadge, policy.status === 'Active' ? styles.statusActive : styles.statusInactive]}>
        <Text style={styles.statusText}>{policy.status}</Text>
      </View>
    </View>
  );

  const renderSectionTabs = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainer}>
      {['Details', 'Coverage', 'Payments', 'Documents', 'Beneficiaries', 'Renewal'].map((section) => (
        <TouchableOpacity
          key={section}
          style={[styles.tab, activeSection === section && styles.activeTab]}
          onPress={() => setActiveSection(section as PolicySection)}
        >
          <Text style={[styles.tabText, activeSection === section && styles.activeTabText]}>
            {section}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderPolicyDetails = (policy: Policy) => (
    <Card title="Policy Details">
      <DetailRow label="Policy Holder" value={policy.policyHolder} />
      <DetailRow label="Vehicle" value={policy.vehicle} />
      <DetailRow label="Start Date" value={policy.startDate} />
      <DetailRow label="End Date" value={policy.endDate} />
      <DetailRow label="Premium Amount" value={`$${policy.premiumAmount.toFixed(2)}`} />
      <DetailRow label="Next Payment Due" value={policy.nextPaymentDue} />
    </Card>
  );

  const renderCoverageBreakdown = (coverages: Coverage[]) => (
    <Card title="Coverage Breakdown">
      {coverages.map((c, index) => (
        <View key={c.id} style={styles.coverageItem}>
          <Text style={styles.coverageName}>{c.name}</Text>
          <DetailRow label="Limit" value={c.limit > 0 ? `$${c.limit.toLocaleString()}` : 'N/A'} />
          <DetailRow label="Deductible" value={`$${c.deductible.toLocaleString()}`} />
          <Text style={styles.coverageDetails}>{c.details}</Text>
          {index < coverages.length - 1 && <Separator />}
        </View>
      ))}
    </Card>
  );

  const renderPaymentHistory = (payments: Payment[]) => (
    <Card title="Payment History">
      {payments.map((p, index) => (
        <View key={p.id} style={styles.paymentItem}>
          <DetailRow label="Date" value={p.date} />
          <DetailRow label="Amount" value={`$${p.amount.toFixed(2)}`} />
          <DetailRow label="Method" value={p.method} />
          <DetailRow label="Status" value={p.status} />
          {index < payments.length - 1 && <Separator />}
        </View>
      ))}
    </Card>
  );

  const renderPolicyDocuments = (documents: Document[]) => (
    <Card title="Policy Documents (PDF)">
      {documents.map((d, index) => (
        <View key={d.id} style={styles.documentItem}>
          <View>
            <Text style={styles.documentName}>{d.name}</Text>
            <Text style={styles.documentDate}>Date: {d.date}</Text>
          </View>
          <Button
            title="Download"
            onPress={() => handleDownloadPolicy(d)}
            style={styles.documentDownloadButton}
          />
          {index < documents.length - 1 && <Separator />}
        </View>
      ))}
    </Card>
  );

  const renderBeneficiaries = (beneficiaries: Beneficiary[]) => (
    <Card title="Beneficiaries">
      {beneficiaries.map((b, index) => (
        <View key={b.id} style={styles.beneficiaryItem}>
          <DetailRow label="Name" value={b.name} />
          <DetailRow label="Relationship" value={b.relationship} />
          <DetailRow label="Percentage" value={`${b.percentage}%`} />
          {index < beneficiaries.length - 1 && <Separator />}
        </View>
      ))}
      <Button
        title="Update Beneficiaries"
        onPress={openBeneficiaryModal}
        style={styles.updateButton}
      />
    </Card>
  );

  const renderRenewalInfo = (renewalInfo: RenewalInfo) => (
    <Card title="Renewal Information">
      <DetailRow label="Renewal Date" value={renewalInfo.renewalDate} />
      <DetailRow label="Estimated Premium" value={`$${renewalInfo.renewalPremium.toFixed(2)}`} />
      <DetailRow label="Status" value={renewalInfo.status} />
      <DetailRow label="Action Required" value={renewalInfo.actionRequired ? 'Yes' : 'No'} />
      <Text style={styles.renewalDetails}>{renewalInfo.details}</Text>
      {renewalInfo.actionRequired && (
        <Button title="Renew Now" onPress={() => Alert.alert('Renew Policy', 'Simulating policy renewal process.')} style={styles.updateButton} />
      )}
    </Card>
  );

  const renderBeneficiaryModal = () => (
    <Modal visible={isBeneficiaryModalVisible} onClose={() => setIsBeneficiaryModalVisible(false)}>
      <Text style={styles.modalTitle}>Edit Beneficiaries</Text>
      {tempBeneficiaries.map((b, index) => (
        <View key={index} style={styles.modalBeneficiaryItem}>
          <Text style={styles.modalBeneficiaryName}>{b.name} ({b.relationship})</Text>
          <View style={styles.modalInputGroup}>
            <Text style={styles.modalInputLabel}>Percentage:</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={String(b.percentage)}
              onChangeText={(text) => updateTempBeneficiary(index, 'percentage', parseInt(text) || 0)}
            />
          </View>
        </View>
      ))}
      <Text style={styles.modalTotal}>Total Percentage: {tempBeneficiaries.reduce((sum, b) => sum + (b.percentage || 0), 0)}%</Text>
      <Button
        title={isUpdatingBeneficiaries ? 'Updating...' : 'Save Changes'}
        onPress={handleUpdateBeneficiaries}
        disabled={isUpdatingBeneficiaries}
        style={styles.modalSaveButton}
      />
    </Modal>
  );

  const renderSectionContent = () => {
    if (!policyData.policy) return null;

    switch (activeSection) {
      case 'Details':
        return renderPolicyDetails(policyData.policy);
      case 'Coverage':
        return renderCoverageBreakdown(policyData.coverages);
      case 'Payments':
        return renderPaymentHistory(policyData.payments);
      case 'Documents':
        return renderPolicyDocuments(policyData.documents);
      case 'Beneficiaries':
        return renderBeneficiaries(policyData.beneficiaries);
      case 'Renewal':
        return policyData.renewalInfo ? renderRenewalInfo(policyData.renewalInfo) : <Text style={styles.placeholderText}>No renewal information available.</Text>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return renderLoading();
  }

  if (error) {
    return renderError();
  }

  const policy = policyData.policy;
  if (!policy) {
    return renderError(); // Should not happen if error is handled, but for safety
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderHeader(policy)}
        {renderSectionTabs()}
        <View style={styles.contentArea}>
          {renderSectionContent()}
        </View>
      </ScrollView>
      <View style={styles.footerActions}>
        <Button
          title="Download Policy"
          // We'll use the first document as the main policy document for this button
          onPress={() => policyData.documents.length > 0 ? handleDownloadPolicy(policyData.documents[0]) : Alert.alert('Error', 'No documents available to download.')}
          style={styles.footerButton}
          disabled={policyData.documents.length === 0}
        />
        <Button
          title="Contact Agent"
          onPress={handleContactAgent}
          style={[styles.footerButton, styles.contactButton]}
        />
      </View>
      {renderBeneficiaryModal()}
    </View>
  );
};

// --- Detail Row Component ---
const DetailRow = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  scrollContent: {
    paddingBottom: 100, // Space for footer actions
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  errorIcon: {
    fontSize: 40,
    color: '#D32F2F',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D32F2F',
  },
  errorTextDetail: {
    fontSize: 14,
    color: '#D32F2F',
    textAlign: 'center',
    marginTop: 5,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  policyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  policyId: {
    fontSize: 14,
    color: '#777',
    marginTop: 5,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 15,
    marginTop: 10,
  },
  statusActive: {
    backgroundColor: '#4CAF50',
  },
  statusInactive: {
    backgroundColor: '#FF9800',
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  tabContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  tab: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginHorizontal: 5,
    borderRadius: 20,
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
  },
  contentArea: {
    padding: 15,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#777',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    maxWidth: '60%',
    textAlign: 'right',
  },
  // --- Feature Specific Styles ---
  coverageItem: {
    marginBottom: 10,
  },
  coverageName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 5,
  },
  coverageDetails: {
    fontSize: 12,
    color: '#555',
    marginTop: 5,
  },
  paymentItem: {
    marginBottom: 10,
  },
  documentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  documentDate: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  documentDownloadButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#4CAF50',
    borderRadius: 5,
  },
  beneficiaryItem: {
    marginBottom: 10,
  },
  updateButton: {
    marginTop: 15,
    backgroundColor: '#FF9500',
  },
  renewalDetails: {
    fontSize: 14,
    color: '#555',
    marginTop: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  // --- Modal Styles ---
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    maxHeight: '80%',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 5,
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalBeneficiaryItem: {
    marginBottom: 15,
    padding: 10,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 5,
  },
  modalBeneficiaryName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  modalInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  modalInputLabel: {
    fontSize: 14,
    color: '#555',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 8,
    width: '50%',
    textAlign: 'right',
  },
  modalTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    textAlign: 'right',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  modalSaveButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
  },
  separator: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
  placeholderText: {
    textAlign: 'center',
    padding: 30,
    color: '#999',
    fontStyle: 'italic',
  },
  footerActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 15,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  footerButton: {
    flex: 1,
    marginHorizontal: 5,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
  },
  contactButton: {
    backgroundColor: '#FF9500',
  },
  button: {
    // Defined in footerButton, but kept for helper component
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  }
});

export default InsurancePolicyScreen;