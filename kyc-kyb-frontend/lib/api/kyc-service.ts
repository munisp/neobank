/**
 * KYC API Service
 * Handles all KYC-related API calls
 */

import { apiRequest } from './client';

/**
 * KYC Types
 */
export enum KYCTier {
  BASIC = 'basic',
  ENHANCED = 'enhanced',
  PREMIUM = 'premium',
}

export enum KYCStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REQUIRES_RESUBMISSION = 'requires_resubmission',
}

export enum DocumentType {
  PASSPORT = 'passport',
  DRIVERS_LICENSE = 'drivers_license',
  NATIONAL_ID = 'national_id',
  UTILITY_BILL = 'utility_bill',
  BANK_STATEMENT = 'bank_statement',
  SELFIE = 'selfie',
}

export interface KYCApplication {
  application_id: string;
  user_id: string;
  tier: KYCTier;
  status: KYCStatus;
  created_at: string;
  updated_at: string;
  completion_percentage: number;
  required_documents: DocumentType[];
  submitted_documents: DocumentType[];
}

export interface PersonalInfo {
  first_name: string;
  last_name: string;
  middle_name?: string;
  date_of_birth: string;
  nationality: string;
  phone_number: string;
  email: string;
}

export interface AddressInfo {
  street_address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface IdentityVerification {
  document_type: DocumentType;
  document_number: string;
  issue_date: string;
  expiry_date: string;
  issuing_country: string;
}

export interface BiometricData {
  face_match_score: number;
  liveness_score: number;
  verified: boolean;
}

export interface KYCDocument {
  document_id: string;
  document_type: DocumentType;
  file_name: string;
  file_url: string;
  uploaded_at: string;
  status: 'pending' | 'verified' | 'rejected';
  ocr_data?: Record<string, any>;
}

/**
 * KYC Service
 */
export const kycService = {
  /**
   * Initiate KYC application
   */
  initiateKYC: async (tier: KYCTier): Promise<KYCApplication> => {
    return apiRequest({
      method: 'POST',
      url: '/kyc/initiate',
      data: { tier },
    });
  },

  /**
   * Get KYC application by ID
   */
  getApplication: async (applicationId: string): Promise<KYCApplication> => {
    return apiRequest({
      method: 'GET',
      url: `/kyc/applications/${applicationId}`,
    });
  },

  /**
   * Get user's KYC applications
   */
  getUserApplications: async (): Promise<KYCApplication[]> => {
    return apiRequest({
      method: 'GET',
      url: '/kyc/applications',
    });
  },

  /**
   * Submit personal information
   */
  submitPersonalInfo: async (
    applicationId: string,
    data: PersonalInfo
  ): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: `/kyc/applications/${applicationId}/personal-info`,
      data,
    });
  },

  /**
   * Submit address information
   */
  submitAddressInfo: async (
    applicationId: string,
    data: AddressInfo
  ): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: `/kyc/applications/${applicationId}/address`,
      data,
    });
  },

  /**
   * Submit identity verification
   */
  submitIdentityVerification: async (
    applicationId: string,
    data: IdentityVerification
  ): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: `/kyc/applications/${applicationId}/identity`,
      data,
    });
  },

  /**
   * Upload document
   */
  uploadDocument: async (
    applicationId: string,
    documentType: DocumentType,
    file: File
  ): Promise<KYCDocument> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);

    return apiRequest({
      method: 'POST',
      url: `/kyc/applications/${applicationId}/documents`,
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  /**
   * Get application documents
   */
  getDocuments: async (applicationId: string): Promise<KYCDocument[]> => {
    return apiRequest({
      method: 'GET',
      url: `/kyc/applications/${applicationId}/documents`,
    });
  },

  /**
   * Submit biometric data
   */
  submitBiometric: async (
    applicationId: string,
    selfieFile: File
  ): Promise<BiometricData> => {
    const formData = new FormData();
    formData.append('selfie', selfieFile);

    return apiRequest({
      method: 'POST',
      url: `/kyc/applications/${applicationId}/biometric`,
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  /**
   * Submit application for review
   */
  submitForReview: async (applicationId: string): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: `/kyc/applications/${applicationId}/submit`,
    });
  },

  /**
   * Get AML screening results
   */
  getAMLScreening: async (applicationId: string): Promise<{
    pep_match: boolean;
    sanctions_match: boolean;
    adverse_media: boolean;
    risk_score: number;
  }> => {
    return apiRequest({
      method: 'GET',
      url: `/kyc/applications/${applicationId}/aml-screening`,
    });
  },

  /**
   * Upgrade KYC tier
   */
  upgradeTier: async (
    applicationId: string,
    newTier: KYCTier
  ): Promise<KYCApplication> => {
    return apiRequest({
      method: 'POST',
      url: `/kyc/applications/${applicationId}/upgrade`,
      data: { new_tier: newTier },
    });
  },
};

export default kycService;
