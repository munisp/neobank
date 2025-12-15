import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';

// --- MOCK DEPENDENCIES ---

// 1. Mock Navigation Setup (assuming a simple stack navigator)
// Define the types for the navigation stack. In a real app, this would be in a global types file.
type RootStackParamList = {
  Settings: undefined;
  Profile: undefined;
  PrivacyPolicy: undefined;
  About: undefined;
};

type SettingsScreenProps = StackScreenProps<RootStackParamList, 'Settings'>;

// 2. Mock API Service
interface UserSettings {
  notificationsEnabled: boolean;
  darkModeEnabled: boolean;
  language: 'en' | 'es' | 'fr';
  version: string;
}

const initialSettings: UserSettings = {
  notificationsEnabled: true,
  darkModeEnabled: false,
  language: 'en',
  version: '1.0.0 (Build 42)',
};

const ApiService = {
  /**
   * Mock function to fetch user settings from a backend.
   * Simulates network delay and potential failure.
   */
  fetchSettings: (): Promise<UserSettings> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate a 10% chance of API failure
        if (Math.random() < 0.1) {
          reject(new Error('Failed to fetch settings. Please try again.'));
        } else {
          resolve(initialSettings);
        }
      }, 1000); // 1 second delay
    });
  },

  /**
   * Mock function to update a specific setting.
   */
  updateSetting: <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate a 5% chance of update failure
        if (Math.random() < 0.05) {
          reject(new Error(`Failed to update ${key}.`));
        } else {
          // In a real app, this would update the backend state
          console.log(`[API] Updated ${key} to ${value}`);
          resolve();
        }
      }, 500); // 0.5 second delay
    });
  },
};

// --- SETTINGS SCREEN IMPLEMENTATION ---

// Define the structure for a single setting item
interface SettingItemProps {
  title: string;
  value?: string;
  onPress?: () => void;
  isToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (newValue: boolean) => void;
  isDestructive?: boolean;
}

/**
 * Reusable component for a single setting row.
 */
const SettingItem: React.FC<SettingItemProps> = ({
  title,
  value,
  onPress,
  isToggle = false,
  toggleValue,
  onToggle,
  isDestructive = false,
}) => {
  const content = (
    <View style={styles.itemContainer}>
      <Text style={[styles.itemTitle, isDestructive && styles.destructiveText]}>
        {title}
      </Text>
      {isToggle ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ false: '#767577', true: '#81b0ff' }}
          thumbColor={toggleValue ? '#f5dd4b' : '#f4f3f4'}
        />
      ) : (
        <Text style={styles.itemValue}>{value}</Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.touchableItem}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.touchableItem}>{content}</View>;
};

/**
 * Main Settings Screen component.
 * @param navigation The navigation prop provided by React Navigation.
 */
const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Function to fetch settings from the mock API
  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedSettings = await ApiService.fetchSettings();
      setSettings(fetchedSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Function to handle setting updates
  const handleUpdateSetting = useCallback(
    async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      if (!settings) return;

      // Optimistic UI update
      const previousSettings = settings;
      setSettings((prev) => (prev ? { ...prev, [key]: value } : null));
      setIsUpdating(true);

      try {
        await ApiService.updateSetting(key, value);
        // If successful, the optimistic update is kept
      } catch (err) {
        // Rollback on failure
        setSettings(previousSettings);
        Alert.alert(
          'Update Failed',
          err instanceof Error ? err.message : 'Could not save your change.'
        );
      } finally {
        setIsUpdating(false);
      }
    },
    [settings]
  );

  // --- RENDER LOGIC FOR LOADING/ERROR STATES ---

  if (isLoading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Settings...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchSettings}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!settings) {
    // Should not happen if error handling is correct, but good for safety
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>No settings data available.</Text>
      </View>
    );
  }

  // --- MAIN SETTINGS UI RENDER ---

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Display a global loading indicator for updates */}
      {isUpdating && (
        <View style={styles.globalLoadingOverlay}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.globalLoadingText}>Saving...</Text>
        </View>
      )}

      {/* Account Section */}
      <Text style={styles.sectionHeader}>Account</Text>
      <SettingItem
        title="Edit Profile"
        onPress={() => navigation.navigate('Profile')}
        value=">"
      />
      <SettingItem
        title="Change Password"
        onPress={() => Alert.alert('Navigation', 'Navigate to Change Password Screen')}
        value=">"
      />

      {/* Preferences Section */}
      <Text style={styles.sectionHeader}>Preferences</Text>
      <SettingItem
        title="Dark Mode"
        isToggle
        toggleValue={settings.darkModeEnabled}
        onToggle={(newValue) => handleUpdateSetting('darkModeEnabled', newValue)}
      />
      <SettingItem
        title="Notifications"
        isToggle
        toggleValue={settings.notificationsEnabled}
        onToggle={(newValue) => handleUpdateSetting('notificationsEnabled', newValue)}
      />
      <SettingItem
        title="Language"
        onPress={() => Alert.alert('Action', 'Open Language Selector Modal')}
        value={settings.language.toUpperCase()}
      />

      {/* Legal & About Section */}
      <Text style={styles.sectionHeader}>Legal & About</Text>
      <SettingItem
        title="Privacy Policy"
        onPress={() => navigation.navigate('PrivacyPolicy')}
        value=">"
      />
      <SettingItem
        title="Terms of Service"
        onPress={() => Alert.alert('Navigation', 'Navigate to Terms of Service Screen')}
        value=">"
      />
      <SettingItem
        title="About App"
        onPress={() => navigation.navigate('About')}
        value=">"
      />
      <SettingItem title="App Version" value={settings.version} />

      {/* Action Section */}
      <Text style={styles.sectionHeader}>Actions</Text>
      <SettingItem
        title="Log Out"
        isDestructive
        onPress={() =>
          Alert.alert('Confirm', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Out', style: 'destructive', onPress: () => console.log('User Logged Out') },
          ])
        }
      />
    </ScrollView>
  );
};

// --- STYLESHEET ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0', // Light gray background for the whole screen
  },
  contentContainer: {
    paddingVertical: 10,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: 'red',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 15,
    marginBottom: 5,
    paddingHorizontal: 15,
    textTransform: 'uppercase',
  },
  touchableItem: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 15,
  },
  itemTitle: {
    fontSize: 16,
    color: '#333',
    flex: 1, // Allows title to take up space
  },
  itemValue: {
    fontSize: 16,
    color: '#999',
    marginLeft: 10,
  },
  destructiveText: {
    color: 'red',
  },
  globalLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // Ensure it's on top
  },
  globalLoadingText: {
    color: '#FFFFFF',
    marginTop: 8,
  },
});

export default SettingsScreen;