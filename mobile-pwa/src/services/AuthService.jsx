/**
 * Authentication Service for NeoBank PWA
 * Handles user authentication, token management, and session persistence
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export class AuthService {
  /**
   * Login user with email and password
   * @param {Object} credentials - User credentials
   * @param {string} credentials.email - User email
   * @param {string} credentials.password - User password
   * @returns {Promise<Object>} User data and token
   */
  static async login(credentials) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();
      
      // Store token and user data
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Store in IndexedDB for offline access
      await this.storeOfflineAuth(data);
      
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Register new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} User data and token
   */
  static async register(userData) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Registration failed');
      }

      const data = await response.json();
      
      // Auto-login after registration
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      return data;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  static logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    // Clear IndexedDB
    this.clearOfflineAuth();
  }

  /**
   * Get current user
   * @returns {Object|null} Current user data
   */
  static getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  /**
   * Get auth token
   * @returns {string|null} Auth token
   */
  static getToken() {
    return localStorage.getItem('authToken');
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} Authentication status
   */
  static isAuthenticated() {
    return !!this.getToken();
  }

  /**
   * Validate token
   * @param {string} token - Token to validate
   * @returns {Promise<Object|null>} User data if valid, null otherwise
   */
  static async validateToken(token) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/validate`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.user;
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  }

  /**
   * Refresh auth token
   * @returns {Promise<string>} New token
   */
  static async refreshToken() {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('refreshToken', data.refreshToken);
      
      return data.token;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.logout();
      throw error;
    }
  }

  /**
   * Request password reset
   * @param {string} email - User email
   * @returns {Promise<void>}
   */
  static async requestPasswordReset(email) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Password reset request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Password reset request error:', error);
      throw error;
    }
  }

  /**
   * Reset password with token
   * @param {string} token - Reset token
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   */
  static async resetPassword(token, newPassword) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Password reset failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  }

  /**
   * Change password
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   */
  static async changePassword(currentPassword, newPassword) {
    try {
      const token = this.getToken();
      
      const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Password change failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Password change error:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   * @param {Object} profileData - Profile data to update
   * @returns {Promise<Object>} Updated user data
   */
  static async updateProfile(profileData) {
    try {
      const token = this.getToken();
      
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Profile update failed');
      }

      const data = await response.json();
      
      // Update stored user data
      localStorage.setItem('user', JSON.stringify(data.user));
      
      return data.user;
    } catch (error) {
      console.error('Profile update error:', error);
      throw error;
    }
  }

  /**
   * Store auth data in IndexedDB for offline access
   * @param {Object} authData - Authentication data
   * @returns {Promise<void>}
   */
  static async storeOfflineAuth(authData) {
    try {
      const db = await this.openDB();
      const transaction = db.transaction(['auth'], 'readwrite');
      const store = transaction.objectStore('auth');
      
      await store.put({
        id: 'current',
        ...authData,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Offline auth storage error:', error);
    }
  }

  /**
   * Clear offline auth data
   * @returns {Promise<void>}
   */
  static async clearOfflineAuth() {
    try {
      const db = await this.openDB();
      const transaction = db.transaction(['auth'], 'readwrite');
      const store = transaction.objectStore('auth');
      
      await store.delete('current');
    } catch (error) {
      console.error('Offline auth clear error:', error);
    }
  }

  /**
   * Open IndexedDB
   * @returns {Promise<IDBDatabase>}
   */
  static openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('NeobankPWA', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('auth')) {
          db.createObjectStore('auth', { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Setup biometric authentication (Web Authentication API)
   * @returns {Promise<boolean>} Success status
   */
  static async setupBiometric() {
    try {
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('Biometric authentication not supported');
      }

      const user = this.getCurrentUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create credential
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array(32),
          rp: {
            name: 'NeoBank',
            id: window.location.hostname,
          },
          user: {
            id: new Uint8Array(16),
            name: user.email,
            displayName: user.name,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 60000,
          attestation: 'none',
        },
      });

      // Store credential ID
      localStorage.setItem('biometricCredentialId', credential.id);
      
      return true;
    } catch (error) {
      console.error('Biometric setup error:', error);
      return false;
    }
  }

  /**
   * Authenticate with biometrics
   * @returns {Promise<boolean>} Success status
   */
  static async authenticateWithBiometric() {
    try {
      const credentialId = localStorage.getItem('biometricCredentialId');
      
      if (!credentialId) {
        throw new Error('Biometric not set up');
      }

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: new Uint8Array(32),
          allowCredentials: [{
            id: Uint8Array.from(atob(credentialId), c => c.charCodeAt(0)),
            type: 'public-key',
          }],
          timeout: 60000,
          userVerification: 'required',
        },
      });

      return !!assertion;
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return false;
    }
  }
}

export default AuthService;

// ---------------------------------------------------------------------------
// Module-level namespace API
// Pages use `import * as AuthService from '../services/AuthService'`; these
// named exports make the static class members reachable on the namespace.
// ---------------------------------------------------------------------------
const _Auth = AuthService;

export const login = _Auth.login.bind(_Auth);
export const logout = _Auth.logout.bind(_Auth);
export const register = _Auth.register.bind(_Auth);
export const getCurrentUser = _Auth.getCurrentUser.bind(_Auth);
export const getUser = _Auth.getCurrentUser.bind(_Auth);
export const getToken = _Auth.getToken.bind(_Auth);
export const isAuthenticated = _Auth.isAuthenticated.bind(_Auth);
export const updateProfile = _Auth.updateProfile.bind(_Auth);
export const changePassword = _Auth.changePassword.bind(_Auth);
export const forgotPassword = _Auth.requestPasswordReset.bind(_Auth);
export const resetPassword = _Auth.resetPassword.bind(_Auth);
export const biometricLogin = _Auth.authenticateWithBiometric.bind(_Auth);

export function getAuthStatus() {
  return { isAuthenticated: _Auth.isAuthenticated(), user: _Auth.getCurrentUser() };
}

export async function checkBiometricAvailability() {
  try {
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}
