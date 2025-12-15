'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Shared Components
import StatusTracker from '@/components/shared/status-tracker';

// Services and Schemas
import { kybService, UBO } from '@/lib/api/kyb-service';
import { UboSchema, UboFormValues } from '@/lib/validations/kyb-schema';

// Icons
import { Plus, Edit, Trash2, CalendarIcon, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// --- Constants and Types ---

const STEPS = ['Company Info', 'UBOs', 'Financials', 'Documents', 'Review'];
const CURRENT_STEP = 1; // UBOs is the second step (index 1)

interface UBOPageProps {
  params: {
    applicationId: string;
  };
}

// --- UBO Form Component (Dialog Content) ---

interface UBOFormProps {
  applicationId: string;
  ubo?: UBO;
  onSuccess: () => void;
  onClose: () => void;
}

const UBOFormComponent: React.FC<UBOFormProps> = ({ applicationId, ubo, onSuccess, onClose }) => {
  const isEdit = !!ubo;

  const form = useForm<UboFormValues>({
    resolver: zodResolver(UboSchema),
    defaultValues: ubo || {
      fullName: '',
      email: '',
      phone: '',
      dateOfBirth: new Date(),
      nationality: '',
      ownershipPercentage: 0,
      address: '',
    },
  });

  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (data: UboFormValues) => {
    setIsLoading(true);
    try {
      if (isEdit) {
        await kybService.updateUBO(applicationId, ubo.id, data);
        toast.success('UBO updated successfully.');
      } else {
        await kybService.addUBO(applicationId, data);
        toast.success('UBO added successfully.');
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error('UBO operation failed:', error);
      toast.error(`Failed to ${isEdit ? 'update' : 'add'} UBO. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="john.doe@example.com" type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input placeholder="+1 555 123 4567" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dateOfBirth"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Date of Birth</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={'outline'}
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="nationality"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nationality</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select nationality" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {/* Placeholder for a real list of nationalities */}
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="ownershipPercentage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ownership Percentage (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="e.g., 25"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input placeholder="123 Main St, Anytown" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Add UBO'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};

// --- Main UBO Page Component ---

const UBOPage: React.FC<UBOPageProps> = ({ params }) => {
  const { applicationId } = params;
  const router = useRouter();

  const [ubos, setUbos] = useState<UBO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUBO, setEditingUBO] = useState<UBO | undefined>(undefined);

  const totalOwnership = useMemo(() => {
    return ubos.reduce((sum, ubo) => sum + ubo.ownershipPercentage, 0);
  }, [ubos]);

  const isOwnershipValid = totalOwnership >= 25 && totalOwnership <= 100;
  const canContinue = ubos.length > 0 && isOwnershipValid;

  const fetchUBOs = async () => {
    setIsLoading(true);
    try {
      const data = await kybService.getUBOs(applicationId);
      setUbos(data);
    } catch (error) {
      console.error('Failed to fetch UBOs:', error);
      toast.error('Failed to load UBO list. Please refresh the page.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUBOs();
  }, [applicationId]);

  const handleAddUBO = () => {
    setEditingUBO(undefined);
    setIsDialogOpen(true);
  };

  const handleEditUBO = (ubo: UBO) => {
    setEditingUBO(ubo);
    setIsDialogOpen(true);
  };

  const handleDeleteUBO = async (uboId: string) => {
    if (!window.confirm('Are you sure you want to delete this UBO?')) {
      return;
    }

    try {
      await kybService.deleteUBO(applicationId, uboId);
      toast.success('UBO deleted successfully.');
      fetchUBOs();
    } catch (error) {
      console.error('Failed to delete UBO:', error);
      toast.error('Failed to delete UBO. Please try again.');
    }
  };

  const handleContinue = () => {
    if (canContinue) {
      // Navigate to the next step: Financials
      router.push(`/kyb/${applicationId}/financials`);
    } else {
      toast.error('Please ensure at least one UBO is added and total ownership is between 25% and 100%.');
    }
  };

  const handleBack = () => {
    // Navigate to the previous step: Company Info
    router.push(`/kyb/${applicationId}/company-info`);
  };

  const UBOListItem: React.FC<{ ubo: UBO }> = ({ ubo }) => (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">{ubo.fullName}</CardTitle>
        <div className="flex space-x-2">
          <Button variant="outline" size="icon" onClick={() => handleEditUBO(ubo)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => handleDeleteUBO(ubo.id)}>
            <Trash2 className="h-4 w-4 text-red-500 hover:text-red-600" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground mb-2">
          <p>Email: {ubo.email}</p>
          <p>Phone: {ubo.phone}</p>
          <p>Nationality: {ubo.nationality}</p>
        </div>
        <Badge variant="secondary" className="text-base font-medium">
          {ubo.ownershipPercentage}% Ownership
        </Badge>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto py-10">
      <StatusTracker steps={STEPS} currentStep={CURRENT_STEP} />

      <div className="max-w-4xl mx-auto mt-8">
        <h1 className="text-3xl font-bold mb-2">Ultimate Beneficial Owners (UBOs)</h1>
        <p className="text-muted-foreground mb-6">
          Please list all individuals who ultimately own or control more than 25% of the company.
        </p>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Total Ownership Summary</CardTitle>
            <CardDescription>
              The combined ownership percentage of all listed UBOs must be between 25% and 100%.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <div className="w-full">
                <Progress value={totalOwnership} className="h-3" />
              </div>
              <span className="text-lg font-semibold w-16 text-right">{totalOwnership}%</span>
            </div>
            {!isOwnershipValid && (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Ownership Validation Failed</AlertTitle>
                <AlertDescription>
                  Total ownership is {totalOwnership}%. It must be between 25% and 100% to continue.
                </AlertDescription>
              </Alert>
            )}
            {ubos.length === 0 && (
              <Alert variant="warning" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Missing UBOs</AlertTitle>
                <AlertDescription>
                  You must add at least one UBO to proceed with the application.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">UBO List ({ubos.length})</h2>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleAddUBO}>
                <Plus className="mr-2 h-4 w-4" /> Add UBO
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{editingUBO ? 'Edit UBO' : 'Add New UBO'}</DialogTitle>
                <CardDescription>
                  Enter the details for the Ultimate Beneficial Owner.
                </CardDescription>
              </DialogHeader>
              <UBOFormComponent
                applicationId={applicationId}
                ubo={editingUBO}
                onSuccess={fetchUBOs}
                onClose={() => setIsDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">Loading UBOs...</div>
        ) : ubos.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {ubos.map((ubo) => (
              <UBOListItem key={ubo.id} ubo={ubo} />
            ))}
          </div>
        ) : (
          <Alert>
            <AlertTitle>No UBOs Added</AlertTitle>
            <AlertDescription>
              Click "Add UBO" to start listing the beneficial owners of the company.
            </AlertDescription>
          </Alert>
        )}

        <Separator className="my-8" />

        <div className="flex justify-between">
          <Button variant="outline" onClick={handleBack}>
            &larr; Back: Company Info
          </Button>
          <Button onClick={handleContinue} disabled={!canContinue}>
            Continue: Financials &rarr;
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UBOPage;