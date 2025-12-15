/**
 * KYC Validation Schemas
 * Zod schemas for KYC form validation
 */

import { z } from 'zod';

/**
 * Personal Information Schema
 */
export const personalInfoSchema = z.object({
  first_name: z.string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be less than 50 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes'),
  
  last_name: z.string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be less than 50 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes'),
  
  middle_name: z.string()
    .max(50, 'Middle name must be less than 50 characters')
    .regex(/^[a-zA-Z\s'-]*$/, 'Middle name can only contain letters, spaces, hyphens, and apostrophes')
    .optional(),
  
  date_of_birth: z.string()
    .refine((date) => {
      const dob = new Date(date);
      const age = (new Date().getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return age >= 18 && age <= 120;
    }, 'You must be at least 18 years old'),
  
  nationality: z.string()
    .min(2, 'Nationality is required')
    .max(50, 'Nationality must be less than 50 characters'),
  
  phone_number: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  
  email: z.string()
    .email('Invalid email address'),
});

export type PersonalInfoFormData = z.infer<typeof personalInfoSchema>;

/**
 * Address Information Schema
 */
export const addressInfoSchema = z.object({
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
});

export type AddressInfoFormData = z.infer<typeof addressInfoSchema>;

/**
 * Identity Verification Schema
 */
export const identityVerificationSchema = z.object({
  document_type: z.enum(['passport', 'drivers_license', 'national_id'], {
    required_error: 'Please select a document type',
  }),
  
  document_number: z.string()
    .min(5, 'Document number must be at least 5 characters')
    .max(50, 'Document number must be less than 50 characters')
    .regex(/^[A-Z0-9-]+$/i, 'Document number can only contain letters, numbers, and hyphens'),
  
  issue_date: z.string()
    .refine((date) => {
      const issueDate = new Date(date);
      return issueDate <= new Date();
    }, 'Issue date cannot be in the future'),
  
  expiry_date: z.string()
    .refine((date) => {
      const expiryDate = new Date(date);
      return expiryDate > new Date();
    }, 'Document has expired'),
  
  issuing_country: z.string()
    .min(2, 'Issuing country is required')
    .max(100, 'Issuing country must be less than 100 characters'),
}).refine((data) => {
  const issueDate = new Date(data.issue_date);
  const expiryDate = new Date(data.expiry_date);
  return expiryDate > issueDate;
}, {
  message: 'Expiry date must be after issue date',
  path: ['expiry_date'],
});

export type IdentityVerificationFormData = z.infer<typeof identityVerificationSchema>;

/**
 * Document Upload Schema
 */
export const documentUploadSchema = z.object({
  document_type: z.string().min(1, 'Document type is required'),
  file: z.instanceof(File, { message: 'Please select a file' })
    .refine((file) => file.size <= 10 * 1024 * 1024, 'File size must be less than 10MB')
    .refine(
      (file) => ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'].includes(file.type),
      'Only JPEG, PNG, and PDF files are allowed'
    ),
});

export type DocumentUploadFormData = z.infer<typeof documentUploadSchema>;

/**
 * Biometric Verification Schema
 */
export const biometricVerificationSchema = z.object({
  selfie: z.instanceof(File, { message: 'Please capture a selfie' })
    .refine((file) => file.size <= 5 * 1024 * 1024, 'File size must be less than 5MB')
    .refine(
      (file) => ['image/jpeg', 'image/png', 'image/jpg'].includes(file.type),
      'Only JPEG and PNG files are allowed'
    ),
});

export type BiometricVerificationFormData = z.infer<typeof biometricVerificationSchema>;

/**
 * KYC Tier Selection Schema
 */
export const kycTierSchema = z.object({
  tier: z.enum(['basic', 'enhanced', 'premium'], {
    required_error: 'Please select a KYC tier',
  }),
});

export type KYCTierFormData = z.infer<typeof kycTierSchema>;

/**
 * Helper function to validate file
 */
export const validateFile = (
  file: File,
  maxSizeMB: number = 10,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
): { valid: boolean; error?: string } => {
  if (file.size > maxSizeMB * 1024 * 1024) {
    return { valid: false, error: `File size must be less than ${maxSizeMB}MB` };
  }
  
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type' };
  }
  
  return { valid: true };
};

export default {
  personalInfoSchema,
  addressInfoSchema,
  identityVerificationSchema,
  documentUploadSchema,
  biometricVerificationSchema,
  kycTierSchema,
  validateFile,
};
