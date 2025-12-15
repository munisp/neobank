import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- Mock Service Imports (Assume these exist in src/services) ---
// import { AuthService } from 'src/services/AuthService';
// import { ApiService } from 'src/services/ApiService';
// import { NotificationService } from 'src/services/NotificationService';
// import { StorageService } from 'src/services/StorageService';

// Mocking the services for implementation purposes
const useAuthService = () => ({
  logout: async () => {
    console.log('AuthService: Logging out...');
    await new Promise(resolve => setTimeout(resolve, 500));
    Alert.alert('Success', 'Logged out successfully.');
  },
});

const useNotificationService = () => ({
  updateNotificationSettings: async (settings: NotificationSettings) => {
    console.log('NotificationService: Updating settings', settings);
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  },
});

const useStorageService = () => ({
  getTheme: () => 'system',
  setTheme: (theme: 'light' | 'dark' | 'system') => {
    console.log('StorageService: Setting theme to', theme);
  },
  getLanguage: () => 'en',
  setLanguage: (lang: string) => {
    console.log('StorageService: Setting language to', lang);
  },
});

// --- TypeScript Definitions ---

type SettingType = 'toggle' | 'action' | 'navigation' | 'picker';

interface SettingItem {
  id: string;
  title: string;
  description?: string;
  type: SettingType;
  iconName?: string; // For a real app, this would be used for an icon component
  onPress?: (value?: any) => void;
  // For 'toggle' type
  initialValue?: boolean;
  // For 'picker' type (e.g., Language, Theme)
  options?: { label: string; value: string }[];
  currentValue?: string;
}

interface SettingsSection {
  title: string;
  data: SettingItem[];
}

interface NotificationSettings {
  pushNotifications: boolean;
  emailAlerts: boolean;
  securityAlerts: boolean;
}

// --- Mock Data for Settings ---

const MOCK_NOTIFICATION_SETTINGS: NotificationSettings = {
  pushNotifications: true,
  emailAlerts: false,
  securityAlerts: true,
};

const MOCK_THEME = 'system';
const MOCK_LANGUAGE = 'en';

const SETTINGS_DATA: SettingsSection[] = [
  {
    title: 'App Settings',
    data: [
      {
        id: 'theme',
        title: 'Theme',
        description: 'Change the app appearance (Light, Dark, System)',
        type: 'picker',
        options: [
          { label: 'Light', value: 'light' },
          { label: 'Dark', value: 'dark' },
          { label: 'System Default', value: 'system' },
        ],
        currentValue: MOCK_THEME,
      },
      {
        id: 'language',
        title: 'Language',
        description: 'Change the app language',
        type: 'picker',
        options: [
          { label: 'English', value: 'en' },
          { label: 'Spanish', value: 'es' },
          { label: 'French', value: 'fr' },
        ],
        currentValue: MOCK_LANGUAGE,
      },
    ],
  },
  {
    title: 'Notifications',
    data: [
      {
        id: 'pushNotifications',
        title: 'Push Notifications',
        description: 'Receive instant alerts for transactions and updates',
        type: 'toggle',
        initialValue: MOCK_NOTIFICATION_SETTINGS.pushNotifications,
      },
      {
        id: 'emailAlerts',
        title: 'Email Alerts',
        description: 'Receive email summaries and promotional content',
        type: 'toggle',
        initialValue: MOCK_NOTIFICATION_SETTINGS.emailAlerts,
      },
      {
        id: 'securityAlerts',
        title: 'Security Alerts',
        description: 'Receive alerts for login attempts and password changes',
        type: 'toggle',
        initialValue: MOCK_NOTIFICATION_SETTINGS.securityAlerts,
      },
    ],
  },
  {
    title: 'Security & Privacy',
    data: [
      {
        id: 'changePassword',
        title: 'Change Password',
        description: 'Update your account password',
        type: 'navigation',
        onPress: () => console.log('Navigate to Change Password Screen'),
      },
      {
        id: 'biometricAuth',
        title: 'Biometric Authentication',
        description: 'Use Face ID or Fingerprint to log in',
        type: 'toggle',
        initialValue: true,
      },
      {
        id: 'privacyPolicy',
        title: 'Privacy Policy',
        description: 'View our data usage and privacy statement',
        type: 'navigation',
        onPress: () => console.log('Navigate to Privacy Policy Screen'),
      },
    ],
  },
  {
    title: 'Account Actions',
    data: [
      {
        id: 'logout',
        title: 'Log Out',
        description: 'Sign out of your account',
        type: 'action',
        onPress: () => console.log('Initiate Logout'),
      },
      {
        id: 'deleteAccount',
        title: 'Delete Account',
        description: 'Permanently delete your account and data',
        type: 'action',
        onPress: () => console.log('Initiate Account Deletion'),
      },
    ],
  },
];

// --- Component Styles (Minimal for structure) ---

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f0f0', // Light background for the screen
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    fontSize: 32,
    fontWeight: 'bold',
    paddingVertical: 20,
    color: '#333',
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
    color: '#555',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
  },
  itemTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  itemDescription: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  actionText: {
    color: 'red',
    fontWeight: '600',
  },
  pickerValue: {
    fontSize: 16,
    color: '#007AFF', // iOS Blue
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// --- Reusable Item Component ---

interface SettingItemProps {
  item: SettingItem;
  onToggle: (id: string, value: boolean) => void;
  onPickerChange: (id: string, value: string) => void;
  onAction: (id: string) => void;
}

const SettingItemComponent: React.FC<SettingItemProps> = React.memo(
  ({ item, onToggle, onPickerChange, onAction }) => {
    const [toggleValue, setToggleValue] = useState(item.initialValue ?? false);
    const [pickerValue, setPickerValue] = useState(item.currentValue ?? '');

    const handlePress = useCallback(() => {
      if (item.type === 'navigation' && item.onPress) {
        item.onPress();
      } else if (item.type === 'action') {
        onAction(item.id);
      }
      // Toggles and Pickers are handled by their specific controls
    }, [item, onAction]);

    const handleToggle = useCallback(() => {
      const newValue = !toggleValue;
      setToggleValue(newValue);
      onToggle(item.id, newValue);
    }, [item.id, onToggle, toggleValue]);

    // In a real app, 'picker' would open a modal or a new screen.
    // Here, we'll simulate a simple press action for navigation/modal.
    const handlePickerPress = useCallback(() => {
      if (item.type === 'picker') {
        // Simulate opening a picker/modal and selecting a new value
        const options = item.options || [];
        const currentIndex = options.findIndex(opt => opt.value === pickerValue);
        const nextIndex = (currentIndex + 1) % options.length;
        const newValue = options[nextIndex].value;

        setPickerValue(newValue);
        onPickerChange(item.id, newValue);
        Alert.alert(
          `Change ${item.title}`,
          `Simulating change to: ${options[nextIndex].label}`
        );
      }
    }, [item, onPickerChange, pickerValue]);

    const renderControl = () => {
      switch (item.type) {
        case 'toggle':
          return <Switch value={toggleValue} onValueChange={handleToggle} />;
        case 'picker':
          const currentOption = item.options?.find(opt => opt.value === pickerValue);
          return (
            <Text style={styles.pickerValue}>
              {currentOption?.label || 'Select'}
            </Text>
          );
        case 'navigation':
          return <Text style={styles.pickerValue}>{'>'}</Text>; // Simple arrow indicator
        case 'action':
          return null; // Action is handled by the main TouchableOpacity
        default:
          return null;
      }
    };

    const isInteractive = item.type !== 'toggle'; // Toggle has its own handler

    return (
      <TouchableOpacity
        style={styles.itemContainer}
        onPress={isInteractive ? (item.type === 'picker' ? handlePickerPress : handlePress) : undefined}
        activeOpacity={isInteractive ? 0.7 : 1}
      >
        <View style={styles.itemTextContainer}>
          <Text style={[styles.itemTitle, item.id === 'deleteAccount' && styles.actionText]}>
            {item.title}
          </Text>
          {item.description && (
            <Text style={styles.itemDescription}>{item.description}</Text>
          )}
        </View>
        {renderControl()}
      </TouchableOpacity>
    );
  }
);

// --- Main Screen Component ---

const SettingsScreen: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [notificationState, setNotificationState] = useState<NotificationSettings>(
    MOCK_NOTIFICATION_SETTINGS
  );
  const [appSettings, setAppSettings] = useState({
    theme: MOCK_THEME,
    language: MOCK_LANGUAGE,
  });

  // Mock Service Hooks
  const authService = useAuthService();
  const notificationService = useNotificationService();
  const storageService = useStorageService();

  // --- Handlers ---

  const handleToggle = useCallback(
    async (id: string, value: boolean) => {
      setIsLoading(true);
      try {
        if (id in notificationState) {
          const newSettings = { ...notificationState, [id]: value };
          await notificationService.updateNotificationSettings(newSettings);
          setNotificationState(newSettings);
        } else if (id === 'biometricAuth') {
          // Simulate updating local biometric setting
          console.log(`Biometric Auth ${value ? 'enabled' : 'disabled'}`);
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to update setting. Please try again.');
        // Revert state on error if necessary, but for this mock, we'll just log
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    },
    [notificationState, notificationService]
  );

  const handlePickerChange = useCallback(
    (id: string, value: string) => {
      setIsLoading(true);
      try {
        if (id === 'theme') {
          storageService.setTheme(value as 'light' | 'dark' | 'system');
          setAppSettings(prev => ({ ...prev, theme: value }));
        } else if (id === 'language') {
          storageService.setLanguage(value);
          setAppSettings(prev => ({ ...prev, language: value }));
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to change setting.');
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    },
    [storageService]
  );

  const handleAction = useCallback(
    async (id: string) => {
      if (id === 'logout') {
        Alert.alert('Confirm Logout', 'Are you sure you want to log out?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log Out',
            style: 'destructive',
            onPress: async () => {
              setIsLoading(true);
              try {
                await authService.logout();
                // Navigation to login screen would happen here
              } catch (error) {
                Alert.alert('Error', 'Logout failed. Please try again.');
              } finally {
                setIsLoading(false);
              }
            },
          },
        ]);
      } else if (id === 'deleteAccount') {
        Alert.alert(
          'Danger Zone',
          'This action is permanent. Are you absolutely sure you want to delete your account?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                console.log('Account deletion initiated...');
                Alert.alert('Success', 'Account deletion process started.');
                // API call to delete account would go here
              },
            },
          ]
        );
      }
    },
    [authService]
  );

  // --- Dynamic Data Structure (to use current state) ---

  const dynamicSettingsData = useMemo(() => {
    return SETTINGS_DATA.map(section => ({
      ...section,
      data: section.data.map(item => {
        if (item.type === 'toggle' && item.id in notificationState) {
          return { ...item, initialValue: notificationState[item.id as keyof NotificationSettings] };
        }
        if (item.type === 'picker') {
          return { ...item, currentValue: appSettings[item.id as keyof typeof appSettings] };
        }
        return item;
      }),
    }));
  }, [notificationState, appSettings]);

  // --- Render Logic ---

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.header}>Settings</Text>

        {dynamicSettingsData.map((section, index) => (
          <View key={index}>
            <Text style={styles.sectionHeader}>{section.title}</Text>
            {section.data.map(item => (
              <SettingItemComponent
                key={item.id}
                item={item}
                onToggle={handleToggle}
                onPickerChange={handlePickerChange}
                onAction={handleAction}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Loading State/Overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={{ color: '#fff', marginTop: 10 }}>Loading...</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

export default SettingsScreen;