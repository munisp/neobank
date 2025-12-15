'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-toastify';

// Mocked paths - assuming these exist in the project structure
import { kycService } from '@/services/kycService'; 
import StatusTracker from '@/components/StatusTracker'; 
import { Input } from '@/components/ui/input'; 
import { Button } from '@/components/ui/button'; 
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; 
import { biometricVerificationSchema, BiometricVerificationForm } from './biometricVerificationSchema'; 

// Mocked types for biometric results
interface BiometricResult {
  faceMatchScore: number;
  livenessResult: 'PASS' | 'FAIL';
}

export default function BiometricVerificationPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = params.applicationId as string;

  const [biometricResult, setBiometricResult] = useState<BiometricResult | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BiometricVerificationForm>({
    resolver: zodResolver(biometricVerificationSchema),
    defaultValues: useMemo(() => ({
      selfieFile: undefined,
    }), []),
  });

  const selfieFile = watch('selfieFile');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setValue('selfieFile', file, { shouldValidate: true });
  };

  const onSubmit = async (data: BiometricVerificationForm) => {
    try {
      // The kycService.submitBiometric is expected to handle the file upload
      // The file is passed directly from the form data object
      const result: BiometricResult = await kycService.submitBiometric(applicationId, data.selfieFile);
      
      setBiometricResult(result);

      // Simple logic for success based on mock results
      if (result.livenessResult === 'PASS' && result.faceMatchScore > 0.7) {
        toast.success('Biometric verification successful! Navigating to status page.');
        // Navigate to the status page on success
        router.push(`/kyc/${applicationId}/status`);
      } else {
        toast.warn('Biometric verification failed. Please try again.');
      }
    } catch (error) {
      console.error('Biometric submission error:', error);
      toast.error('Failed to process biometric verification. Please try again.');
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <div className="container mx-auto py-10">
      <StatusTracker currentStep="Biometric Verification" />
      <Card className="mt-8 max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Biometric Verification</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                Capture Selfie (File Upload)
              </label>
              <Input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                // We use onChange and setValue manually for file input with RHF
              />
              {errors.selfieFile && (
                <p className="text-sm text-red-500">{errors.selfieFile.message as string}</p>
              )}
              {selfieFile && (
                <p className="text-sm text-gray-500">Selected file: {selfieFile.name}</p>
              )}
            </div>

            {biometricResult && (
              <div className="border p-4 rounded-md space-y-2">
                <h3 className="font-semibold">Verification Results:</h3>
                <p>
                  Face Match Score: 
                  <span className={`ml-2 font-mono ${biometricResult.faceMatchScore > 0.7 ? 'text-green-600' : 'text-red-600'}`}>
                    {(biometricResult.faceMatchScore * 100).toFixed(2)}%
                  </span>
                </p>
                <p>
                  Liveness Result: 
                  <span className={`ml-2 font-bold ${biometricResult.livenessResult === 'PASS' ? 'text-green-600' : 'text-red-600'}`}>
                    {biometricResult.livenessResult}
                  </span>
                </p>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button type="button" variant="outline" onClick={handleBack} disabled={isSubmitting}>
                Back
              </Button>
              <Button type="submit" disabled={isSubmitting || !selfieFile}>
                {isSubmitting ? 'Verifying...' : 'Continue'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}