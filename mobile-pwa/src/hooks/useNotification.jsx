import { useContext, useCallback } from 'react';
import { NotificationContext } from '../contexts/NotificationContext';

// Hook facade over NotificationContext; falls back to a no-op notify so
// pages work even outside the provider tree.
export const useNotification = () => {
  const ctx = useContext(NotificationContext) || {};
  const notify = useCallback((message, type = 'info') => {
    if (typeof ctx.addNotification === 'function') {
      ctx.addNotification({ title: type === 'error' ? 'Error' : 'Notice', message, type });
    }
  }, [ctx]);
  return { ...ctx, notify };
};
export default useNotification;
