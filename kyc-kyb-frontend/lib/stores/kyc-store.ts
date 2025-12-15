/**
 * KYC State Management Store
 * Zustand store for managing KYC application state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { KYCApplication, KYCDocument, KYCTier } from '../api/kyc-service';

interface KYCState {
  // Current application
  currentApplication: KYCApplication | null;
  
  // Documents
  documents: KYCDocument[];
  
  // Loading states
  isLoading: boolean;
  isSubmitting: boolean;
  
  // Error state
  error: string | null;
  
  // Actions
  setCurrentApplication: (application: KYCApplication | null) => void;
  setDocuments: (documents: KYCDocument[]) => void;
  addDocument: (document: KYCDocument) => void;
  setLoading: (loading: boolean) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  reset: () => void;
  
  // Computed properties
  getCompletionPercentage: () => number;
  isComplete: () => boolean;
  canSubmit: () => boolean;
}

const initialState = {
  currentApplication: null,
  documents: [],
  isLoading: false,
  isSubmitting: false,
  error: null,
};

export const useKYCStore = create<KYCState>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      setCurrentApplication: (application) => 
        set({ currentApplication: application }),
      
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
      
      isComplete: () => {
        const { currentApplication } = get();
        if (!currentApplication) return false;
        
        const requiredDocs = currentApplication.required_documents || [];
        const submittedDocs = currentApplication.submitted_documents || [];
        
        return requiredDocs.every(doc => submittedDocs.includes(doc));
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
      name: 'kyc-storage',
      partialize: (state) => ({
        currentApplication: state.currentApplication,
        documents: state.documents,
      }),
    }
  )
);

export default useKYCStore;
