import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';

// Auth Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';

// Main Screens
import DashboardScreen from '../screens/DashboardScreen';
import BankingScreen from '../screens/BankingScreen';
import AccountsScreen from '../screens/AccountsScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import TransfersScreen from '../screens/TransfersScreen';
import CardsScreen from '../screens/CardsScreen';
import CardManagementScreen from '../screens/CardManagementScreen';

// Loans
import LoansScreen from '../screens/LoansScreen';
import LoanApplicationScreen from '../screens/LoanApplicationScreen';
import CreditScoreScreen from '../screens/CreditScoreScreen';

// Payments
import BillPaymentsScreen from '../screens/BillPaymentsScreen';

// Investments
import InvestmentsScreen from '../screens/InvestmentsScreen';
import CryptocurrencyScreen from '../screens/CryptocurrencyScreen';
import StockTradingScreen from '../screens/StockTradingScreen';

// Insurance
import InsuranceScreen from '../screens/InsuranceScreen';
import InsuranceQuoteScreen from '../screens/InsuranceQuoteScreen';
import InsurancePolicyScreen from '../screens/InsurancePolicyScreen';
import InsuranceClaimsScreen from '../screens/InsuranceClaimsScreen';

// User
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import DocumentsScreen from '../screens/DocumentsScreen';

// Analytics
import BudgetScreen from '../screens/BudgetScreen';
import SpendingInsightsScreen from '../screens/SpendingInsightsScreen';

// Utility
import NotFoundScreen from '../screens/NotFoundScreen';
import OfflineScreen from '../screens/OfflineScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Auth Stack
const AuthStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
    }}
  >
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
  </Stack.Navigator>
);

// Banking Stack
const BankingStack = () => (
  <Stack.Navigator>
    <Stack.Screen 
      name="BankingHome" 
      component={BankingScreen}
      options={{ title: 'Banking' }}
    />
    <Stack.Screen name="Accounts" component={AccountsScreen} />
    <Stack.Screen name="Transactions" component={TransactionsScreen} />
    <Stack.Screen name="Transfers" component={TransfersScreen} />
    <Stack.Screen name="Cards" component={CardsScreen} />
    <Stack.Screen name="CardManagement" component={CardManagementScreen} />
    <Stack.Screen name="BillPayments" component={BillPaymentsScreen} />
  </Stack.Navigator>
);

// Investments Stack
const InvestmentsStack = () => (
  <Stack.Navigator>
    <Stack.Screen 
      name="InvestmentsHome" 
      component={InvestmentsScreen}
      options={{ title: 'Investments' }}
    />
    <Stack.Screen name="Cryptocurrency" component={CryptocurrencyScreen} />
    <Stack.Screen name="StockTrading" component={StockTradingScreen} />
  </Stack.Navigator>
);

// Loans Stack
const LoansStack = () => (
  <Stack.Navigator>
    <Stack.Screen 
      name="LoansHome" 
      component={LoansScreen}
      options={{ title: 'Loans' }}
    />
    <Stack.Screen name="LoanApplication" component={LoanApplicationScreen} />
    <Stack.Screen name="CreditScore" component={CreditScoreScreen} />
  </Stack.Navigator>
);

// Insurance Stack
const InsuranceStack = () => (
  <Stack.Navigator>
    <Stack.Screen 
      name="InsuranceHome" 
      component={InsuranceScreen}
      options={{ title: 'Insurance' }}
    />
    <Stack.Screen name="InsuranceQuote" component={InsuranceQuoteScreen} />
    <Stack.Screen name="InsurancePolicy" component={InsurancePolicyScreen} />
    <Stack.Screen name="InsuranceClaims" component={InsuranceClaimsScreen} />
  </Stack.Navigator>
);

// Profile Stack
const ProfileStack = () => (
  <Stack.Navigator>
    <Stack.Screen 
      name="ProfileHome" 
      component={ProfileScreen}
      options={{ title: 'Profile' }}
    />
    <Stack.Screen name="Settings" component={SettingsScreen} />
    <Stack.Screen name="Notifications" component={NotificationsScreen} />
    <Stack.Screen name="Documents" component={DocumentsScreen} />
    <Stack.Screen name="Budget" component={BudgetScreen} />
    <Stack.Screen name="SpendingInsights" component={SpendingInsightsScreen} />
  </Stack.Navigator>
);

// Main Tab Navigator
const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        let iconName: string;

        switch (route.name) {
          case 'Dashboard':
            iconName = focused ? 'home' : 'home-outline';
            break;
          case 'Banking':
            iconName = focused ? 'wallet' : 'wallet-outline';
            break;
          case 'Investments':
            iconName = focused ? 'trending-up' : 'trending-up-outline';
            break;
          case 'Loans':
            iconName = focused ? 'cash' : 'cash-outline';
            break;
          case 'Insurance':
            iconName = focused ? 'shield-checkmark' : 'shield-checkmark-outline';
            break;
          case 'Profile':
            iconName = focused ? 'person' : 'person-outline';
            break;
          default:
            iconName = 'help-outline';
        }

        return <Icon name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#007AFF',
      tabBarInactiveTintColor: 'gray',
      headerShown: false,
    })}
  >
    <Tab.Screen name="Dashboard" component={DashboardScreen} />
    <Tab.Screen name="Banking" component={BankingStack} />
    <Tab.Screen name="Investments" component={InvestmentsStack} />
    <Tab.Screen name="Loans" component={LoansStack} />
    <Tab.Screen name="Insurance" component={InsuranceStack} />
    <Tab.Screen name="Profile" component={ProfileStack} />
  </Tab.Navigator>
);

// Root Navigator
const RootNavigator = () => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  // In production, check authentication status from AuthService
  React.useEffect(() => {
    // Check if user is logged in
    // For now, default to false (show login)
    setIsAuthenticated(false);
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="NotFound" component={NotFoundScreen} />
            <Stack.Screen name="Offline" component={OfflineScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
