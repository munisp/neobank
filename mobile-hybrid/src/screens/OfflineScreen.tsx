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

// --- Mock Service Definitions (Simulating src/services) ---

// Define types for the mock data and service responses
interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: string | null;
  pendingItems: number;
  error: string | null;
}

interface CachedDataStatus {
  totalRecords: number;
  lastCacheUpdate: string | null;
  cacheSizeMB: number;
}

interface OfflineState {
  isConnected: boolean;
  syncStatus: SyncStatus;
  cachedDataStatus: CachedDataStatus;
  isLoading: boolean;
  error: string | null;
}

// Mock function to simulate network connectivity check
const mockCheckConnectivity = async (): Promise<boolean> => {
  // Simulate a network check delay
  await new Promise(resolve => setTimeout(resolve, 500));
  // Randomly return true or false to simulate intermittent connection
  return Math.random() > 0.3;
};

// Mock function to simulate fetching sync status
const mockFetchSyncStatus = async (): Promise<SyncStatus> => {
  await new Promise(resolve => setTimeout(resolve, 800));
  const pending = Math.floor(Math.random() * 10);
  if (pending > 7) {
    return {
      isSyncing: false,
      lastSyncTime: new Date(Date.now() - 3600000).toLocaleTimeString(), // 1 hour ago
      pendingItems: pending,
      error: 'Sync failed: Server unreachable.',
    };
  }
  return {
    isSyncing: pending > 0,
    lastSyncTime: pending === 0 ? new Date().toLocaleTimeString() : null,
    pendingItems: pending,
    error: null,
  };
};

// Mock function to simulate fetching cached data status
const mockFetchCachedDataStatus = async (): Promise<CachedDataStatus> => {
  await new Promise(resolve => setTimeout(resolve, 600));
  return {
    totalRecords: 1542,
    lastCacheUpdate: new Date(Date.now() - 7200000).toLocaleDateString(), // 2 hours ago
    cacheSizeMB: 12.5,
  };
};

// --- Component Implementation ---

const INITIAL_STATE: OfflineState = {
  isConnected: true,
  syncStatus: { isSyncing: false, lastSyncTime: null, pendingItems: 0, error: null },
  cachedDataStatus: { totalRecords: 0, lastCacheUpdate: null, cacheSizeMB: 0 },
  isLoading: true,
  error: null,
};

const OfflineScreen: React.FC = () => {
  const [state, setState] = useState<OfflineState>(INITIAL_STATE);

  const fetchData = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const isConnected = await mockCheckConnectivity();
      const syncStatus = await mockFetchSyncStatus();
      const cachedDataStatus = await mockFetchCachedDataStatus();

      setState({
        isConnected,
        syncStatus,
        cachedDataStatus,
        isLoading: false,
        error: null,
      });
    } catch (e) {
      console.error('Failed to fetch offline status:', e);
      setState(s => ({
        ...s,
        isLoading: false,
        error: 'Could not load offline status. Please try again.',
      }));
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRetry = () => {
    fetchData();
  };

  const renderOfflineIndicator = () => (
    <View style={[styles.indicator, state.isConnected ? styles.online : styles.offline]}>
      <Text style={styles.indicatorText}>
        {state.isConnected ? 'Online Mode' : 'Offline Mode'}
      </Text>
      <Text style={styles.indicatorSubText}>
        {state.isConnected ? 'All services available.' : 'Using cached data. Limited functionality.'}
      </Text>
    </View>
  );

  const renderSyncStatus = () => {
    const { syncStatus } = state;
    let statusText = 'Up to date.';
    let statusColor = styles.successText;

    if (syncStatus.error) {
      statusText = 'Sync Error!';
      statusColor = styles.errorText;
    } else if (syncStatus.isSyncing) {
      statusText = 'Syncing in progress...';
      statusColor = styles.warningText;
    } else if (syncStatus.pendingItems > 0) {
      statusText = `${syncStatus.pendingItems} items pending sync.`;
      statusColor = styles.warningText;
    }

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Data Synchronization</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Status:</Text>
          <Text style={[styles.value, statusColor]}>{statusText}</Text>
        </View>
        {syncStatus.lastSyncTime && (
          <View style={styles.row}>
            <Text style={styles.label}>Last Successful Sync:</Text>
            <Text style={styles.value}>{syncStatus.lastSyncTime}</Text>
          </View>
        )}
        {syncStatus.error && (
          <Text style={styles.errorDetail}>{syncStatus.error}</Text>
        )}
        {syncStatus.isSyncing && <ActivityIndicator style={styles.spinner} size="small" color="#007AFF" />}
      </View>
    );
  };

  const renderCachedDataStatus = () => {
    const { cachedDataStatus } = state;
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cached Data</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Total Records Cached:</Text>
          <Text style={styles.value}>{cachedDataStatus.totalRecords.toLocaleString()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Last Cache Update:</Text>
          <Text style={styles.value}>{cachedDataStatus.lastCacheUpdate || 'N/A'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Cache Size:</Text>
          <Text style={styles.value}>{cachedDataStatus.cacheSizeMB.toFixed(1)} MB</Text>
        </View>
      </View>
    );
  };

  const renderContent = () => {
    if (state.isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading offline status...</Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderOfflineIndicator()}
        {renderSyncStatus()}
        {renderCachedDataStatus()}

        {/* Retry Button */}
        <TouchableOpacity
          style={styles.retryButton}
          onPress={handleRetry}
          disabled={state.isLoading}
        >
          <Text style={styles.retryButtonText}>
            {state.isLoading ? 'Checking...' : 'Retry Connection Check'}
          </Text>
        </TouchableOpacity>

        {state.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Error:</Text>
            <Text style={styles.errorDetail}>{state.error}</Text>
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Offline Status</Text>
      {renderContent()}
    </View>
  );
};

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5', // Light background for the screen
    paddingTop: Platform.OS === 'web' ? 20 : 0, // Web padding
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1c1c1e',
    padding: 20,
    paddingBottom: 10,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  // Indicator Styles
  indicator: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  online: {
    backgroundColor: '#e6ffe6', // Light green
    borderColor: '#4CAF50',
    borderWidth: 1,
  },
  offline: {
    backgroundColor: '#ffe6e6', // Light red
    borderColor: '#F44336',
    borderWidth: 1,
  },
  indicatorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  indicatorSubText: {
    fontSize: 14,
    color: '#444',
    marginTop: 5,
  },
  // Card Styles
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 5,
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  label: {
    fontSize: 16,
    color: '#666',
  },
  value: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1c1c1e',
    },
  // Text Colors
  successText: {
    color: '#4CAF50', // Green
    fontWeight: 'bold',
  },
  warningText: {
    color: '#FF9800', // Orange
    fontWeight: 'bold',
  },
  errorText: {
    color: '#F44336', // Red
    fontWeight: 'bold',
  },
  errorDetail: {
    color: '#F44336',
    fontSize: 14,
    marginTop: 5,
    paddingLeft: 5,
    borderLeftWidth: 2,
    borderLeftColor: '#F44336',
  },
  spinner: {
    marginTop: 10,
  },
  // Button Styles
  retryButton: {
    backgroundColor: '#007AFF', // iOS Blue
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  errorBox: {
    padding: 15,
    backgroundColor: '#fdd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
    marginBottom: 20,
  }
});

export default OfflineScreen;