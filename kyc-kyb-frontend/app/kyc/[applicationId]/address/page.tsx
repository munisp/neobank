'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

// Mock imports - assume these exist in the project
import { kycService } from '@/services/kycService';
import { StatusTracker } from '@/components/StatusTracker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// 1. Define the Zod schema for address info
// Requirements: street, city, state, postal code, country
const addressInfoSchema = z.object({
  street: z.string().min(5, 'Street address is required and must be at least 5 characters.'),
  city: z.string().min(1, 'City is required.'),
  state: z.string().min(1, 'State/Province is required.'),
  postalCode: z.string().min(3, 'Postal code is required.'),
  country: z.string().min(2, 'Country is required.'),
});

type AddressInfoFormValues = z.infer<typeof addressInfoSchema>;

export default function AddressInfoPage({ params }: { params: { applicationId: string } }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const applicationId = params.applicationId;

  const form = useForm<AddressInfoFormValues>({
    resolver: zodResolver(addressInfoSchema),
    defaultValues: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
    },
  });

  async function onSubmit(values: AddressInfoFormValues) {
    setIsLoading(true);
    try {
      // 2. Integrate with kycService.submitAddressInfo()
      await kycService.submitAddressInfo(applicationId, values);
      toast.success('Address information saved successfully.');
      
      // 3. Navigate to the next page (identity page) on success
      router.push(`/kyc/${applicationId}/identity`);
    } catch (error) {
      console.error('Submission error:', error);
      toast.error('Failed to save address information. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12">
      <div className="w-full max-w-2xl">
        {/* Update StatusTracker currentStep */}
        <StatusTracker currentStep="Address Information" />
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Address Information</CardTitle>
            <CardDescription>Please provide your current residential address.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                <FormField
                  control={form.control}
                  name="street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street Address</FormLabel>
                      <FormControl>
                        <Input placeholder="123 Main St" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input placeholder="New York" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State / Province</FormLabel>
                        <FormControl>
                          <Input placeholder="NY" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="postalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postal Code</FormLabel>
                        <FormControl>
                          <Input placeholder="10001" {...field} />
                        </FormControl>
                          <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          {/* In a real app, this would be a Select component, but using Input for simplicity and consistency with the template */}
                          <Input placeholder="USA" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="flex justify-between pt-4">
                  {/* Back button: Navigates to the previous step (personal-info) */}
                  <Button variant="outline" onClick={() => router.push(`/kyc/${applicationId}/personal-info`)} type="button">
                    Back
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Saving...' : 'Continue'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}