import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Upload, FileText, Camera, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function KYCPage() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState({});

  const [kycData, setKycData] = useState({
    verification_level: 'tier_2',
    identity_type: 'national_id',
    identity_number: '',
    date_of_birth: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    occupation: '',
    income_range: '',
    purpose_of_account: ''
  });

  const getKYCStatusBadge = (status) => {
    const variants = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      in_progress: { color: 'bg-blue-100 text-blue-800', icon: Clock },
      completed: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      rejected: { color: 'bg-red-100 text-red-800', icon: AlertCircle }
    };

    const variant = variants[status] || variants.pending;
    const Icon = variant.icon;

    return (
      <Badge className={variant.color}>
        <Icon className="w-3 h-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </Badge>
    );
  };

  const handleDocumentUpload = (documentType) => {
    // Simulate file upload
    setUploadedDocuments(prev => ({
      ...prev,
      [documentType]: {
        name: `${documentType}_document.pdf`,
        uploaded: true,
        verified: false
      }
    }));
  };

  const handleSubmitKYC = async () => {
    setLoading(true);
    // Simulate KYC submission
    setTimeout(() => {
      setLoading(false);
      alert('KYC verification submitted successfully! We will review your documents within 24-48 hours.');
    }, 2000);
  };

  const steps = [
    { id: 1, title: 'Personal Information', description: 'Basic details and verification level' },
    { id: 2, title: 'Identity Verification', description: 'Upload identity documents' },
    { id: 3, title: 'Address Verification', description: 'Proof of address documents' },
    { id: 4, title: 'Additional Information', description: 'Occupation and income details' },
    { id: 5, title: 'Review & Submit', description: 'Review all information before submission' }
  ];

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="verification_level">Verification Level</Label>
              <Select
                value={kycData.verification_level}
                onValueChange={(value) => setKycData({...kycData, verification_level: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tier_1">Tier 1 - Basic (₦50,000 daily limit)</SelectItem>
                  <SelectItem value="tier_2">Tier 2 - Standard (₦200,000 daily limit)</SelectItem>
                  <SelectItem value="tier_3">Tier 3 - Premium (₦5,000,000 daily limit)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="identity_type">Identity Document Type</Label>
              <Select
                value={kycData.identity_type}
                onValueChange={(value) => setKycData({...kycData, identity_type: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="national_id">National ID Card</SelectItem>
                  <SelectItem value="drivers_license">Driver's License</SelectItem>
                  <SelectItem value="passport">International Passport</SelectItem>
                  <SelectItem value="voters_card">Voter's Card</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="identity_number">Identity Number</Label>
              <Input
                id="identity_number"
                value={kycData.identity_number}
                onChange={(e) => setKycData({...kycData, identity_number: e.target.value})}
                placeholder="Enter your ID number"
              />
            </div>

            <div>
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <Input
                id="date_of_birth"
                type="date"
                value={kycData.date_of_birth}
                onChange={(e) => setKycData({...kycData, date_of_birth: e.target.value})}
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                Please upload clear, high-quality images of your identity document. 
                Ensure all text is readable and the document is not expired.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Front of {kycData.identity_type.replace('_', ' ')}</h3>
                {uploadedDocuments.identity_front ? (
                  <div className="flex items-center justify-center text-green-600">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    <span>{uploadedDocuments.identity_front.name}</span>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    onClick={() => handleDocumentUpload('identity_front')}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Upload Front
                  </Button>
                )}
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Back of {kycData.identity_type.replace('_', ' ')}</h3>
                {uploadedDocuments.identity_back ? (
                  <div className="flex items-center justify-center text-green-600">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    <span>{uploadedDocuments.identity_back.name}</span>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    onClick={() => handleDocumentUpload('identity_back')}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Upload Back
                  </Button>
                )}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  value={kycData.address}
                  onChange={(e) => setKycData({...kycData, address: e.target.value})}
                  placeholder="Enter your full address"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={kycData.city}
                    onChange={(e) => setKycData({...kycData, city: e.target.value})}
                    placeholder="City"
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={kycData.state}
                    onChange={(e) => setKycData({...kycData, state: e.target.value})}
                    placeholder="State"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="postal_code">Postal Code</Label>
                <Input
                  id="postal_code"
                  value={kycData.postal_code}
                  onChange={(e) => setKycData({...kycData, postal_code: e.target.value})}
                  placeholder="Postal code"
                />
              </div>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Proof of Address</h3>
              <p className="text-sm text-gray-600 mb-4">
                Upload a utility bill, bank statement, or government document (not older than 3 months)
              </p>
              {uploadedDocuments.proof_of_address ? (
                <div className="flex items-center justify-center text-green-600">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  <span>{uploadedDocuments.proof_of_address.name}</span>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  onClick={() => handleDocumentUpload('proof_of_address')}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Upload Document
                </Button>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="occupation">Occupation</Label>
              <Input
                id="occupation"
                value={kycData.occupation}
                onChange={(e) => setKycData({...kycData, occupation: e.target.value})}
                placeholder="Your occupation"
              />
            </div>

            <div>
              <Label htmlFor="income_range">Monthly Income Range</Label>
              <Select
                value={kycData.income_range}
                onValueChange={(value) => setKycData({...kycData, income_range: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select income range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="below_50k">Below ₦50,000</SelectItem>
                  <SelectItem value="50k_100k">₦50,000 - ₦100,000</SelectItem>
                  <SelectItem value="100k_250k">₦100,000 - ₦250,000</SelectItem>
                  <SelectItem value="250k_500k">₦250,000 - ₦500,000</SelectItem>
                  <SelectItem value="500k_1m">₦500,000 - ₦1,000,000</SelectItem>
                  <SelectItem value="above_1m">Above ₦1,000,000</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="purpose_of_account">Purpose of Account</Label>
              <Select
                value={kycData.purpose_of_account}
                onValueChange={(value) => setKycData({...kycData, purpose_of_account: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal_savings">Personal Savings</SelectItem>
                  <SelectItem value="salary_account">Salary Account</SelectItem>
                  <SelectItem value="business_transactions">Business Transactions</SelectItem>
                  <SelectItem value="investment">Investment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Please review all information carefully before submitting your KYC verification.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Personal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Verification Level:</span>
                    <span className="font-medium">{kycData.verification_level.replace('_', ' ').toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Identity Type:</span>
                    <span className="font-medium">{kycData.identity_type.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Identity Number:</span>
                    <span className="font-medium">{kycData.identity_number}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Documents Uploaded</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(uploadedDocuments).map(([key, doc]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-gray-600">{key.replace('_', ' ')}:</span>
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          <span className="text-sm">Uploaded</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Button 
              onClick={handleSubmitKYC}
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Submitting...
                </>
              ) : (
                'Submit KYC Verification'
              )}
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">KYC Verification</h1>
            <p className="text-gray-600 mt-2">Complete your identity verification to unlock all features</p>
          </div>
          <div>
            {getKYCStatusBadge(user?.kyc_status || 'pending')}
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                currentStep >= step.id 
                  ? 'bg-blue-600 border-blue-600 text-white' 
                  : 'border-gray-300 text-gray-500'
              }`}>
                {currentStep > step.id ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <span className="text-sm font-semibold">{step.id}</span>
                )}
              </div>
              {index < steps.length - 1 && (
                <div className={`w-16 h-0.5 mx-2 ${
                  currentStep > step.id ? 'bg-blue-600' : 'bg-gray-300'
                }`} />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4">
          <h3 className="font-semibold">{steps[currentStep - 1].title}</h3>
          <p className="text-sm text-gray-600">{steps[currentStep - 1].description}</p>
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6">
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button 
          variant="outline"
          onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
          disabled={currentStep === 1}
        >
          Previous
        </Button>
        
        {currentStep < 5 && (
          <Button 
            onClick={() => setCurrentStep(Math.min(5, currentStep + 1))}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
