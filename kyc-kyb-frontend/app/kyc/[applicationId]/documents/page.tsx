'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Loader2, FileText, Trash2 } from 'lucide-react';

// --- Local Imports (Inferred from requirements) ---
// Assuming these are the paths based on the project structure
import { kycService, Document, DocumentRequirement } from '@/services/kycService';
import { StatusTracker } from '@/components/kyc/StatusTracker';
import { DocumentUpload } from '@/components/kyc/DocumentUpload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

// --- Types and Schema ---

// Define the shape of the form data (minimal for this page, as document state is managed separately)
const formSchema = z.object({
  // This form is primarily for validation and submission flow, not for field inputs
  // We can use a placeholder field or just rely on the document state
  isDocumentsComplete: z.boolean().refine(val => val === true, {
    message: 'Please upload all required documents to continue.',
  }),
});

type DocumentFormValues = z.infer<typeof formSchema>;

// --- Component ---

export default function DocumentUploadPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = params.applicationId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);

  const {
    handleSubmit,
    setValue,
    formState: { isDirty, isValid },
  } = useForm<DocumentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isDocumentsComplete: false,
    },
    mode: 'onChange',
  });

  // --- Data Fetching ---

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const [fetchedDocuments, fetchedRequirements] = await Promise.all([
        kycService.getDocuments(applicationId),
        kycService.getDocumentRequirements(applicationId), // Assuming a service method to get requirements
      ]);
      setDocuments(fetchedDocuments);
      setRequirements(fetchedRequirements);

      // Check if all requirements are met
      const requiredTypes = new Set(fetchedRequirements.map(r => r.type));
      const uploadedTypes = new Set(fetchedDocuments.map(d => d.type));
      const allRequiredUploaded = Array.from(requiredTypes).every(type => uploadedTypes.has(type));

      setValue('isDocumentsComplete', allRequiredUploaded, { shouldValidate: true });
    } catch (error) {
      console.error('Failed to fetch documents or requirements:', error);
      toast.error('Failed to load document data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [applicationId, setValue]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // --- Handlers ---

  const handleUploadSuccess = async (newDocument: Document) => {
    toast.success(`Document "${newDocument.name}" uploaded successfully.`);
    // Re-fetch all documents to update the list and re-evaluate completion status
    await fetchDocuments();
  };

  const handleDeleteDocument = async (documentId: string) => {
    try {
      await kycService.deleteDocument(applicationId, documentId);
      toast.success('Document deleted successfully.');
      await fetchDocuments(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete document:', error);
      toast.error('Failed to delete document. Please try again.');
    }
  };

  const onSubmit = async (data: DocumentFormValues) => {
    if (!data.isDocumentsComplete) {
      toast.error('Please upload all required documents before continuing.');
      return;
    }

    setIsSubmitting(true);
    try {
      // No explicit save/update needed here, as documents are saved on upload/delete.
      // We just need to navigate to the next step.
      router.push(`/kyc/${applicationId}/biometric`);
    } catch (error) {
      console.error('Navigation error:', error);
      toast.error('An unexpected error occurred during navigation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    router.push(`/kyc/${applicationId}/personal-info`);
  };

  // --- Render Helpers ---

  const getRequirementStatus = (requirement: DocumentRequirement) => {
    const uploadedDoc = documents.find(d => d.type === requirement.type);
    return uploadedDoc ? 'Uploaded' : 'Pending';
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span className="text-lg">Loading documents...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <StatusTracker currentStep="documents" />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-2xl">Document Upload</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-muted-foreground">
            Please upload the required documents to proceed with your application.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {/* Document Requirements List */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Required Documents</h3>
              <div className="border rounded-lg p-4 space-y-3">
                {requirements.map((req) => (
                  <div key={req.type} className="flex justify-between items-center">
                    <Label className="font-medium">{req.name}</Label>
                    <span className={`text-sm font-medium ${getRequirementStatus(req) === 'Uploaded' ? 'text-green-600' : 'text-red-600'}`}>
                      {getRequirementStatus(req)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Document Upload Component */}
            <DocumentUpload
              applicationId={applicationId}
              requiredDocumentTypes={requirements.map(r => r.type)}
              onUploadSuccess={handleUploadSuccess}
            />

            {/* Uploaded Documents List */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Uploaded Documents ({documents.length})</h3>
              <div className="border rounded-lg">
                {documents.length === 0 ? (
                  <p className="p-4 text-center text-muted-foreground">No documents uploaded yet.</p>
                ) : (
                  <ul className="divide-y">
                    {documents.map((doc) => (
                      <li key={doc.id} className="flex justify-between items-center p-4 hover:bg-gray-50">
                        <div className="flex items-center space-x-3">
                          <FileText className="h-5 w-5 text-blue-500" />
                          <div>
                            <p className="font-medium">{doc.name}</p>
                            <p className="text-sm text-muted-foreground">{doc.type} - {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteDocument(doc.id)}
                          disabled={isSubmitting}
                          aria-label={`Delete ${doc.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={isSubmitting}
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={!isValid || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  'Continue to Biometric'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}