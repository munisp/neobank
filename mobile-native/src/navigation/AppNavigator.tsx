import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { useAuth } from '../store/AuthContext';
import { useTheme } from '../store/ThemeContext';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import PinSetupScreen from '../screens/auth/PinSetupScreen';
import BiometricSetupScreen from '../screens/auth/BiometricSetupScreen';

// Main Screens
import DashboardScreen from '../screens/main/DashboardScreen';
import TransferScreen from '../screens/main/TransferScreen';
import TransactionsScreen from '../screens/main/TransactionsScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import SettingsScreen from '../screens/main/SettingsScreen';

// KYC Screens
import KYCScreen from '../screens/kyc/KYCScreen';
import DocumentUploadScreen from '../screens/kyc/DocumentUploadScreen';
import KYCStatusScreen from '../screens/kyc/KYCStatusScreen';

// Bill Payment Screens
import BillPaymentScreen from '../screens/bills/BillPaymentScreen';
import AirtimeScreen from '../screens/bills/AirtimeScreen';

// QR Screens
import QRScannerScreen from '../screens/qr/QRScannerScreen';
import QRPaymentScreen from '../screens/qr/QRPaymentScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const AuthStack: React.FC = () => {
  const { theme } = useTheme();
  
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: theme.colors.white,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen 
        name="Login" 
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Register" 
        component={RegisterScreen}
        options={{ title: 'Create Account' }}
      />
      <Stack.Screen 
        name="PinSetup" 
        component={PinSetupScreen}
        options={{ title: 'Set Transaction PIN' }}
      />
      <Stack.Screen 
        name="BiometricSetup" 
        component={BiometricSetupScreen}
        options={{ title: 'Enable Biometrics' }}
      />
    </Stack.Navigator>
  );
};

const MainTabs: React.FC = () => {
  const { theme } = useTheme();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;

          switch (route.name) {
            case 'Dashboard':
              iconName = 'dashboard';
              break;
            case 'Transfer':
              iconName = 'send';
              break;
            case 'Transactions':
              iconName = 'history';
              break;
            case 'Profile':
              iconName = 'person';
              break;
            default:
              iconName = 'help';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.gray,
        tabBarStyle: {
          backgroundColor: theme.colors.white,
          borderTopColor: theme.colors.lightGray,
        },
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: theme.colors.white,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ title: 'Home' }}
      />
      <Tab.Screen 
        name="Transfer" 
        component={TransferScreen}
        options={{ title: 'Transfer' }}
      />
      <Tab.Screen 
        name="Transactions" 
        component={TransactionsScreen}
        options={{ title: 'History' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

const MainStack: React.FC = () => {
  const { theme } = useTheme();
  
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: theme.colors.white,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen 
        name="MainTabs" 
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <Stack.Screen 
        name="KYC" 
        component={KYCScreen}
        options={{ title: 'Verify Identity' }}
      />
      <Stack.Screen 
        name="DocumentUpload" 
        component={DocumentUploadScreen}
        options={{ title: 'Upload Document' }}
      />
      <Stack.Screen 
        name="KYCStatus" 
        component={KYCStatusScreen}
        options={{ title: 'Verification Status' }}
      />
      <Stack.Screen 
        name="BillPayment" 
        component={BillPaymentScreen}
        options={{ title: 'Pay Bills' }}
      />
      <Stack.Screen 
        name="Airtime" 
        component={AirtimeScreen}
        options={{ title: 'Buy Airtime' }}
      />
      <Stack.Screen 
        name="QRScanner" 
        component={QRScannerScreen}
        options={{ title: 'Scan QR Code' }}
      />
      <Stack.Screen 
        name="QRPayment" 
        component={QRPaymentScreen}
        options={{ title: 'QR Payment' }}
      />
    </Stack.Navigator>
  );
};

const AppNavigator: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // Would show a loading screen component
    return null;
  }

  return isAuthenticated ? <MainStack /> : <AuthStack />;
};

export default AppNavigator;
