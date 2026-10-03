import { useState, useCallback } from 'react';
import ApiService from '../services/ApiService';

// Generic data-fetching hook facade over ApiService.
export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (fn) => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    fetchData: (endpoint, params) => run(() => ApiService.get(endpoint, params)),
    postData: (endpoint, data) => run(() => ApiService.post(endpoint, data)),
    putData: (endpoint, data) => run(() => ApiService.put(endpoint, data)),
    deleteData: (endpoint) => run(() => ApiService.delete(endpoint)),
  };
};
export default useApi;
