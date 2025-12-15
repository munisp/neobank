import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNetwork } from '../store/NetworkContext';

export const OfflineIndicator: React.FC = () => {
  const { isConnected, isInternetReachable, syncPending, triggerSync } = useNetwork();

  if (isConnected && isInternetReachable && syncPending === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {!isConnected || !isInternetReachable ? (
        <View style={[styles.banner, styles.offlineBanner]}>
          <Text style={styles.icon}>📡</Text>
          <View style={styles.textContainer}>
            <Text style={styles.title}>You're offline</Text>
            <Text style={styles.subtitle}>
              Changes will be synced when connection is restored
            </Text>
          </View>
        </View>
      ) : syncPending > 0 ? (
        <TouchableOpacity
          style={[styles.banner, styles.syncBanner]}
          onPress={triggerSync}
        >
          <Text style={styles.icon}>🔄</Text>
          <View style={styles.textContainer}>
            <Text style={styles.title}>
              {syncPending} {syncPending === 1 ? 'change' : 'changes'} pending
            </Text>
            <Text style={styles.subtitle}>Tap to sync now</Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingTop: 50, // Account for status bar
  },
  offlineBanner: {
    backgroundColor: '#ff9500',
  },
  syncBanner: {
    backgroundColor: '#007AFF',
  },
  icon: {
    fontSize: 24,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  subtitle: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
  },
});

