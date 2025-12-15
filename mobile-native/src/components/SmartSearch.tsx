/**
 * Smart Universal Search
 * Search across all features: transactions, contacts, stocks, crypto, help
 * World-class search experience
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { HapticFeedback } from '../utils/haptics';
import apiService from '../services/ApiService';

const RECENT_SEARCHES_KEY = '@neobank_recent_searches';
const MAX_RECENT_SEARCHES = 10;

interface SearchResult {
  id: string;
  type: 'transaction' | 'contact' | 'stock' | 'crypto' | 'help';
  title: string;
  subtitle: string;
  icon: string;
  data: any;
}

interface SmartSearchProps {
  onResultSelect: (result: SearchResult) => void;
  onClose: () => void;
}

const SmartSearch: React.FC<SmartSearchProps> = ({ onResultSelect, onClose }) => {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadRecentSearches();
  }, []);

  useEffect(() => {
    if (query.length > 0) {
      // Debounce search
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }

      searchTimeout.current = setTimeout(() => {
        performSearch(query);
      }, 300);
    } else {
      setResults([]);
    }

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [query]);

  const loadRecentSearches = async () => {
    try {
      const storedSearches = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (storedSearches) {
        const parsed = JSON.parse(storedSearches);
        setRecentSearches(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error('Failed to load recent searches:', error);
      setRecentSearches([]);
    }
  };

  const saveRecentSearch = async (searchQuery: string) => {
    try {
      const trimmedQuery = searchQuery.trim();
      if (!trimmedQuery) return;

      const updatedSearches = [
        trimmedQuery,
        ...recentSearches.filter(s => s !== trimmedQuery),
      ].slice(0, MAX_RECENT_SEARCHES);

      setRecentSearches(updatedSearches);
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updatedSearches));
    } catch (error) {
      console.error('Failed to save recent search:', error);
    }
  };

  const performSearch = async (searchQuery: string) => {
    setLoading(true);
    try {
      const searchResults = await apiService.universalSearch(searchQuery);
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResultPress = (result: SearchResult) => {
    HapticFeedback.light();
    saveRecentSearch(query);
    onResultSelect(result);
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'transaction':
        return '💳';
      case 'contact':
        return '👤';
      case 'stock':
        return '📈';
      case 'crypto':
        return '₿';
      case 'help':
        return '❓';
      default:
        return '🔍';
    }
  };

  const renderResult = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={[styles.resultItem, { backgroundColor: theme.colors.card }]}
      onPress={() => handleResultPress(item)}
    >
      <Text style={styles.resultIcon}>{getResultIcon(item.type)}</Text>
      <View style={styles.resultContent}>
        <Text style={[styles.resultTitle, { color: theme.colors.text }]}>
          {item.title}
        </Text>
        <Text style={[styles.resultSubtitle, { color: theme.colors.textSecondary }]}>
          {item.subtitle}
        </Text>
      </View>
      <Text style={[styles.resultType, { color: theme.colors.textSecondary }]}>
        {item.type}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Search Header */}
      <View style={[styles.searchHeader, { backgroundColor: theme.colors.surface }]}>
        <TextInput
          style={[styles.searchInput, { color: theme.colors.text }]}
          placeholder="Search transactions, stocks, contacts..."
          placeholderTextColor={theme.colors.placeholder}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={[styles.closeButtonText, { color: theme.colors.primary }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.resultsList}
        />
      ) : query.length > 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
            No results found for "{query}"
          </Text>
        </View>
      ) : (
        <View style={styles.recentContainer}>
          <Text style={[styles.recentTitle, { color: theme.colors.textSecondary }]}>
            Recent Searches
          </Text>
          {recentSearches.map((search, index) => (
            <TouchableOpacity
              key={index}
              style={styles.recentItem}
              onPress={() => setQuery(search)}
            >
              <Text style={[styles.recentText, { color: theme.colors.text }]}>
                {search}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsList: {
    padding: 16,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  resultIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  resultSubtitle: {
    fontSize: 14,
  },
  resultType: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  recentContainer: {
    padding: 16,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  recentItem: {
    paddingVertical: 12,
  },
  recentText: {
    fontSize: 16,
  },
});

export default SmartSearch;

