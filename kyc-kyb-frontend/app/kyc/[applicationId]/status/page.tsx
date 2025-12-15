'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';

// Inferred Imports from the project pattern
import { kycService } from '@/services/kycService';
import { StatusTracker } from '@/components/StatusTracker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

// --- Types and Schema ---

// Define the expected structure of the application data for this page
interface Document {
  id: string;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}

interface ApplicationStatus {
  status: 'IN_PROGRESS' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  completionPercentage: number;
  timeline: { step: string; date: string; status: 'COMPLETED' | 'PENDING' | 'FAILED' }[];
  submittedDocuments: Document[];
  amlScreening?: {
    status: 'CLEARED' | 'FLAGGED';
    details: string;
  };
  tier: 'BASIC' | 'PREMIUM';
}

// The status page doesn't have a traditional form to submit, but we use a mock schema
// and form for the 'Submit for Review' action to leverage RHF's submission flow and state.
const StatusFormSchema = z.object({});
type StatusFormValues = z.infer<typeof StatusFormSchema>;

interface StatusPageProps {
  params: {
    applicationId: string;
  };
}

// --- Helper Components ---

const StatusIndicator: React.FC<{ status: ApplicationStatus['status'] }> = ({ status }) => {
  const statusMap = {
    IN_PROGRESS: { icon: Clock, color: 'text-yellow-500', text: 'In Progress' },
    PENDING_REVIEW: { icon: Clock, color: 'text-blue-500', text: 'Pending Review' },
    APPROVED: { icon: CheckCircle, color: 'text-green-500', text: 'Approved' },
    REJECTED: { icon: XCircle, color: 'text-red-500', text: 'Rejected' },
  };
  const { icon: Icon, color, text } = statusMap[status] || statusMap.IN_PROGRESS;

  return (
    <div className="flex items-center space-x-2">
      <Icon className={`w-5 h-5 ${color}`} />
      <span className={`font-semibold ${color}`}>{text}</span>
    </div>
  );
};

const DocumentStatus: React.FC<{ doc: Document }> = ({ doc }) => {
  const statusMap = {
    PENDING: { icon: Clock, color: 'text-yellow-500', text: 'Pending' },
    APPROVED: { icon: CheckCircle, color: 'text-green-500', text: 'Approved' },
    REJECTED: { icon: XCircle, color: 'text-red-500', text: 'Rejected' },
  };
  const { icon: Icon, color, text } = statusMap[doc.status];

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <span className="font-medium">{doc.name}</span>
      <div className="flex items-center space-x-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className={`text-sm ${color}`}>{text}</span>
      </div>
    </div>
  );
};

// --- Main Component ---

export default function ApplicationStatusPage({ params }: StatusPageProps) {
  const router = useRouter();
  const { applicationId } = params;
  const [application, setApplication] = useState<ApplicationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<StatusFormValues>({
    resolver: zodResolver(StatusFormSchema),
  });

  const fetchApplicationData = useCallback(async () => {
    try {
      setIsLoading(true);
      // Mock data for demonstration, replace with actual service call
      // const data = await kycService.getApplication(applicationId);
      const mockData: ApplicationStatus = {
        status: 'IN_PROGRESS',
        completionPercentage: 60,
        timeline: [
          { step: 'Personal Info', date: '2025-10-20', status: 'COMPLETED' },
          { step: 'Address Details', date: '2025-10-21', status: 'COMPLETED' },
          { step: 'Document Upload', date: '2025-10-22', status: 'COMPLETED' },
          { step: 'Status Review', date: '', status: 'PENDING' },
          { step: 'Final Approval', date: '', status: 'PENDING' },
        ],
        submittedDocuments: [
          { id: 'doc1', name: 'Passport Scan', status: 'APPROVED' },
          { id: 'doc2', name: 'Proof of Address', status: 'PENDING' },
          { id: 'doc3', name: 'Source of Funds', status: 'REJECTED', rejectionReason: 'Unclear image' },
        ],
        amlScreening: {
          status: 'CLEARED',
          details: 'No adverse media or sanctions found.',
        },
        tier: 'PREMIUM', // Show AML screening for Premium tier
      };
      setApplication(mockData);
      toast.success('Application status loaded.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to load application status.');
    } finally {
      setIsLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    fetchApplicationData();
  }, [fetchApplicationData]);

  const onSubmitForReview = async () => {
    if (application?.status !== 'IN_PROGRESS') {
      toast('Application is already under review or finalized.', { icon: 'ℹ️' });
      return;
    }
    try {
      setIsSubmitting(true);
      // await kycService.submitForReview(applicationId);
      toast.success('Application submitted for review successfully!');
      // Optimistically update status
      setApplication(prev => prev ? { ...prev, status: 'PENDING_REVIEW' } : null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to submit application for review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="mt-4 text-gray-500">Loading application status...</p>
      </div>
    );
  }

  if (!application) {
    return <div className="p-8 text-center text-red-500">Application not found or an error occurred.</div>;
  }

  const isSubmittable = application.status === 'IN_PROGRESS' && application.completionPercentage === 100;
  const nextStepUrl = application.timeline.find(t => t.status === 'PENDING')?.step.toLowerCase().replace(/\s/g, '-') || `/kyc/${applicationId}/review`;

  return (
    <div className="space-y-6">
      <StatusTracker currentStep="Status Review" totalSteps={5} />

      <Card>
        <CardHeader>
          <CardTitle>Application Status</CardTitle>
          <CardDescription>Application ID: {applicationId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Overall Status:</h3>
            <StatusIndicator status={application.status} />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Completion: {application.completionPercentage}%</h3>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${application.completionPercentage}%` }}
              ></div>
            </div>
          </div>

          <Separator />

          {/* Timeline of Steps */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Application Timeline</h3>
            <ol className="relative border-l border-gray-200 ml-4">
              {application.timeline.map((item, index) => (
                <li key={index} className="mb-4 ml-6">
                  <span className={`absolute flex items-center justify-center w-3 h-3 rounded-full -left-1.5 ring-8 ring-white ${item.status === 'COMPLETED' ? 'bg-green-500' : item.status === 'FAILED' ? 'bg-red-500' : 'bg-gray-300'}`}>
                  </span>
                  <h4 className="font-medium leading-tight">{item.step}</h4>
                  <p className="text-sm text-gray-500">{item.date || 'Pending'}</p>
                </li>
              ))}
            </ol>
          </div>

          <Separator />

          {/* Submitted Documents List */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Submitted Documents</h3>
            <div className="border rounded-lg p-4">
              {application.submittedDocuments.length > 0 ? (
                application.submittedDocuments.map(doc => <DocumentStatus key={doc.id} doc={doc} />)
              ) : (
                <p className="text-gray-500">No documents have been submitted yet.</p>
              )}
            </div>
          </div>

          {/* AML Screening Results (Premium Tier Only) */}
          {application.tier === 'PREMIUM' && application.amlScreening && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">AML Screening Results</h3>
                <Card className={application.amlScreening.status === 'CLEARED' ? 'border-green-500' : 'border-red-500'}>
                  <CardContent className="pt-4">
                    <div className="flex items-center space-x-3">
                      {application.amlScreening.status === 'CLEARED' ? (
                        <CheckCircle className="w-6 h-6 text-green-500" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-500" />
                      )}
                      <p className="font-medium">
                        Status: <span className={application.amlScreening.status === 'CLEARED' ? 'text-green-600' : 'text-red-600'}>{application.amlScreening.status}</span>
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{application.amlScreening.details}</p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between pt-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Back
            </Button>
            {application.status === 'IN_PROGRESS' && (
              <Button
                type="button"
                onClick={() => router.push(nextStepUrl)}
                disabled={isSubmitting}
              >
                Continue to Next Step
              </Button>
            )}
            {isSubmittable && (
              <Button
                type="button"
                onClick={form.handleSubmit(onSubmitForReview)}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  'Submit for Review'
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}