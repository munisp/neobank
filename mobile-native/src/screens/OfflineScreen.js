import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- Types ---

interface PendingAction {
  id: string;
  type: string;
  timestamp: number;
}

interface CachedDataSummary {
  accounts: number;
  transactions: number;
  payees: number;
}

interface OfflineCapabilities {
  viewAccounts: boolean;
  viewTransactions: boolean;
  initiateTransfers: boolean;
  updateProfile: boolean;
}

// --- Mock Data and Utility Functions ---

const MOCK_CACHED_DATA: CachedDataSummary = {
  accounts: 5,
  transactions: 120,
  payees: 15,
};

const MOCK_CAPABILITIES: OfflineCapabilities = {
  viewAccounts: true,
  viewTransactions: true,
  initiateTransfers: false,
  updateProfile: false,
};

const MOCK_PENDING_ACTIONS: PendingAction[] = [
  { id: 'a1', type: 'Transfer', timestamp: Date.now() - 60000 },
  { id: 'a2', type: 'Bill Payment', timestamp: Date.now() - 120000 },
];

const formatTimestamp = (timestamp: number): string => {
  // Use a simple time format for display
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

// --- Component ---

const OfflineScreen: React.FC = () => {
  // State for offline mode indicator and sync status
  const [isOffline, setIsOffline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number>(
    Date.now() - 3600000, // Initial mock: 1 hour ago
  );
  
  // State for queue pending actions
  const [pendingActions, setPendingActions] = useState<PendingAction[]>(
    MOCK_PENDING_ACTIONS,
  );
  
  // State for cached data display
  const [cachedData, setCachedData] =
    useState<CachedDataSummary>(MOCK_CACHED_DATA);
    
  // Static data for offline capabilities list
  const offlineCapabilities: OfflineCapabilities = MOCK_CAPABILITIES;

  // Simulate network status change (for demonstration and error handling)
  useEffect(() => {
    const interval = setInterval(() => {
      // Toggle offline status every 15 seconds to demonstrate state changes
      setIsOffline(prev => !prev);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Retry connection/sync logic
  const handleRetryConnection = useCallback(() => {
    if (isSyncing) return;

    setIsSyncing(true);
    console.log('Attempting to sync/reconnect...');

    // Simulate network/API call delay (3 seconds)
    setTimeout(() => {
      const success = Math.random() > 0.3; // 70% chance of success

      if (success) {
        // Successful sync/reconnection
        setIsOffline(false);
        setLastSyncTimestamp(Date.now());
        setPendingActions([]); // Clear pending actions on successful sync
        console.log('Sync successful. Online mode restored.');
      } else {
        // Failed sync/reconnection (simulated error handling)
        console.log('Sync failed. Still offline.');
        // In a real app, you might show a toast or error message here
      }

      setIsSyncing(false);
    }, 3000);
  }, [isSyncing]);

  // --- UI Rendering Helpers ---

  // Feature: Offline mode indicator
  const renderStatusIndicator = () => (
    <View
      style={[
        styles.statusContainer,
        isOffline ? styles.offlineStatus : styles.onlineStatus,
      ]}
    >
      <Text style={styles.statusText}>
        {isOffline ? 'OFFLINE MODE' : 'ONLINE MODE'}
      </Text>
    </View>
  );

  // Feature: Sync status and Last sync timestamp
  const renderSyncStatus = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Sync Status</Text>
      <Text style={styles.syncStatusText}>
        {isSyncing
          ? 'Syncing in progress...' // Loading state
          : isOffline
          ? 'Disconnected. Data is stale.' // Error state (offline)
          : 'Connected. Data is up-to-date.'}
      </Text>
      <Text style={styles.lastSyncText}>
        Last Sync: {formatTimestamp(lastSyncTimestamp)}
      </Text>
    </View>
  );

  // Feature: Cached data display
  const renderCachedData = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Cached Data Summary</Text>
      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>Accounts:</Text>
        <Text style={styles.dataValue}>{cachedData.accounts}</Text>
      </View>
      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>Transactions:</Text>
        <Text style={styles.dataValue}>{cachedData.transactions}</Text>
      </View>
      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>Payees:</Text>
        <Text style={styles.dataValue}>{cachedData.payees}</Text>
      </View>
      <Text style={styles.dataHint}>
        This data is available offline but may not be the latest.
      </Text>
    </View>
  );

  // Feature: Queue pending actions
  const renderPendingActions = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Queue Pending Actions</Text>
      <Text style={styles.pendingCount}>
        {pendingActions.length} action(s) waiting to sync
      </Text>
      {pendingActions.length > 0 && (
        <View style={styles.actionList}>
          {pendingActions.map(action => (
            <View key={action.id} style={styles.actionItem}>
              <Text style={styles.actionType}>{action.type}</Text>
              <Text style={styles.actionTime}>
                {formatTimestamp(action.timestamp)}
              </Text>
            </View>
          ))}
        </View>
      )}
      {pendingActions.length === 0 && (
        <Text style={styles.dataHint}>No pending actions to sync.</Text>
      )}
    </View>
  );

  // Feature: Offline capabilities list
  const renderOfflineCapabilities = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Offline Capabilities</Text>
      {Object.entries(offlineCapabilities).map(([key, value]) => (
        <View key={key} style={styles.capabilityRow}>
          <Text style={styles.capabilityLabel}>
            {/* Format camelCase to Title Case */}
            {key.replace(/([A-Z])/g, ' $1').trim()}:
          </Text>
          <Text
            style={[
              styles.capabilityStatus,
              value ? styles.enabled : styles.disabled,
            ]}
          >
            {value ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      ))}
    </View>
  );

  // Feature: Retry connection button (with loading state)
  const renderRetryButton = () => (
    <TouchableOpacity
      style={[styles.button, isSyncing && styles.buttonDisabled]}
      onPress={handleRetryConnection}
      disabled={isSyncing}
    >
      {isSyncing ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.buttonText}>
          {isOffline ? 'RETRY CONNECTION' : 'FORCE SYNC'}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>Offline Utility</Text>

        {renderStatusIndicator()}

        {renderSyncStatus()}

        {renderRetryButton()}

        {renderCachedData()}

        {renderPendingActions()}

        {renderOfflineCapabilities()}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            NeoBank Platform - Offline Mode Utility
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// --- Styles (Responsive design via React Native's StyleSheet) ---

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e3a8a', // NeoBank primary color
    marginBottom: 20,
  },
  // Status Indicator
  statusContainer: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  offlineStatus: {
    backgroundColor: '#ef4444', // Red
  },
  onlineStatus: {
    backgroundColor: '#10b981', // Green
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // Sections
  section: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e3a8a',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 5,
  },
  // Sync Status
  syncStatusText: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 5,
  },
  lastSyncText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  // Retry Button
  button: {
    backgroundColor: '#1e3a8a',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Cached Data
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dataLabel: {
    fontSize: 16,
    color: '#4b5563',
  },
  dataValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  dataHint: {
    marginTop: 10,
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  // Pending Actions
  pendingCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f97316', // Orange for warning
    marginBottom: 10,
  },
  actionList: {
    marginTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
  actionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  actionType: {
    fontSize: 14,
    color: '#4b5563',
  },
  actionTime: {
    fontSize: 14,
    color: '#6b7280',
  },
  // Offline Capabilities
  capabilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  capabilityLabel: {
    fontSize: 16,
    color: '#4b5563',
  },
  capabilityStatus: {
    fontSize: 16,
    fontWeight: '600',
  },
  enabled: {
    color: '#10b981', // Green
  },
  disabled: {
    color: '#ef4444', // Red
  },
  // Footer
  footer: {
    marginTop: 30,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
  },
});

export default OfflineScreen;