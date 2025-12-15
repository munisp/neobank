import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ApiService } from '../services/ApiService';
import LoadingSpinner from '../components/LoadingSpinner';

const InsurancePolicy = () => {
  const { policyId } = useParams();
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPolicy();
  }, [policyId]);

  const loadPolicy = async () => {
    try {
      const data = await ApiService.get(`/insurance/policies/${policyId}`);
      setPolicy(data);
    } catch (error) {
      console.error('Load policy error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Policy not found</p>
        <Link to="/insurance" className="text-indigo-600 hover:text-indigo-800 mt-4 inline-block">
          Back to Insurance
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Policy Details</h1>
      
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="text-sm text-gray-600">Policy Number</label>
          <p className="text-lg font-semibold">{policy.policyNumber}</p>
        </div>
        
        <div>
          <label className="text-sm text-gray-600">Product</label>
          <p className="text-lg font-semibold">{policy.productName}</p>
        </div>
        
        <div>
          <label className="text-sm text-gray-600">Coverage Amount</label>
          <p className="text-lg font-semibold">₦{policy.coverageAmount?.toLocaleString()}</p>
        </div>
        
        <div>
          <label className="text-sm text-gray-600">Premium</label>
          <p className="text-lg font-semibold">₦{policy.premium?.toLocaleString()}/month</p>
        </div>
        
        <div>
          <label className="text-sm text-gray-600">Status</label>
          <p className={`text-lg font-semibold ${policy.status === 'active' ? 'text-green-600' : 'text-gray-600'}`}>
            {policy.status}
          </p>
        </div>
      </div>
      
      <div className="mt-6">
        <Link
          to="/insurance"
          className="text-indigo-600 hover:text-indigo-800"
        >
          ← Back to Insurance
        </Link>
      </div>
    </div>
  );
};

export default InsurancePolicy;
