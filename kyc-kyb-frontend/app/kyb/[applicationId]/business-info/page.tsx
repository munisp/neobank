'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';

// Imports from existing services and schemas
import kybService from '@/lib/api/kyb-service';
import { businessInfoSchema } from '@/lib/validations/kyb-schema';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusTracker } from '@/components/shared/status-tracker';

// Define the form data type based on the schema
type BusinessInfoFormValues = z.infer<typeof businessInfoSchema>;

// Define props for the page component
interface BusinessInfoPageProps {
  params: {
    applicationId: string;
  };
}

// Static data for select fields
const businessTypes = [
  { value: 'limited_company', label: 'Limited Company' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'ngo', label: 'NGO/Non-Profit' },
];

const industries = [
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance/Banking' },
  { value: 'retail', label: 'Retail/E-commerce' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'services', label: 'Professional Services' },
  { value: 'other', label: 'Other' },
];

// Helper function to format date for input[type="date"]
const formatDateForInput = (date: Date | string | undefined): string => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
};

export default function BusinessInfoPage({ params }: BusinessInfoPageProps) {
  const { applicationId } = params;
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<BusinessInfoFormValues>({
    resolver: zodResolver(businessInfoSchema),
    defaultValues: {
      businessName: '',
      businessType: undefined,
      registrationNumber: '',
      taxId: '',
      incorporationDate: formatDateForInput(new Date()), // Default to today or fetch existing data
      businessAddress: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'Nigeria', // Default to Nigeria as per requirement
      industry: undefined,
      website: '',
      contactEmail: '',
      contactPhone: '',
    },
  });

  const {
    handleSubmit,
    register,
    formState: { errors },
    setValue,
    watch,
  } = form;

  const watchedFields = watch();

  const onSubmit = async (values: BusinessInfoFormValues) => {
    setIsLoading(true);
    try {
      // The incorporationDate is a string in "YYYY-MM-DD" format from the input.
      // The service call expects the values object.
      await kybService.submitBusinessInfo(applicationId, values);

      toast.success('Business information saved successfully.');
      // Navigate to the next step: cac-verification
      router.push(`/kyb/${applicationId}/cac-verification`);
    } catch (error) {
      console.error('Submission error:', error);
      toast.error('Failed to save business information. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    // Navigate to the previous step, assuming it's /kyb/[applicationId]/start
    router.push(`/kyb/${applicationId}/start`);
  };

  return (
    <div className="flex min-h-screen w-full">
      <div className="flex-1 space-y-8 p-8 pt-6">
        <StatusTracker currentStep="Business Information" />
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Business Information</CardTitle>
            <CardDescription>
              Provide the legal and operational details of your business.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Business Name */}
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Legal Name</Label>
                  <Input
                    id="businessName"
                    {...register('businessName')}
                    placeholder="e.g., Acme Global Ltd"
                    disabled={isLoading}
                  />
                  {errors.businessName && (
                    <p className="text-sm text-red-500">{errors.businessName.message}</p>
                  )}
                </div>

                {/* Business Type */}
                <div className="space-y-2">
                  <Label htmlFor="businessType">Business Type</Label>
                  <Select
                    onValueChange={(value) => setValue('businessType', value, { shouldValidate: true })}
                    value={watchedFields.businessType}
                    disabled={isLoading}
                  >
                    <SelectTrigger id="businessType">
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent>
                      {businessTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.businessType && (
                    <p className="text-sm text-red-500">{errors.businessType.message}</p>
                  )}
                </div>

                {/* Registration Number */}
                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">Registration Number (e.g., CAC)</Label>
                  <Input
                    id="registrationNumber"
                    {...register('registrationNumber')}
                    placeholder="e.g., RC123456"
                    disabled={isLoading}
                  />
                  {errors.registrationNumber && (
                    <p className="text-sm text-red-500">{errors.registrationNumber.message}</p>
                  )}
                </div>

                {/* Tax ID */}
                <div className="space-y-2">
                  <Label htmlFor="taxId">Tax Identification Number (TIN)</Label>
                  <Input
                    id="taxId"
                    {...register('taxId')}
                    placeholder="e.g., 1234567890"
                    disabled={isLoading}
                  />
                  {errors.taxId && (
                    <p className="text-sm text-red-500">{errors.taxId.message}</p>
                  )}
                </div>

                {/* Incorporation Date */}
                <div className="space-y-2">
                  <Label htmlFor="incorporationDate">Incorporation Date</Label>
                  <Input
                    id="incorporationDate"
                    type="date"
                    {...register('incorporationDate')}
                    disabled={isLoading}
                  />
                  {errors.incorporationDate && (
                    <p className="text-sm text-red-500">{errors.incorporationDate.message}</p>
                  )}
                </div>

                {/* Industry */}
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Select
                    onValueChange={(value) => setValue('industry', value, { shouldValidate: true })}
                    value={watchedFields.industry}
                    disabled={isLoading}
                  >
                    <SelectTrigger id="industry">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {industries.map((industry) => (
                        <SelectItem key={industry.value} value={industry.value}>
                          {industry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.industry && (
                    <p className="text-sm text-red-500">{errors.industry.message}</p>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-semibold pt-4 border-t mt-6">Business Address</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Business Address */}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="businessAddress">Street Address</Label>
                  <Input
                    id="businessAddress"
                    {...register('businessAddress')}
                    placeholder="e.g., 123 Main St"
                    disabled={isLoading}
                  />
                  {errors.businessAddress && (
                    <p className="text-sm text-red-500">{errors.businessAddress.message}</p>
                  )}
                </div>

                {/* City */}
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    {...register('city')}
                    placeholder="e.g., Lagos"
                    disabled={isLoading}
                  />
                  {errors.city && (
                    <p className="text-sm text-red-500">{errors.city.message}</p>
                  )}
                </div>

                {/* State */}
                <div className="space-y-2">
                  <Label htmlFor="state">State/Region</Label>
                  <Input
                    id="state"
                    {...register('state')}
                    placeholder="e.g., Ikeja"
                    disabled={isLoading}
                  />
                  {errors.state && (
                    <p className="text-sm text-red-500">{errors.state.message}</p>
                  )}
                </div>

                {/* Postal Code */}
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input
                    id="postalCode"
                    {...register('postalCode')}
                    placeholder="e.g., 100001"
                    disabled={isLoading}
                  />
                  {errors.postalCode && (
                    <p className="text-sm text-red-500">{errors.postalCode.message}</p>
                  )}
                </div>

                {/* Country (Default Nigeria) */}
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    {...register('country')}
                    defaultValue="Nigeria"
                    disabled={true} // Disabled as per requirement to default to Nigeria
                  />
                  {errors.country && (
                    <p className="text-sm text-red-500">{errors.country.message}</p>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-semibold pt-4 border-t mt-6">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Contact Email */}
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    {...register('contactEmail')}
                    placeholder="e.g., info@acmeglobal.com"
                    disabled={isLoading}
                  />
                  {errors.contactEmail && (
                    <p className="text-sm text-red-500">{errors.contactEmail.message}</p>
                  )}
                </div>

                {/* Contact Phone */}
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <Input
                    id="contactPhone"
                    {...register('contactPhone')}
                    placeholder="e.g., +2348012345678"
                    disabled={isLoading}
                  />
                  {errors.contactPhone && (
                    <p className="text-sm text-red-500">{errors.contactPhone.message}</p>
                  )}
                </div>

                {/* Website (Optional) */}
                <div className="space-y-2">
                  <Label htmlFor="website">Website (Optional)</Label>
                  <Input
                    id="website"
                    {...register('website')}
                    placeholder="e.g., https://www.acmeglobal.com"
                    disabled={isLoading}
                  />
                  {errors.website && (
                    <p className="text-sm text-red-500">{errors.website.message}</p>
                  )}
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-6 border-t mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Saving...' : 'Continue'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}