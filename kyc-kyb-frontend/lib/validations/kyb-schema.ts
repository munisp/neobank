/**
 * KYB Validation Schemas
 * Zod schemas for KYB form validation
 */

import { z } from 'zod';

/**
 * Business Information Schema
 */
export const businessInfoSchema = z.object({
  business_name: z.string()
    .min(2, 'Business name must be at least 2 characters')
    .max(200, 'Business name must be less than 200 characters'),
  
  business_type: z.enum(
    ['sole_proprietorship', 'partnership', 'limited_liability', 'corporation', 'non_profit'],
    { required_error: 'Please select a business type' }
  ),
  
  registration_number: z.string()
    .min(5, 'Registration number must be at least 5 characters')
    .max(50, 'Registration number must be less than 50 characters')
    .regex(/^[A-Z0-9-]+$/i, 'Registration number can only contain letters, numbers, and hyphens'),
  
  tax_id: z.string()
    .min(5, 'Tax ID must be at least 5 characters')
    .max(50, 'Tax ID must be less than 50 characters')
    .regex(/^[A-Z0-9-]+$/i, 'Tax ID can only contain letters, numbers, and hyphens'),
  
  incorporation_date: z.string()
    .refine((date) => {
      const incDate = new Date(date);
      return incDate <= new Date();
    }, 'Incorporation date cannot be in the future'),
  
  country_of_incorporation: z.string()
    .min(2, 'Country of incorporation is required')
    .max(100, 'Country must be less than 100 characters'),
  
  business_address: z.object({
    street_address: z.string()
      .min(5, 'Street address must be at least 5 characters')
      .max(200, 'Street address must be less than 200 characters'),
    
    city: z.string()
      .min(2, 'City must be at least 2 characters')
      .max(100, 'City must be less than 100 characters'),
    
    state: z.string()
      .min(2, 'State/Province is required')
      .max(100, 'State/Province must be less than 100 characters'),
    
    postal_code: z.string()
      .min(3, 'Postal code must be at least 3 characters')
      .max(20, 'Postal code must be less than 20 characters'),
    
    country: z.string()
      .min(2, 'Country is required')
      .max(100, 'Country must be less than 100 characters'),
  }),
  
  industry: z.string()
    .min(2, 'Industry is required')
    .max(100, 'Industry must be less than 100 characters'),
  
  website: z.string()
    .url('Invalid website URL')
    .optional()
    .or(z.literal('')),
  
  phone_number: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  
  email: z.string()
    .email('Invalid email address'),
});

export type BusinessInfoFormData = z.infer<typeof businessInfoSchema>;

/**
 * CAC Verification Schema (Nigeria)
 */
export const cacVerificationSchema = z.object({
  rc_number: z.string()
    .min(5, 'RC number must be at least 5 characters')
    .max(20, 'RC number must be less than 20 characters')
    .regex(/^RC\d+$/i, 'RC number must start with "RC" followed by numbers'),
});

export type CACVerificationFormData = z.infer<typeof cacVerificationSchema>;

/**
 * Ultimate Beneficial Owner (UBO) Schema
 */
export const uboSchema = z.object({
  full_name: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be less than 100 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes'),
  
  date_of_birth: z.string()
    .refine((date) => {
      const dob = new Date(date);
      const age = (new Date().getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return age >= 18 && age <= 120;
    }, 'UBO must be at least 18 years old'),
  
  nationality: z.string()
    .min(2, 'Nationality is required')
    .max(50, 'Nationality must be less than 50 characters'),
  
  ownership_percentage: z.number()
    .min(0.01, 'Ownership percentage must be greater than 0')
    .max(100, 'Ownership percentage cannot exceed 100'),
  
  position: z.string()
    .min(2, 'Position is required')
    .max(100, 'Position must be less than 100 characters'),
  
  id_document_type: z.enum(['passport', 'drivers_license', 'national_id'], {
    required_error: 'Please select an ID document type',
  }),
  
  id_document_number: z.string()
    .min(5, 'ID document number must be at least 5 characters')
    .max(50, 'ID document number must be less than 50 characters')
    .regex(/^[A-Z0-9-]+$/i, 'ID document number can only contain letters, numbers, and hyphens'),
  
  address: z.object({
    street_address: z.string()
      .min(5, 'Street address must be at least 5 characters')
      .max(200, 'Street address must be less than 200 characters'),
    
    city: z.string()
      .min(2, 'City must be at least 2 characters')
      .max(100, 'City must be less than 100 characters'),
    
    state: z.string()
      .min(2, 'State/Province is required')
      .max(100, 'State/Province must be less than 100 characters'),
    
    postal_code: z.string()
      .min(3, 'Postal code must be at least 3 characters')
      .max(20, 'Postal code must be less than 20 characters'),
    
    country: z.string()
      .min(2, 'Country is required')
      .max(100, 'Country must be less than 100 characters'),
  }),
});

export type UBOFormData = z.infer<typeof uboSchema>;

/**
 * Financial Information Schema
 */
export const financialInfoSchema = z.object({
  annual_revenue: z.number()
    .min(0, 'Annual revenue must be a positive number')
    .max(1000000000000, 'Annual revenue is too large'),
  
  revenue_currency: z.string()
    .length(3, 'Currency code must be 3 characters')
    .regex(/^[A-Z]{3}$/, 'Invalid currency code (e.g., USD, EUR, NGN)'),
  
  number_of_employees: z.number()
    .int('Number of employees must be a whole number')
    .min(0, 'Number of employees must be a positive number')
    .max(1000000, 'Number of employees is too large'),
  
  expected_transaction_volume: z.number()
    .min(0, 'Expected transaction volume must be a positive number')
    .max(1000000000000, 'Expected transaction volume is too large'),
  
  source_of_funds: z.string()
    .min(10, 'Please provide details about the source of funds (at least 10 characters)')
    .max(500, 'Source of funds description must be less than 500 characters'),
});

export type FinancialInfoFormData = z.infer<typeof financialInfoSchema>;

/**
 * KYB Document Upload Schema
 */
export const kybDocumentUploadSchema = z.object({
  document_type: z.string().min(1, 'Document type is required'),
  file: z.instanceof(File, { message: 'Please select a file' })
    .refine((file) => file.size <= 10 * 1024 * 1024, 'File size must be less than 10MB')
    .refine(
      (file) => ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'].includes(file.type),
      'Only JPEG, PNG, and PDF files are allowed'
    ),
});

export type KYBDocumentUploadFormData = z.infer<typeof kybDocumentUploadSchema>;

/**
 * KYB Initiation Schema
 */
export const kybInitiationSchema = z.object({
  business_name: z.string()
    .min(2, 'Business name must be at least 2 characters')
    .max(200, 'Business name must be less than 200 characters'),
});

export type KYBInitiationFormData = z.infer<typeof kybInitiationSchema>;

/**
 * Helper function to validate total UBO ownership
 */
export const validateTotalOwnership = (ubos: { ownership_percentage: number }[]): {
  valid: boolean;
  total: number;
  error?: string;
} => {
  const total = ubos.reduce((sum, ubo) => sum + ubo.ownership_percentage, 0);
  
  if (total > 100) {
    return {
      valid: false,
      total,
      error: 'Total ownership percentage cannot exceed 100%',
    };
  }
  
  if (total < 25) {
    return {
      valid: false,
      total,
      error: 'At least 25% of ownership must be declared',
    };
  }
  
  return { valid: true, total };
};

export default {
  businessInfoSchema,
  cacVerificationSchema,
  uboSchema,
  financialInfoSchema,
  kybDocumentUploadSchema,
  kybInitiationSchema,
  validateTotalOwnership,
};
