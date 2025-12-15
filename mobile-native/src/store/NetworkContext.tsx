import React, { createContext, useContext, useState, useEffect } from 'react';
// Note: Would need: npm install react-native-netinfo
// import NetInfo from '@react-native-community/netinfo';
import OfflineService from '../services/OfflineService';
import apiService from '../services/ApiService';

interface NetworkContextType {
  isConnected: boolean;
  isInternetReachable: boolean;
  connectionType: string;
  syncPending: number;
  triggerSync: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  isInternetReachable: true,
  connectionType: 'wifi',
  syncPending: 0,
  triggerSync: async () => {},
});

export const useNetwork = () => useContext(NetworkContext);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);
  const [connectionType, setConnectionType] = useState('wifi');
  const [syncPending, setSyncPending] = useState(0);

  useEffect(() => {
    // Subscribe to network state changes
    // const unsubscribe = NetInfo.addEventListener((state) => {
    //   setIsConnected(state.isConnected ?? false);
    //   setIsInternetReachable(state.isInternetReachable ?? false);
    //   setConnectionType(state.type);
    //   
    //   // Trigger sync when connection is restored
    //   if (state.isConnected && state.isInternetReachable) {
    //     triggerSync();
    //   }
    // });

    // Simulated network state
    const simulatedNetworkCheck = setInterval(() => {
      // In production, this would be handled by NetInfo
      updateSyncPending();
    }, 5000);

    updateSyncPending();

    return () => {
      // unsubscribe();
      clearInterval(simulatedNetworkCheck);
    };
  }, []);

  const updateSyncPending = () => {
    const pending = OfflineService.getQueueLength();
    setSyncPending(pending);
  };

  const triggerSync = async () => {
    if (!isConnected || !isInternetReachable) {
      console.log('Cannot sync: No internet connection');
      return;
    }

    try {
      console.log('Starting background sync...');
      const success = await OfflineService.sync(apiService);
      
      if (success) {
        console.log('Sync completed successfully');
      } else {
        console.log('Sync completed with some failures');
      }
      
      updateSyncPending();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  const value: NetworkContextType = {
    isConnected,
    isInternetReachable,
    connectionType,
    syncPending,
    triggerSync,
  };

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
};

