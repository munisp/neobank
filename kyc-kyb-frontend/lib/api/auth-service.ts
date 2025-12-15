/**
 * Authentication API Service
 * Handles user authentication and authorization
 */

import { apiRequest } from './client';

/**
 * Auth Types
 */
export interface User {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  kyc_status?: string;
  kyc_tier?: string;
  created_at: string;
  is_verified: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ConfirmResetPasswordRequest {
  token: string;
  new_password: string;
}

/**
 * Authentication Service
 */
export const authService = {
  /**
   * User login
   */
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    const response = await apiRequest<AuthResponse>({
      method: 'POST',
      url: '/auth/login',
      data: credentials,
    });

    // Store tokens
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }

    return response;
  },

  /**
   * User registration
   */
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await apiRequest<AuthResponse>({
      method: 'POST',
      url: '/auth/register',
      data,
    });

    // Store tokens
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }

    return response;
  },

  /**
   * User logout
   */
  logout: async (): Promise<void> => {
    try {
      await apiRequest({
        method: 'POST',
        url: '/auth/logout',
      });
    } finally {
      // Clear tokens regardless of API response
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
      }
    }
  },

  /**
   * Refresh access token
   */
  refreshToken: async (refreshToken: string): Promise<AuthResponse> => {
    const response = await apiRequest<AuthResponse>({
      method: 'POST',
      url: '/auth/refresh',
      data: { refresh_token: refreshToken },
    });

    // Update tokens
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);
    }

    return response;
  },

  /**
   * Get current user profile
   */
  getCurrentUser: async (): Promise<User> => {
    return apiRequest({
      method: 'GET',
      url: '/auth/me',
    });
  },

  /**
   * Update user profile
   */
  updateProfile: async (data: Partial<User>): Promise<User> => {
    const response = await apiRequest<User>({
      method: 'PUT',
      url: '/auth/profile',
      data,
    });

    // Update stored user
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(response));
    }

    return response;
  },

  /**
   * Change password
   */
  changePassword: async (data: ChangePasswordRequest): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: '/auth/change-password',
      data,
    });
  },

  /**
   * Request password reset
   */
  requestPasswordReset: async (data: ResetPasswordRequest): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: '/auth/reset-password',
      data,
    });
  },

  /**
   * Confirm password reset
   */
  confirmPasswordReset: async (
    data: ConfirmResetPasswordRequest
  ): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: '/auth/reset-password/confirm',
      data,
    });
  },

  /**
   * Verify email
   */
  verifyEmail: async (token: string): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: '/auth/verify-email',
      data: { token },
    });
  },

  /**
   * Resend verification email
   */
  resendVerificationEmail: async (): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: '/auth/resend-verification',
    });
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: (): boolean => {
    if (typeof window === 'undefined') return false;
    const token = localStorage.getItem('auth_token');
    return !!token;
  },

  /**
   * Get stored user
   */
  getStoredUser: (): User | null => {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },
};

export default authService;
