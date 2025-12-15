import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation, NavigationProp, ParamListBase } from '@react-navigation/native';

// --- Type Definitions ---

/**
 * Defines the structure of a single document item.
 */
interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'image' | 'other';
  size: number; // Size in bytes
  uploadDate: string; // ISO date string
  downloadUrl: string;
}

/**
 * Defines the structure for the API service response.
 */
interface ApiResponse<T> {
  data: T;
  error: string | null;
}

// --- Mock API Service (Replace with actual ApiService) ---

/**
 * A mock implementation of the ApiService for fetching documents.
 * In a real application, this would be an imported module (e.g., import ApiService from '../services/ApiService';)
 */
const ApiService = {
  fetchDocuments: async (): Promise<ApiResponse<Document[]>> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock data
    const mockDocuments: Document[] = [
      {
        id: 'doc-1',
        name: 'Quarterly Report Q3 2025',
        type: 'pdf',
        size: 1520000,
        uploadDate: '2025-10-20T10:00:00Z',
        downloadUrl: 'https://api.example.com/download/doc-1',
      },
      {
        id: 'doc-2',
        name: 'Client Agreement v1.2',
        type: 'doc',
        size: 85000,
        uploadDate: '2025-10-15T14:30:00Z',
        downloadUrl: 'https://api.example.com/download/doc-2',
      },
      {
        id: 'doc-3',
        name: 'Team Photo September',
        type: 'image',
        size: 4200000,
        uploadDate: '2025-09-30T09:00:00Z',
        downloadUrl: 'https://api.example.com/download/doc-3',
      },
      {
        id: 'doc-4',
        name: 'Project Specs',
        type: 'other',
        size: 25000,
        uploadDate: '2025-09-01T11:00:00Z',
        downloadUrl: 'https://api.example.com/download/doc-4',
      },
    ];

    // Simulate success or failure randomly for demonstration
    if (Math.random() > 0.1) {
      return { data: mockDocuments, error: null };
    } else {
      return { data: [], error: 'Failed to connect to the document server.' };
    }
  },
  // Mock function for downloading a document (PWA feature equivalent)
  downloadDocument: async (docId: string): Promise<ApiResponse<boolean>> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const success = Math.random() > 0.2;
    if (success) {
      return { data: true, error: null };
    } else {
      return { data: false, error: `Failed to initiate download for ${docId}.` };
    }
  }
};

// --- Utility Functions ---

/**
 * Converts bytes to a human-readable string (KB, MB).
 */
const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// --- Components ---

interface DocumentItemProps {
  item: Document;
  onPress: (document: Document) => void;
}

const DocumentItem: React.FC<DocumentItemProps> = ({ item, onPress }) => {
  // Simple icon representation based on file type
  const getIcon = (type: Document['type']) => {
    switch (type) {
      case 'pdf':
        return '📄'; // Document icon
      case 'doc':
        return '📝'; // Memo/Text icon
      case 'image':
        return '🖼️'; // Image icon
      default:
        return '📦'; // Package/Other icon
    }
  };

  return (
    <TouchableOpacity style={styles.itemContainer} onPress={() => onPress(item)}>
      <Text style={styles.itemIcon}>{getIcon(item.type)}</Text>
      <View style={styles.itemDetails}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemMeta}>
          {formatBytes(item.size)} | Uploaded: {new Date(item.uploadDate).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.itemAction}>⬇️</Text>
    </TouchableOpacity>
  );
};

// --- Main Screen Component ---

type DocumentsScreenNavigationProp = NavigationProp<ParamListBase>;

const DocumentsScreen: React.FC = () => {
  const navigation = useNavigation<DocumentsScreenNavigationProp>();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches the list of documents from the API service.
   * Includes loading, error, and refreshing state management.
   */
  const fetchDocuments = useCallback(async (isInitialLoad: boolean = false) => {
    if (isInitialLoad) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    try {
      // API service call using the existing ApiService
      const response = await ApiService.fetchDocuments();

      if (response.error) {
        setError(response.error);
        setDocuments([]);
      } else {
        // Sort documents by upload date descending
        const sortedData = response.data.sort((a, b) => 
          new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
        );
        setDocuments(sortedData);
      }
    } catch (e) {
      // Handle unexpected network or parsing errors
      console.error('Fetch documents error:', e);
      setError('An unexpected error occurred while fetching documents.');
      setDocuments([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial data fetch on component mount
  useEffect(() => {
    fetchDocuments(true);
  }, [fetchDocuments]);

  /**
   * Handles the press event on a document item.
   * This simulates the PWA feature of viewing/downloading a document.
   */
  const handleDocumentPress = async (document: Document) => {
    // In a real app, this would navigate to a viewer or initiate a background download.
    Alert.alert(
      'Download Document',
      `Do you want to download "${document.name}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Download',
          onPress: async () => {
            // Simulate download API call
            const response = await ApiService.downloadDocument(document.id);
            if (response.error) {
              Alert.alert('Download Failed', response.error);
            } else {
              // On success, a real implementation would use a library like rn-fetch-blob
              // to save the file to the device's file system.
              Alert.alert('Download Started', `Downloading ${document.name} from ${document.downloadUrl}...`);
            }
          },
        },
      ],
    );
    
    // Example of navigation integration (e.g., to a DocumentDetailScreen)
    // navigation.navigate('DocumentDetail', { documentId: document.id });
  };

  // --- Render Logic ---

  if (isLoading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading documents...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchDocuments(true)}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (documents.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.emptyText}>No documents found.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchDocuments(true)}>
          <Text style={styles.retryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Documents</Text>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <DocumentItem item={item} onPress={handleDocumentPress} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => fetchDocuments(false)} />
        }
        // Add a separator for better visual separation
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      {/* Feature from PWA: Add New Document button */}
      <TouchableOpacity style={styles.fab} onPress={() => Alert.alert('Upload Document', 'Navigate to upload screen.')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: 'red',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContent: {
    paddingBottom: 80, // Space for FAB
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#FFFFFF',
  },
  itemIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  itemMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  itemAction: {
    fontSize: 20,
    color: '#007AFF',
    marginLeft: 10,
  },
  separator: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginLeft: 54, // Align with item details
  },
  fab: {
    position: 'absolute',
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    right: 30,
    bottom: 30,
    backgroundColor: '#007AFF',
    borderRadius: 30,
    elevation: 8, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 30,
    color: 'white',
    lineHeight: Platform.OS === 'ios' ? 30 : 35, // Adjust line height for better centering
  },
});

export default DocumentsScreen;