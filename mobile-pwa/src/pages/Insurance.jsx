import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { NotificationContext } from '../contexts/NotificationContext';
import LoadingSpinner from '../components/LoadingSpinner';

const Insurance = () => {
  const { addNotification } = useContext(NotificationContext);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [insuranceData, setInsuranceData] = useState({
    policies: [],
    claims: [],
    products: [],
    stats: {}
  });

  useEffect(() => {
    loadInsuranceData();
  }, []);

  const loadInsuranceData = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setInsuranceData({
        policies: [
          {
            id: 1,
            type: 'crop',
            name: 'Cassava Crop Insurance',
            policyNumber: 'CRP-2024-001',
            premium: 15000,
            coverage: 500000,
            status: 'active',
            startDate: new Date('2024-01-15'),
            expiryDate: new Date('2024-12-15'),
            claimsCount: 0,
            description: 'Parametric crop insurance for cassava farming with weather-based triggers'
          },
          {
            id: 2,
            type: 'flight',
            name: 'Flight Delay Insurance',
            policyNumber: 'FLT-2024-002',
            premium: 3500,
            coverage: 50000,
            status: 'claimed',
            startDate: new Date('2024-02-01'),
            expiryDate: new Date('2024-02-02'),
            claimsCount: 1,
            description: 'Automatic compensation for flight delays over 2 hours'
          },
          {
            id: 3,
            type: 'health',
            name: 'Health Micro Insurance',
            policyNumber: 'HTH-2024-003',
            premium: 18000,
            coverage: 300000,
            status: 'active',
            startDate: new Date('2024-01-01'),
            expiryDate: new Date('2024-12-31'),
            claimsCount: 0,
            description: 'Affordable health coverage for emergency medical expenses'
          }
        ],
        claims: [
          {
            id: 1,
            policyId: 2,
            claimNumber: 'CLM-2024-001',
            type: 'flight',
            amount: 25000,
            status: 'approved',
            submittedDate: new Date('2024-02-02'),
            processedDate: new Date('2024-02-02'),
            description: 'Flight P4-7001 delayed by 3 hours',
            automaticPayout: true
          }
        ],
        products: [
          {
            id: 1,
            type: 'crop',
            name: 'Crop Insurance',
            icon: 'wheat',
            description: 'Protect your crops against weather risks with parametric insurance',
            features: ['Weather-based triggers', 'Automatic payouts', 'All major crops covered'],
            premiumRange: '₦8,000 - ₦50,000',
            coverageRange: '₦100,000 - ₦5,000,000',
            color: 'green'
          },
          {
            id: 2,
            type: 'flight',
            name: 'Flight Insurance',
            icon: 'plane',
            description: 'Get compensated for flight delays and cancellations automatically',
            features: ['Instant payouts', 'All Nigerian airlines', 'No paperwork required'],
            premiumRange: '₦2,000 - ₦8,000',
            coverageRange: '₦20,000 - ₦200,000',
            color: 'blue'
          },
          {
            id: 3,
            type: 'health',
            name: 'Health Micro Insurance',
            icon: 'heart-pulse',
            description: 'Affordable health coverage for emergency medical expenses',
            features: ['Emergency coverage', 'Telemedicine included', 'Family plans available'],
            premiumRange: '₦12,000 - ₦25,000',
            coverageRange: '₦200,000 - ₦500,000',
            color: 'red'
          },
          {
            id: 4,
            type: 'weather',
            name: 'Weather Insurance',
            icon: 'cloud-rain',
            description: 'Business protection against extreme weather events',
            features: ['Parametric triggers', 'Quick settlements', 'Custom coverage'],
            premiumRange: '₦5,000 - ₦30,000',
            coverageRange: '₦100,000 - ₦1,000,000',
            color: 'purple'
          }
        ],
        stats: {
          totalPolicies: 3,
          activePolicies: 2,
          totalCoverage: 850000,
          totalPremiums: 36500,
          claimsRatio: 0.33,
          avgProcessingTime: '15 minutes'
        }
      });
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load insurance data'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getInsuranceIcon = (type) => {
    switch (type) {
      case 'crop': return 'wheat';
      case 'flight': return 'plane';
      case 'health': return 'heart-pulse';
      case 'weather': return 'cloud-rain';
      default: return 'shield';
    }
  };

  const getInsuranceColor = (type) => {
    switch (type) {
      case 'crop': return 'green';
      case 'flight': return 'blue';
      case 'health': return 'red';
      case 'weather': return 'purple';
      default: return 'gray';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'expired':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
      case 'claimed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display">
              Decentralized Insurance
            </h1>
            <p className="text-primary-100 mt-1">
              Blockchain-powered insurance products for Nigerian market
            </p>
          </div>
          <div className="hidden md:block">
            <Link
              to="/insurance/quote"
              className="bg-white text-primary-600 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Get Quote
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <i data-lucide="file-text" className="h-6 w-6 text-blue-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Policies</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {insuranceData.stats.activePolicies}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="h-12 w-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
              <i data-lucide="shield-check" className="h-6 w-6 text-green-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Coverage</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(insuranceData.stats.totalCoverage)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
              <i data-lucide="banknote" className="h-6 w-6 text-purple-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Premiums</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(insuranceData.stats.totalPremiums)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="h-12 w-12 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg flex items-center justify-center">
              <i data-lucide="clock" className="h-6 w-6 text-yellow-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Processing</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {insuranceData.stats.avgProcessingTime}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', name: 'Overview', icon: 'eye' },
              { id: 'policies', name: 'My Policies', icon: 'file-text' },
              { id: 'claims', name: 'Claims', icon: 'clipboard-list' },
              { id: 'products', name: 'Available Products', icon: 'shopping-bag' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <i data-lucide={tab.icon} className="h-4 w-4 mr-2"></i>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Portfolio Summary */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Portfolio Summary
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Total Policies</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {insuranceData.stats.totalPolicies}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Claims Ratio</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {(insuranceData.stats.claimsRatio * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Coverage Utilization</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {((insuranceData.stats.totalPremiums / insuranceData.stats.totalCoverage) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Recent Activity
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <div className="h-8 w-8 bg-green-500 rounded-full flex items-center justify-center">
                        <i data-lucide="check" className="h-4 w-4 text-white"></i>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Flight claim approved
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          2 days ago
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <div className="h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <i data-lucide="plus" className="h-4 w-4 text-white"></i>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Health policy renewed
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          1 week ago
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link
                  to="/insurance/quote"
                  className="flex items-center p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                >
                  <i data-lucide="plus-circle" className="h-8 w-8 text-primary-600 mr-4"></i>
                  <div>
                    <p className="font-medium text-primary-700 dark:text-primary-300">
                      Get New Quote
                    </p>
                    <p className="text-sm text-primary-600 dark:text-primary-400">
                      Compare insurance products
                    </p>
                  </div>
                </Link>

                <Link
                  to="/insurance/claims"
                  className="flex items-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                >
                  <i data-lucide="file-plus" className="h-8 w-8 text-green-600 mr-4"></i>
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-300">
                      File a Claim
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Submit insurance claim
                    </p>
                  </div>
                </Link>

                <button className="flex items-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
                  <i data-lucide="headphones" className="h-8 w-8 text-purple-600 mr-4"></i>
                  <div>
                    <p className="font-medium text-purple-700 dark:text-purple-300">
                      Get Support
                    </p>
                    <p className="text-sm text-purple-600 dark:text-purple-400">
                      Contact our team
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Policies Tab */}
          {activeTab === 'policies' && (
            <div className="space-y-4">
              {insuranceData.policies.map((policy) => (
                <div
                  key={policy.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start">
                      <div className={`h-12 w-12 bg-${getInsuranceColor(policy.type)}-100 dark:bg-${getInsuranceColor(policy.type)}-900/20 rounded-lg flex items-center justify-center`}>
                        <i data-lucide={getInsuranceIcon(policy.type)} className={`h-6 w-6 text-${getInsuranceColor(policy.type)}-600`}></i>
                      </div>
                      <div className="ml-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {policy.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                          Policy #{policy.policyNumber}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {policy.description}
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(policy.status)}`}>
                      {policy.status}
                    </span>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Premium</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(policy.premium)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Coverage</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(policy.coverage)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Start Date</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {policy.startDate.toLocaleDateString('en-NG')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Expiry Date</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {policy.expiryDate.toLocaleDateString('en-NG')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Claims: {policy.claimsCount}
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      <Link
                        to={`/insurance/policy/${policy.id}`}
                        className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-500 border border-primary-300 dark:border-primary-600 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/20"
                      >
                        View Details
                      </Link>
                      {policy.status === 'active' && (
                        <Link
                          to="/insurance/claims"
                          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
                        >
                          File Claim
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Claims Tab */}
          {activeTab === 'claims' && (
            <div className="space-y-4">
              {insuranceData.claims.length > 0 ? (
                insuranceData.claims.map((claim) => (
                  <div
                    key={claim.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-6"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Claim #{claim.claimNumber}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                          {claim.description}
                        </p>
                        <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-300">
                          <span>Amount: {formatCurrency(claim.amount)}</span>
                          <span>Submitted: {claim.submittedDate.toLocaleDateString('en-NG')}</span>
                          {claim.automaticPayout && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                              <i data-lucide="zap" className="h-3 w-3 mr-1"></i>
                              Automatic
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(claim.status)}`}>
                        {claim.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <i data-lucide="clipboard-list" className="h-12 w-12 text-gray-400 mx-auto mb-4"></i>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No claims yet
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    You haven't filed any insurance claims yet.
                  </p>
                  <Link
                    to="/insurance/claims"
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                  >
                    File a Claim
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Products Tab */}
          {activeTab === 'products' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {insuranceData.products.map((product) => (
                <div
                  key={product.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start">
                    <div className={`h-12 w-12 bg-${product.color}-100 dark:bg-${product.color}-900/20 rounded-lg flex items-center justify-center`}>
                      <i data-lucide={product.icon} className={`h-6 w-6 text-${product.color}-600`}></i>
                    </div>
                    <div className="ml-4 flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {product.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                        {product.description}
                      </p>
                      
                      <div className="space-y-2 mb-4">
                        {product.features.map((feature, index) => (
                          <div key={index} className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                            <i data-lucide="check" className="h-4 w-4 text-green-500 mr-2"></i>
                            {feature}
                          </div>
                        ))}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Premium Range</p>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {product.premiumRange}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Coverage Range</p>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {product.coverageRange}
                          </p>
                        </div>
                      </div>
                      
                      <Link
                        to={`/insurance/quote?product=${product.type}`}
                        className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                      >
                        Get Quote
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Insurance;

