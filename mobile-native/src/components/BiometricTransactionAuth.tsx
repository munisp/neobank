import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Image,
} from 'react-native';
import BiometricTransactionAuthService, {
  TransactionAuthRequest,
  BiometricAuthResult,
} from '../services/BiometricTransactionAuthService';
import * as Haptics from 'expo-haptics';

interface BiometricTransactionAuthProps {
  visible: boolean;
  transaction: TransactionAuthRequest;
  onSuccess: () => void;
  onCancel: () => void;
  onError: (error: string) => void;
}

export const BiometricTransactionAuth: React.FC<BiometricTransactionAuthProps> = ({
  visible,
  transaction,
  onSuccess,
  onCancel,
  onError,
}) => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('');

  useEffect(() => {
    if (visible) {
      setBiometricType(BiometricTransactionAuthService.getBiometricName());
      authenticateTransaction();
    }
  }, [visible]);

  const authenticateTransaction = async () => {
    setIsAuthenticating(true);

    try {
      const result = await BiometricTransactionAuthService.authenticateTransaction(transaction);

      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess();
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        onError(result.error || 'Authentication failed');
      }
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      onError('An error occurred during authentication');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleRetry = () => {
    authenticateTransaction();
  };

  const getBiometricIcon = () => {
    const types = BiometricTransactionAuthService.getSupportedTypes();
    if (types.includes('facial')) {
      return '👤'; // Face icon
    } else if (types.includes('fingerprint')) {
      return '👆'; // Fingerprint icon
    }
    return '🔒'; // Lock icon
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{getBiometricIcon()}</Text>
          </View>

          <Text style={styles.title}>Authenticate Transaction</Text>

          <View style={styles.transactionDetails}>
            <Text style={styles.transactionType}>
              {transaction.type.replace('_', ' ').toUpperCase()}
            </Text>
            <Text style={styles.amount}>${transaction.amount.toFixed(2)}</Text>
            {transaction.recipient && (
              <Text style={styles.recipient}>to {transaction.recipient}</Text>
            )}
            {transaction.description && (
              <Text style={styles.description}>{transaction.description}</Text>
            )}
          </View>

          {isAuthenticating ? (
            <View style={styles.authenticatingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.authenticatingText}>
                Authenticating with {biometricType}...
              </Text>
            </View>
          ) : (
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={handleRetry}
              >
                <Text style={styles.retryButtonText}>Retry {biometricType}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onCancel}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.securityNote}>
            🔒 Your biometric data never leaves your device
          </Text>
        </View>
      </View>
    </Modal>
  );
};

interface BiometricSetupProps {
  onComplete: (enabled: boolean) => void;
}

export const BiometricSetup: React.FC<BiometricSetupProps> = ({ onComplete }) => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricName, setBiometricName] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkAvailability();
  }, []);

  const checkAvailability = async () => {
    const available = BiometricTransactionAuthService.isAvailableOnDevice();
    const enabled = BiometricTransactionAuthService.isEnabled();
    const name = BiometricTransactionAuthService.getBiometricName();

    setIsAvailable(available);
    setIsEnabled(enabled);
    setBiometricName(name);
  };

  const handleEnable = async () => {
    setIsLoading(true);

    try {
      const result = await BiometricTransactionAuthService.enableBiometricAuth();

      if (result.success) {
        setIsEnabled(true);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onComplete(true);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        alert(result.error || 'Failed to enable biometric authentication');
      }
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      alert('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async () => {
    setIsLoading(true);

    try {
      await BiometricTransactionAuthService.disableBiometricAuth();
      setIsEnabled(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete(false);
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      alert('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAvailable) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.setupTitle}>Biometric Authentication</Text>
        <Text style={styles.unavailableText}>
          Biometric authentication is not available on this device
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.setupContainer}>
      <Text style={styles.setupTitle}>Biometric Authentication</Text>
      <Text style={styles.setupDescription}>
        Use {biometricName} to securely authenticate transactions
      </Text>

      <View style={styles.featureList}>
        <Text style={styles.featureItem}>✓ Fast and secure authentication</Text>
        <Text style={styles.featureItem}>✓ Required for high-value transactions</Text>
        <Text style={styles.featureItem}>✓ Your data never leaves your device</Text>
        <Text style={styles.featureItem}>✓ Can be disabled anytime</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : isEnabled ? (
        <TouchableOpacity
          style={styles.disableButton}
          onPress={handleDisable}
        >
          <Text style={styles.disableButtonText}>Disable {biometricName}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.enableButton}
          onPress={handleEnable}
        >
          <Text style={styles.enableButtonText}>Enable {biometricName}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 16,
  },
  transactionDetails: {
    width: '100%',
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  transactionType: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 8,
    fontWeight: '600',
  },
  amount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  recipient: {
    fontSize: 16,
    color: '#333333',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
  authenticatingContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  authenticatingText: {
    fontSize: 14,
    color: '#666666',
    marginTop: 12,
  },
  buttonContainer: {
    width: '100%',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#333333',
    fontSize: 16,
    fontWeight: '600',
  },
  securityNote: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
  },
  setupContainer: {
    padding: 24,
  },
  setupTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
  },
  setupDescription: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 24,
  },
  unavailableText: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
  featureList: {
    marginBottom: 24,
  },
  featureItem: {
    fontSize: 14,
    color: '#333333',
    marginBottom: 8,
  },
  enableButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  enableButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disableButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  disableButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default BiometricTransactionAuth;

