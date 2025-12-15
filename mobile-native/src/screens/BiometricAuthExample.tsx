import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import BiometricTransactionAuthService, {
  BiometricConfig,
} from '../services/BiometricTransactionAuthService';
import {
  BiometricTransactionAuth,
  BiometricSetup,
} from '../components/BiometricTransactionAuth';

const BiometricAuthExample: React.FC = () => {
  const [config, setConfig] = useState<BiometricConfig | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadConfig();
    loadStats();
  }, []);

  const loadConfig = async () => {
    const currentConfig = BiometricTransactionAuthService.getConfig();
    setConfig(currentConfig);
  };

  const loadStats = async () => {
    const biometricStats = await BiometricTransactionAuthService.getBiometricStats();
    setStats(biometricStats);
  };

  const handleTransactionAuth = () => {
    setShowAuthModal(true);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    Alert.alert('Success', 'Transaction authenticated successfully!');
    loadStats(); // Refresh stats
  };

  const handleAuthCancel = () => {
    setShowAuthModal(false);
    Alert.alert('Cancelled', 'Transaction authentication cancelled');
  };

  const handleAuthError = (error: string) => {
    setShowAuthModal(false);
    Alert.alert('Error', error);
  };

  const updateConfigValue = async (key: keyof BiometricConfig, value: any) => {
    if (!config) return;

    const updates = { [key]: value };
    await BiometricTransactionAuthService.updateConfig(updates);
    await loadConfig();
  };

  const testBiometric = async () => {
    const result = await BiometricTransactionAuthService.testBiometric();
    if (result.success) {
      Alert.alert('Success', `${BiometricTransactionAuthService.getBiometricName()} test successful!`);
    } else {
      Alert.alert('Failed', result.error || 'Biometric test failed');
    }
  };

  if (!config) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Biometric Setup</Text>
        <BiometricSetup
          onComplete={(enabled) => {
            loadConfig();
            Alert.alert(
              enabled ? 'Enabled' : 'Disabled',
              `Biometric authentication ${enabled ? 'enabled' : 'disabled'} successfully`
            );
          }}
        />
      </View>

      {config.enabled && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Configuration</Text>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Require for all transactions</Text>
              <Switch
                value={config.requiredForTransactions}
                onValueChange={(value) =>
                  updateConfigValue('requiredForTransactions', value)
                }
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Require for high-value</Text>
              <Switch
                value={config.requiredForHighValue}
                onValueChange={(value) =>
                  updateConfigValue('requiredForHighValue', value)
                }
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>High-value threshold</Text>
              <Text style={styles.settingValue}>
                ${config.highValueThreshold.toFixed(0)}
              </Text>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Require for login</Text>
              <Switch
                value={config.requiredForLogin}
                onValueChange={(value) =>
                  updateConfigValue('requiredForLogin', value)
                }
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Require for settings</Text>
              <Switch
                value={config.requiredForSettings}
                onValueChange={(value) =>
                  updateConfigValue('requiredForSettings', value)
                }
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Allow PIN fallback</Text>
              <Switch
                value={config.fallbackToPin}
                onValueChange={(value) => updateConfigValue('fallbackToPin', value)}
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Max attempts</Text>
              <Text style={styles.settingValue}>{config.maxAttempts}</Text>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Lockout duration</Text>
              <Text style={styles.settingValue}>
                {config.lockoutDuration} minutes
              </Text>
            </View>
          </View>

          {stats && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Statistics</Text>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Total Attempts</Text>
                <Text style={styles.statValue}>{stats.totalAttempts}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Successful</Text>
                <Text style={[styles.statValue, styles.successText]}>
                  {stats.successfulAttempts}
                </Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Failed</Text>
                <Text style={[styles.statValue, styles.errorText]}>
                  {stats.failedAttempts}
                </Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Success Rate</Text>
                <Text style={styles.statValue}>
                  {(stats.successRate * 100).toFixed(1)}%
                </Text>
              </View>

              {stats.lastAuthDate && (
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Last Authentication</Text>
                  <Text style={styles.statValue}>
                    {new Date(stats.lastAuthDate).toLocaleString()}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Test Authentication</Text>

            <TouchableOpacity
              style={styles.testButton}
              onPress={testBiometric}
            >
              <Text style={styles.testButtonText}>
                Test {BiometricTransactionAuthService.getBiometricName()}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.transactionButton}
              onPress={handleTransactionAuth}
            >
              <Text style={styles.transactionButtonText}>
                Simulate Transaction ($1,500)
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Device Information</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Biometric Available</Text>
              <Text style={styles.infoValue}>
                {BiometricTransactionAuthService.isAvailableOnDevice()
                  ? '✓ Yes'
                  : '✗ No'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Biometric Type</Text>
              <Text style={styles.infoValue}>
                {BiometricTransactionAuthService.getBiometricName()}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supported Types</Text>
              <Text style={styles.infoValue}>
                {BiometricTransactionAuthService.getSupportedTypes().join(', ')}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Failed Attempts</Text>
              <Text style={styles.infoValue}>
                {BiometricTransactionAuthService.getFailedAttempts()} /{' '}
                {config.maxAttempts}
              </Text>
            </View>

            {BiometricTransactionAuthService.getLockedUntil() && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Locked Until</Text>
                <Text style={[styles.infoValue, styles.errorText]}>
                  {BiometricTransactionAuthService.getLockedUntil()?.toLocaleString()}
                </Text>
              </View>
            )}
          </View>
        </>
      )}

      <BiometricTransactionAuth
        visible={showAuthModal}
        transaction={{
          transactionId: 'test_123',
          type: 'transfer',
          amount: 1500,
          recipient: 'John Doe',
          description: 'Test transaction',
          requiresBiometric: true,
        }}
        onSuccess={handleAuthSuccess}
        onCancel={handleAuthCancel}
        onError={handleAuthError}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginVertical: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  settingLabel: {
    fontSize: 16,
    color: '#333333',
  },
  settingValue: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '600',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  statLabel: {
    fontSize: 16,
    color: '#333333',
  },
  statValue: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '600',
  },
  successText: {
    color: '#34C759',
  },
  errorText: {
    color: '#FF3B30',
  },
  testButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  testButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  transactionButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  transactionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666666',
  },
  infoValue: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '600',
  },
});

export default BiometricAuthExample;

