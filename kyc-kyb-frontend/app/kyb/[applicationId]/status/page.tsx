'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, AlertTriangle, Loader2, FileText, User, DollarSign, Briefcase, ChevronLeft, Send } from 'lucide-react';
import { toast } from 'sonner';

// Imports from existing services and components
import kybService from '@/lib/api/kyb-service';
import { KybApplication, KybStatus, Ubo, Document } from '@/lib/validations/kyb-schema'; // Assuming these types are exported
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import StatusTracker from '@/components/shared/status-tracker';

// --- Utility Functions and Constants ---

const STATUS_MAP: Record<KybStatus, { text: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | null; icon: React.ElementType }> = {
  pending: { text: 'Pending Submission', variant: 'secondary', icon: Clock },
  in_progress: { text: 'In Progress', variant: 'warning', icon: Loader2 },
  under_review: { text: 'Under Review', variant: 'warning', icon: AlertTriangle },
  approved: { text: 'Approved', variant: 'success', icon: CheckCircle },
  rejected: { text: 'Rejected', variant: 'destructive', icon: XCircle },
};

const CHECKPOINTS = [
  { id: 'businessInfo', title: 'Business Info', icon: Briefcase },
  { id: 'cacVerification', title: 'CAC Verification', icon: FileText },
  { id: 'uboManagement', title: 'UBO Management', icon: User },
  { id: 'financialInfo', title: 'Financial Info', icon: DollarSign },
];

const getStatusBadge = (status: KybStatus) => {
  const { text, variant, icon: Icon } = STATUS_MAP[status] || STATUS_MAP.pending;
  return (
    <Badge variant={variant as any} className="capitalize flex items-center gap-2">
      <Icon className="w-4 h-4" />
      {text}
    </Badge>
  );
};

const getProgressPercentage = (application: KybApplication): number => {
  const totalSteps = 4; // Based on CHECKPOINTS
  let completedSteps = 0;

  if (application.businessInfo) completedSteps++;
  if (application.cacVerification) completedSteps++;
  if (application.ubos && application.ubos.length > 0) completedSteps++;
  if (application.financialInfo) completedSteps++;

  return Math.round((completedSteps / totalSteps) * 100);
};

// --- Components ---

interface CheckpointItemProps {
  title: string;
  isComplete: boolean;
  Icon: React.ElementType;
}

const CheckpointItem: React.FC<CheckpointItemProps> = ({ title, isComplete, Icon }) => (
  <div className="flex items-center space-x-3">
    {isComplete ? (
      <CheckCircle className="w-5 h-5 text-green-500" />
    ) : (
      <Clock className="w-5 h-5 text-gray-400" />
    )}
    <Icon className="w-5 h-5 text-gray-600" />
    <span className={isComplete ? 'font-medium' : 'text-gray-500'}>{title}</span>
  </div>
);

interface KybStatusPageProps {
  params: {
    applicationId: string;
  };
}

const KybStatusPage: React.FC<KybStatusPageProps> = ({ params }) => {
  const { applicationId } = params;
  const router = useRouter();
  const queryClient = useQueryClient();

  // --- Data Fetching with Auto-Refresh ---
  const { data: application, isLoading, isError, error } = useQuery<KybApplication, Error>({
    queryKey: ['kybApplication', applicationId],
    queryFn: () => kybService.getApplication(applicationId),
    refetchInterval: (data) => {
      const status = data?.status;
      if (status === 'in_progress' || status === 'under_review') {
        return 30000; // 30 seconds
      }
      return false;
    },
  });

  // --- Submit for Review Mutation ---
  const submitMutation = useMutation({
    mutationFn: () => kybService.submitForReview(applicationId),
    onSuccess: () => {
      toast.success('Application submitted for review!', {
        description: 'We will notify you once the review is complete.',
      });
      // Invalidate and refetch to update the status immediately
      queryClient.invalidateQueries({ queryKey: ['kybApplication', applicationId] });
    },
    onError: (err: any) => {
      toast.error('Submission failed', {
        description: err.message || 'An unexpected error occurred during submission.',
      });
    },
  });

  const handleSubmitForReview = useCallback(() => {
    submitMutation.mutate();
  }, [submitMutation]);

  // --- Loading and Error States ---
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-2">Loading KYB Application Status...</p>
      </div>
    );
  }

  if (isError || !application) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load application status for ID: {applicationId}. {error?.message || 'Please try again.'}
        </AlertDescription>
        <Button onClick={() => router.back()} className="mt-4">
          <ChevronLeft className="w-4 h-4 mr-2" /> Back
        </Button>
      </Alert>
    );
  }

  // --- Derived State ---
  const progressPercentage = getProgressPercentage(application);
  const isSubmittable = progressPercentage === 100 && application.status === 'pending';
  const isReviewing = application.status === 'under_review' || application.status === 'in_progress';
  const isFinal = application.status === 'approved' || application.status === 'rejected';

  // --- Render Helpers ---

  const renderCheckpoints = () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Verification Checkpoints</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        {CHECKPOINTS.map((checkpoint) => (
          <CheckpointItem
            key={checkpoint.id}
            title={checkpoint.title}
            isComplete={!!(application as any)[checkpoint.id]} // Assuming checkpoint ID matches application property
            Icon={checkpoint.icon}
          />
        ))}
      </CardContent>
    </Card>
  );

  const renderUboList = (ubos: Ubo[]) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Ultimate Beneficial Owners (UBOs)</CardTitle>
      </CardHeader>
      <CardContent>
        {ubos.length === 0 ? (
          <p className="text-gray-500">No UBOs have been added yet.</p>
        ) : (
          <ul className="space-y-2">
            {ubos.map((ubo, index) => (
              <li key={index} className="flex justify-between items-center border-b pb-2 last:border-b-0 last:pb-0">
                <span className="font-medium">{ubo.fullName}</span>
                <Badge variant="secondary">{ubo.ownershipPercentage}% Ownership</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  const renderDocumentsList = (documents: Document[]) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Submitted Documents</CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-gray-500">No documents have been submitted yet.</p>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc, index) => (
              <li key={index} className="flex justify-between items-center border-b pb-2 last:border-b-0 last:pb-0">
                <span className="font-medium">{doc.type}</span>
                <Badge variant="success">Uploaded</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  const renderRiskAssessment = (risk: KybApplication['riskAssessment']) => {
    if (!risk) return null;

    const riskColor = risk.level === 'high' ? 'text-red-500' : risk.level === 'medium' ? 'text-yellow-500' : 'text-green-500';

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Risk Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <span className="font-medium">Risk Level:</span>
            <span className={`font-bold capitalize ${riskColor}`}>{risk.level}</span>
          </div>
          <p className="text-sm text-gray-500 mt-2">{risk.summary}</p>
        </CardContent>
      </Card>
    );
  };

  // --- Main Render ---
  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">KYB Application Status</h1>
        <StatusTracker currentStep={4} totalSteps={4} /> {/* Assuming Status is the final step (4/4) */}
      </div>

      <Card className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="space-y-1">
            <p className="text-sm text-gray-500">Application ID: {applicationId}</p>
            <h2 className="text-2xl font-semibold">{application.businessName || 'Business Name Not Set'}</h2>
          </div>
          {getStatusBadge(application.status)}
        </div>

        <Separator className="my-4" />

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="font-medium">Completion Progress</span>
            <span className="font-semibold">{progressPercentage}%</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
      </Card>

      {/* Conditional Alert for Review Status */}
      {isReviewing && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Application Under Review</AlertTitle>
          <AlertDescription>
            Your application is currently being reviewed by our compliance team. This page will automatically refresh every 30 seconds to check for status updates.
          </AlertDescription>
        </Alert>
      )}

      {/* Conditional Alert for Final Status */}
      {isFinal && (
        <Alert variant={application.status === 'approved' ? 'success' : 'destructive'}>
          {application.status === 'approved' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <AlertTitle>Application {application.status === 'approved' ? 'Approved' : 'Rejected'}</AlertTitle>
          <AlertDescription>
            Your KYB application has been {application.status}. Please check your email for further details.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderCheckpoints()}
        {renderRiskAssessment(application.riskAssessment)}
        {renderUboList(application.ubos || [])}
        {renderDocumentsList(application.documents || [])}
      </div>

      <div className="flex justify-between pt-6 border-t">
        <Button variant="outline" onClick={() => router.back()}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Application
        </Button>

        {isSubmittable && (
          <Button
            onClick={handleSubmitForReview}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Submit for Review
          </Button>
        )}
      </div>
    </div>
  );
};

export default KybStatusPage;