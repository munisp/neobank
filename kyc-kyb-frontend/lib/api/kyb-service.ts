/**
 * KYB (Know Your Business) API Service
 * Handles all KYB-related API calls
 */

import { apiRequest } from './client';

/**
 * KYB Types
 */
export enum KYBStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REQUIRES_RESUBMISSION = 'requires_resubmission',
}

export enum BusinessType {
  SOLE_PROPRIETORSHIP = 'sole_proprietorship',
  PARTNERSHIP = 'partnership',
  LIMITED_LIABILITY = 'limited_liability',
  CORPORATION = 'corporation',
  NON_PROFIT = 'non_profit',
}

export interface KYBApplication {
  application_id: string;
  user_id: string;
  business_name: string;
  status: KYBStatus;
  created_at: string;
  updated_at: string;
  completion_percentage: number;
  cac_verified: boolean;
  ubos_verified: boolean;
  financial_verified: boolean;
}

export interface BusinessInfo {
  business_name: string;
  business_type: BusinessType;
  registration_number: string;
  tax_id: string;
  incorporation_date: string;
  country_of_incorporation: string;
  business_address: {
    street_address: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  industry: string;
  website?: string;
  phone_number: string;
  email: string;
}

export interface UBO {
  ubo_id?: string;
  full_name: string;
  date_of_birth: string;
  nationality: string;
  ownership_percentage: number;
  position: string;
  id_document_type: string;
  id_document_number: string;
  address: {
    street_address: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}

export interface CACVerification {
  verified: boolean;
  company_name: string;
  rc_number: string;
  registration_date: string;
  company_type: string;
  status: string;
  address: string;
  directors: Array<{
    name: string;
    position: string;
  }>;
}

export interface FinancialInfo {
  annual_revenue: number;
  revenue_currency: string;
  number_of_employees: number;
  expected_transaction_volume: number;
  source_of_funds: string;
  bank_statements_uploaded: boolean;
}

export interface KYBDocument {
  document_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
  status: 'pending' | 'verified' | 'rejected';
}

/**
 * KYB Service
 */
export const kybService = {
  /**
   * Initiate KYB application
   */
  initiateKYB: async (businessName: string): Promise<KYBApplication> => {
    return apiRequest({
      method: 'POST',
      url: '/kyb/initiate',
      data: { business_name: businessName },
    });
  },

  /**
   * Get KYB application by ID
   */
  getApplication: async (applicationId: string): Promise<KYBApplication> => {
    return apiRequest({
      method: 'GET',
      url: `/kyb/applications/${applicationId}`,
    });
  },

  /**
   * Get user's KYB applications
   */
  getUserApplications: async (): Promise<KYBApplication[]> => {
    return apiRequest({
      method: 'GET',
      url: '/kyb/applications',
    });
  },

  /**
   * Submit business information
   */
  submitBusinessInfo: async (
    applicationId: string,
    data: BusinessInfo
  ): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: `/kyb/applications/${applicationId}/business-info`,
      data,
    });
  },

  /**
   * Verify with CAC (Corporate Affairs Commission - Nigeria)
   */
  verifyCACRegistration: async (
    applicationId: string,
    rcNumber: string
  ): Promise<CACVerification> => {
    return apiRequest({
      method: 'POST',
      url: `/kyb/applications/${applicationId}/cac-verification`,
      data: { rc_number: rcNumber },
    });
  },

  /**
   * Add Ultimate Beneficial Owner (UBO)
   */
  addUBO: async (applicationId: string, ubo: UBO): Promise<UBO> => {
    return apiRequest({
      method: 'POST',
      url: `/kyb/applications/${applicationId}/ubos`,
      data: ubo,
    });
  },

  /**
   * Get all UBOs for application
   */
  getUBOs: async (applicationId: string): Promise<UBO[]> => {
    return apiRequest({
      method: 'GET',
      url: `/kyb/applications/${applicationId}/ubos`,
    });
  },

  /**
   * Update UBO
   */
  updateUBO: async (
    applicationId: string,
    uboId: string,
    ubo: Partial<UBO>
  ): Promise<UBO> => {
    return apiRequest({
      method: 'PUT',
      url: `/kyb/applications/${applicationId}/ubos/${uboId}`,
      data: ubo,
    });
  },

  /**
   * Delete UBO
   */
  deleteUBO: async (applicationId: string, uboId: string): Promise<{ message: string }> => {
    return apiRequest({
      method: 'DELETE',
      url: `/kyb/applications/${applicationId}/ubos/${uboId}`,
    });
  },

  /**
   * Submit financial information
   */
  submitFinancialInfo: async (
    applicationId: string,
    data: FinancialInfo
  ): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: `/kyb/applications/${applicationId}/financial-info`,
      data,
    });
  },

  /**
   * Upload document
   */
  uploadDocument: async (
    applicationId: string,
    documentType: string,
    file: File
  ): Promise<KYBDocument> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);

    return apiRequest({
      method: 'POST',
      url: `/kyb/applications/${applicationId}/documents`,
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  /**
   * Get application documents
   */
  getDocuments: async (applicationId: string): Promise<KYBDocument[]> => {
    return apiRequest({
      method: 'GET',
      url: `/kyb/applications/${applicationId}/documents`,
    });
  },

  /**
   * Submit application for review
   */
  submitForReview: async (applicationId: string): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: `/kyb/applications/${applicationId}/submit`,
    });
  },

  /**
   * Get business risk assessment
   */
  getRiskAssessment: async (applicationId: string): Promise<{
    risk_score: number;
    risk_level: 'low' | 'medium' | 'high';
    risk_factors: string[];
  }> => {
    return apiRequest({
      method: 'GET',
      url: `/kyb/applications/${applicationId}/risk-assessment`,
    });
  },
};

export default kybService;
