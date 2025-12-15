/**
 * SecureQRScanner Component - Native Mobile
 * 
 * Features:
 * - Camera-based QR code scanning
 * - Real-time QR code detection
 * - Secure QR code verification
 * - Encryption/decryption
 * - Expiration checking
 * - Signature verification
 * - Anti-fraud protection
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Vibration,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import { useScanBarcodes, BarcodeFormat } from 'vision-camera-code-scanner';
import { EncryptionService } from '../services/EncryptionService';
import { QRPaymentService } from '../services/QRPaymentService';
import { AnalyticsEngineService } from '../services/AnalyticsEngineService';

interface SecureQRData {
  type: 'payment' | 'transfer' | 'merchant' | 'p2p';
  version: string;
  payload: any;
  signature: string;
  timestamp: number;
  expiresAt: number;
  nonce: string;
  encrypted: boolean;
}

interface SecureQRScannerProps {
  onScanSuccess: (data: SecureQRData) => void;
  onScanError: (error: Error) => void;
  onClose: () => void;
  allowedTypes?: Array<'payment' | 'transfer' | 'merchant' | 'p2p'>;
  requireEncryption?: boolean;
  maxAge?: number; // Maximum age in seconds
}

export const SecureQRScanner: React.FC<SecureQRScannerProps> = ({
  onScanSuccess,
  onScanError,
  onClose,
  allowedTypes = ['payment', 'transfer', 'merchant', 'p2p'],
  requireEncryption = true,
  maxAge = 300, // 5 minutes default
}) => {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [scanCount, setScanCount] = useState<number>(0);
  const [lastScanTime, setLastScanTime] = useState<number>(0);
  
  const devices = useCameraDevices();
  const device = devices.back;
  
  const scanLinePosition = useRef(new Animated.Value(0)).current;
  const frameOpacity = useRef(new Animated.Value(1)).current;

  // QR code scanner configuration
  const [frameProcessor, barcodes] = useScanBarcodes([BarcodeFormat.QR_CODE], {
    checkInverted: true,
  });

  useEffect(() => {
    checkCameraPermission();
    startScanAnimation();
    
    return () => {
      stopScanAnimation();
    };
  }, []);

  useEffect(() => {
    if (barcodes && barcodes.length > 0 && isScanning && !isProcessing) {
      handleBarcodeScan(barcodes[0]);
    }
  }, [barcodes]);

  const checkCameraPermission = async () => {
    try {
      const status = await Camera.getCameraPermissionStatus();
      
      if (status === 'authorized') {
        setHasPermission(true);
      } else {
        const newStatus = await Camera.requestCameraPermission();
        setHasPermission(newStatus === 'authorized');
        
        if (newStatus !== 'authorized') {
          Alert.alert(
            'Camera Permission Required',
            'Please grant camera permission to scan QR codes.',
            [{ text: 'OK', onPress: onClose }]
          );
        }
      }
    } catch (error) {
      console.error('Error checking camera permission:', error);
      onScanError(new Error('Failed to check camera permission'));
    }
  };

  const startScanAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLinePosition, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanLinePosition, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(frameOpacity, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(frameOpacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopScanAnimation = () => {
    scanLinePosition.stopAnimation();
    frameOpacity.stopAnimation();
  };

  const handleBarcodeScan = async (barcode: any) => {
    // Prevent rapid scanning
    const now = Date.now();
    if (now - lastScanTime < 1000) {
      return;
    }
    setLastScanTime(now);

    setIsProcessing(true);
    setIsScanning(false);

    try {
      // Vibrate on scan
      Vibration.vibrate(100);

      // Parse QR code data
      const rawData = barcode.rawValue || barcode.displayValue;
      if (!rawData) {
        throw new Error('Empty QR code');
      }

      // Verify and decrypt QR code
      const verifiedData = await verifySecureQRCode(rawData);

      // Track successful scan
      await AnalyticsEngineService.trackEvent('qr_scan_success', {
        type: verifiedData.type,
        encrypted: verifiedData.encrypted,
        scanCount: scanCount + 1,
      });

      setScanCount(scanCount + 1);

      // Success feedback
      Vibration.vibrate([0, 100, 100, 100]);
      
      onScanSuccess(verifiedData);
    } catch (error) {
      console.error('QR scan error:', error);
      
      // Track failed scan
      await AnalyticsEngineService.trackEvent('qr_scan_error', {
        error: error.message,
        scanCount: scanCount + 1,
      });

      // Error feedback
      Vibration.vibrate([0, 200, 100, 200]);
      
      Alert.alert(
        'Invalid QR Code',
        error.message || 'The QR code could not be verified. Please try again.',
        [
          {
            text: 'Retry',
            onPress: () => {
              setIsProcessing(false);
              setIsScanning(true);
            },
          },
          {
            text: 'Cancel',
            onPress: onClose,
            style: 'cancel',
          },
        ]
      );
    }
  };

  const verifySecureQRCode = async (rawData: string): Promise<SecureQRData> => {
    try {
      // Step 1: Parse JSON
      let qrData: SecureQRData;
      try {
        qrData = JSON.parse(rawData);
      } catch {
        throw new Error('Invalid QR code format');
      }

      // Step 2: Validate structure
      if (!qrData.type || !qrData.version || !qrData.payload) {
        throw new Error('Missing required fields');
      }

      // Step 3: Check QR code type
      if (!allowedTypes.includes(qrData.type)) {
        throw new Error(`QR code type '${qrData.type}' not allowed`);
      }

      // Step 4: Check version compatibility
      if (!isVersionCompatible(qrData.version)) {
        throw new Error(`Unsupported QR code version: ${qrData.version}`);
      }

      // Step 5: Check expiration
      const now = Date.now();
      if (qrData.expiresAt && qrData.expiresAt < now) {
        const expiredMinutes = Math.floor((now - qrData.expiresAt) / 60000);
        throw new Error(`QR code expired ${expiredMinutes} minutes ago`);
      }

      // Step 6: Check age
      if (qrData.timestamp) {
        const age = (now - qrData.timestamp) / 1000;
        if (age > maxAge) {
          throw new Error(`QR code is too old (${Math.floor(age / 60)} minutes)`);
        }
      }

      // Step 7: Verify encryption requirement
      if (requireEncryption && !qrData.encrypted) {
        throw new Error('QR code must be encrypted');
      }

      // Step 8: Decrypt payload if encrypted
      let decryptedPayload = qrData.payload;
      if (qrData.encrypted) {
        try {
          decryptedPayload = await EncryptionService.decrypt(
            qrData.payload,
            qrData.nonce
          );
          decryptedPayload = JSON.parse(decryptedPayload);
        } catch (error) {
          throw new Error('Failed to decrypt QR code');
        }
      }

      // Step 9: Verify signature
      if (qrData.signature) {
        const isValid = await verifySignature(qrData, decryptedPayload);
        if (!isValid) {
          throw new Error('Invalid QR code signature');
        }
      }

      // Step 10: Validate payload based on type
      validatePayload(qrData.type, decryptedPayload);

      // Step 11: Check for replay attacks (nonce)
      if (qrData.nonce) {
        const isReplay = await checkReplayAttack(qrData.nonce);
        if (isReplay) {
          throw new Error('QR code has already been used');
        }
      }

      // Return verified data with decrypted payload
      return {
        ...qrData,
        payload: decryptedPayload,
      };
    } catch (error) {
      throw error;
    }
  };

  const isVersionCompatible = (version: string): boolean => {
    const supportedVersions = ['1.0', '1.1', '2.0'];
    return supportedVersions.includes(version);
  };

  const verifySignature = async (
    qrData: SecureQRData,
    payload: any
  ): Promise<boolean> => {
    try {
      // Reconstruct the data that was signed
      const dataToVerify = JSON.stringify({
        type: qrData.type,
        version: qrData.version,
        payload: payload,
        timestamp: qrData.timestamp,
        expiresAt: qrData.expiresAt,
        nonce: qrData.nonce,
      });

      // Verify signature using EncryptionService
      const isValid = await EncryptionService.verifySignature(
        dataToVerify,
        qrData.signature
      );

      return isValid;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  };

  const validatePayload = (type: string, payload: any): void => {
    switch (type) {
      case 'payment':
        if (!payload.amount || !payload.currency || !payload.recipient) {
          throw new Error('Invalid payment QR code');
        }
        if (payload.amount <= 0) {
          throw new Error('Invalid payment amount');
        }
        break;

      case 'transfer':
        if (!payload.accountNumber || !payload.amount) {
          throw new Error('Invalid transfer QR code');
        }
        break;

      case 'merchant':
        if (!payload.merchantId || !payload.amount) {
          throw new Error('Invalid merchant QR code');
        }
        break;

      case 'p2p':
        if (!payload.userId || !payload.amount) {
          throw new Error('Invalid P2P QR code');
        }
        break;

      default:
        throw new Error(`Unknown QR code type: ${type}`);
    }
  };

  const checkReplayAttack = async (nonce: string): Promise<boolean> => {
    try {
      // Check if nonce has been used before
      const hasBeenUsed = await QRPaymentService.checkNonceUsed(nonce);
      
      if (!hasBeenUsed) {
        // Mark nonce as used
        await QRPaymentService.markNonceUsed(nonce);
      }
      
      return hasBeenUsed;
    } catch (error) {
      console.error('Replay attack check error:', error);
      return false;
    }
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          Camera permission required to scan QR codes
        </Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>No camera device found</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { width, height } = Dimensions.get('window');
  const scanAreaSize = width * 0.7;
  const scanLineY = scanLinePosition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, scanAreaSize],
  });

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isScanning}
        frameProcessor={frameProcessor}
        frameProcessorFps={5}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top overlay */}
        <View style={styles.overlayTop} />

        {/* Middle row with scan area */}
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          
          {/* Scan area */}
          <View style={[styles.scanArea, { width: scanAreaSize, height: scanAreaSize }]}>
            {/* Corner markers */}
            <Animated.View style={[styles.cornerTopLeft, { opacity: frameOpacity }]} />
            <Animated.View style={[styles.cornerTopRight, { opacity: frameOpacity }]} />
            <Animated.View style={[styles.cornerBottomLeft, { opacity: frameOpacity }]} />
            <Animated.View style={[styles.cornerBottomRight, { opacity: frameOpacity }]} />

            {/* Scanning line */}
            {isScanning && !isProcessing && (
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    transform: [{ translateY: scanLineY }],
                  },
                ]}
              />
            )}

            {/* Processing indicator */}
            {isProcessing && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={styles.processingText}>Verifying...</Text>
              </View>
            )}
          </View>

          <View style={styles.overlaySide} />
        </View>

        {/* Bottom overlay */}
        <View style={styles.overlayBottom}>
          <Text style={styles.instructionText}>
            {isProcessing
              ? 'Verifying QR code...'
              : 'Position QR code within the frame'}
          </Text>
          
          <View style={styles.statsContainer}>
            <Text style={styles.statsText}>Scans: {scanCount}</Text>
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    flex: 1,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  scanArea: {
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  cornerTopLeft: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#4CAF50',
  },
  cornerTopRight: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#4CAF50',
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#4CAF50',
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#4CAF50',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600',
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 40,
  },
  statsContainer: {
    marginBottom: 20,
  },
  statsText: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.7,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    margin: 40,
  },
});

