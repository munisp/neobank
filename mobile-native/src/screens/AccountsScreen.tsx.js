import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
// Assuming navigation is set up with React Navigation
// For a complete screen, we would typically use:
// import { useNavigation, StackScreenProps } from '@react-navigation/native';
// For this standalone file, we'll mock the navigation prop/hook.

// Mocking the navigation prop for demonstration purposes
interface NavigationProp {
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
}

// Mocking the ApiService and UserAccount types from the mock file
interface UserAccount {
  id: string;
  name: string;
  email: string;
  plan: 'Basic' | 'Premium' | 'Enterprise';
  lastLogin: string;
  isTwoFactorEnabled: boolean;
}

// Mock ApiService (in a real app, this would be imported)
const ApiService = {
  fetchAccountData: async (): Promise<UserAccount> => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return {
      id: 'user-123',
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      plan: 'Premium',
      lastLogin: new Date().toLocaleString(),
      isTwoFactorEnabled: true,
    };
  },
  updateSetting: async (settingKey: string, value: any): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    if (Math.random() < 0.1) {
      throw new Error(`Failed to update ${settingKey}.`);
    }
    console.log(`Setting ${settingKey} updated to ${value}`);
  },
  logout: async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('User logged out successfully.');
  },
};

// --- Component Props and State Types ---

type AccountsScreenProps = {
  navigation: NavigationProp; // Mocked navigation prop
};

interface AccountState {
  data: UserAccount | null;
  isLoading: boolean;
  error: string | null;
  isLoggingOut: boolean;
}

// --- AccountsScreen Component ---

const AccountsScreen: React.FC<AccountsScreenProps> = ({ navigation }) => {
  const [state, setState] = useState<AccountState>({
    data: null,
    isLoading: true,
    error: null,
    isLoggingOut: false,
  });

  // Function to fetch account data from the API
  const fetchAccountData = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const accountData = await ApiService.fetchAccountData();
      setState(s => ({ ...s, data: accountData, isLoading: false }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setState(s => ({ ...s, error: `Failed to load account data: ${errorMessage}`, isLoading: false }));
      Alert.alert('Error', `Could not load account details. ${errorMessage}`);
    }
  }, []);

  useEffect(() => {
    fetchAccountData();
  }, [fetchAccountData]);

  // Handler for toggling Two-Factor Authentication
  const handleToggle2FA = async (newValue: boolean) => {
    if (!state.data) return;

    // Optimistic UI update
    const previousValue = state.data.isTwoFactorEnabled;
    setState(s => ({ ...s, data: s.data ? { ...s.data, isTwoFactorEnabled: newValue } : null }));

    try {
      await ApiService.updateSetting('isTwoFactorEnabled', newValue);
      Alert.alert('Success', `Two-Factor Authentication has been ${newValue ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      // Revert on failure
      setState(s => ({ ...s, data: s.data ? { ...s.data, isTwoFactorEnabled: previousValue } : null }));
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      Alert.alert('Update Failed', `Could not update 2FA setting. ${errorMessage}`);
    }
  };

  // Handler for user logout
  const handleLogout = async () => {
    setState(s => ({ ...s, isLoggingOut: true }));
    try {
      await ApiService.logout();
      // Navigate to the login screen or home screen after successful logout
      navigation.navigate('Login');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      Alert.alert('Logout Failed', `There was an issue logging out. ${errorMessage}`);
    } finally {
      setState(s => ({ ...s, isLoggingOut: false }));
    }
  };

  // --- Render Helpers ---

  if (state.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Account Details...</Text>
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{state.error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchAccountData}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!state.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No account data available.</Text>
      </View>
    );
  }

  // Helper component for a single setting row
  const SettingRow: React.FC<{ label: string; value: string | React.ReactNode; isSwitch?: boolean; onToggle?: (value: boolean) => void; switchValue?: boolean }> = ({
    label,
    value,
    isSwitch = false,
    onToggle,
    switchValue,
  }) => (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      {isSwitch && onToggle !== undefined && switchValue !== undefined ? (
        <Switch
          trackColor={{ false: '#767577', true: '#81b0ff' }}
          thumbColor={switchValue ? '#007AFF' : '#f4f3f4'}
          onValueChange={onToggle}
          value={switchValue}
        />
      ) : (
        <Text style={styles.settingValue}>{value}</Text>
      )}
    </View>
  );

  // --- Main Render ---

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.header}>Account Settings</Text>

      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Profile Information</Text>
        <SettingRow label="Name" value={state.data.name} />
        <SettingRow label="Email" value={state.data.email} />
        <SettingRow label="Last Login" value={state.data.lastLogin} />
      </View>

      {/* Subscription Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Subscription</Text>
        <SettingRow label="Plan" value={state.data.plan} />
        <TouchableOpacity style={styles.linkButton}>
          <Text style={styles.linkButtonText}>Manage Subscription</Text>
        </TouchableOpacity>
      </View>

      {/* Security Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Security</Text>
        <SettingRow
          label="Two-Factor Auth"
          isSwitch
          switchValue={state.data.isTwoFactorEnabled}
          onToggle={handleToggle2FA}
          value={''} // Value is not used for switch
        />
        <TouchableOpacity style={styles.linkButton}>
          <Text style={styles.linkButtonText}>Change Password</Text>
        </TouchableOpacity>
      </View>

      {/* Logout Button */}
      <TouchableOpacity
        style={[styles.logoutButton, state.isLoggingOut && styles.logoutButtonDisabled]}
        onPress={handleLogout}
        disabled={state.isLoggingOut}
      >
        {state.isLoggingOut ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.logoutButtonText}>Logout</Text>
        )}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>User ID: {state.data.id}</Text>
      </View>
    </ScrollView>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingBottom: 5,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  settingValue: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
    maxWidth: '50%',
    textAlign: 'right',
  },
  linkButton: {
    paddingVertical: 10,
    marginTop: 5,
  },
  linkButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  logoutButtonDisabled: {
    backgroundColor: '#FF3B3080',
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 30,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#AAA',
  },
});

// Export the component with the required name
export default AccountsScreen;
