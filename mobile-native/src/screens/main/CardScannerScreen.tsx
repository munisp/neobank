import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
// Note: These packages would need to be installed:
// npm install react-native-vision-camera react-native-text-recognition
// For this implementation, we'll create the structure and logic

interface CardData {
  number: string;
  expiry: string;
  cvv: string;
  name: string;
}

export const CardScannerScreen: React.FC = ({ navigation }: any) => {
  const [hasPermission, setHasPermission] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  const requestCameraPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'NeoBank needs access to your camera to scan cards',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        setHasPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        // iOS permission handling would go here
        // const status = await Camera.requestCameraPermission();
        // setHasPermission(status === 'authorized');
        setHasPermission(true); // Simulated for iOS
      }
    } catch (err) {
      console.error('Permission error:', err);
      setHasPermission(false);
    }
  };

  const processCardImage = async (imageData: string) => {
    try {
      setIsScanning(true);

      // Simulated OCR processing
      // In production, this would use react-native-text-recognition
      // const result = await TextRecognition.recognize(imageData);
      
      // Simulated card data extraction
      const simulatedCardData = extractCardData('SIMULATED_OCR_TEXT');
      
      if (simulatedCardData) {
        setCardData(simulatedCardData);
        Alert.alert(
          'Card Scanned Successfully',
          `Card Number: ${maskCardNumber(simulatedCardData.number)}\nExpiry: ${simulatedCardData.expiry}`,
          [
            {
              text: 'Use This Card',
              onPress: () => handleUseCard(simulatedCardData),
            },
            {
              text: 'Scan Again',
              onPress: () => setCardData(null),
            },
          ]
        );
      } else {
        Alert.alert(
          'Scan Failed',
          'Could not detect card information. Please try again.',
          [{ text: 'OK', onPress: () => setIsScanning(false) }]
        );
      }
    } catch (error) {
      console.error('OCR error:', error);
      Alert.alert('Error', 'Failed to process card image');
    } finally {
      setIsScanning(false);
    }
  };

  const extractCardData = (ocrText: string): CardData | null => {
    // Card number regex: 4 groups of 4 digits
    const cardNumberRegex = /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/;
    // Expiry regex: MM/YY or MM/YYYY
    const expiryRegex = /\b(0[1-9]|1[0-2])\/?([0-9]{2}|[0-9]{4})\b/;
    // CVV regex: 3 or 4 digits
    const cvvRegex = /\b\d{3,4}\b/;
    // Name regex: Capital letters
    const nameRegex = /\b[A-Z]{2,}\s[A-Z]{2,}\b/;

    const cardNumber = ocrText.match(cardNumberRegex)?.[0].replace(/\s/g, '');
    const expiry = ocrText.match(expiryRegex)?.[0];
    const cvv = ocrText.match(cvvRegex)?.[0];
    const name = ocrText.match(nameRegex)?.[0];

    if (cardNumber && expiry) {
      return {
        number: cardNumber,
        expiry: expiry,
        cvv: cvv || '',
        name: name || '',
      };
    }

    return null;
  };

  const validateCardNumber = (cardNumber: string): boolean => {
    // Luhn algorithm for card validation
    let sum = 0;
    let isEven = false;

    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i]);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  };

  const maskCardNumber = (cardNumber: string): string => {
    return cardNumber.replace(/\d(?=\d{4})/g, '*');
  };

  const handleUseCard = (card: CardData) => {
    // Validate card number
    if (!validateCardNumber(card.number)) {
      Alert.alert('Invalid Card', 'The card number is not valid');
      return;
    }

    // Navigate back with card data
    navigation.navigate('PaymentMethod', { scannedCard: card });
  };

  const handleManualEntry = () => {
    navigation.navigate('PaymentMethod', { manualEntry: true });
  };

  const toggleTorch = () => {
    setTorchOn(!torchOn);
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          Camera permission is required to scan cards
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestCameraPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera View Placeholder */}
      <View style={styles.cameraContainer}>
        <View style={styles.cameraPlaceholder}>
          <Text style={styles.cameraText}>📷</Text>
          <Text style={styles.cameraText}>Camera View</Text>
          <Text style={styles.instructionText}>
            Position your card within the frame
          </Text>
        </View>

        {/* Card Frame Overlay */}
        <View style={styles.cardFrame}>
          <View style={styles.corner} style={[styles.corner, styles.topLeft]} />
          <View style={styles.corner} style={[styles.corner, styles.topRight]} />
          <View style={styles.corner} style={[styles.corner, styles.bottomLeft]} />
          <View style={styles.corner} style={[styles.corner, styles.bottomRight]} />
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={toggleTorch}
        >
          <Text style={styles.controlButtonText}>
            {torchOn ? '🔦 Torch On' : '🔦 Torch Off'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.captureButton]}
          onPress={() => processCardImage('SIMULATED_IMAGE_DATA')}
          disabled={isScanning}
        >
          <Text style={styles.captureButtonText}>
            {isScanning ? 'Processing...' : 'Capture Card'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleManualEntry}
        >
          <Text style={styles.controlButtonText}>Manual Entry</Text>
        </TouchableOpacity>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionTitle}>Tips for best results:</Text>
        <Text style={styles.instructionItem}>• Ensure good lighting</Text>
        <Text style={styles.instructionItem}>• Hold phone steady</Text>
        <Text style={styles.instructionItem}>• Avoid glare on card</Text>
        <Text style={styles.instructionItem}>• Keep card flat and centered</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  cameraText: {
    fontSize: 48,
    color: '#fff',
    marginBottom: 10,
  },
  instructionText: {
    fontSize: 16,
    color: '#ccc',
    marginTop: 20,
  },
  cardFrame: {
    position: 'absolute',
    top: '25%',
    left: '10%',
    right: '10%',
    height: 200,
    borderWidth: 2,
    borderColor: '#00ff00',
    borderRadius: 10,
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#00ff00',
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  controls: {
    padding: 20,
    backgroundColor: '#1a1a1a',
  },
  controlButton: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  captureButton: {
    backgroundColor: '#007AFF',
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  instructions: {
    padding: 20,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  instructionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  instructionItem: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 5,
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginHorizontal: 40,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

