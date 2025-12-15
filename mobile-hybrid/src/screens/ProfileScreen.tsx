import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { ApiService, AuthService, NotificationService, UserProfile } from './src/services/index';

// --- Types and Interfaces ---

// Define the navigation props type (simplified for this task)
interface ProfileScreenProps {
  navigation: {
    navigate: (screen: string, params?: any) => void;
  };
}

// --- Constants and Styles ---

const ICON_SIZE = 24;
const PRIMARY_COLOR = '#007AFF'; // NeoBank primary blue
const SECONDARY_COLOR = '#EFEFF4'; // Light gray background
const TEXT_COLOR = '#333333';
const BORDER_COLOR = '#CCCCCC';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SECONDARY_COLOR,
  },
  contentContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  // Profile Header
  profileHeader: {
    alignItems: 'center',
    marginBottom: 30,
    width: '100%',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 15,
    backgroundColor: BORDER_COLOR,
    borderWidth: 3,
    borderColor: PRIMARY_COLOR,
  },
  nameText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TEXT_COLOR,
    marginBottom: 5,
  },
  emailText: {
    fontSize: 16,
    color: '#666666',
  },
  // Menu Section
  menuSection: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 20,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: SECONDARY_COLOR,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    fontSize: 18,
    color: TEXT_COLOR,
  },
  arrowIcon: {
    fontSize: 18,
    color: BORDER_COLOR,
  },
  // Info Card
  infoCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 16,
    color: '#666666',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: TEXT_COLOR,
  },
  // Logout Button
  logoutButton: {
    backgroundColor: '#FF3B30', // Red for danger/logout
    padding: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

// --- Helper Component for Menu Items ---
interface MenuItemProps {
  title: string;
  onPress: () => void;
  isLast?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({ title, onPress, isLast }) => (
  <TouchableOpacity
    style={[styles.menuItem, isLast && styles.menuItemLast]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={styles.menuItemText}>{title}</Text>
    {/* Using a simple text arrow for the icon for cross-platform compatibility */}
    <Text style={styles.arrowIcon}>&gt;</Text>
  </TouchableOpacity>
);

// --- Main Screen Component ---

const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  // Determine if we are on a wide screen (for basic responsiveness)
  const isWideScreen = width > 768;

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userId = AuthService.getUserId();
      const response = await ApiService.fetchUserProfile(userId);

      if (response.data) {
        setUserProfile(response.data);
      } else if (response.error) {
        setError(response.error);
        NotificationService.showError(`Failed to load profile: ${response.error}`);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(errorMessage);
      NotificationService.showError(`Network Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          onPress: async () => {
            // Simulate navigation to a login screen after logout
            await AuthService.logout();
            NotificationService.showSuccess('Successfully logged out.');
            // In a real app, this would navigate to the login screen:
            // navigation.navigate('LoginScreen');
          },
          style: 'destructive',
        },
      ],
      { cancelable: true }
    );
  }, []);

  const handleNavigate = useCallback((screen: string) => {
    // In a real app, this would navigate to the respective screen
    // navigation.navigate(screen);
    Alert.alert('Navigation', `Navigating to ${screen}... (Simulated)`);
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        <Text style={{ marginTop: 10 }}>Loading Profile...</Text>
      </View>
    );
  }

  if (error || !userProfile) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>
          {error || 'Could not load user profile. Please try again.'}
        </Text>
        <TouchableOpacity onPress={fetchProfile} style={{ marginTop: 20 }}>
          <Text style={{ color: PRIMARY_COLOR, fontSize: 16 }}>Tap to Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { firstName, lastName, email, phoneNumber, profilePictureUrl, accountStatus } = userProfile;

  return (
    <ScrollView style={styles.container} contentContainerStyle={isWideScreen ? { paddingHorizontal: width * 0.2 } : styles.contentContainer}>
      <View style={styles.profileHeader}>
        <Image
          source={{ uri: profilePictureUrl }}
          style={styles.profileImage}
          accessibilityLabel="User Profile Picture"
        />
        <Text style={styles.nameText}>{`${firstName} ${lastName}`}</Text>
        <Text style={styles.emailText}>{email}</Text>
      </View>

      {/* Profile Actions Menu */}
      <View style={styles.menuSection}>
        <MenuItem
          title="Edit Profile"
          onPress={() => handleNavigate('EditProfileScreen')}
        />
        <MenuItem
          title="Account Settings"
          onPress={() => handleNavigate('AccountSettingsScreen')}
        />
        <MenuItem
          title="Security & Privacy"
          onPress={() => handleNavigate('SecurityPrivacyScreen')}
          isLast
        />
      </View>

      {/* Personal Information Card */}
      <View style={styles.infoCard}>
        <Text style={[styles.nameText, { fontSize: 20, marginBottom: 15 }]}>Personal Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone Number:</Text>
          <Text style={styles.infoValue}>{phoneNumber}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Account Status:</Text>
          <Text style={[styles.infoValue, { color: accountStatus === 'Active' ? 'green' : 'orange' }]}>
            {accountStatus}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Platform:</Text>
          <Text style={styles.infoValue}>{Platform.OS === 'web' ? 'Web (React Native Web)' : 'Mobile'}</Text>
        </View>
      </View>

      {/* Logout Button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.8}
      >
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </TouchableOpacity>

      {/* Add some bottom padding for better scroll experience */}
      <View style={{ height: 50 }} />
    </ScrollView>
  );
};

export default ProfileScreen;