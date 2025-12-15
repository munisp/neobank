/**
 * KYC Personal Information Page
 * Collect personal information for KYC
 */

'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusTracker, Step } from '@/components/shared/status-tracker';
import { kycService } from '@/lib/api/kyc-service';
import { personalInfoSchema, PersonalInfoFormData } from '@/lib/validations/kyc-schema';
import { toast } from 'sonner';

const steps: Step[] = [
  { id: '1', title: 'Personal Info', status: 'current' },
  { id: '2', title: 'Address', status: 'upcoming' },
  { id: '3', title: 'Identity', status: 'upcoming' },
  { id: '4', title: 'Documents', status: 'upcoming' },
  { id: '5', title: 'Review', status: 'upcoming' },
];

export default function PersonalInfoPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = params.applicationId as string;
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PersonalInfoFormData>({
    resolver: zodResolver(personalInfoSchema),
  });

  const onSubmit = async (data: PersonalInfoFormData) => {
    setIsSubmitting(true);

    try {
      await kycService.submitPersonalInfo(applicationId, data);
      toast.success('Personal information saved successfully');
      router.push(`/kyc/${applicationId}/address`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save personal information');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <StatusTracker steps={steps} className="mb-8" />

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Please provide your personal details as they appear on your government-issued ID
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="First Name"
                {...register('first_name')}
                error={errors.first_name?.message}
                required
              />

              <Input
                label="Last Name"
                {...register('last_name')}
                error={errors.last_name?.message}
                required
              />
            </div>

            <Input
              label="Middle Name (Optional)"
              {...register('middle_name')}
              error={errors.middle_name?.message}
            />

            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Date of Birth"
                type="date"
                {...register('date_of_birth')}
                error={errors.date_of_birth?.message}
                required
              />

              <Input
                label="Nationality"
                {...register('nationality')}
                error={errors.nationality?.message}
                required
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Phone Number"
                type="tel"
                placeholder="+1234567890"
                {...register('phone_number')}
                error={errors.phone_number?.message}
                required
              />

              <Input
                label="Email Address"
                type="email"
                {...register('email')}
                error={errors.email?.message}
                required
              />
            </div>

            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/kyc')}
              >
                Back
              </Button>

              <Button type="submit" isLoading={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Continue'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
