import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ApiService from '../../services/ApiService';

interface Document {
  id: string;
  title: string;
  type: 'statement' | 'tax' | 'loan' | 'receipt' | 'other';
  date: string;
  size: number;
  url: string;
  status: 'available' | 'processing' | 'failed';
}

type DocumentFilter = 'all' | 'statement' | 'tax' | 'loan' | 'receipt' | 'other';

const DocumentsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<DocumentFilter>('all');
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    filterDocuments();
  }, [documents, activeFilter]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getDocuments();
      setDocuments(data);
    } catch (error) {
      console.error('Error fetching documents:', error);
      Alert.alert('Error', 'Failed to load documents');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterDocuments = () => {
    if (activeFilter === 'all') {
      setFilteredDocuments(documents);
    } else {
      setFilteredDocuments(documents.filter((doc) => doc.type === activeFilter));
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDocuments();
  };

  const handleDownload = async (document: Document) => {
    if (document.status !== 'available') {
      Alert.alert('Not Available', 'This document is not ready for download yet');
      return;
    }

    try {
      setDownloading(document.id);
      
      // Open document URL in browser for download
      const supported = await Linking.canOpenURL(document.url);
      if (supported) {
        await Linking.openURL(document.url);
        Alert.alert('Success', 'Document opened in browser');
      } else {
        Alert.alert('Error', 'Cannot open document URL');
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      Alert.alert('Error', 'Failed to download document');
    } finally {
      setDownloading(null);
    }
  };

  const handleShare = async (document: Document) => {
    Alert.alert(
      'Share Document',
      `Share "${document.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share',
          onPress: () => {
            // In a real app, use react-native-share
            Alert.alert('Info', 'Share functionality would be implemented here');
          },
        },
      ]
    );
  };

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'statement':
        return 'file-document';
      case 'tax':
        return 'file-chart';
      case 'loan':
        return 'file-certificate';
      case 'receipt':
        return 'receipt';
      case 'other':
        return 'file';
      default:
        return 'file';
    }
  };

  const getDocumentColor = (type: string) => {
    switch (type) {
      case 'statement':
        return '#3B82F6';
      case 'tax':
        return '#10B981';
      case 'loan':
        return '#F59E0B';
      case 'receipt':
        return '#8B5CF6';
      case 'other':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return '#10B981';
      case 'processing':
        return '#F59E0B';
      case 'failed':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filters: { key: DocumentFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: 'file-multiple' },
    { key: 'statement', label: 'Statements', icon: 'file-document' },
    { key: 'tax', label: 'Tax', icon: 'file-chart' },
    { key: 'loan', label: 'Loans', icon: 'file-certificate' },
    { key: 'receipt', label: 'Receipts', icon: 'receipt' },
    { key: 'other', label: 'Other', icon: 'file' },
  ];

  const getDocumentCount = (filter: DocumentFilter) => {
    if (filter === 'all') return documents.length;
    return documents.filter((doc) => doc.type === filter).length;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading documents...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Documents</Text>
        <TouchableOpacity onPress={handleRefresh}>
          <Icon name="refresh" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[styles.filterTab, activeFilter === filter.key && styles.activeFilterTab]}
            onPress={() => setActiveFilter(filter.key)}
          >
            <Icon
              name={filter.icon}
              size={18}
              color={activeFilter === filter.key ? '#FFFFFF' : '#6B7280'}
            />
            <Text
              style={[styles.filterText, activeFilter === filter.key && styles.activeFilterText]}
            >
              {filter.label}
            </Text>
            <View
              style={[
                styles.filterBadge,
                activeFilter === filter.key && styles.activeFilterBadge,
              ]}
            >
              <Text
                style={[
                  styles.filterBadgeText,
                  activeFilter === filter.key && styles.activeFilterBadgeText,
                ]}
              >
                {getDocumentCount(filter.key)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Documents List */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {filteredDocuments.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="file-document-outline" size={64} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Documents</Text>
            <Text style={styles.emptyText}>
              {activeFilter === 'all'
                ? 'You have no documents yet'
                : `No ${activeFilter} documents found`}
            </Text>
          </View>
        ) : (
          <View style={styles.documentsList}>
            {filteredDocuments.map((document) => (
              <View key={document.id} style={styles.documentCard}>
                <View style={styles.documentHeader}>
                  <View
                    style={[
                      styles.documentIcon,
                      { backgroundColor: `${getDocumentColor(document.type)}20` },
                    ]}
                  >
                    <Icon
                      name={getDocumentIcon(document.type)}
                      size={24}
                      color={getDocumentColor(document.type)}
                    />
                  </View>
                  <View style={styles.documentInfo}>
                    <Text style={styles.documentTitle} numberOfLines={2}>
                      {document.title}
                    </Text>
                    <View style={styles.documentMeta}>
                      <Text style={styles.documentDate}>{formatDate(document.date)}</Text>
                      <Text style={styles.documentSeparator}>•</Text>
                      <Text style={styles.documentSize}>{formatFileSize(document.size)}</Text>
                      <Text style={styles.documentSeparator}>•</Text>
                      <View
                        style={[
                          styles.documentStatus,
                          { backgroundColor: getStatusColor(document.status) },
                        ]}
                      >
                        <Text style={styles.documentStatusText}>
                          {document.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.documentActions}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      downloading === document.id && styles.actionButtonDisabled,
                    ]}
                    onPress={() => handleDownload(document)}
                    disabled={downloading === document.id || document.status !== 'available'}
                  >
                    {downloading === document.id ? (
                      <ActivityIndicator size="small" color="#3B82F6" />
                    ) : (
                      <>
                        <Icon name="download" size={18} color="#3B82F6" />
                        <Text style={styles.actionButtonText}>Download</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleShare(document)}
                    disabled={document.status !== 'available'}
                  >
                    <Icon name="share-variant" size={18} color="#6B7280" />
                    <Text style={[styles.actionButtonText, { color: '#6B7280' }]}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Summary Footer */}
      {filteredDocuments.length > 0 && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Showing {filteredDocuments.length} of {documents.length} documents
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  filterContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterContent: {
    padding: 12,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  activeFilterTab: {
    backgroundColor: '#3B82F6',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
  filterBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  activeFilterBadge: {
    backgroundColor: '#1E40AF',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeFilterBadgeText: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
    marginTop: 64,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  documentsList: {
    padding: 16,
    gap: 12,
  },
  documentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  documentHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  documentIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 6,
  },
  documentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  documentDate: {
    fontSize: 13,
    color: '#6B7280',
  },
  documentSeparator: {
    fontSize: 13,
    color: '#D1D5DB',
    marginHorizontal: 6,
  },
  documentSize: {
    fontSize: 13,
    color: '#6B7280',
  },
  documentStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 4,
  },
  documentStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  documentActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#6B7280',
  },
});

export default DocumentsScreen;

