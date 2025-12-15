'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-hot-toast';

// --- Project Imports (Assumed) ---
import { kycService } from '@/services/kycService';
import { StatusTracker } from '@/components/StatusTracker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { DatePicker } from '@/components/ui/date-picker'; // Assuming a custom DatePicker component
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, Loader2 } from 'lucide-react';

// --- Zod Schema for Identity Verification ---
// Document types are assumed to be a fixed set for a neobank KYC flow
const documentTypes = ['PASSPORT', 'NATIONAL_ID', 'DRIVING_LICENSE'] as const;

export const identityVerificationSchema = z.object({
  documentType: z.enum(documentTypes, {
    required_error: 'Please select a document type.',
  }),
  documentNumber: z.string().min(1, 'Document number is required.'),
  issueDate: z.date({
    required_error: 'Issue date is required.',
  }),
  expiryDate: z.date({
    required_error: 'Expiry date is required.',
  }).refine((date) => date > new Date(), {
    message: 'Expiry date must be in the future.',
  }),
  issuingCountry: z.string().min(1, 'Issuing country is required.'),
});

type IdentityVerificationFormValues = z.infer<typeof identityVerificationSchema>;

// --- Component Definition ---
interface IdentityPageProps {
  params: {
    applicationId: string;
  };
}

const IdentityPage = ({ params }: IdentityPageProps) => {
  const router = useRouter();
  const { applicationId } = params;
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<IdentityVerificationFormValues>({
    resolver: zodResolver(identityVerificationSchema),
    defaultValues: {
      documentType: undefined,
      documentNumber: '',
      issueDate: undefined,
      expiryDate: undefined,
      issuingCountry: '',
    },
  });

  const onSubmit = async (values: IdentityVerificationFormValues) => {
    setIsLoading(true);
    try {
      // Format dates to ISO string for API
      const payload = {
        ...values,
        issueDate: values.issueDate.toISOString().split('T')[0],
        expiryDate: values.expiryDate.toISOString().split('T')[0],
      };

      await kycService.submitIdentityVerification(applicationId, payload);

      toast.success('Identity details saved successfully!');
      // Navigate to the next page: documents
      router.push(\`/kyc/\${applicationId}/documents\`);
    } catch (error) {
      console.error('Identity verification submission failed:', error);
      toast.error('Failed to save identity details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    // Navigate back to the previous page: personal-info
    router.push(\`/kyc/\${applicationId}/personal-info\`);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      <div className="lg:w-1/3">
        <StatusTracker currentStep="Identity Verification" />
      </div>
      <div className="lg:w-2/3">
        <Card>
          <CardHeader>
            <CardTitle>Identity Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Document Type */}
                <FormField
                  control={form.control}
                  name="documentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a document type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {documentTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type.replace('_', ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Document Number */}
                <FormField
                  control={form.control}
                  name="documentNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter document number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Issuing Country */}
                <FormField
                  control={form.control}
                  name="issuingCountry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issuing Country</FormLabel>
                      <FormControl>
                        {/* In a real app, this would be a country select component */}
                        <Input placeholder="e.g., USA, Germany, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Issue Date */}
                  <FormField
                    control={form.control}
                    name="issueDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Issue Date</FormLabel>
                        <FormControl>
                          {/* Assuming DatePicker is a component that handles date selection and returns a Date object */}
                          <DatePicker
                            selected={field.value}
                            onSelect={field.onChange}
                            placeholderText="Select issue date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Expiry Date */}
                  <FormField
                    control={form.control}
                    name="expiryDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Expiry Date</FormLabel>
                        <FormControl>
                          <DatePicker
                            selected={field.value}
                            onSelect={field.onChange}
                            placeholderText="Select expiry date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Navigation Buttons */}
                <div className="flex justify-between pt-4">
                  <Button type="button" variant="outline" onClick={handleBack} disabled={isLoading}>
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continue
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IdentityPage;
