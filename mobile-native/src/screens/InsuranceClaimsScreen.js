import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchClaims,
  fetchClaimDetails,
  fileNewClaim,
  uploadDocuments,
  fetchChatMessages,
  sendMessage,
} from './src/api/claimsApi';

// --- Type Definitions (Imported from claimsApi.js for JSDoc) ---
/**
 * @typedef {import('./src/api/claimsApi').Claim} Claim
 * @typedef {import('./src/api/claimsApi').ClaimTimelineEvent} ClaimTimelineEvent
 * @typedef {import('./src/api/claimsApi').SettlementDetails} SettlementDetails
 * @typedef {import('./src/api/claimsApi').NewClaimPayload} NewClaimPayload
 * @typedef {import('./src/api/claimsApi').ChatMessage} ChatMessage
 */

// --- Constants ---
const VIEWS = {
  HISTORY: 'Claim History',
  NEW_CLAIM: 'File New Claim',
  CLAIM_DETAIL: 'Claim Detail',
};

// --- Utility Components (Simplified for this example) ---

/**
 * @param {{status: string}} props
 */
const StatusBadge = ({ status }) => {
  const getStyle = (s) => {
    switch (s) {
      case 'submitted':
        return { backgroundColor: '#FFC107' };
      case 'under_review':
        return { backgroundColor: '#2196F3' };
      case 'settled':
        return { backgroundColor: '#4CAF50' };
      default:
        return { backgroundColor: '#9E9E9E' };
    }
  };
  return (
    <View style={[styles.statusBadge, getStyle(status)]}>
      <Text style={styles.statusText}>{status.replace('_', ' ').toUpperCase()}</Text>
    </View>
  );
};

/**
 * @param {{claim: Claim, onPress: (claim: Claim) => void}} props
 */
const ClaimHistoryItem = ({ claim, onPress }) => (
  <TouchableOpacity style={styles.claimItem} onPress={() => onPress(claim)}>
    <View style={styles.claimItemHeader}>
      <Text style={styles.claimId}>{claim.id}</Text>
      <StatusBadge status={claim.status} />
    </View>
    <Text style={styles.claimType}>{claim.type}</Text>
    <Text style={styles.claimDate}>Filed: {claim.dateFiled}</Text>
  </TouchableOpacity>
);

// --- Feature Components ---

/**
 * @param {{onClaimFiled: (claim: Claim) => void}} props
 */
const FileNewClaim = ({ onClaimFiled }) => {
  const [policyNumber, setPolicyNumber] = useState('');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!policyNumber || !type || !description) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      /** @type {NewClaimPayload} */
      const payload = { policyNumber, type, description };
      const newClaim = await fileNewClaim(payload);
      Alert.alert('Success', `Claim ${newClaim.id} filed successfully!`);
      onClaimFiled(newClaim);
    } catch (error) {
      Alert.alert('Error', 'Failed to file claim. Please try again.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.sectionTitle}>File a New Claim</Text>
      <TextInput
        style={styles.input}
        placeholder="Policy Number"
        value={policyNumber}
        onChangeText={setPolicyNumber}
      />
      <TextInput
        style={styles.input}
        placeholder="Claim Type (e.g., Auto, Home)"
        value={type}
        onChangeText={setType}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Description of Incident"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
      />
      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Submit Claim</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

/**
 * @param {{claim: Claim, onBack: () => void, onUpdate: (claim: Claim) => void}} props
 */
const ClaimDetailScreen = ({ claim, onBack, onUpdate }) => {
  const [detail, setDetail] = useState(claim);
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedDetail = await fetchClaimDetails(claim.id);
      setDetail(fetchedDetail);
      const messages = await fetchChatMessages(claim.id);
      setChatMessages(messages);
    } catch (error) {
      Alert.alert('Error', 'Failed to load claim details.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [claim.id]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const handleUpload = async () => {
    // Mock file selection and upload
    const mockFiles = ['Receipt.jpg', 'Estimate.pdf'];
    setUploading(true);
    try {
      const updatedClaim = await uploadDocuments(claim.id, mockFiles);
      setDetail(updatedClaim);
      onUpdate(updatedClaim);
      Alert.alert('Success', `${mockFiles.length} documents uploaded.`);
    } catch (error) {
      Alert.alert('Error', 'Failed to upload documents.');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      const sentMessage = await sendMessage(claim.id, newMessage);
      setChatMessages((prev) => [...prev, sentMessage]);
      setNewMessage('');
    } catch (error) {
      Alert.alert('Error', 'Failed to send message.');
      console.error(error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Loading Claim Details...</Text>
      </View>
    );
  }

  /**
   * Renders the Claim Timeline
   * @param {{timeline: ClaimTimelineEvent[]}} props
   */
  const ClaimTimeline = ({ timeline }) => (
    <View style={styles.timelineContainer}>
      <Text style={styles.subSectionTitle}>Claim Timeline</Text>
      {timeline.map((event, index) => (
        <View key={event.id} style={styles.timelineItem}>
          <View style={styles.timelineDot} />
          <View style={styles.timelineContent}>
            <Text style={styles.timelineDate}>{event.date}</Text>
            <Text style={styles.timelineDescription}>{event.description}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  /**
   * Renders the Chat with Adjuster
   * @param {{messages: ChatMessage[]}} props
   */
  const ChatWithAdjuster = ({ messages }) => (
    <View style={styles.chatContainer}>
      <Text style={styles.subSectionTitle}>Chat with Adjuster ({detail.adjusterName})</Text>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.messageBubble, item.sender === 'User' ? styles.userMessage : styles.adjusterMessage]}>
            <Text style={styles.messageText}>{item.message}</Text>
            <Text style={styles.messageTime}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
          </View>
        )}
        style={styles.chatList}
        inverted // Show latest message at the bottom
      />
      <View style={styles.chatInputContainer}>
        <TextInput
          style={styles.chatInput}
          placeholder="Type a message..."
          value={newMessage}
          onChangeText={setNewMessage}
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>{'< Back to History'}</Text>
      </TouchableOpacity>

      <Text style={styles.screenTitle}>{detail.id}</Text>
      <StatusBadge status={detail.status} />

      {/* Claim Status & Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Claim Status & Details</Text>
        <Text style={styles.detailText}>Type: {detail.type}</Text>
        <Text style={styles.detailText}>Filed: {detail.dateFiled}</Text>
        <Text style={styles.detailText}>Adjuster: {detail.adjusterName}</Text>
        <Text style={styles.detailText}>Description: {detail.description}</Text>
      </View>

      {/* Settlement Details */}
      {detail.settlement && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Settlement Details</Text>
          <Text style={styles.detailText}>Amount: ${detail.settlement.approvedAmount.toFixed(2)}</Text>
          <Text style={styles.detailText}>Payment Date: {detail.settlement.paymentDate}</Text>
          <Text style={styles.detailText}>Method: {detail.settlement.method}</Text>
        </View>
      )}

      {/* Upload Photos/Documents */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Documents ({detail.documents.length})</Text>
        <FlatList
          data={detail.documents}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => <Text style={styles.documentItem}>- {item}</Text>}
        />
        <TouchableOpacity style={[styles.button, styles.uploadButton]} onPress={handleUpload} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color="#007AFF" />
          ) : (
            <Text style={styles.uploadButtonText}>Upload Photos/Documents</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Claim Timeline */}
      <ClaimTimeline timeline={detail.timeline} />

      {/* Chat with Adjuster */}
      <ChatWithAdjuster messages={chatMessages} />

      <View style={{ height: 50 }} />
    </ScrollView>
  );
};

/**
 * Main Component: InsuranceClaimsScreen
 */
const InsuranceClaimsScreen = () => {
  /** @type {[Claim[], React.Dispatch<React.SetStateAction<Claim[]>>]} */
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState(VIEWS.HISTORY);
  /** @type {[Claim | null, React.Dispatch<React.SetStateAction<Claim | null>>]} */
  const [selectedClaim, setSelectedClaim] = useState(null);

  const loadClaims = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedClaims = await fetchClaims();
      setClaims(fetchedClaims);
    } catch (err) {
      setError('Failed to load claims history.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  const handleClaimSelect = (claim) => {
    setSelectedClaim(claim);
    setActiveView(VIEWS.CLAIM_DETAIL);
  };

  const handleBackToHistory = () => {
    setSelectedClaim(null);
    setActiveView(VIEWS.HISTORY);
  };

  const handleClaimFiled = (newClaim) => {
    setClaims((prev) => [newClaim, ...prev]);
    handleClaimSelect(newClaim);
  };

  const handleClaimUpdate = (updatedClaim) => {
    setClaims((prev) => prev.map(c => c.id === updatedClaim.id ? updatedClaim : c));
  };

  const renderContent = () => {
    if (activeView === VIEWS.NEW_CLAIM) {
      return <FileNewClaim onClaimFiled={handleClaimFiled} />;
    }

    if (activeView === VIEWS.CLAIM_DETAIL && selectedClaim) {
      return <ClaimDetailScreen claim={selectedClaim} onBack={handleBackToHistory} onUpdate={handleClaimUpdate} />;
    }

    // Default to Claim History
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text>Loading Claims History...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={loadClaims}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.historyContainer}>
        <Text style={styles.sectionTitle}>Claim History ({claims.length})</Text>
        <FlatList
          data={claims}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ClaimHistoryItem claim={item} onPress={handleClaimSelect} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No claims found.</Text>}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      </View>
    );
  };

  const renderTabs = () => {
    if (activeView === VIEWS.CLAIM_DETAIL) return null; // Hide tabs on detail screen

    const tabs = [VIEWS.HISTORY, VIEWS.NEW_CLAIM];
    return (
      <View style={styles.tabContainer}>
        {tabs.map((view) => (
          <TouchableOpacity
            key={view}
            style={[styles.tab, activeView === view && styles.activeTab]}
            onPress={() => setActiveView(view)}
          >
            <Text style={[styles.tabText, activeView === view && styles.activeTabText]}>
              {view}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Claims Management</Text>
      </View>
      {renderTabs()}
      <View style={styles.content}>{renderContent()}</View>
      {/* Notifications feature is implicitly handled by Alert.alert or a dedicated notification system */}
    </SafeAreaView>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  contentContainer: {
    padding: 15,
  },
  header: {
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
    fontSize: 16,
    textAlign: 'center',
  },
  historyContainer: {
    flex: 1,
    padding: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  claimItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  claimItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  claimId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  claimType: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  claimDate: {
    fontSize: 12,
    color: '#999',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 15,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // New Claim Styles
  input: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Claim Detail Styles
  backButton: {
    marginBottom: 15,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 5,
    color: '#333',
  },
  detailText: {
    fontSize: 14,
    marginBottom: 5,
    color: '#555',
  },
  uploadButton: {
    backgroundColor: '#E0E0E0',
    marginTop: 10,
    padding: 10,
  },
  uploadButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  documentItem: {
    fontSize: 14,
    color: '#007AFF',
    textDecorationLine: 'underline',
    marginBottom: 3,
  },
  // Timeline Styles
  timelineContainer: {
    paddingVertical: 10,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
    marginRight: 15,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
  },
  timelineDate: {
    fontSize: 12,
    color: '#999',
  },
  timelineDescription: {
    fontSize: 14,
    color: '#333',
  },
  subSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  // Chat Styles
  chatContainer: {
    height: 300, // Fixed height for chat window
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
  chatList: {
    flex: 1,
    marginBottom: 10,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 15,
    marginBottom: 8,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  adjusterMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0E0E0',
  },
  messageText: {
    color: '#fff',
  },
  messageTime: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    alignSelf: 'flex-end',
    marginTop: 3,
  },
  chatInputContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 10,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 15,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
});

export default InsuranceClaimsScreen;