"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { NextPage } from "next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Building2 } from "lucide-react";

// Existing services and validations
import { kybService, CACVerificationResult } from "@/lib/api/kyb-service";
import { cacVerificationSchema } from "@/lib/validations/kyb-schema";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";

// Shared Components
import StatusTracker from "@/components/shared/status-tracker";

// --- Types and Schema ---

type FormValues = z.infer<typeof cacVerificationSchema>;

interface CACVerificationPageProps {
  params: {
    applicationId: string;
  };
}

// --- Component ---

const CACVerificationPage: NextPage<CACVerificationPageProps> = ({ params }) => {
  const { applicationId } = params;
  const router = useRouter();

  const [verificationResult, setVerificationResult] = useState<CACVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(cacVerificationSchema),
    defaultValues: {
      rcNumber: "",
    },
  });

  const { handleSubmit, control, watch, formState: { isSubmitting } } = form;
  const rcNumber = watch("rcNumber");

  const handleVerification = useCallback(async (values: FormValues) => {
    setIsVerifying(true);
    setVerificationResult(null);
    setIsVerified(false);

    try {
      const result = await kybService.verifyCACRegistration(applicationId, values.rcNumber);
      setVerificationResult(result);

      if (result.status === "SUCCESS") {
        setIsVerified(true);
        toast.success("CAC verification successful!", {
          description: `Company: ${result.company_name}`,
        });
      } else {
        setIsVerified(false);
        toast.error("CAC verification failed.", {
          description: result.message || "The provided RC number could not be verified.",
        });
      }
    } catch (error) {
      console.error("CAC Verification Error:", error);
      setIsVerified(false);
      setVerificationResult(null);
      toast.error("Verification failed", {
        description: "An unexpected error occurred during CAC verification. Please try again.",
      });
    } finally {
      setIsVerifying(false);
    }
  }, [applicationId]);

  const handleContinue = useCallback(() => {
    if (isVerified) {
      // Navigate to the next step, which is UBO page
      router.push(`/kyb/${applicationId}/ubo`);
    } else {
      toast.warning("Verification required", {
        description: "Please successfully verify the CAC registration before continuing.",
      });
    }
  }, [isVerified, applicationId, router]);

  const handleBack = useCallback(() => {
    // Navigate back to the previous step, e.g., company details
    router.back();
  }, [router]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return <Badge variant="success" className="text-xs">Verified</Badge>;
      case "FAILED":
        return <Badge variant="destructive" className="text-xs">Failed</Badge>;
      case "PENDING":
        return <Badge variant="secondary" className="text-xs">Pending</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const VerificationResultCard = useMemo(() => {
    if (!verificationResult) return null;

    const { company_name, rc_number, registration_date, status, directors } = verificationResult;
    const isSuccess = status === "SUCCESS";

    return (
      <Card className="mt-6 border-2 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Verification Result
          </CardTitle>
          {getStatusBadge(status)}
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <p><strong>Company Name:</strong></p>
            <p className="text-right">{company_name}</p>
            <p><strong>RC Number:</strong></p>
            <p className="text-right">{rc_number}</p>
            <p><strong>Registration Date:</strong></p>
            <p className="text-right">{registration_date}</p>
          </div>

          <Separator />

          <div>
            <h4 className="text-md font-semibold mb-2">Directors ({directors.length})</h4>
            <ul className="list-disc list-inside space-y-1 text-sm max-h-40 overflow-y-auto p-2 bg-muted/50 rounded-md">
              {directors.map((director, index) => (
                <li key={index} className="truncate">{director}</li>
              ))}
              {directors.length === 0 && <li className="text-muted-foreground">No director information found.</li>}
            </ul>
          </div>

          <Alert variant={isSuccess ? "success" : "destructive"}>
            {isSuccess ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertTitle>{isSuccess ? "Verification Complete" : "Verification Failed"}</AlertTitle>
            <AlertDescription>
              {verificationResult.message || (isSuccess ? "The company details have been successfully verified with CAC." : "The RC number could not be verified. Please check the number and try again.")}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }, [verificationResult]);

  return (
    <div className="flex flex-col min-h-screen">
      <StatusTracker currentStep="CAC Verification" steps={["Company Details", "CAC Verification", "UBO", "Bank Account", "Review"]} />

      <main className="flex-grow container mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">CAC Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-6">
              Please enter your Corporate Affairs Commission (CAC) Registration Number to verify your company details.
            </p>

            <Form {...form}>
              <form onSubmit={handleSubmit(handleVerification)} className="space-y-6">
                <FormField
                  control={control}
                  name="rcNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RC Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., RC123456"
                          {...field}
                          disabled={isVerifying || isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={isVerifying || isSubmitting || !rcNumber}
                  className="w-full"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify RC Number"
                  )}
                </Button>
              </form>
            </Form>

            {VerificationResultCard}

            <div className="flex justify-between mt-8 pt-4 border-t">
              <Button variant="outline" onClick={handleBack} disabled={isVerifying || isSubmitting}>
                Back
              </Button>
              <Button onClick={handleContinue} disabled={!isVerified || isVerifying || isSubmitting}>
                Continue
                <CheckCircle2 className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CACVerificationPage;
