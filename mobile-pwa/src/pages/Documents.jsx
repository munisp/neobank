import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { ApiService } from '../services/ApiService';
import { NotificationService } from '../services/NotificationService';

// Mock UI Components - In a real PWA, these would be imported from '../components/ui/'
const Spinner = () => <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>;
const Button = ({ children, onClick, disabled, className = '', variant = 'primary', type = 'button' }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`px-4 py-2 rounded-lg font-semibold transition duration-150 ease-in-out ${
      variant === 'primary' ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
  >
    {children}
  </button>
);
const Input = ({ type = 'text', placeholder, value, onChange, className = '' }) => (
  <input
    type={type}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 ${className}`}
  />
);
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
};
const Icon = ({ name, className = 'w-6 h-6' }) => {
  // Mock Icon component for file types and actions
  const icons = {
    pdf: '📄', doc: '📝', xls: '📊', default: '📎', upload: '⬆️', download: '⬇️', delete: '🗑️',
    offline: '📴', online: '🌐', error: '⚠️', empty: '📂'
  };
  return <span className={`inline-block align-middle ${className}`}>{icons[name] || icons.default}</span>;
};

// --- Type Definitions (for better readability and type safety in a real TS project) ---
interface Document {
  id: string;
  name: string;
  category: string;
  uploadDate: string;
  fileType: 'pdf' | 'doc' | 'xls' | 'default';
  url: string;
}

interface DocumentCategory {
  id: string;
  name: string;
}

// --- DocumentsScreen Component ---

const DocumentsScreen: React.FC = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  // State for data
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // State for UI/UX
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string>('');

  // --- Data Fetching and Initialization ---

  const fetchDocuments = useCallback(async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // Mock API call: ApiService.get('/documents')
      const mockDocuments: Document[] = [
        { id: '1', name: 'Account Statement Q3 2024', category: 'Statements', uploadDate: '2024-09-30', fileType: 'pdf', url: '/docs/statement_q3.pdf' },
        { id: '2', name: 'Loan Agreement 2023', category: 'Agreements', uploadDate: '2023-05-15', fileType: 'doc', url: '/docs/loan_agreement.doc' },
        { id: '3', name: 'Tax Document 2023', category: 'Tax', uploadDate: '2024-01-20', fileType: 'pdf', url: '/docs/tax_2023.pdf' },
      ];
      setDocuments(mockDocuments);

      // Mock API call: ApiService.get('/document-categories')
      const mockCategories: DocumentCategory[] = [
        { id: 'all', name: 'All Documents' },
        { id: 'Statements', name: 'Statements' },
        { id: 'Agreements', name: 'Agreements' },
        { id: 'Tax', name: 'Tax Documents' },
        { id: 'Other', name: 'Other' },
      ];
      setCategories(mockCategories);
      setUploadCategory(mockCategories.find(c => c.id !== 'all')?.id || ''); // Set default upload category
    } catch (err) {
      setError('Failed to load documents. Please try again.');
      NotificationService.error('Failed to load documents.');
    } finally {
      setIsLoading(false);
    }
  }, [user, navigate]);

  useEffect(() => {
    fetchDocuments();

    // Offline support indicator
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchDocuments]);

  // --- Event Handlers ---

  const handleUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadFile(e.target.files[0]);
    } else {
      setUploadFile(null);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadCategory) {
      NotificationService.warn('Please select a file and a category.');
      return;
    }

    setIsLoading(true);
    try {
      // Mock API call: ApiService.post('/documents/upload', formData)
      // In a real app, you'd use FormData to send the file
      console.log(`Uploading file: ${uploadFile.name} to category: ${uploadCategory}`);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

      const newDoc: Document = {
        id: Date.now().toString(),
        name: uploadFile.name,
        category: uploadCategory,
        uploadDate: new Date().toISOString().split('T')[0],
        fileType: uploadFile.name.split('.').pop() as Document['fileType'] || 'default',
        url: `/docs/${uploadFile.name}`,
      };

      setDocuments(prev => [...prev, newDoc]);
      NotificationService.success('Document uploaded successfully!');
      setIsUploadModalOpen(false);
      setUploadFile(null);
      setUploadCategory(categories.find(c => c.id !== 'all')?.id || '');
    } catch (err) {
      NotificationService.error('Document upload failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = (doc: Document) => {
    if (!isOnline) {
      NotificationService.warn('You are offline. Cannot download documents.');
      return;
    }
    // Mock download logic
    NotificationService.info(`Initiating download for: ${doc.name}`);
    // In a real app, you'd use window.open(doc.url) or a fetch to download the blob
    window.open(doc.url, '_blank');
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      // Mock API call: ApiService.delete(`/documents/${docId}`)
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay

      setDocuments(prev => prev.filter(doc => doc.id !== docId));
      NotificationService.success('Document deleted successfully.');
    } catch (err) {
      NotificationService.error('Failed to delete document.');
    } finally {
      setIsDeleting(false);
    }
  };

  // --- Computed Values ---

  const filteredDocuments = documents.filter(doc =>
    selectedCategory === 'all' || doc.category === selectedCategory
  );

  // --- Render Helpers ---

  const renderDocumentList = () => {
    if (isLoading) {
      return (
        <div className="py-10 text-center">
          <Spinner />
          <p className="mt-4 text-gray-600">Loading your documents...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="py-10 text-center text-red-600">
          <Icon name="error" className="w-10 h-10 mx-auto mb-2" />
          <p className="font-semibold">{error}</p>
          <Button onClick={fetchDocuments} className="mt-4">Try Again</Button>
        </div>
      );
    }

    if (filteredDocuments.length === 0) {
      return (
        <div className="py-10 text-center text-gray-500">
          <Icon name="empty" className="w-10 h-10 mx-auto mb-2" />
          <p className="text-lg font-semibold">No documents found in this category.</p>
          <p className="text-sm">Try selecting a different category or upload a new document.</p>
        </div>
      );
    }

    return (
      <ul className="space-y-3">
        {filteredDocuments.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition duration-150"
          >
            <div className="flex items-center min-w-0 flex-1">
              <Icon name={doc.fileType} className="w-8 h-8 text-primary-600 flex-shrink-0" />
              <div className="ml-4 min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                <p className="text-xs text-gray-500">
                  {doc.category} &bull; Uploaded: {doc.uploadDate}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
              <Button
                onClick={() => handleDownload(doc)}
                variant="secondary"
                className="p-2 text-sm"
                disabled={!isOnline}
              >
                <Icon name="download" className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => handleDelete(doc.id)}
                variant="secondary"
                className="p-2 text-sm text-red-600 hover:bg-red-100"
                disabled={isDeleting}
              >
                <Icon name="delete" className="w-4 h-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  // --- Main Render ---

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Document Management</h1>
        <div className="flex items-center space-x-3">
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            <Icon name={isOnline ? 'online' : 'offline'} className="w-4 h-4 inline-block mr-1" />
            {isOnline ? 'Online' : 'Offline'}
          </span>
          <Button onClick={() => setIsUploadModalOpen(true)} disabled={!isOnline}>
            <Icon name="upload" className="w-5 h-5 mr-1 inline-block" />
            Upload Document
          </Button>
        </div>
      </header>

      {/* Category Filter */}
      <div className="mb-6 overflow-x-auto whitespace-nowrap pb-2">
        <div className="inline-flex space-x-3">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 text-sm font-medium rounded-full transition duration-150 ${
                selectedCategory === cat.id
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Document List */}
      <div className="bg-white p-4 rounded-xl shadow-lg">
        {renderDocumentList()}
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title="Upload New Document"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div>
            <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-1">
              Select File (PDF, DOC, XLS, etc.)
            </label>
            <Input
              type="file"
              id="file-upload"
              onChange={handleUploadFileChange}
              className="p-1 border-none shadow-none"
            />
            {uploadFile && (
              <p className="mt-2 text-sm text-gray-500">Selected: {uploadFile.name}</p>
            )}
          </div>

          <div>
            <label htmlFor="category-select" className="block text-sm font-medium text-gray-700 mb-1">
              Document Category
            </label>
            <select
              id="category-select"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              required
            >
              <option value="" disabled>Select a category</option>
              {categories.filter(c => c.id !== 'all').map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <Button variant="secondary" onClick={() => setIsUploadModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!uploadFile || !uploadCategory || isLoading}>
              {isLoading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DocumentsScreen;
