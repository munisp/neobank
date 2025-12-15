/**
 * KYC Initiation Page
 * Start KYC verification process
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Shield, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { kycService, KYCTier } from '@/lib/api/kyc-service';
import { useKYCStore } from '@/lib/stores/kyc-store';
import { toast } from 'sonner';

const tiers = [
  {
    tier: KYCTier.BASIC,
    name: 'Basic KYC',
    icon: Zap,
    description: 'Quick verification for basic banking services',
    features: [
      'Personal information verification',
      'Basic identity document',
      'Transaction limit: $1,000/day',
      'Approval time: 24-48 hours',
    ],
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    tier: KYCTier.ENHANCED,
    name: 'Enhanced KYC',
    icon: Shield,
    description: 'Comprehensive verification for full banking access',
    features: [
      'All Basic KYC features',
      'Address verification',
      'Biometric verification',
      'Transaction limit: $10,000/day',
      'Approval time: 48-72 hours',
    ],
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    recommended: true,
  },
  {
    tier: KYCTier.PREMIUM,
    name: 'Premium KYC',
    icon: CheckCircle2,
    description: 'Maximum verification for high-value transactions',
    features: [
      'All Enhanced KYC features',
      'Video KYC session',
      'AML/PEP screening',
      'Unlimited transactions',
      'Priority support',
      'Approval time: 72-96 hours',
    ],
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
];

export default function KYCInitiationPage() {
  const router = useRouter();
  const { setCurrentApplication, setLoading } = useKYCStore();
  const [selectedTier, setSelectedTier] = React.useState<KYCTier | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleInitiate = async () => {
    if (!selectedTier) {
      toast.error('Please select a KYC tier');
      return;
    }

    setIsSubmitting(true);
    setLoading(true);

    try {
      const application = await kycService.initiateKYC(selectedTier);
      setCurrentApplication(application);
      toast.success('KYC application initiated successfully');
      router.push(`/kyc/${application.application_id}/personal-info`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to initiate KYC');
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Start Your KYC Verification
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Choose the verification level that best suits your needs. You can upgrade anytime.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {tiers.map((tierOption) => {
          const Icon = tierOption.icon;
          const isSelected = selectedTier === tierOption.tier;

          return (
            <Card
              key={tierOption.tier}
              className={`relative cursor-pointer transition-all ${
                isSelected
                  ? 'ring-2 ring-primary shadow-lg'
                  : 'hover:shadow-md'
              }`}
              onClick={() => setSelectedTier(tierOption.tier)}
            >
              {tierOption.recommended && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge variant="default">Recommended</Badge>
                </div>
              )}

              <CardHeader>
                <div className={`w-12 h-12 rounded-lg ${tierOption.bgColor} flex items-center justify-center mb-4`}>
                  <Icon className={`h-6 w-6 ${tierOption.color}`} />
                </div>
                <CardTitle>{tierOption.name}</CardTitle>
                <CardDescription>{tierOption.description}</CardDescription>
              </CardHeader>

              <CardContent>
                <ul className="space-y-2">
                  {tierOption.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleInitiate}
          disabled={!selectedTier || isSubmitting}
          isLoading={isSubmitting}
        >
          {isSubmitting ? 'Initiating...' : 'Start Verification'}
        </Button>
      </div>

      <div className="mt-12 bg-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          What you'll need:
        </h3>
        <ul className="grid md:grid-cols-2 gap-3 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <span>Valid government-issued ID (Passport, Driver's License, or National ID)</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <span>Proof of address (Utility bill or Bank statement)</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <span>Clear selfie photo for biometric verification</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <span>10-15 minutes to complete the process</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
