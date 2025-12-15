import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  Dimensions,
  ScrollView,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

// --- MOCK SERVICE IMPORTS ---
// In a real application, these would be imported from 'src/services'
// For this task, we'll define mock functions to simulate service calls.

// Mocking the required services:
// - ApiService for fetching documents
// - NotificationService for showing alerts/toasts
// - StorageService for handling file operations (download/upload)

// --- 1. TYPE DEFINITIONS ---

/**
 * Interface for a single document item.
 */
interface Document {
  id: string;
  name: string;
  category: string;
  fileType: 'pdf' | 'doc' | 'img' | 'other';
  size: number; // in bytes
  uploadDate: string; // ISO date string
  url: string; // URL to view/download the document
}

/**
 * Interface for a document category.
 */
interface Category {
  id: string;
  name: string;
}

/**
 * Interface for the state of the screen.
 */
interface DocumentsScreenState {
  documents: Document[];
  categories: Category[];
  selectedCategory: string | null;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
}

// --- 2. MOCK DATA ---

const MOCK_CATEGORIES: Category[] = [
  { id: 'all', name: 'All Documents' },
  { id: 'statements', name: 'Statements' },
  { id: 'invoices', name: 'Invoices' },
  { id: 'tax', name: 'Tax Documents' },
  { id: 'agreements', name: 'Agreements' },
];

const MOCK_DOCUMENTS: Document[] = [
  {
    id: 'doc1',
    name: 'Monthly Statement - Oct 2025',
    category: 'statements',
    fileType: 'pdf',
    size: 150000,
    uploadDate: '2025-10-31T10:00:00Z',
    url: 'https://mockapi.com/documents/doc1.pdf',
  },
  {
    id: 'doc2',
    name: 'Q3 Tax Filing',
    category: 'tax',
    fileType: 'pdf',
    size: 520000,
    uploadDate: '2025-10-15T12:30:00Z',
    url: 'https://mockapi.com/documents/doc2.pdf',
  },
  {
    id: 'doc3',
    name: 'Service Agreement v1.2',
    category: 'agreements',
    fileType: 'doc',
    size: 80000,
    uploadDate: '2025-09-01T09:00:00Z',
    url: 'https://mockapi.com/documents/doc3.doc',
  },
  {
    id: 'doc4',
    name: 'Invoice #2025-11-001',
    category: 'invoices',
    fileType: 'pdf',
    size: 95000,
    uploadDate: '2025-11-01T14:00:00Z',
    url: 'https://mockapi.com/documents/doc4.pdf',
  },
  {
    id: 'doc5',
    name: 'Profile Photo',
    category: 'other',
    fileType: 'img',
    size: 250000,
    uploadDate: '2025-08-20T16:00:00Z',
    url: 'https://mockapi.com/documents/doc5.jpg',
  },
];

// --- 3. MOCK SERVICE IMPLEMENTATIONS ---

const ApiService = {
  fetchDocuments: async (category: string | null, query: string): Promise<Document[]> => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 800));

    let filteredDocs = MOCK_DOCUMENTS;

    // Filter by category
    if (category && category !== 'all') {
      filteredDocs = filteredDocs.filter(doc => doc.category === category);
    }

    // Filter by search query
    if (query) {
      const lowerQuery = query.toLowerCase();
      filteredDocs = filteredDocs.filter(
        doc => doc.name.toLowerCase().includes(lowerQuery) || doc.category.toLowerCase().includes(lowerQuery)
      );
    }

    // Simulate a random error for demonstration
    // if (Math.random() < 0.1) {
    //   throw new Error('Failed to fetch documents due to network error.');
    // }

    return filteredDocs;
  },
  fetchCategories: async (): Promise<Category[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_CATEGORIES;
  },
};

const NotificationService = {
  showSuccess: (message: string) => {
    if (Platform.OS === 'web') {
      console.log(`SUCCESS: ${message}`);
    }
    Alert.alert('Success', message);
  },
  showError: (message: string) => {
    if (Platform.OS === 'web') {
      console.error(`ERROR: ${message}`);
    }
    Alert.alert('Error', message);
  },
};

const StorageService = {
  uploadDocument: async (file: any): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    NotificationService.showSuccess(`Document "${file.name}" uploaded successfully.`);
    return true;
  },
  downloadDocument: async (doc: Document): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    NotificationService.showSuccess(`Document "${doc.name}" downloaded.`);
    // In a real app, this would handle the actual file download process
    return true;
  },
};

// --- 4. UTILITY FUNCTIONS ---

const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getFileIcon = (fileType: Document['fileType']) => {
  switch (fileType) {
    case 'pdf':
      return 'file-pdf-o';
    case 'doc':
      return 'file-word-o';
    case 'img':
      return 'file-image-o';
    default:
      return 'file-o';
  }
};

// --- 5. COMPONENTS ---

/**
 * Renders a single document item in the list.
 */
const DocumentItem: React.FC<{ document: Document; onAction: (action: 'view' | 'download', doc: Document) => void }> = ({
  document,
  onAction,
}) => {
  const date = new Date(document.uploadDate).toLocaleDateString();
  const size = formatBytes(document.size);
  const iconName = getFileIcon(document.fileType);

  return (
    <View style={styles.documentItem}>
      <FontAwesome name={iconName} size={24} color="#007AFF" style={styles.documentIcon} />
      <View style={styles.documentInfo}>
        <Text style={styles.documentName} numberOfLines={1}>
          {document.name}
        </Text>
        <Text style={styles.documentMeta}>
          {document.category} | {size} | {date}
        </Text>
      </View>
      <View style={styles.documentActions}>
        <TouchableOpacity
          onPress={() => onAction('view', document)}
          style={styles.actionButton}
          accessibilityLabel={`View ${document.name}`}
        >
          <FontAwesome name="eye" size={20} color="#555" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onAction('download', document)}
          style={styles.actionButton}
          accessibilityLabel={`Download ${document.name}`}
        >
          <FontAwesome name="download" size={20} color="#555" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

/**
 * Renders the list of categories for filtering.
 */
const CategoryFilter: React.FC<{
  categories: Category[];
  selectedCategory: string | null;
  onSelect: (categoryId: string) => void;
}> = ({ categories, selectedCategory, onSelect }) => {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryContainer}>
      {categories.map(category => (
        <TouchableOpacity
          key={category.id}
          style={[
            styles.categoryButton,
            selectedCategory === category.id && styles.categoryButtonSelected,
          ]}
          onPress={() => onSelect(category.id)}
        >
          <Text
            style={[
              styles.categoryText,
              selectedCategory === category.id && styles.categoryTextSelected,
            ]}
          >
            {category.name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

// --- 6. MAIN SCREEN COMPONENT ---

const DocumentsScreen: React.FC = () => {
  const [state, setState] = useState<DocumentsScreenState>({
    documents: [],
    categories: MOCK_CATEGORIES, // Initialize with mock categories
    selectedCategory: 'all',
    searchQuery: '',
    isLoading: false,
    error: null,
  });

  const { documents, categories, selectedCategory, searchQuery, isLoading, error } = state;

  // --- Data Fetching Logic ---

  const fetchDocuments = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const fetchedDocs = await ApiService.fetchDocuments(selectedCategory, searchQuery);
      setState(s => ({ ...s, documents: fetchedDocs, isLoading: false }));
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      NotificationService.showError(`Failed to load documents: ${errorMessage}`);
      setState(s => ({ ...s, error: errorMessage, isLoading: false }));
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // --- Handlers ---

  const handleCategorySelect = (categoryId: string) => {
    setState(s => ({ ...s, selectedCategory: categoryId }));
  };

  const handleSearchChange = (query: string) => {
    setState(s => ({ ...s, searchQuery: query }));
  };

  const handleDocumentAction = (action: 'view' | 'download', doc: Document) => {
    if (action === 'view') {
      // In a real app, this would navigate to a document viewer screen
      // or open the URL in a web browser/in-app viewer.
      Alert.alert('View Document', `Simulating viewing of: ${doc.name} at URL: ${doc.url}`);
    } else if (action === 'download') {
      // Simulate download process
      StorageService.downloadDocument(doc);
    }
  };

  const handleUpload = async () => {
    // In a real app, this would open a file picker.
    // For simulation, we'll mock a successful upload.
    const mockFile = { name: 'New_Document_2025.pdf' };
    Alert.alert(
      'Upload Document',
      'Simulating file picker and upload...',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Simulate Upload',
          onPress: () => {
            StorageService.uploadDocument(mockFile);
            // After successful upload, refresh the list
            fetchDocuments();
          },
        },
      ]
    );
  };

  // --- UI Rendering ---

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Documents</Text>
      <TouchableOpacity onPress={handleUpload} style={styles.uploadButton}>
        <FontAwesome name="upload" size={20} color="#FFF" />
        <Text style={styles.uploadButtonText}>Upload</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSearchAndFilter = () => (
    <View style={styles.controlsContainer}>
      <View style={styles.searchContainer}>
        <FontAwesome name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search documents..."
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholderTextColor="#888"
        />
      </View>
      <CategoryFilter
        categories={categories}
        selectedCategory={selectedCategory}
        onSelect={handleCategorySelect}
      />
    </View>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading documents...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <FontAwesome name="exclamation-triangle" size={30} color="#FF3B30" />
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity onPress={fetchDocuments} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (documents.length === 0) {
      return (
        <View style={styles.centered}>
          <FontAwesome name="folder-open-o" size={40} color="#CCC" />
          <Text style={styles.emptyText}>No documents found.</Text>
          <Text style={styles.emptySubText}>
            Try adjusting your search or category filter.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={documents}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <DocumentItem document={item} onAction={handleDocumentAction} />}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    );
  };

  return (
    <View style={styles.container}>
      {renderHeader()}
      {renderSearchAndFilter()}
      <View style={styles.listContainer}>
        {renderContent()}
      </View>
    </View>
  );
};

// --- 7. STYLES ---

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';
const isMobile = !isWeb;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    ...Platform.select({
      web: {
        paddingTop: 20, // Extra padding for web header
      },
    }),
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: '#FFF',
    fontWeight: '600',
    marginLeft: 8,
  },
  controlsContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: '#333',
    // Web-specific styles for better input feel
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      },
    }),
  },
  categoryContainer: {
    paddingVertical: 5,
  },
  categoryButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#E0E0E0',
  },
  categoryButtonSelected: {
    backgroundColor: '#007AFF',
  },
  categoryText: {
    color: '#333',
    fontWeight: '500',
  },
  categoryTextSelected: {
    color: '#FFF',
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: isMobile ? 0 : Math.max(20, (width - 800) / 2), // Center content on web
    paddingBottom: 20,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 15,
    backgroundColor: '#FFF',
    // Responsive design: on web, add a slight shadow/border for card effect
    ...Platform.select({
      web: {
        marginHorizontal: 10,
        marginVertical: 5,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  documentIcon: {
    width: 30,
    textAlign: 'center',
  },
  documentInfo: {
    flex: 1,
    marginLeft: 15,
    marginRight: 10,
  },
  documentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  documentMeta: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  documentActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    marginLeft: 15,
    padding: 5,
  },
  separator: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 15,
    ...Platform.select({
      web: {
        marginHorizontal: 0, // Separator is part of the list item on web
      },
    }),
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 15,
    fontSize: 18,
    fontWeight: '600',
    color: '#555',
  },
  emptySubText: {
    marginTop: 5,
    fontSize: 14,
    color: '#888',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
});

export default DocumentsScreen;