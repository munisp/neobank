import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
// Note: Would need to install: npm install react-native-payments @stripe/stripe-react-native

interface PaymentMethod {
  id: string;
  type: 'card' | 'apple_pay' | 'google_pay' | 'bank';
  last4?: string;
  brand?: string;
  isDefault: boolean;
}

interface ApplePayConfig {
  merchantIdentifier: string;
  supportedNetworks: string[];
  merchantCapabilities: string[];
  countryCode: string;
  currencyCode: string;
}

interface GooglePayConfig {
  environment: 'TEST' | 'PRODUCTION';
  merchantName: string;
  allowedCardNetworks: string[];
  allowedCardAuthMethods: string[];
}

export const PaymentMethodScreen: React.FC = ({ navigation, route }: any) => {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [googlePayAvailable, setGooglePayAvailable] = useState(false);

  const scannedCard = route.params?.scannedCard;

  useEffect(() => {
    checkPaymentAvailability();
    loadPaymentMethods();
  }, []);

  const checkPaymentAvailability = async () => {
    try {
      if (Platform.OS === 'ios') {
        // Check Apple Pay availability
        // const available = await ApplePay.canMakePayments();
        setApplePayAvailable(true); // Simulated
      } else if (Platform.OS === 'android') {
        // Check Google Pay availability
        // const available = await GooglePay.isReadyToPay();
        setGooglePayAvailable(true); // Simulated
      }
    } catch (error) {
      console.error('Payment availability check failed:', error);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      setLoading(true);
      // Simulated payment methods
      const methods: PaymentMethod[] = [
        {
          id: '1',
          type: 'card',
          last4: '4242',
          brand: 'Visa',
          isDefault: true,
        },
        {
          id: '2',
          type: 'card',
          last4: '5555',
          brand: 'Mastercard',
          isDefault: false,
        },
      ];

      if (scannedCard) {
        methods.unshift({
          id: 'scanned',
          type: 'card',
          last4: scannedCard.number.slice(-4),
          brand: detectCardBrand(scannedCard.number),
          isDefault: false,
        });
      }

      setPaymentMethods(methods);
    } catch (error) {
      console.error('Failed to load payment methods:', error);
      Alert.alert('Error', 'Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  };

  const detectCardBrand = (cardNumber: string): string => {
    if (cardNumber.startsWith('4')) return 'Visa';
    if (cardNumber.startsWith('5')) return 'Mastercard';
    if (cardNumber.startsWith('3')) return 'American Express';
    if (cardNumber.startsWith('6')) return 'Discover';
    return 'Unknown';
  };

  const handleApplePay = async () => {
    try {
      setLoading(true);

      const applePayConfig: ApplePayConfig = {
        merchantIdentifier: 'merchant.com.neobank',
        supportedNetworks: ['visa', 'mastercard', 'amex'],
        merchantCapabilities: ['3DS', 'debit', 'credit'],
        countryCode: 'US',
        currencyCode: 'USD',
      };

      // Simulated Apple Pay flow
      Alert.alert(
        'Apple Pay',
        'Apple Pay payment would be processed here',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Confirm Payment',
            onPress: () => processApplePayment('apple_pay_token'),
          },
        ]
      );
    } catch (error) {
      console.error('Apple Pay error:', error);
      Alert.alert('Error', 'Apple Pay payment failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGooglePay = async () => {
    try {
      setLoading(true);

      const googlePayConfig: GooglePayConfig = {
        environment: 'TEST',
        merchantName: 'NeoBank',
        allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX'],
        allowedCardAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
      };

      // Simulated Google Pay flow
      Alert.alert(
        'Google Pay',
        'Google Pay payment would be processed here',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Confirm Payment',
            onPress: () => processGooglePayment('google_pay_token'),
          },
        ]
      );
    } catch (error) {
      console.error('Google Pay error:', error);
      Alert.alert('Error', 'Google Pay payment failed');
    } finally {
      setLoading(false);
    }
  };

  const processApplePayment = async (token: string) => {
    try {
      // Send token to backend for processing
      // await apiService.processPayment({ token, type: 'apple_pay' });
      
      Alert.alert(
        'Success',
        'Payment processed successfully with Apple Pay',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Payment processing error:', error);
      Alert.alert('Error', 'Payment processing failed');
    }
  };

  const processGooglePayment = async (token: string) => {
    try {
      // Send token to backend for processing
      // await apiService.processPayment({ token, type: 'google_pay' });
      
      Alert.alert(
        'Success',
        'Payment processed successfully with Google Pay',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Payment processing error:', error);
      Alert.alert('Error', 'Payment processing failed');
    }
  };

  const handleCardPayment = (method: PaymentMethod) => {
    Alert.alert(
      'Card Payment',
      `Pay with ${method.brand} ending in ${method.last4}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => processCardPayment(method.id),
        },
      ]
    );
  };

  const processCardPayment = async (methodId: string) => {
    try {
      setLoading(true);
      // Process card payment
      // await apiService.processPayment({ methodId, type: 'card' });
      
      Alert.alert(
        'Success',
        'Payment processed successfully',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Payment processing error:', error);
      Alert.alert('Error', 'Payment processing failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCard = () => {
    navigation.navigate('CardScanner');
  };

  const handleSetDefault = (methodId: string) => {
    setPaymentMethods(
      paymentMethods.map((m) => ({
        ...m,
        isDefault: m.id === methodId,
      }))
    );
    Alert.alert('Success', 'Default payment method updated');
  };

  const handleRemoveMethod = (methodId: string) => {
    Alert.alert(
      'Remove Payment Method',
      'Are you sure you want to remove this payment method?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setPaymentMethods(paymentMethods.filter((m) => m.id !== methodId));
            Alert.alert('Success', 'Payment method removed');
          },
        },
      ]
    );
  };

  if (loading && paymentMethods.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading payment methods...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Digital Wallets */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Digital Wallets</Text>

        {Platform.OS === 'ios' && applePayAvailable && (
          <TouchableOpacity
            style={[styles.paymentButton, styles.applePayButton]}
            onPress={handleApplePay}
            disabled={loading}
          >
            <Text style={styles.applePayIcon}>🍎</Text>
            <Text style={styles.applePayText}>Pay with Apple Pay</Text>
          </TouchableOpacity>
        )}

        {Platform.OS === 'android' && googlePayAvailable && (
          <TouchableOpacity
            style={[styles.paymentButton, styles.googlePayButton]}
            onPress={handleGooglePay}
            disabled={loading}
          >
            <Text style={styles.googlePayIcon}>G</Text>
            <Text style={styles.googlePayText}>Pay with Google Pay</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Saved Cards */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Saved Cards</Text>
          <TouchableOpacity onPress={handleAddCard}>
            <Text style={styles.addButton}>+ Add Card</Text>
          </TouchableOpacity>
        </View>

        {paymentMethods.map((method) => (
          <View key={method.id} style={styles.paymentMethodCard}>
            <View style={styles.methodInfo}>
              <Text style={styles.methodBrand}>{method.brand}</Text>
              <Text style={styles.methodNumber}>•••• {method.last4}</Text>
              {method.isDefault && (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultText}>Default</Text>
                </View>
              )}
            </View>

            <View style={styles.methodActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleCardPayment(method)}
              >
                <Text style={styles.actionButtonText}>Use</Text>
              </TouchableOpacity>

              {!method.isDefault && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondaryButton]}
                  onPress={() => handleSetDefault(method.id)}
                >
                  <Text style={styles.secondaryButtonText}>Set Default</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionButton, styles.dangerButton]}
                onPress={() => handleRemoveMethod(method.id)}
              >
                <Text style={styles.dangerButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* Security Notice */}
      <View style={styles.securityNotice}>
        <Text style={styles.securityIcon}>🔒</Text>
        <Text style={styles.securityText}>
          All payments are encrypted and secure. Your card information is never stored on your device.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  addButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  paymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  applePayButton: {
    backgroundColor: '#000',
  },
  applePayIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  applePayText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  googlePayButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  googlePayIcon: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4285F4',
    marginRight: 10,
  },
  googlePayText: {
    color: '#333',
    fontSize: 18,
    fontWeight: '600',
  },
  paymentMethodCard: {
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  methodInfo: {
    marginBottom: 10,
  },
  methodBrand: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  methodNumber: {
    fontSize: 14,
    color: '#666',
  },
  defaultBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  defaultText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  methodActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ff3b30',
  },
  dangerButtonText: {
    color: '#ff3b30',
    fontSize: 14,
    fontWeight: '600',
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    marginTop: 20,
    marginBottom: 20,
  },
  securityIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  securityText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

