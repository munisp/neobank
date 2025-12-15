# NeoBank Frontend Implementation Guide

## Overview

This document provides a comprehensive guide for implementing the remaining pages and components for the NeoBank KYC/KYB frontend.

## ✅ Completed Components (Phase 1-2)

### Core Infrastructure (11 files)
- ✅ `lib/api/client.ts` - Axios client with interceptors
- ✅ `lib/api/kyc-service.ts` - KYC API service
- ✅ `lib/api/kyb-service.ts` - KYB API service
- ✅ `lib/api/video-kyc-service.ts` - Video KYC API service
- ✅ `lib/api/auth-service.ts` - Authentication service
- ✅ `lib/stores/kyc-store.ts` - KYC state management
- ✅ `lib/stores/kyb-store.ts` - KYB state management
- ✅ `lib/stores/auth-store.ts` - Auth state management
- ✅ `lib/utils/cn.ts` - Class name utility
- ✅ `lib/utils/format.ts` - Formatting utilities
- ✅ `lib/validations/kyc-schema.ts` - KYC validation schemas
- ✅ `lib/validations/kyb-schema.ts` - KYB validation schemas

### UI Components (12 files)
- ✅ `components/ui/button.tsx`
- ✅ `components/ui/input.tsx`
- ✅ `components/ui/card.tsx`
- ✅ `components/ui/progress.tsx`
- ✅ `components/ui/badge.tsx`
- ✅ `components/ui/alert.tsx`
- ✅ `components/ui/select.tsx`
- ✅ `components/ui/tabs.tsx`
- ✅ `components/ui/dialog.tsx`
- ✅ `components/shared/document-upload.tsx`
- ✅ `components/shared/status-tracker.tsx`
- ✅ `components/shared/loading-spinner.tsx`

### Pages (2 files)
- ✅ `app/kyc/page.tsx` - KYC initiation
- ✅ `app/kyc/[applicationId]/personal-info/page.tsx` - Personal info form

## 🔨 Remaining Implementation (Phase 3-6)

### KYC Flow Pages (5 remaining)

#### 1. Address Information Page
**File**: `app/kyc/[applicationId]/address/page.tsx`

**Purpose**: Collect user's address information

**Key Features**:
- Form with address fields (street, city, state, postal code, country)
- React Hook Form + Zod validation
- Integration with `kycService.submitAddressInfo()`
- Navigation to identity verification page

**Implementation Pattern**:
```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addressInfoSchema } from '@/lib/validations/kyc-schema';
import { kycService } from '@/lib/api/kyc-service';
// ... similar to personal-info page
```

#### 2. Identity Verification Page
**File**: `app/kyc/[applicationId]/identity/page.tsx`

**Purpose**: Collect identity document information

**Key Features**:
- Document type selection (passport, driver's license, national ID)
- Document number, issue date, expiry date fields
- Form validation
- Integration with `kycService.submitIdentityVerification()`

#### 3. Document Upload Page
**File**: `app/kyc/[applicationId]/documents/page.tsx`

**Purpose**: Upload required documents

**Key Features**:
- Multiple document upload using `DocumentUpload` component
- Document type selection
- File preview
- Upload progress tracking
- Integration with `kycService.uploadDocument()`
- List of uploaded documents

**Implementation Pattern**:
```typescript
const [documents, setDocuments] = useState<KYCDocument[]>([]);
const [uploading, setUploading] = useState(false);

const handleUpload = async (documentType: DocumentType, file: File) => {
  setUploading(true);
  try {
    const doc = await kycService.uploadDocument(applicationId, documentType, file);
    setDocuments([...documents, doc]);
    toast.success('Document uploaded successfully');
  } catch (error) {
    toast.error('Failed to upload document');
  } finally {
    setUploading(false);
  }
};
```

#### 4. Biometric Verification Page
**File**: `app/kyc/[applicationId]/biometric/page.tsx`

**Purpose**: Capture selfie for biometric verification

**Key Features**:
- Webcam integration or file upload
- Selfie capture
- Face match score display
- Liveness detection results
- Integration with `kycService.submitBiometric()`

#### 5. Application Status Page
**File**: `app/kyc/[applicationId]/status/page.tsx`

**Purpose**: Display KYC application status and progress

**Key Features**:
- Status badge (pending, in_progress, under_review, approved, rejected)
- Progress percentage
- Timeline of steps completed
- List of submitted documents
- AML screening results (for Premium tier)
- Action buttons (submit for review, upgrade tier)

**Implementation Pattern**:
```typescript
const [application, setApplication] = useState<KYCApplication | null>(null);

useEffect(() => {
  const fetchApplication = async () => {
    const app = await kycService.getApplication(applicationId);
    setApplication(app);
  };
  fetchApplication();
}, [applicationId]);
```

### KYB Flow Pages (6 files)

#### 1. KYB Initiation Page
**File**: `app/kyb/page.tsx`

**Purpose**: Start KYB verification process

**Key Features**:
- Business name input
- Initiate KYB application
- Integration with `kybService.initiateKYB()`

#### 2. Business Information Page
**File**: `app/kyb/[applicationId]/business-info/page.tsx`

**Purpose**: Collect business details

**Key Features**:
- Business name, type, registration number
- Tax ID, incorporation date
- Business address
- Industry, website, contact info
- Form validation with `businessInfoSchema`
- Integration with `kybService.submitBusinessInfo()`

#### 3. CAC Verification Page
**File**: `app/kyb/[applicationId]/cac-verification/page.tsx`

**Purpose**: Verify business with Nigerian CAC

**Key Features**:
- RC number input
- CAC verification button
- Display verification results (company name, directors, status)
- Integration with `kybService.verifyCACRegistration()`

**Implementation Pattern**:
```typescript
const [cacResult, setCacResult] = useState<CACVerification | null>(null);
const [verifying, setVerifying] = useState(false);

const handleVerify = async (rcNumber: string) => {
  setVerifying(true);
  try {
    const result = await kybService.verifyCACRegistration(applicationId, rcNumber);
    setCacResult(result);
    toast.success('CAC verification successful');
  } catch (error) {
    toast.error('CAC verification failed');
  } finally {
    setVerifying(false);
  }
};
```

#### 4. UBO Management Page
**File**: `app/kyb/[applicationId]/ubos/page.tsx`

**Purpose**: Manage Ultimate Beneficial Owners

**Key Features**:
- List of UBOs with ownership percentages
- Add UBO form (modal dialog)
- Edit UBO functionality
- Delete UBO functionality
- Total ownership percentage display
- Validation (total ownership >= 25%, <= 100%)
- Integration with `kybService.addUBO()`, `updateUBO()`, `deleteUBO()`

#### 5. Financial Information Page
**File**: `app/kyb/[applicationId]/financial/page.tsx`

**Purpose**: Collect business financial information

**Key Features**:
- Annual revenue, currency
- Number of employees
- Expected transaction volume
- Source of funds
- Form validation with `financialInfoSchema`
- Integration with `kybService.submitFinancialInfo()`

#### 6. KYB Status Page
**File**: `app/kyb/[applicationId]/status/page.tsx`

**Purpose**: Display KYB application status

**Key Features**:
- Status badge
- Completion percentage
- CAC verification status
- UBO verification status
- Financial verification status
- Risk assessment results
- Submit for review button

### Video KYC Pages (3 files)

#### 1. Schedule Session Page
**File**: `app/video-kyc/schedule/page.tsx`

**Purpose**: Schedule video KYC session

**Key Features**:
- Calendar view for date selection
- Available time slots display
- Timezone selection
- KYC application selection
- Integration with `videoKYCService.getAvailableSlots()` and `scheduleSession()`

**Implementation Pattern**:
```typescript
const [selectedDate, setSelectedDate] = useState<string>('');
const [availableSlots, setAvailableSlots] = useState<string[]>([]);

useEffect(() => {
  const fetchSlots = async () => {
    const slots = await videoKYCService.getAvailableSlots(startDate, endDate);
    setAvailableSlots(slots);
  };
  if (selectedDate) {
    fetchSlots();
  }
}, [selectedDate]);
```

#### 2. Video Session Page
**File**: `app/video-kyc/session/[sessionId]/page.tsx`

**Purpose**: Conduct video KYC session

**Key Features**:
- Video call interface (integrate with WebRTC or third-party video SDK)
- Session information display
- Agent information
- Start/end session buttons
- Integration with `videoKYCService.startSession()` and `completeSession()`

#### 3. Sessions List Page
**File**: `app/video-kyc/sessions/page.tsx`

**Purpose**: View all video KYC sessions

**Key Features**:
- List of sessions with status
- Session details (date, time, agent, status)
- Join session button (for scheduled sessions)
- Reschedule/cancel options
- Recording access (for completed sessions)

### Shared Components (5 files)

#### 1. Form Field Component
**File**: `components/shared/form-field.tsx`

**Purpose**: Reusable form field wrapper

**Key Features**:
- Label, input, error message
- Support for different input types
- Integration with React Hook Form

#### 2. Status Badge Component
**File**: `components/shared/status-badge.tsx`

**Purpose**: Display status with appropriate styling

**Key Features**:
- Color-coded badges for different statuses
- Support for KYC/KYB statuses

#### 3. Document List Component
**File**: `components/shared/document-list.tsx`

**Purpose**: Display list of uploaded documents

**Key Features**:
- Document preview
- Download button
- Status indicator
- Delete option

#### 4. Navigation Header Component
**File**: `components/shared/navigation-header.tsx`

**Purpose**: Application header with navigation

**Key Features**:
- Logo
- Navigation links (KYC, KYB, Video KYC)
- User menu
- Logout button

#### 5. Footer Component
**File**: `components/shared/footer.tsx`

**Purpose**: Application footer

**Key Features**:
- Copyright information
- Links (Privacy Policy, Terms of Service, Contact)

## 🎯 Implementation Priority

### High Priority (Complete First)
1. ✅ Core infrastructure (API services, stores, utilities)
2. ✅ UI components library
3. ✅ KYC initiation and personal info pages
4. 🔨 Remaining KYC flow pages (address, identity, documents, biometric, status)
5. 🔨 KYB flow pages (all 6 pages)

### Medium Priority
6. 🔨 Video KYC pages
7. 🔨 Shared components (navigation, footer, document list)

### Low Priority
8. 🔨 Dashboard page (overview of all applications)
9. 🔨 Settings page (user preferences)
10. 🔨 Help/FAQ page

## 🔧 Development Guidelines

### Code Style
- Use TypeScript for all files
- Follow Next.js 14 App Router conventions
- Use 'use client' directive for client components
- Implement proper error handling with try-catch
- Use toast notifications for user feedback
- Add loading states for async operations

### Form Handling
```typescript
const {
  register,
  handleSubmit,
  formState: { errors },
} = useForm<FormData>({
  resolver: zodResolver(validationSchema),
});
```

### API Calls
```typescript
const [isLoading, setIsLoading] = useState(false);

const handleSubmit = async (data: FormData) => {
  setIsLoading(true);
  try {
    await apiService.method(data);
    toast.success('Success message');
    router.push('/next-page');
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Error message');
  } finally {
    setIsLoading(false);
  }
};
```

### State Management
```typescript
// Use Zustand stores for global state
const { currentApplication, setCurrentApplication } = useKYCStore();

// Use React state for local component state
const [localData, setLocalData] = useState<Type>(initialValue);
```

## 📦 Testing Strategy

### Unit Tests
- Test utility functions
- Test validation schemas
- Test API service methods (with mocked axios)

### Integration Tests
- Test form submission flows
- Test navigation between pages
- Test state management

### E2E Tests
- Test complete KYC flow
- Test complete KYB flow
- Test Video KYC scheduling

## 🚀 Deployment Checklist

- [ ] All pages implemented
- [ ] All components tested
- [ ] Environment variables configured
- [ ] API integration verified
- [ ] Error handling implemented
- [ ] Loading states added
- [ ] Responsive design verified
- [ ] Accessibility checked
- [ ] Performance optimized
- [ ] Security reviewed
- [ ] Documentation updated

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React Hook Form](https://react-hook-form.com/)
- [Zod Validation](https://zod.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Shadcn/ui](https://ui.shadcn.com/)
- [Zustand](https://zustand-demo.pmnd.rs/)

## 🤝 Support

For questions or issues, contact the NeoBank development team.

---

**Last Updated**: 2025-01-31
