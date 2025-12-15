import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../services/AuthService'; // Simulated useContext
import ApiService from '../services/ApiService';
import NotificationService from '../services/NotificationService';

// Simulated UI Components
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import PolicyDetailItem from '../components/ui/PolicyDetailItem';
import OfflineIndicator from '../components/ui/OfflineIndicator';

const InsurancePolicy = () => {
  const { policyId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth(); // Simulated context usage
  
  const [policy, setPolicy] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Simulated Policy Data Structure
  const mockPolicyData = {
    id: policyId || 'POL-NBK-2025-12345',
    name: 'NeoBank Comprehensive Auto Insurance',
    type: 'Auto',
    status: 'Active',
    policyHolder: 'John Doe',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    coverage: [
      { name: 'Collision', limit: '$50,000', deductible: '$500' },
      { name: 'Comprehensive', limit: '$25,000', deductible: '$250' },
      { name: 'Liability', limit: '$100,000/$300,000', deductible: 'N/A' },
    ],
    premium: {
      amount: 1200.50,
      frequency: 'Annual',
      nextDueDate: '2025-12-31',
    },
    renewal: {
      status: 'Eligible',
      date: '2025-11-01',
      offer: 1250.00,
    },
    documents: [
      { name: 'Policy Schedule', url: '/documents/schedule.pdf', type: 'PDF' },
      { name: 'Terms & Conditions', url: '/documents/terms.pdf', type: 'PDF' },
      { name: 'ID Card', url: '/documents/idcard.png', type: 'Image' },
    ],
    claimsHistory: [
      { id: 'CLM-001', date: '2025-03-15', status: 'Closed', amount: 4500.00 },
    ],
  };

  const fetchPolicyDetails = useCallback(async () => {
    if (!isAuthenticated) {
      setError('Authentication required to view policy details.');
      setIsLoading(false);
      NotificationService.error('Session expired. Please log in.');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate API call to fetch policy details
      // const response = await ApiService.get(`/policies/${policyId}`);
      // setPolicy(response.data);
      
      // Using mock data for simulation
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
      setPolicy(mockPolicyData);
      
      NotificationService.success(`Policy ${policyId} loaded successfully.`);
    } catch (err) {
      console.error('Failed to fetch policy:', err);
      setError('Failed to load policy details. Please try again.');
      NotificationService.error('Error fetching policy details.');
    } finally {
      setIsLoading(false);
    }
  }, [policyId, isAuthenticated]);

  useEffect(() => {
    fetchPolicyDetails();
    
    // Setup offline/online listener for PWA requirement
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchPolicyDetails]);

  const handleDocumentDownload = (doc) => {
    // In a real PWA, this would trigger a file download or open in a new tab
    NotificationService.info(`Attempting to download ${doc.name} (${doc.type})...`);
    // Simulate download logic
    window.open(doc.url, '_blank');
  };

  const handleRenewal = () => {
    if (policy.renewal.status === 'Eligible') {
      navigate(`/renew-policy/${policy.id}`);
    } else {
      NotificationService.warning('Policy is not currently eligible for online renewal.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <Spinner size="lg" />
        <p className="ml-3 text-gray-600">Loading Policy Details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 max-w-md mx-auto mt-10">
        <Alert type="error" message={error} />
        <Button onClick={() => navigate(-1)} className="mt-4 w-full">Go Back</Button>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="p-4 max-w-md mx-auto mt-10">
        <Alert type="info" message="No policy found for this ID." />
        <Button onClick={() => navigate('/policies')} className="mt-4 w-full">View All Policies</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <OfflineIndicator isOffline={isOffline} />
      
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 truncate">
          {policy.name}
        </h1>
        <Link to="/policies" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
          &larr; Back
        </Link>
      </header>

      {/* Policy Summary Card */}
      <Card className="mb-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Policy Summary</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <PolicyDetailItem label="Policy ID" value={policy.id} />
          <PolicyDetailItem label="Status" value={policy.status} status={policy.status === 'Active' ? 'success' : 'warning'} />
          <PolicyDetailItem label="Policy Type" value={policy.type} />
          <PolicyDetailItem label="Policy Holder" value={policy.policyHolder} />
          <PolicyDetailItem label="Start Date" value={policy.startDate} />
          <PolicyDetailItem label="End Date" value={policy.endDate} />
        </div>
      </Card>

      {/* Coverage Details */}
      <Card className="mb-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Coverage Details</h2>
        <div className="space-y-4">
          {policy.coverage.map((item, index) => (
            <div key={index} className="border-b pb-3 last:border-b-0">
              <p className="font-medium text-gray-700">{item.name}</p>
              <div className="flex justify-between text-sm text-gray-600 mt-1">
                <span>Limit: <span className="font-semibold">{item.limit}</span></span>
                <span>Deductible: <span className="font-semibold">{item.deductible}</span></span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Premium & Renewal */}
      <Card className="mb-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Premium & Renewal</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Premium Information</h3>
            <PolicyDetailItem label="Amount" value={`$${policy.premium.amount.toFixed(2)}`} />
            <PolicyDetailItem label="Frequency" value={policy.premium.frequency} />
            <PolicyDetailItem label="Next Due" value={policy.premium.nextDueDate} />
          </div>
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Renewal Status</h3>
            <PolicyDetailItem label="Status" value={policy.renewal.status} status={policy.renewal.status === 'Eligible' ? 'success' : 'info'} />
            <PolicyDetailItem label="Renewal Date" value={policy.renewal.date} />
            <PolicyDetailItem label="Renewal Offer" value={`$${policy.renewal.offer.toFixed(2)}`} />
            <Button 
              onClick={handleRenewal} 
              disabled={policy.renewal.status !== 'Eligible'}
              className="mt-3 w-full text-sm"
            >
              {policy.renewal.status === 'Eligible' ? 'Renew Policy Now' : 'Renewal Not Available'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Documents */}
      <Card className="mb-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Policy Documents</h2>
        <ul className="divide-y divide-gray-200">
          {policy.documents.map((doc, index) => (
            <li key={index} className="py-3 flex justify-between items-center">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-indigo-600 truncate hover:text-indigo-800 cursor-pointer" onClick={() => handleDocumentDownload(doc)}>
                  {doc.name}
                </p>
                <p className="text-xs text-gray-500">{doc.type}</p>
              </div>
              <Button 
                onClick={() => handleDocumentDownload(doc)} 
                variant="secondary" 
                size="sm"
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
        {policy.documents.length === 0 && (
          <p className="text-sm text-gray-500 italic">No documents available for this policy.</p>
        )}
      </Card>
      
      {/* Claims History - Example of a related feature */}
      <Card className="mb-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Claims History</h2>
        <Link to={`/claims/${policy.id}`} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
          View all {policy.claimsHistory.length} claims &rarr;
        </Link>
        {policy.claimsHistory.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-gray-600">Latest Claim ({policy.claimsHistory[0].id}): {policy.claimsHistory[0].status} on {policy.claimsHistory[0].date}</p>
          </div>
        )}
      </Card>

      {/* Action Button for Support/Contact */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 shadow-2xl">
        <Button 
          onClick={() => navigate('/support')} 
          variant="primary" 
          className="w-full"
        >
          Contact Support for Policy Questions
        </Button>
      </div>
    </div>
  );
};

// Simulated Custom Hook for Auth Service
const useAuth = () => ({
  isAuthenticated: true, // Assume user is logged in for this page
});

export default InsurancePolicy;
