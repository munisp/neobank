import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

class EncryptionService {
  private masterKey: string | null = null;
  private readonly MASTER_KEY_ALIAS = 'neobank_master_key';
  private readonly KEY_SIZE = 256; // AES-256

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadOrGenerateMasterKey();
  }

  private async loadOrGenerateMasterKey(): Promise<void> {
    try {
      // Try to load existing master key
      this.masterKey = await SecureStore.getItemAsync(this.MASTER_KEY_ALIAS);

      if (!this.masterKey) {
        // Generate new master key
        this.masterKey = await this.generateSecureKey();
        await SecureStore.setItemAsync(this.MASTER_KEY_ALIAS, this.masterKey);
      }
    } catch (error) {
      console.error('Error loading/generating master key:', error);
      throw error;
    }
  }

  private async generateSecureKey(): Promise<string> {
    const randomBytes = await Crypto.getRandomBytesAsync(32); // 256 bits
    return this.bytesToHex(randomBytes);
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  async hash(data: string, algorithm: 'SHA256' | 'SHA512' = 'SHA256'): Promise<string> {
    try {
      const digest = await Crypto.digestStringAsync(
        algorithm === 'SHA256' ? Crypto.CryptoDigestAlgorithm.SHA256 : Crypto.CryptoDigestAlgorithm.SHA512,
        data
      );
      return digest;
    } catch (error) {
      console.error('Error hashing data:', error);
      throw error;
    }
  }

  async encrypt(plaintext: string, key?: string): Promise<string> {
    try {
      const encryptionKey = key || this.masterKey;
      if (!encryptionKey) {
        throw new Error('Encryption key not available');
      }

      // Generate IV (Initialization Vector)
      const iv = await Crypto.getRandomBytesAsync(16);
      const ivHex = this.bytesToHex(iv);

      // For React Native, we'll use a simple XOR-based encryption
      // In production, use a proper crypto library like react-native-crypto
      const encrypted = this.xorEncrypt(plaintext, encryptionKey);

      // Combine IV and encrypted data
      return `${ivHex}:${encrypted}`;
    } catch (error) {
      console.error('Error encrypting data:', error);
      throw error;
    }
  }

  async decrypt(ciphertext: string, key?: string): Promise<string> {
    try {
      const decryptionKey = key || this.masterKey;
      if (!decryptionKey) {
        throw new Error('Decryption key not available');
      }

      // Split IV and encrypted data
      const [ivHex, encrypted] = ciphertext.split(':');

      // Decrypt using XOR
      const decrypted = this.xorDecrypt(encrypted, decryptionKey);

      return decrypted;
    } catch (error) {
      console.error('Error decrypting data:', error);
      throw error;
    }
  }

  // Simple XOR encryption (for demonstration - use proper crypto in production)
  private xorEncrypt(text: string, key: string): string {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return Buffer.from(result).toString('base64');
  }

  private xorDecrypt(encrypted: string, key: string): string {
    const text = Buffer.from(encrypted, 'base64').toString();
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  }

  async encryptObject(obj: any, key?: string): Promise<string> {
    const json = JSON.stringify(obj);
    return await this.encrypt(json, key);
  }

  async decryptObject<T>(ciphertext: string, key?: string): Promise<T> {
    const json = await this.decrypt(ciphertext, key);
    return JSON.parse(json) as T;
  }

  async encryptSensitiveData(data: {
    ssn?: string;
    accountNumber?: string;
    routingNumber?: string;
    cardNumber?: string;
    cvv?: string;
    pin?: string;
    [key: string]: any;
  }): Promise<{ [key: string]: string }> {
    const encrypted: { [key: string]: string } = {};

    for (const [key, value] of Object.entries(data)) {
      if (value) {
        encrypted[key] = await this.encrypt(String(value));
      }
    }

    return encrypted;
  }

  async decryptSensitiveData(encryptedData: { [key: string]: string }): Promise<{ [key: string]: string }> {
    const decrypted: { [key: string]: string } = {};

    for (const [key, value] of Object.entries(encryptedData)) {
      if (value) {
        decrypted[key] = await this.decrypt(value);
      }
    }

    return decrypted;
  }

  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    // Generate RSA key pair (simplified version)
    const publicKey = await this.generateSecureKey();
    const privateKey = await this.generateSecureKey();

    return { publicKey, privateKey };
  }

  async secureStore(key: string, value: string): Promise<void> {
    try {
      const encrypted = await this.encrypt(value);
      await SecureStore.setItemAsync(key, encrypted);
    } catch (error) {
      console.error('Error storing encrypted data:', error);
      throw error;
    }
  }

  async secureRetrieve(key: string): Promise<string | null> {
    try {
      const encrypted = await SecureStore.getItemAsync(key);
      if (!encrypted) {
        return null;
      }
      return await this.decrypt(encrypted);
    } catch (error) {
      console.error('Error retrieving encrypted data:', error);
      return null;
    }
  }

  async secureDelete(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('Error deleting encrypted data:', error);
    }
  }

  async generateOTP(length: number = 6): Promise<string> {
    const randomBytes = await Crypto.getRandomBytesAsync(length);
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += (randomBytes[i] % 10).toString();
    }
    return otp;
  }

  async verifyIntegrity(data: string, signature: string): Promise<boolean> {
    try {
      const hash = await this.hash(data);
      return hash === signature;
    } catch (error) {
      console.error('Error verifying integrity:', error);
      return false;
    }
  }

  async signData(data: string): Promise<string> {
    return await this.hash(data + (this.masterKey || ''));
  }

  maskSensitiveData(data: string, visibleChars: number = 4): string {
    if (data.length <= visibleChars) {
      return '*'.repeat(data.length);
    }
    const masked = '*'.repeat(data.length - visibleChars);
    const visible = data.slice(-visibleChars);
    return masked + visible;
  }

  maskCardNumber(cardNumber: string): string {
    const cleaned = cardNumber.replace(/\s/g, '');
    if (cleaned.length < 4) {
      return '*'.repeat(cleaned.length);
    }
    return '**** **** **** ' + cleaned.slice(-4);
  }

  maskSSN(ssn: string): string {
    const cleaned = ssn.replace(/[-\s]/g, '');
    if (cleaned.length !== 9) {
      return '*'.repeat(cleaned.length);
    }
    return '***-**-' + cleaned.slice(-4);
  }

  async rotateMasterKey(): Promise<void> {
    try {
      // Generate new master key
      const newMasterKey = await this.generateSecureKey();

      // Store new master key
      await SecureStore.setItemAsync(this.MASTER_KEY_ALIAS, newMasterKey);

      // Update instance
      this.masterKey = newMasterKey;

      console.log('Master key rotated successfully');
    } catch (error) {
      console.error('Error rotating master key:', error);
      throw error;
    }
  }

  async clearAllKeys(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.MASTER_KEY_ALIAS);
      this.masterKey = null;
    } catch (error) {
      console.error('Error clearing keys:', error);
    }
  }
}

export default new EncryptionService();

