/**
 * Authentication State Management Store
 * Zustand store for managing user authentication state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../api/auth-service';

interface AuthState {
  // User data
  user: User | null;
  
  // Authentication status
  isAuthenticated: boolean;
  
  // Loading state
  isLoading: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setAuthenticated: (authenticated: boolean) => void;
  setLoading: (loading: boolean) => void;
  login: (user: User) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  
  // Computed properties
  hasKYC: () => boolean;
  getKYCStatus: () => string | null;
  getKYCTier: () => string | null;
}

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      setUser: (user) => 
        set({ user, isAuthenticated: !!user }),
      
      setAuthenticated: (authenticated) => 
        set({ isAuthenticated: authenticated }),
      
      setLoading: (loading) => 
        set({ isLoading: loading }),
      
      login: (user) => 
        set({ user, isAuthenticated: true }),
      
      logout: () => {
        // Clear localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
        }
        set(initialState);
      },
      
      updateUser: (updates) => 
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      
      hasKYC: () => {
        const { user } = get();
        return !!user?.kyc_status && user.kyc_status !== 'none';
      },
      
      getKYCStatus: () => {
        const { user } = get();
        return user?.kyc_status || null;
      },
      
      getKYCTier: () => {
        const { user } = get();
        return user?.kyc_tier || null;
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useAuthStore;
