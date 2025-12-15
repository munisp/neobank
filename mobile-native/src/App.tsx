import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from 'react-query';
import { StatusBar, Platform, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PushNotification from 'react-native-push-notification';

import AppNavigator from './navigation/AppNavigator';
import { AuthProvider } from './store/AuthContext';
import { ThemeProvider } from './store/ThemeContext';
import { NotificationProvider } from './store/NotificationContext';
import { setupPushNotifications } from './services/NotificationService';
import { initializeBiometrics } from './services/BiometricService';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

const App: React.FC = () => {
  useEffect(() => {
    // Initialize app services
    const initializeApp = async () => {
      try {
        // Setup push notifications
        await setupPushNotifications();
        
        // Initialize biometric authentication
        await initializeBiometrics();
        
        console.log('App initialized successfully');
      } catch (error) {
        console.error('App initialization error:', error);
        Alert.alert('Initialization Error', 'Some features may not work properly.');
      }
    };

    initializeApp();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <NotificationProvider>
              <NavigationContainer>
                <StatusBar
                  barStyle={Platform.OS === 'ios' ? 'dark-content' : 'light-content'}
                  backgroundColor="#1a365d"
                />
                <AppNavigator />
              </NavigationContainer>
            </NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

export default App;
