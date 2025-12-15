import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useOnlineStatus } from '../hooks/useOnlineStatus'; // Assuming a custom hook for online status
import AuthService from '../services/AuthService';
import ApiService from '../services/ApiService';
import NotificationService from '../services/NotificationService';
import { Button, Input, Select, Textarea, Card, Spinner, Alert, Tabs, Tab } from '../components/ui/'; // Mock UI components

// --- Component Definition ---
const InsuranceClaims = () => {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus(); // Custom hook for offline indicator

  // State for the main view (History, File Claim, Status)
  const [activeTab, setActiveTab] = useState('history');

  // State for data fetching
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // State for the new claim form
  const [newClaim, setNewClaim] = useState({
    policyNumber: '',
    claimType: '',
    description: '',
    dateOfIncident: '',
    attachments: [],
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for checking a specific claim status
  const [claimIdToCheck, setClaimIdToCheck] = useState('');
  const [checkedClaimStatus, setCheckedClaimStatus] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusError, setStatusError] = useState(null);

  // --- Effects ---

  // 1. Fetch Claim History on component mount and tab change
  useEffect(() => {
    if (activeTab === 'history') {
      fetchClaimHistory();
    }
  }, [activeTab]);

  // --- Event Handlers and Logic ---

  const fetchClaimHistory = async () => {
    if (!isOnline) {
      setError('You are offline. Cannot fetch claim history.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Mock API call
      const response = await ApiService.get('/claims/history');
      setClaims(response.data.claims || []);
    } catch (err) {
      setError('Failed to fetch claim history. Please try again.');
      NotificationService.error('Failed to load claims.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewClaimChange = (e) => {
    const { name, value } = e.target;
    setNewClaim(prev => ({ ...prev, [name]: value }));
    // Clear error for the field on change
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validateClaimForm = () => {
    let errors = {};
    if (!newClaim.policyNumber) errors.policyNumber = 'Policy number is required.';
    if (!newClaim.claimType) errors.claimType = 'Claim type is required.';
    if (!newClaim.description || newClaim.description.length < 10) errors.description = 'Description must be at least 10 characters.';
    if (!newClaim.dateOfIncident) errors.dateOfIncident = 'Date of incident is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    if (!validateClaimForm()) {
      NotificationService.warning('Please correct the errors in the form.');
      return;
    }
    if (!isOnline) {
      NotificationService.error('Cannot submit claim while offline. Please try again when connected.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Mock API call
      const response = await ApiService.post('/claims/file', newClaim);
      NotificationService.success('Claim filed successfully! Claim ID: ' + response.data.claimId);
      // Reset form and navigate to status view or history
      setNewClaim({ policyNumber: '', claimType: '', description: '', dateOfIncident: '', attachments: [] });
      setActiveTab('status');
      setClaimIdToCheck(response.data.claimId); // Automatically check status of the new claim
    } catch (err) {
      NotificationService.error('Failed to file claim. Please check your details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusCheck = async (e) => {
    e.preventDefault();
    if (!claimIdToCheck) {
      setStatusError('Claim ID is required.');
      return;
    }
    if (!isOnline) {
      setStatusError('You are offline. Cannot check claim status.');
      return;
    }

    setCheckingStatus(true);
    setStatusError(null);
    setCheckedClaimStatus(null);
    try {
      // Mock API call
      const response = await ApiService.get(`/claims/status/${claimIdToCheck}`);
      setCheckedClaimStatus(response.data.statusDetails);
    } catch (err) {
      setStatusError('Claim not found or an error occurred.');
      NotificationService.error('Failed to check claim status.');
    } finally {
      setCheckingStatus(false);
    }
  };

  // --- Render Helpers ---

  const renderOfflineIndicator = () => (
    <div className={`p-2 text-center text-sm font-medium ${isOnline ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
      {isOnline ? 'Online' : 'Offline Mode - Limited Functionality'}
    </div>
  );

  const renderClaimHistory = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-48">
          <Spinner size="lg" />
          <p className="ml-3 text-gray-600">Loading claim history...</p>
        </div>
      );
    }

    if (error) {
      return <Alert type="error" message={error} />;
    }

    if (claims.length === 0) {
      return (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900">No Claims Found</h3>
          <p className="mt-1 text-sm text-gray-500">
            It looks like you haven't filed any claims yet.
          </p>
          <Button className="mt-4" onClick={() => setActiveTab('file')}>File a New Claim</Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {claims.map((claim) => (
          <Card key={claim.id} className="p-4 shadow-md hover:shadow-lg transition duration-150 ease-in-out">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-indigo-600">Claim ID: {claim.id}</p>
                <h4 className="text-lg font-bold text-gray-900">{claim.claimType}</h4>
              </div>
              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                claim.status === 'Approved' ? 'bg-green-100 text-green-800' :
                claim.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {claim.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-500">Incident Date: {claim.dateOfIncident}</p>
            <p className="text-sm text-gray-500">Policy: {claim.policyNumber}</p>
            <Link to={`/claims/${claim.id}`} className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">
              View Details &rarr;
            </Link>
          </Card>
        ))}
      </div>
    );
  };

  const renderFileClaimForm = () => (
    <form onSubmit={handleClaimSubmit} className="space-y-6">
      <Card className="p-6 shadow-lg">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">File a New Claim</h3>

        <Input
          label="Policy Number"
          name="policyNumber"
          value={newClaim.policyNumber}
          onChange={handleNewClaimChange}
          placeholder="e.g., ABC-123456"
          error={formErrors.policyNumber}
          required
        />

        <Select
          label="Claim Type"
          name="claimType"
          value={newClaim.claimType}
          onChange={handleNewClaimChange}
          error={formErrors.claimType}
          required
        >
          <option value="">Select a claim type</option>
          <option value="Auto">Auto</option>
          <option value="Home">Home</option>
          <option value="Health">Health</option>
          <option value="Life">Life</option>
        </Select>

        <Input
          label="Date of Incident"
          name="dateOfIncident"
          type="date"
          value={newClaim.dateOfIncident}
          onChange={handleNewClaimChange}
          error={formErrors.dateOfIncident}
          required
        />

        <Textarea
          label="Description of Incident"
          name="description"
          value={newClaim.description}
          onChange={handleNewClaimChange}
          placeholder="Provide a detailed description of the incident..."
          rows="4"
          error={formErrors.description}
          required
        />

        {/* Attachment upload component would go here (mocked for now) */}
        <div className="border-t pt-4">
          <p className="text-sm font-medium text-gray-700">Attachments (Photos, Documents)</p>
          <p className="text-xs text-gray-500">Max file size 5MB. Supported formats: PDF, JPG, PNG.</p>
          {/* In a real app, this would be a dedicated file upload component */}
        </div>

        <Button type="submit" disabled={isSubmitting || !isOnline} className="w-full">
          {isSubmitting ? <Spinner size="sm" className="mr-2" /> : 'Submit Claim'}
        </Button>
        {!isOnline && <Alert type="warning" message="Cannot submit claim while offline." />}
      </Card>
    </form>
  );

  const renderClaimStatusCheck = () => (
    <div className="space-y-6">
      <Card className="p-6 shadow-lg">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Check Claim Status</h3>
        <form onSubmit={handleStatusCheck} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-grow">
            <Input
              label="Enter Claim ID"
              name="claimIdToCheck"
              value={claimIdToCheck}
              onChange={(e) => {
                setClaimIdToCheck(e.target.value);
                setStatusError(null);
              }}
              placeholder="e.g., CLM-2025-00123"
              error={statusError}
              required
            />
          </div>
          <Button type="submit" disabled={checkingStatus || !isOnline} className="sm:self-end h-10">
            {checkingStatus ? <Spinner size="sm" /> : 'Check Status'}
          </Button>
        </form>
      </Card>

      {checkingStatus && (
        <div className="flex justify-center items-center p-6">
          <Spinner size="lg" />
          <p className="ml-3 text-gray-600">Checking status...</p>
        </div>
      )}

      {checkedClaimStatus && (
        <Card className="p-6 shadow-lg border-l-4 border-indigo-500">
          <h4 className="text-lg font-bold text-gray-900 mb-2">Status for Claim ID: {claimIdToCheck}</h4>
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">Current Status:</span>
              <span className={`ml-2 px-3 py-1 text-sm font-semibold rounded-full ${
                checkedClaimStatus.status === 'Approved' ? 'bg-green-100 text-green-800' :
                checkedClaimStatus.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {checkedClaimStatus.status}
              </span>
            </p>
            <p className="text-sm text-gray-700"><span className="font-semibold">Last Updated:</span> {checkedClaimStatus.lastUpdated}</p>
            <p className="text-sm text-gray-700"><span className="font-semibold">Next Step:</span> {checkedClaimStatus.nextStep}</p>
            <p className="text-sm text-gray-700"><span className="font-semibold">Adjuster:</span> {checkedClaimStatus.adjusterName}</p>
          </div>
          <Button variant="link" className="mt-4" onClick={() => navigate(`/claims/${claimIdToCheck}`)}>View Full Timeline</Button>
        </Card>
      )}
    </div>
  );

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-gray-100">
      {renderOfflineIndicator()}
      <header className="p-4 bg-white shadow-md">
        <h1 className="text-2xl font-bold text-gray-900">Insurance Claims</h1>
        <p className="text-sm text-gray-500">Manage your claims, check status, and file new ones.</p>
      </header>

      <main className="p-4 max-w-4xl mx-auto">
        <Tabs activeTab={activeTab} setActiveTab={setActiveTab}>
          <Tab id="history" title="Claim History" />
          <Tab id="file" title="File a Claim" />
          <Tab id="status" title="Check Status" />
        </Tabs>

        <div className="mt-6">
          {activeTab === 'history' && renderClaimHistory()}
          {activeTab === 'file' && renderFileClaimForm()}
          {activeTab === 'status' && renderClaimStatusCheck()}
        </div>
      </main>

      <footer className="p-4 text-center text-xs text-gray-500">
        &copy; {new Date().getFullYear()} NeoBank Insurance.
      </footer>
    </div>
  );
};

export default InsuranceClaims;

// Mock data structure for reference
/*
const mockClaims = [
  { id: 'CLM-2025-00101', policyNumber: 'ABC-123456', claimType: 'Auto', dateOfIncident: '2025-10-20', status: 'Approved' },
  { id: 'CLM-2025-00102', policyNumber: 'DEF-789012', claimType: 'Home', dateOfIncident: '2025-09-15', status: 'Pending' },
  { id: 'CLM-2025-00103', policyNumber: 'GHI-345678', claimType: 'Health', dateOfIncident: '2025-08-01', status: 'Denied' },
];

const mockStatusDetails = {
  status: 'Pending',
  lastUpdated: '2025-11-01 10:30 AM',
  nextStep: 'Awaiting adjuster review and damage assessment.',
  adjusterName: 'Jane Doe',
};
*/

// Mock useOnlineStatus hook for completeness
/*
const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};
*/