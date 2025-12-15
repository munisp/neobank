import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Mocking the API client for demonstration. In a real app, this would be an actual
// HTTP client like Axios or fetch wrapper.
const apiClient = {
  post: async (url: string, data: any) => {
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
    if (url.includes('login') && data.email === 'test@neo.bank' && data.password === 'password') {
      return {
        data: {
          accessToken: 'mock_access_token_12345',
          refreshToken: 'mock_refresh_token_67890',
          user: { id: 'user-1', email: data.email, name: 'Neo User', profilePicture: null },
          expiresIn: 3600, // 1 hour
        },
      };
    }
    if (url.includes('register')) {
      return {
        data: {
          accessToken: 'mock_access_token_new',
          refreshToken: 'mock_refresh_token_new',
          user: { id: 'user-new', email: data.email, name: data.name, profilePicture: null },
          expiresIn: 3600,
        },
      };
    }
    if (url.includes('refresh')) {
      if (data.refreshToken === 'mock_refresh_token_67890') {
        return {
          data: {
            accessToken: 'mock_access_token_refreshed',
            expiresIn: 3600,
          },
        };
      }
      throw new Error('Invalid refresh token');
    }
    if (url.includes('profile')) {
        return { data: { success: true, message: 'Profile updated' } };
    }
    if (url.includes('reset-password')) {
        return { data: { success: true, message: 'Password reset link sent' } };
    }
    throw new Error('API Error: Invalid endpoint or credentials');
  },
  get: async (url: string) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (url.includes('profile')) {
        return { data: { id: 'user-1', email: 'test@neo.bank', name: 'Neo User', profilePicture: null } };
    }
    throw new Error('API Error: Invalid endpoint');
  },
};

// --- Biometric Authentication Setup ---
// React Native Biometrics is a mobile-only library. We need a web-compatible mock.
// In a real-world web app, you'd use the Web Authentication API (WebAuthn).
const Biometrics = Platform.OS !== 'web' ? require('react-native-biometrics').default : {
    isSensorAvailable: async () => ({ available: false, biometryType: null }),
    createKeys: async () => ({ publicKey: 'mock_public_key' }),
    deleteKeys: async () => true,
    createSignature: async () => ({ success: true, signature: 'mock_signature' }),
};

// --- TypeScript Interfaces ---

export interface User {
  id: string;
  email: string;
  name: string;
  profilePicture: string | null;
  // Add other user fields as needed
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  name: string;
}

export interface UpdateProfilePayload {
    name?: string;
    // Add other updatable fields
}

export interface AuthServiceError extends Error {
    code?: string;
    isAuthError: boolean;
}

// --- Constants for AsyncStorage Keys ---
const ACCESS_TOKEN_KEY = '@AuthService:accessToken';
const REFRESH_TOKEN_KEY = '@AuthService:refreshToken';
const USER_DATA_KEY = '@AuthService:user';
const BIOMETRIC_KEY_ALIAS = 'NeoBankBiometricKey';

// --- AuthService Class ---

class AuthService {
  private tokens: AuthTokens | null = null;
  private user: User | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    // Initialize the service by loading stored data
    this.loadStoredSession();
  }

  // --- Storage Management ---

  private async loadStoredSession(): Promise<void> {
    try {
      const [accessToken, refreshToken, userData] = await AsyncStorage.multiGet([
        ACCESS_TOKEN_KEY,
        REFRESH_TOKEN_KEY,
        USER_DATA_KEY,
      ]);

      if (accessToken[1] && refreshToken[1] && userData[1]) {
        const user: User = JSON.parse(userData[1]);
        const expiresAt = this.getExpiresAtFromToken(accessToken[1]); // Assuming token has expiry info or we store it separately

        this.tokens = {
          accessToken: accessToken[1],
          refreshToken: refreshToken[1],
          expiresAt: expiresAt || Date.now() + 3600000, // Fallback to 1 hour if no expiry info
        };
        this.user = user;
        console.log('Session loaded from storage.');
      }
    } catch (error) {
      console.error('Failed to load session from storage:', error);
    }
  }

  private async saveTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
    const expiresAt = Date.now() + expiresIn * 1000;
    this.tokens = { accessToken, refreshToken, expiresAt };
    await AsyncStorage.multiSet([
      [ACCESS_TOKEN_KEY, accessToken],
      [REFRESH_TOKEN_KEY, refreshToken],
    ]);
  }

  private async saveUser(user: User): Promise<void> {
    this.user = user;
    await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
  }

  private async clearSession(): Promise<void> {
    this.tokens = null;
    this.user = null;
    await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_DATA_KEY]);
  }

  // Helper to decode token expiry (simplified for mock)
  private getExpiresAtFromToken(token: string): number | null {
    // In a real app, you'd decode the JWT to get 'exp'
    // For this mock, we'll assume the expiry is handled by the server response 'expiresIn'
    return null;
  }

  // --- Session Management & Getters ---

  public isAuthenticated(): boolean {
    if (!this.tokens) return false;
    // Check if access token is expired (give a 5 minute buffer)
    return this.tokens.expiresAt > Date.now() + 300000;
  }

  public getAccessToken(): string | null {
    return this.tokens?.accessToken || null;
  }

  public getUser(): User | null {
    return this.user;
  }

  // --- Core Authentication Methods ---

  public async login(payload: LoginPayload): Promise<User> {
    try {
      const response = await apiClient.post('/auth/login', payload);
      const { accessToken, refreshToken, user, expiresIn } = response.data;

      await this.saveTokens(accessToken, refreshToken, expiresIn);
      await this.saveUser(user);

      return user;
    } catch (error) {
      console.error('Login failed:', error);
      throw this.handleError(error, 'LOGIN_FAILED');
    }
  }

  public async register(payload: RegisterPayload): Promise<User> {
    try {
      const response = await apiClient.post('/auth/register', payload);
      const { accessToken, refreshToken, user, expiresIn } = response.data;

      await this.saveTokens(accessToken, refreshToken, expiresIn);
      await this.saveUser(user);

      return user;
    } catch (error) {
      console.error('Registration failed:', error);
      throw this.handleError(error, 'REGISTER_FAILED');
    }
  }

  public async logout(): Promise<void> {
    try {
      // Optional: Invalidate token on the server
      // await apiClient.post('/auth/logout', { refreshToken: this.tokens?.refreshToken });
    } catch (error) {
      console.warn('Server logout failed, clearing local session anyway:', error);
    } finally {
      await this.clearSession();
    }
  }

  // --- Token Refresh Logic ---

  public async refreshAccessToken(): Promise<string> {
    if (!this.tokens?.refreshToken) {
      await this.clearSession();
      throw this.handleError(new Error('No refresh token available'), 'NO_REFRESH_TOKEN');
    }

    // Request de-duplication: if a refresh is already in progress, return the existing promise
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = new Promise(async (resolve, reject) => {
      try {
        const response = await apiClient.post('/auth/refresh', {
          refreshToken: this.tokens!.refreshToken,
        });

        const { accessToken, expiresIn } = response.data;
        // Keep the old refresh token, update access token
        await this.saveTokens(accessToken, this.tokens!.refreshToken, expiresIn);

        this.isRefreshing = false;
        this.refreshPromise = null;
        resolve(accessToken);
      } catch (error) {
        console.error('Token refresh failed:', error);
        await this.clearSession(); // Force logout on refresh failure
        this.isRefreshing = false;
        this.refreshPromise = null;
        reject(this.handleError(error, 'REFRESH_FAILED'));
      }
    });

    return this.refreshPromise;
  }

  // --- Error Handling ---

  private handleError(error: any, defaultCode: string): AuthServiceError {
    const authError: AuthServiceError = {
      name: 'AuthServiceError',
      message: error.message || 'An unknown authentication error occurred.',
      isAuthError: true,
      code: defaultCode,
    };

    // You can add more sophisticated error parsing here (e.g., checking HTTP status codes)
    if (error.response && error.response.data && error.response.data.code) {
        authError.code = error.response.data.code;
    }

    return authError;
  }

  // --- Advanced Features ---

  public async resetPassword(email: string): Promise<void> {
    try {
      await apiClient.post('/auth/reset-password', { email });
    } catch (error) {
      console.error('Password reset failed:', error);
      throw this.handleError(error, 'PASSWORD_RESET_FAILED');
    }
  }

  public async updateProfile(payload: UpdateProfilePayload): Promise<User> {
    if (!this.isAuthenticated() || !this.user) {
        throw this.handleError(new Error('User not authenticated'), 'NOT_AUTHENTICATED');
    }
    try {
      const response = await apiClient.post('/user/profile', { ...payload, userId: this.user.id });
      // Assuming the API returns the updated user object or we fetch it
      const updatedUser = { ...this.user, ...payload };
      await this.saveUser(updatedUser);
      return updatedUser;
    } catch (error) {
      console.error('Profile update failed:', error);
      throw this.handleError(error, 'PROFILE_UPDATE_FAILED');
    }
  }

  // --- Biometric Authentication ---

  public async isBiometricsAvailable(): Promise<{ available: boolean, type: string | null }> {
    try {
      const { available, biometryType } = await Biometrics.isSensorAvailable();
      return { available, type: biometryType };
    } catch (error) {
      console.error('Biometrics check failed:', error);
      return { available: false, type: null };
    }
  }

  public async enableBiometricAuth(): Promise<boolean> {
    const { available } = await this.isBiometricsAvailable();
    if (!available) {
      throw this.handleError(new Error('Biometric sensor not available'), 'BIOMETRICS_UNAVAILABLE');
    }

    try {
      // 1. Create a new key pair associated with the biometric sensor
      const { publicKey } = await Biometrics.createKeys({
        promptMessage: 'Enable Biometric Login',
        keyAlias: BIOMETRIC_KEY_ALIAS,
        allowDeviceCredentials: true,
      });

      // 2. Send the public key to the server to link it to the user's account
      // In a real app, this would be an API call:
      // await apiClient.post('/auth/biometrics/register', { userId: this.user!.id, publicKey });

      // 3. Store a flag or the public key locally if needed (optional, as the key is managed by the OS)
      // await AsyncStorage.setItem('@AuthService:biometricsEnabled', 'true');

      return true;
    } catch (error) {
      console.error('Biometric enrollment failed:', error);
      throw this.handleError(error, 'BIOMETRICS_ENROLLMENT_FAILED');
    }
  }

  public async biometricLogin(): Promise<User> {
    const { available } = await this.isBiometricsAvailable();
    if (!available) {
      throw this.handleError(new Error('Biometric sensor not available'), 'BIOMETRICS_UNAVAILABLE');
    }

    // 1. Get a challenge from the server
    // const challengeResponse = await apiClient.get('/auth/biometrics/challenge');
    // const challenge = challengeResponse.data.challenge;
    const challenge = 'mock_server_challenge_123'; // Mock challenge

    try {
      // 2. Sign the challenge using the stored private key
      const { success, signature } = await Biometrics.createSignature({
        promptMessage: 'Sign in with Biometrics',
        payload: challenge,
        keyAlias: BIOMETRIC_KEY_ALIAS,
      });

      if (!success) {
        throw new Error('Biometric signature failed or user cancelled.');
      }

      // 3. Send the signature back to the server for verification
      // In a real app, this would be an API call:
      // const response = await apiClient.post('/auth/biometrics/login', { signature, challenge });
      const response = await apiClient.post('/auth/login', { signature, challenge }); // Reusing mock login endpoint

      const { accessToken, refreshToken, user, expiresIn } = response.data;

      await this.saveTokens(accessToken, refreshToken, expiresIn);
      await this.saveUser(user);

      return user;
    } catch (error) {
      console.error('Biometric login failed:', error);
      throw this.handleError(error, 'BIOMETRIC_LOGIN_FAILED');
    }
  }

  public async disableBiometricAuth(): Promise<boolean> {
    try {
      // 1. Delete the key pair from the device
      await Biometrics.deleteKeys({ keyAlias: BIOMETRIC_KEY_ALIAS });

      // 2. Notify the server (optional)
      // await apiClient.post('/auth/biometrics/unregister', { userId: this.user!.id });

      // 3. Clear local flag (optional)
      // await AsyncStorage.removeItem('@AuthService:biometricsEnabled');

      return true;
    } catch (error) {
      console.error('Biometric disable failed:', error);
      throw this.handleError(error, 'BIOMETRICS_DISABLE_FAILED');
    }
  }
}

// Export a singleton instance
export const AuthServiceInstance = new AuthService();
