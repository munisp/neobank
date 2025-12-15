import React, { useState, useCallback, useMemo } from 'react';
import { PlusCircle, FileText, Clock, History, MessageSquare, Bell, DollarSign, Upload, Send, X } from 'lucide-react';

// --- 1. Data Models (TypeScript Interfaces) ---

/**
 * Represents the status of an insurance claim.
 */
type ClaimStatus = 'Draft' | 'Submitted' | 'Under Review' | 'Awaiting Documents' | 'Approved' | 'Settled' | 'Rejected';

/**
 * Represents a single insurance claim.
 */
interface Claim {
  id: string;
  policyNumber: string;
  claimType: string;
  dateOfLoss: string;
  description: string;
  status: ClaimStatus;
  lastUpdated: string;
  settlementAmount?: number;
}

/**
 * Represents a supporting document for a claim.
 */
interface Document {
  id: string;
  fileName: string;
  uploadDate: string;
  status: 'Pending' | 'Verified' | 'Rejected';
  url: string;
}

/**
 * Represents a message in the chat with an adjuster.
 */
interface Message {
  id: string;
  sender: 'User' | 'Adjuster';
  content: string;
  timestamp: string;
}

/**
 * Represents a claim notification.
 */
interface Notification {
  id: string;
  claimId: string;
  message: string;
  timestamp: string;
  read: boolean;
}

// --- 2. Mock API Endpoints and Data ---

const MOCK_CLAIMS: Claim[] = [
  {
    id: 'C-001023',
    policyNumber: 'POL-98765',
    claimType: 'Auto Accident',
    dateOfLoss: '2025-10-20',
    description: 'Minor fender-bender on Main Street.',
    status: 'Under Review',
    lastUpdated: '2025-11-01',
  },
  {
    id: 'C-001022',
    policyNumber: 'POL-12345',
    claimType: 'Home Damage',
    dateOfLoss: '2025-09-15',
    description: 'Water damage in the kitchen due to burst pipe.',
    status: 'Settled',
    lastUpdated: '2025-10-25',
    settlementAmount: 15500.00,
  },
  {
    id: 'C-001021',
    policyNumber: 'POL-54321',
    claimType: 'Theft',
    dateOfLoss: '2025-08-01',
    description: 'Stolen bicycle from garage.',
    status: 'Awaiting Documents',
    lastUpdated: '2025-08-05',
  },
];

const MOCK_DOCUMENTS: Document[] = [
  { id: 'D-001', fileName: 'Police Report.pdf', uploadDate: '2025-10-21', status: 'Verified', url: '#' },
  { id: 'D-002', fileName: 'Repair Estimate.docx', uploadDate: '2025-10-22', status: 'Pending', url: '#' },
];

const MOCK_MESSAGES: Message[] = [
  { id: 'M-001', sender: 'Adjuster', content: 'Hello, I am your adjuster, John Doe. I have received your claim and am reviewing the details.', timestamp: '2025-11-01 10:30' },
  { id: 'M-002', sender: 'User', content: 'Hi John, thanks for the update. Let me know if you need anything else.', timestamp: '2025-11-01 10:35' },
];

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'N-001', claimId: 'C-001023', message: 'Claim C-001023 status updated to "Under Review".', timestamp: '2025-11-01 09:00', read: false },
  { id: 'N-002', claimId: 'C-001022', message: 'Settlement details for C-001022 are available.', timestamp: '2025-10-25 14:00', read: true },
];

const API_ENDPOINTS = {
  fetchClaims: '/api/insurance/claims',
  submitClaim: '/api/insurance/claims/new',
  uploadDocument: '/api/insurance/claims/{claimId}/documents',
  fetchClaimDetails: '/api/insurance/claims/{claimId}',
  fetchMessages: '/api/insurance/claims/{claimId}/chat',
  sendMessage: '/api/insurance/claims/{claimId}/chat',
  fetchNotifications: '/api/insurance/notifications',
};

// Mock API Call Function
const mockApiCall = <T,>(data: T, delay = 500): Promise<T> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delay);
  });
};

// --- 3. Component State Management ---

type ActiveTab = 'New Claim' | 'Track Status' | 'History' | 'Chat' | 'Notifications' | 'Settlement';

interface ClaimsState {
  claims: Claim[];
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  selectedClaimId: string | null;
}

// --- 4. Utility Components (for better structure) ---

const StatusBadge: React.FC<{ status: ClaimStatus }> = ({ status }) => {
  const colorMap: Record<ClaimStatus, string> = {
    'Draft': 'bg-gray-100 text-gray-800',
    'Submitted': 'bg-blue-100 text-blue-800',
    'Under Review': 'bg-yellow-100 text-yellow-800',
    'Awaiting Documents': 'bg-red-100 text-red-800',
    'Approved': 'bg-green-100 text-green-800',
    'Settled': 'bg-purple-100 text-purple-800',
    'Rejected': 'bg-red-500 text-white',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colorMap[status]}`}>
      {status}
    </span>
  );
};

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white shadow-lg rounded-xl p-6">
    <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">{title}</h2>
    {children}
  </div>
);

// --- 5. Feature Components (Placeholders for now) ---

const NewClaimForm: React.FC<{ onSubmit: (claim: Omit<Claim, 'id' | 'status' | 'lastUpdated'>) => void }> = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    policyNumber: '',
    claimType: '',
    dateOfLoss: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setSubmitError(null);
    setSubmitSuccess(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      // Mock submission logic
      await mockApiCall({}, 1500); // Simulate API call
      onSubmit(formData);
      
      // Simulate document upload
      if (file) {
        console.log(`Uploading file: ${file.name}`);
        await mockApiCall({}, 1000);
      }

      setSubmitSuccess(true);
      setFormData({ policyNumber: '', claimType: '', dateOfLoss: '', description: '' });
      setFile(null);

    } catch (err) {
      setSubmitError('Failed to submit claim. Please check your details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card title="File a New Claim">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="policyNumber" className="block text-sm font-medium text-gray-700">Policy Number</label>
            <input
              type="text"
              name="policyNumber"
              id="policyNumber"
              value={formData.policyNumber}
              onChange={handleChange}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            />
          </div>
          <div>
            <label htmlFor="claimType" className="block text-sm font-medium text-gray-700">Claim Type</label>
            <select
              name="claimType"
              id="claimType"
              value={formData.claimType}
              onChange={handleChange}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white"
            >
              <option value="">Select Type</option>
              <option value="Auto Accident">Auto Accident</option>
              <option value="Home Damage">Home Damage</option>
              <option value="Theft">Theft</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="dateOfLoss" className="block text-sm font-medium text-gray-700">Date of Loss</label>
          <input
            type="date"
            name="dateOfLoss"
            id="dateOfLoss"
            value={formData.dateOfLoss}
            onChange={handleChange}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description of Loss</label>
          <textarea
            name="description"
            id="description"
            rows={4}
            value={formData.description}
            onChange={handleChange}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
          />
        </div>

        {/* Upload Supporting Documents Feature */}
        <div className="border-t pt-4">
          <label htmlFor="supportingDocument" className="block text-sm font-medium text-gray-700 mb-2">Upload Supporting Documents (Optional)</label>
          <div className="flex items-center space-x-4">
            <label className="cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold py-2 px-4 rounded-lg border border-indigo-300 transition duration-150 ease-in-out flex items-center">
              <Upload className="w-5 h-5 mr-2" />
              <span>{file ? 'Change File' : 'Choose File'}</span>
              <input
                type="file"
                id="supportingDocument"
                name="supportingDocument"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {file && (
              <div className="flex items-center text-sm text-gray-600">
                <FileText className="w-4 h-4 mr-1" />
                <span>{file.name}</span>
                <button type="button" onClick={() => setFile(null)} className="ml-2 text-red-500 hover:text-red-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {submitError && (
          <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
            {submitError}
          </div>
        )}

        {submitSuccess && (
          <div className="p-3 text-sm text-green-700 bg-green-100 rounded-lg" role="alert">
            Claim submitted successfully! You can track its status now.
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Claim'}
        </button>
      </form>
    </Card>
  );
};

const ClaimHistory: React.FC<{ claims: Claim[]; onSelectClaim: (id: string) => void }> = ({ claims, onSelectClaim }) => {
  return (
    <Card title="Claim History">
      {claims.length === 0 ? (
        <p className="text-gray-500">No claims found in your history.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Claim ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date of Loss</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {claims.map((claim) => (
                <tr key={claim.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{claim.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{claim.claimType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{claim.dateOfLoss}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={claim.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => onSelectClaim(claim.id)}
                      className="text-indigo-600 hover:text-indigo-900 font-semibold"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const TrackClaimStatus: React.FC<{ claim: Claim | undefined; documents: Document[] }> = ({ claim, documents }) => {
  if (!claim) {
    return <Card title="Track Claim Status"><p className="text-gray-500">Please select a claim from history to track its status.</p></Card>;
  }

  const timelineSteps: { status: ClaimStatus; title: string; date: string | null }[] = [
    { status: 'Submitted', title: 'Claim Submitted', date: '2025-10-20' },
    { status: 'Under Review', title: 'Review in Progress', date: '2025-10-21' },
    { status: 'Awaiting Documents', title: 'Documents Requested', date: '2025-10-25' },
    { status: 'Approved', title: 'Claim Approved', date: null },
    { status: 'Settled', title: 'Settlement Processed', date: null },
  ];

  const currentStepIndex = timelineSteps.findIndex(step => step.status === claim.status);

  return (
    <Card title={`Tracking Claim: ${claim.id}`}>
      <div className="mb-6">
        <p className="text-lg font-medium text-gray-800">Current Status: <StatusBadge status={claim.status} /></p>
        <p className="text-sm text-gray-500 mt-1">Last Updated: {claim.lastUpdated}</p>
      </div>

      {/* Status Timeline */}
      <h3 className="text-lg font-semibold text-gray-700 mb-3">Claim Timeline</h3>
      <ol className="relative border-l border-gray-200 ml-4">
        {timelineSteps.map((step, index) => (
          <li key={step.status} className="mb-6 ml-6">
            <span className={`absolute flex items-center justify-center w-6 h-6 rounded-full -left-3 ring-8 ring-white ${index <= currentStepIndex ? 'bg-indigo-600' : 'bg-gray-200'}`}>
              {index <= currentStepIndex && <Clock className="w-3 h-3 text-white" />}
            </span>
            <h4 className={`font-semibold ${index <= currentStepIndex ? 'text-gray-900' : 'text-gray-500'}`}>{step.title}</h4>
            <p className="text-sm text-gray-500">{step.date || (index === currentStepIndex ? 'Current Step' : 'Pending')}</p>
          </li>
        ))}
      </ol>

      {/* Supporting Documents */}
      <h3 className="text-lg font-semibold text-gray-700 mt-6 mb-3 border-t pt-4">Supporting Documents</h3>
      {documents.length === 0 ? (
        <p className="text-gray-500">No documents uploaded yet.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <FileText className="w-5 h-5 text-indigo-500 mr-3" />
                <span className="text-sm font-medium text-gray-700">{doc.fileName}</span>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${doc.status === 'Verified' ? 'bg-green-100 text-green-800' : doc.status === 'Rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {doc.status}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button className="mt-4 text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center">
        <Upload className="w-4 h-4 mr-1" />
        Upload Additional Documents
      </button>
    </Card>
  );
};

const ChatWithAdjuster: React.FC<{ claimId: string }> = ({ claimId }) => {
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const messageToSend: Message = {
      id: `M-${Date.now()}`,
      sender: 'User',
      content: newMessage.trim(),
      timestamp: new Date().toLocaleTimeString(),
    };

    setIsSending(true);
    setNewMessage('');
    setMessages(prev => [...prev, messageToSend]);

    try {
      // Simulate API call to send message
      await mockApiCall({}, 500);
      // Simulate adjuster response
      setTimeout(() => {
        const adjusterResponse: Message = {
          id: `M-${Date.now() + 1}`,
          sender: 'Adjuster',
          content: 'Thank you for your message. I will look into this and get back to you shortly.',
          timestamp: new Date().toLocaleTimeString(),
        };
        setMessages(prev => [...prev, adjusterResponse]);
      }, 2000);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Revert message or show error
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card title={`Chat for Claim ${claimId}`}>
      <div className="flex flex-col h-96 bg-gray-50 rounded-lg border">
        {/* Message History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'User' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-xl ${msg.sender === 'User' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-tl-none shadow'}`}>
                <p className="text-sm">{msg.content}</p>
                <span className={`block text-xs mt-1 ${msg.sender === 'User' ? 'text-indigo-200' : 'text-gray-400'} text-right`}>{msg.timestamp}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Message Input */}
        <form onSubmit={handleSend} className="p-4 border-t bg-white flex items-center">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 mr-3"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={isSending || !newMessage.trim()}
            className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition duration-150"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </Card>
  );
};

const ClaimNotifications: React.FC<{ notifications: Notification[] }> = ({ notifications }) => {
  const [currentNotifications, setCurrentNotifications] = useState(notifications);

  const markAsRead = (id: string) => {
    setCurrentNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const unreadCount = currentNotifications.filter(n => !n.read).length;

  return (
    <Card title={`Notifications (${unreadCount} unread)`}>
      {currentNotifications.length === 0 ? (
        <p className="text-gray-500">You have no new notifications.</p>
      ) : (
        <ul className="space-y-3">
          {currentNotifications.map((n) => (
            <li
              key={n.id}
              className={`p-4 rounded-lg border cursor-pointer transition duration-150 ease-in-out ${n.read ? 'bg-white border-gray-200' : 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100'}`}
              onClick={() => markAsRead(n.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  {!n.read && <span className="w-2 h-2 bg-indigo-600 rounded-full mr-3 flex-shrink-0"></span>}
                  <p className={`text-sm ${n.read ? 'text-gray-600' : 'font-medium text-gray-800'}`}>
                    <span className="font-semibold mr-1">{n.claimId}:</span> {n.message}
                  </p>
                </div>
                <span className="text-xs text-gray-400 ml-4 flex-shrink-0">{n.timestamp}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const SettlementDetails: React.FC<{ claim: Claim | undefined }> = ({ claim }) => {
  if (!claim) {
    return <Card title="Settlement Details"><p className="text-gray-500">Please select a settled claim to view details.</p></Card>;
  }

  if (claim.status !== 'Settled' || !claim.settlementAmount) {
    return <Card title="Settlement Details"><p className="text-gray-500">Settlement details are only available for settled claims.</p></Card>;
  }

  const settlementDate = new Date(claim.lastUpdated).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Card title={`Settlement for Claim ${claim.id}`}>
      <div className="space-y-4">
        <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center">
            <DollarSign className="w-6 h-6 text-green-600 mr-3" />
            <p className="text-lg font-semibold text-green-800">Total Settlement Amount</p>
          </div>
          <p className="text-2xl font-bold text-green-800">${claim.settlementAmount.toFixed(2)}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-500">Settlement Date</p>
            <p className="text-base font-semibold text-gray-800">{settlementDate}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-500">Payment Method</p>
            <p className="text-base font-semibold text-gray-800">ACH Transfer (NeoBank Account)</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 pt-2">
          The settlement funds have been successfully transferred to your linked NeoBank account.
          A detailed settlement statement has been sent to your registered email address.
        </p>
      </div>
    </Card>
  );
};


// --- 6. Main Component: InsuranceClaimsPage ---

const InsuranceClaimsPage: React.FC = () => {
  const [state, setState] = useState<ClaimsState>({
    claims: MOCK_CLAIMS,
    notifications: MOCK_NOTIFICATIONS,
    loading: false,
    error: null,
    selectedClaimId: MOCK_CLAIMS[0]?.id || null,
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('Track Status');

  // Simulate data fetching on mount
  // In a real app, this would be an effect hook
  const fetchInitialData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const claims = await mockApiCall(MOCK_CLAIMS);
      const notifications = await mockApiCall(MOCK_NOTIFICATIONS);
      setState(prev => ({
        ...prev,
        claims,
        notifications,
        selectedClaimId: claims[0]?.id || null,
      }));
    } catch (e) {
      setState(prev => ({ ...prev, error: 'Failed to load claims data.' }));
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  // useEffect(() => {
  //   fetchInitialData();
  // }, [fetchInitialData]);

  const handleNewClaimSubmit = (newClaimData: Omit<Claim, 'id' | 'status' | 'lastUpdated'>) => {
    const newClaim: Claim = {
      ...newClaimData,
      id: `C-${Math.floor(Math.random() * 100000)}`,
      status: 'Submitted',
      lastUpdated: new Date().toISOString().split('T')[0],
    };
    setState(prev => ({
      ...prev,
      claims: [newClaim, ...prev.claims],
      selectedClaimId: newClaim.id,
    }));
    setActiveTab('Track Status');
  };

  const handleSelectClaim = (id: string) => {
    setState(prev => ({ ...prev, selectedClaimId: id }));
    setActiveTab('Track Status');
  };

  const selectedClaim = useMemo(() => {
    return state.claims.find(c => c.id === state.selectedClaimId);
  }, [state.claims, state.selectedClaimId]);

  const selectedClaimDocuments = useMemo(() => {
    // In a real app, this would fetch documents for the selected claim
    return MOCK_DOCUMENTS;
  }, [state.selectedClaimId]);

  const navItems: { name: ActiveTab; icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
    { name: 'New Claim', icon: PlusCircle },
    { name: 'Track Status', icon: Clock },
    { name: 'History', icon: History },
    { name: 'Chat', icon: MessageSquare },
    { name: 'Notifications', icon: Bell },
    { name: 'Settlement', icon: DollarSign },
  ];

  const renderContent = () => {
    if (state.loading) {
      return <div className="text-center p-10 text-lg text-indigo-600">Loading claims data...</div>;
    }

    if (state.error) {
      return <div className="text-center p-10 text-lg text-red-600">Error: {state.error}</div>;
    }

    switch (activeTab) {
      case 'New Claim':
        return <NewClaimForm onSubmit={handleNewClaimSubmit} />;
      case 'Track Status':
        return <TrackClaimStatus claim={selectedClaim} documents={selectedClaimDocuments} />;
      case 'History':
        return <ClaimHistory claims={state.claims} onSelectClaim={handleSelectClaim} />;
      case 'Chat':
        return selectedClaim ? <ChatWithAdjuster claimId={selectedClaim.id} /> : <Card title="Chat with Adjuster"><p className="text-gray-500">Please select a claim to start chatting.</p></Card>;
      case 'Notifications':
        return <ClaimNotifications notifications={state.notifications} />;
      case 'Settlement':
        return <SettlementDetails claim={selectedClaim} />;
      default:
        return <NewClaimForm onSubmit={handleNewClaimSubmit} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Insurance Claims Management</h1>
        <p className="text-gray-500">Manage your claims, track status, and communicate with your adjuster.</p>
      </header>

      <div className="lg:flex lg:space-x-8">
        {/* Sidebar Navigation (Responsive) */}
        <nav className="lg:w-64 mb-6 lg:mb-0 flex overflow-x-auto lg:block">
          <div className="flex lg:flex-col space-x-2 lg:space-x-0 lg:space-y-2 p-1 bg-white rounded-xl shadow-lg">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.name;
              const isNotificationTab = item.name === 'Notifications';
              const unreadCount = state.notifications.filter(n => !n.read).length;

              return (
                <button
                  key={item.name}
                  onClick={() => setActiveTab(item.name)}
                  className={`flex items-center w-full px-4 py-3 rounded-lg text-sm font-medium transition duration-150 ease-in-out whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  <span>{item.name}</span>
                  {isNotificationTab && unreadCount > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default InsuranceClaimsPage;