/**
 * KYB State Management Store
 * Zustand store for managing KYB application state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { KYBApplication, KYBDocument, UBO } from '../api/kyb-service';

interface KYBState {
  // Current application
  currentApplication: KYBApplication | null;
  
  // UBOs
  ubos: UBO[];
  
  // Documents
  documents: KYBDocument[];
  
  // Loading states
  isLoading: boolean;
  isSubmitting: boolean;
  
  // Error state
  error: string | null;
  
  // Actions
  setCurrentApplication: (application: KYBApplication | null) => void;
  setUBOs: (ubos: UBO[]) => void;
  addUBO: (ubo: UBO) => void;
  updateUBO: (uboId: string, ubo: Partial<UBO>) => void;
  removeUBO: (uboId: string) => void;
  setDocuments: (documents: KYBDocument[]) => void;
  addDocument: (document: KYBDocument) => void;
  setLoading: (loading: boolean) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  reset: () => void;
  
  // Computed properties
  getCompletionPercentage: () => number;
  getTotalOwnership: () => number;
  isComplete: () => boolean;
  canSubmit: () => boolean;
}

const initialState = {
  currentApplication: null,
  ubos: [],
  documents: [],
  isLoading: false,
  isSubmitting: false,
  error: null,
};

export const useKYBStore = create<KYBState>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      setCurrentApplication: (application) => 
        set({ currentApplication: application }),
      
      setUBOs: (ubos) => 
        set({ ubos }),
      
      addUBO: (ubo) => 
        set((state) => ({ 
          ubos: [...state.ubos, ubo] 
        })),
      
      updateUBO: (uboId, ubo) => 
        set((state) => ({
          ubos: state.ubos.map(u => 
            u.ubo_id === uboId ? { ...u, ...ubo } : u
          ),
        })),
      
      removeUBO: (uboId) => 
        set((state) => ({
          ubos: state.ubos.filter(u => u.ubo_id !== uboId),
        })),
      
      setDocuments: (documents) => 
        set({ documents }),
      
      addDocument: (document) => 
        set((state) => ({ 
          documents: [...state.documents, document] 
        })),
      
      setLoading: (loading) => 
        set({ isLoading: loading }),
      
      setSubmitting: (submitting) => 
        set({ isSubmitting: submitting }),
      
      setError: (error) => 
        set({ error }),
      
      clearError: () => 
        set({ error: null }),
      
      reset: () => 
        set(initialState),
      
      getCompletionPercentage: () => {
        const { currentApplication } = get();
        return currentApplication?.completion_percentage || 0;
      },
      
      getTotalOwnership: () => {
        const { ubos } = get();
        return ubos.reduce((total, ubo) => total + ubo.ownership_percentage, 0);
      },
      
      isComplete: () => {
        const { currentApplication, ubos } = get();
        if (!currentApplication) return false;
        
        return currentApplication.cac_verified &&
               currentApplication.ubos_verified &&
               currentApplication.financial_verified &&
               ubos.length > 0;
      },
      
      canSubmit: () => {
        const { currentApplication, isComplete } = get();
        if (!currentApplication) return false;
        
        return isComplete() && 
               currentApplication.status === 'in_progress' &&
               currentApplication.completion_percentage >= 100;
      },
    }),
    {
      name: 'kyb-storage',
      partialize: (state) => ({
        currentApplication: state.currentApplication,
        ubos: state.ubos,
        documents: state.documents,
      }),
    }
  )
);

export default useKYBStore;
