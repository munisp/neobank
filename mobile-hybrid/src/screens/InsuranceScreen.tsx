import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

// --- Mock Service Imports (Assuming they exist in src/services) ---
// In a real app, these would be imported from the actual service files.
// For this task, we will define the types and mock the functions.

// Mocking the service structure based on the requirement: "Use the services from src/services (AuthService, ApiService, NotificationService, StorageService)"
// We'll focus on a mock ApiService for data fetching.

// --- 1. TypeScript Interfaces ---

interface InsuranceProduct {
  id: string;
  name: string;
  description: string;
  category: 'Life' | 'Health' | 'Auto' | 'Home';
  premium: number; // Annual premium
  coverage: string;
  features: string[];
}

interface ActivePolicy {
  id: string;
  productName: string;
  policyNumber: string;
  startDate: string;
  endDate: string;
  premium: number;
  status: 'Active' | 'Expired' | 'Pending';
}

interface QuoteRequest {
  productId: string;
  details: Record<string, any>; // e.g., car model, house value, age
}

interface QuoteResponse {
  quoteId: string;
  premiumEstimate: number;
  validUntil: string;
}

// --- 2. Mock API Service Hooks ---

// Mock data
const MOCK_PRODUCTS: InsuranceProduct[] = [
  { id: 'p1', name: 'Comprehensive Auto', description: 'Full coverage for your vehicle.', category: 'Auto', premium: 1200, coverage: '$500k', features: ['Roadside Assistance', 'Accident Forgiveness'] },
  { id: 'p2', name: 'Term Life 20-Year', description: 'Secure your family\'s future for 20 years.', category: 'Life', premium: 500, coverage: '$1M', features: ['Guaranteed Premium', 'Convertible'] },
  { id: 'p3', name: 'Family Health Plan', description: 'Extensive medical coverage for the whole family.', category: 'Health', premium: 3000, coverage: 'Unlimited', features: ['Annual Checkups', 'Dental & Vision'] },
  { id: 'p4', name: 'Standard Home Insurance', description: 'Protect your property against common risks.', category: 'Home', premium: 800, coverage: '$300k', features: ['Fire Protection', 'Theft Coverage'] },
];

const MOCK_POLICIES: ActivePolicy[] = [
  { id: 'pol1', productName: 'Comprehensive Auto', policyNumber: 'AUTO-12345', startDate: '2024-01-01', endDate: '2025-01-01', premium: 1200, status: 'Active' },
  { id: 'pol2', productName: 'Term Life 20-Year', policyNumber: 'LIFE-67890', startDate: '2023-05-15', endDate: '2043-05-15', premium: 500, status: 'Active' },
];

/**
 * Mock hook to fetch insurance products.
 */
const useInsuranceProducts = () => {
  const [products, setProducts] = useState<InsuranceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        setProducts(MOCK_PRODUCTS);
      } catch (e) {
        setError('Failed to fetch insurance products.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  return { products, loading, error };
};

/**
 * Mock hook to fetch active policies.
 */
const useActivePolicies = () => {
  const [policies, setPolicies] = useState<ActivePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 800));
        setPolicies(MOCK_POLICIES);
      } catch (e) {
        setError('Failed to fetch active policies.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchPolicies();
  }, []);

  return { policies, loading, error };
};

// --- Start of InsuranceScreen Component ---

const { width } = Dimensions.get('window');
const isWeb = width > 768; // Simple check for web/tablet-like view

// --- 3. UI Components Implementation ---

// Component for Active Policies
const ActivePoliciesComponent: React.FC<{ policies: ActivePolicy[] }> = ({ policies }) => {
  const renderPolicy = ({ item }: { item: ActivePolicy }) => (
    <View style={styles.policyCard}>
      <Text style={styles.policyTitle}>{item.productName}</Text>
      <Text style={styles.policyDetail}>Policy No: {item.policyNumber}</Text>
      <Text style={styles.policyDetail}>Expires: {item.endDate}</Text>
      <Text style={[styles.policyStatus, item.status === 'Active' ? styles.statusActive : styles.statusExpired]}>
        {item.status}
      </Text>
    </View>
  );

  return (
    <View>
      <Text style={styles.sectionTitle}>Active Policies ({policies.length})</Text>
      {policies.length === 0 ? (
        <Text style={styles.noDataText}>No active policies found.</Text>
      ) : (
        <FlatList
          data={policies}
          renderItem={renderPolicy}
          keyExtractor={(item) => item.id}
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.policyList}
        />
      )}
    </View>
  );
};

// Component for Product Catalog
const ProductCatalogComponent: React.FC<{ products: InsuranceProduct[], onSelect: (product: InsuranceProduct) => void }> = ({ products, onSelect }) => {
  const renderProduct = ({ item }: { item: InsuranceProduct }) => (
    <TouchableOpacity style={[styles.productCard, isWeb && { flexBasis: '48%' }]} onPress={() => onSelect(item)}>
      <Text style={styles.productTitle}>{item.name}</Text>
      <Text style={styles.productCategory}>{item.category}</Text>
      <Text style={styles.productDescription} numberOfLines={2}>{item.description}</Text>
      <View style={styles.productFooter}>
        <Text style={styles.productPremium}>${item.premium.toLocaleString()}/yr</Text>
        <Text style={styles.productCoverage}>{item.coverage} Coverage</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View>
      <Text style={styles.sectionTitle}>Product Catalog</Text>
      <View style={isWeb ? styles.productGrid : styles.productMobileList}>
        {products.map(product => (
          <View key={product.id} style={isWeb ? styles.productGridItem : styles.productMobileListItem}>
            {renderProduct({ item: product })}
          </View>
        ))}
      </View>
    </View>
  );
};

// Component for Comparison Tool (Simple placeholder for now)
const ComparisonToolComponent: React.FC<{ selectedProduct: InsuranceProduct | null }> = ({ selectedProduct }) => {
  return (
    <View>
      <Text style={styles.sectionTitle}>Product Comparison</Text>
      {selectedProduct ? (
        <View style={styles.comparisonBox}>
          <Text style={styles.comparisonText}>Comparing: {selectedProduct.name}</Text>
          <Text style={styles.comparisonFeature}>Features: {selectedProduct.features.join(', ')}</Text>
          <TouchableOpacity style={styles.compareButton}>
            <Text style={styles.compareButtonText}>Add to Compare</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.noDataText}>Select a product from the catalog to start comparison.</Text>
      )}
    </View>
  );
};

// Component for Premium Calculator (Simple form placeholder)
const PremiumCalculatorComponent: React.FC<{ onCalculate: (input: any) => void }> = ({ onCalculate }) => {
  const [value, setValue] = useState('');

  const handleCalculate = () => {
    // In a real app, this would be a complex form submission
    Alert.alert('Calculator', `Simulating calculation for value: ${value}`);
    onCalculate({ calculatedValue: value });
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Premium Calculator</Text>
      <Text style={styles.calculatorLabel}>Enter Value (e.g., Car Price, House Value)</Text>
      {/* Using a simple Text input placeholder for React Native Web compatibility */}
      <View style={styles.textInputPlaceholder}>
        <Text style={{ color: '#666' }}>Input Field Placeholder (e.g., TextInput)</Text>
      </View>
      <TouchableOpacity style={styles.calculateButton} onPress={handleCalculate}>
        <Text style={styles.calculateButtonText}>Calculate Estimate</Text>
      </TouchableOpacity>
    </View>
  );
};

// Component for Quote Button
const QuoteButtonComponent: React.FC<{ onQuote: () => void }> = ({ onQuote }) => {
  return (
    <View style={styles.quoteSection}>
      <Text style={styles.quoteText}>Ready to secure your future?</Text>
      <TouchableOpacity style={styles.quoteButton} onPress={onQuote}>
        <Text style={styles.quoteButtonText}>Get a Personalized Quote</Text>
      </TouchableOpacity>
    </View>
  );
};

const InsuranceScreen: React.FC = () => {
  const navigation = useNavigation();
  // We'll assume a hook to refresh data exists for the retry button in Phase 4
  const { products, loading: loadingProducts, error: errorProducts } = useInsuranceProducts();
  const { policies, loading: loadingPolicies, error: errorPolicies } = useActivePolicies();

  // State for comparison/quote
  const [selectedProduct, setSelectedProduct] = useState<InsuranceProduct | null>(null);
  const [calculatorInput, setCalculatorInput] = useState<any>({}); // State for calculator form input

  // Combined loading and error states
  const isLoading = loadingProducts || loadingPolicies;
  const hasError = errorProducts || errorPolicies;

  // Function to handle product selection for comparison/quote
  const handleProductSelect = useCallback((product: InsuranceProduct) => {
    setSelectedProduct(product);
    // Optionally navigate or show a modal here
  }, []);

  // Function to handle the main "Get a Quote" button
  const handleMainQuote = useCallback(() => {
    Alert.alert('Main Quote', 'Navigating to the main quote form.');
  }, []);

  // --- Helper Components for Loading/Error States ---

  const ErrorState: React.FC<{ message: string }> = ({ message }) => (
    <View style={styles.centered}>
      <Text style={styles.errorText}>Error: {message}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={() => { /* In a real app, trigger a re-fetch */ }}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading Insurance Data...</Text>
      </View>
    );
  }

  if (hasError) {
    return <ErrorState message={errorProducts || errorPolicies || 'An unknown error occurred.'} />;
  }

  // --- Main Screen Layout ---

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.header}>Insurance Hub</Text>

      {/* Active Policies Section (Top Priority) */}
      <View style={styles.section}>
        <ActivePoliciesComponent policies={policies} />
      </View>

      {/* Main Content Area: Catalog, Comparison, Calculator */}
      <View style={isWeb ? styles.webLayout : styles.mobileLayout}>
        <View style={isWeb ? styles.webMainColumn : styles.mobileFullWidth}>
          <View style={styles.section}>
            <ProductCatalogComponent products={products} onSelect={handleProductSelect} />
          </View>
          <View style={styles.section}>
            <ComparisonToolComponent selectedProduct={selectedProduct} />
          </View>
        </View>

        <View style={isWeb ? styles.webSideColumn : styles.mobileFullWidth}>
          <View style={styles.section}>
            <PremiumCalculatorComponent onCalculate={setCalculatorInput} />
          </View>
          <View style={styles.section}>
            <QuoteButtonComponent onQuote={handleMainQuote} />
          </View>
        </View>
      </View>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    marginBottom: 10,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    margin: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  // Responsive Layout Styles
  webLayout: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 10,
  },
  mobileLayout: {
    flexDirection: 'column',
  },
  webMainColumn: {
    flex: 2, // Takes 2/3 of the space
    minWidth: 300,
  },
  webSideColumn: {
    flex: 1, // Takes 1/3 of the space
    minWidth: 300,
  },
  mobileFullWidth: {
    width: '100%',
  },
  // Loading/Error Styles
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  errorText: {
    fontSize: 18,
    color: '#dc3545',
    marginBottom: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007bff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Policy Card Styles
  policyList: {
    paddingVertical: 5,
  },
  policyCard: {
    backgroundColor: '#e6f7ff',
    padding: 15,
    borderRadius: 8,
    marginRight: 10,
    width: 200,
    borderLeftWidth: 5,
    borderLeftColor: '#007bff',
  },
  policyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  policyDetail: {
    fontSize: 12,
    color: '#555',
  },
  policyStatus: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusActive: {
    color: '#28a745',
  },
  statusExpired: {
    color: '#dc3545',
  },
  noDataText: {
    fontSize: 14,
    color: '#6c757d',
    paddingVertical: 10,
  },
  // Product Card Styles
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  productGridItem: {
    width: '48%', // Approx half width for two columns
    marginBottom: 10,
  },
  productMobileList: {
    flexDirection: 'column',
  },
  productMobileListItem: {
    marginBottom: 10,
  },
  productCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    height: '100%', // Ensure cards in the grid are the same height
  },
  productTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007bff',
    marginBottom: 5,
  },
  productCategory: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: '#f8f9fa',
    alignSelf: 'flex-start',
    borderRadius: 3,
  },
  productDescription: {
    fontSize: 14,
    color: '#333',
    marginBottom: 10,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  productPremium: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28a745',
  },
  productCoverage: {
    fontSize: 12,
    color: '#007bff',
    fontWeight: '500',
  },
  // Comparison Styles
  comparisonBox: {
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 5,
    borderLeftWidth: 3,
    borderLeftColor: '#ffc107',
  },
  comparisonText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 5,
  },
  comparisonFeature: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  compareButton: {
    backgroundColor: '#ffc107',
    paddingVertical: 8,
    borderRadius: 5,
    alignItems: 'center',
  },
  compareButtonText: {
    color: '#333',
    fontWeight: '600',
  },
  // Calculator Styles
  calculatorLabel: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
  },
  textInputPlaceholder: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  calculateButton: {
    backgroundColor: '#17a2b8',
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  calculateButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  // Quote Button Styles
  quoteSection: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#e9ecef',
    borderRadius: 8,
  },
  quoteText: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 15,
    color: '#333',
  },
  quoteButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  quoteButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
});

export default InsuranceScreen;
