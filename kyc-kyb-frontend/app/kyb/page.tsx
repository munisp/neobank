'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { kybService } from '@/lib/api/kyb-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, FileCheck, Users, TrendingUp } from 'lucide-react';

const initiateKYBSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
});

type InitiateKYBFormValues = z.infer<typeof initiateKYBSchema>;

export default function KYBInitiationPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<InitiateKYBFormValues>({
    resolver: zodResolver(initiateKYBSchema),
    defaultValues: {
      businessName: '',
    },
  });

  async function onSubmit(values: InitiateKYBFormValues) {
    setIsLoading(true);
    try {
      const response = await kybService.initiateKYB(values.businessName);
      toast.success('KYB application initiated successfully');
      router.push(`/kyb/${response.application_id}/business-info`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to initiate KYB application');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Business Verification (KYB)</h1>
          <p className="text-muted-foreground">
            Verify your business to unlock full platform capabilities
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Start KYB Verification</CardTitle>
            <CardDescription>
              Enter your business name to begin the verification process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="businessName" className="block text-sm font-medium mb-2">
                  Business Name
                </label>
                <Input
                  id="businessName"
                  placeholder="Enter your registered business name"
                  {...form.register('businessName')}
                />
                {form.formState.errors.businessName && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.businessName.message}
                  </p>
                )}
              </div>
              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? 'Initiating...' : 'Start KYB Verification'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Business Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Provide comprehensive details about your business including registration,
                tax ID, and contact information.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <FileCheck className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">CAC Verification</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Verify your business with the Nigerian Corporate Affairs Commission
                using your RC number.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">UBO Management</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Identify Ultimate Beneficial Owners with 25% or more ownership stake
                in your business.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Financial Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Share your business financial details including revenue, employees,
                and transaction volume.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 p-6 bg-muted rounded-lg">
          <h3 className="font-semibold mb-3">What you'll need:</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Business registration certificate (CAC certificate)</li>
            <li>• Tax identification number (TIN)</li>
            <li>• Business address and contact information</li>
            <li>• Details of Ultimate Beneficial Owners (UBOs)</li>
            <li>• Financial information (revenue, employees)</li>
            <li>• Memorandum and Articles of Association</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
