import React from 'react';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';

export const OfflineIndicator = ({ isOnline: isOnlineProp }) => {
  const { isOnline: detected } = useOfflineStatus();
  const isOnline = isOnlineProp !== undefined ? isOnlineProp : detected;
  if (isOnline) return null;
  return (
    <div className="bg-yellow-100 text-yellow-800 text-sm text-center py-1 px-2" role="status">
      You are offline. Some features may be unavailable.
    </div>
  );
};
export default OfflineIndicator;
