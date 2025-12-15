import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';

// --- 1. TypeScript Interfaces and Types ---

// Define the structure of the user profile data
interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  bio: string;
  avatarUrl: string;
  location: string;
  joinDate: string;
  settings: {
    notifications: boolean;
    darkMode: boolean;
  };
}

// Define the navigation stack parameter list (assuming a root stack)
// Replace 'RootStackParamList' with your actual navigation type if available
type RootStackParamList = {
  Profile: undefined;
  EditProfile: { userId: string };
  Settings: undefined;
  Login: undefined;
};

type ProfileScreenProps = StackScreenProps<RootStackParamList, 'Profile'>;

// --- 2. Mock API Service (Simulating an external ApiService) ---

const mockProfileData: UserProfile = {
  id: 'user-123',
  firstName: 'Alex',
  lastName: 'Johnson',
  email: 'alex.johnson@example.com',
  bio: 'Software developer with a passion for React Native and clean architecture. Building the future, one component at a time.',
  avatarUrl: 'https://example.com/avatar.jpg', // Placeholder
  location: 'San Francisco, CA',
  joinDate: '2023-01-15',
  settings: {
    notifications: true,
    darkMode: false,
  },
};

/**
 * Simulates an API call to fetch the user profile.
 * @returns A promise that resolves with UserProfile data or rejects with an error.
 */
const ApiService = {
  fetchUserProfile: (): Promise<UserProfile> => {
    return new Promise((resolve, reject) => {
      // Simulate network latency
      const latency = Math.random() * 1500 + 500; // 500ms to 2000ms
      setTimeout(() => {
        // Simulate a 10% chance of failure
        if (Math.random() < 0.1) {
          reject(new Error('Failed to fetch profile data. Network error or server issue.'));
        } else {
          resolve(mockProfileData);
        }
      }, latency);
    });
  },
};

// --- 3. ProfileScreen Component Implementation ---

const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ApiService.fetchUserProfile();
      setProfile(data);
    } catch (err) {
      // Type assertion for error handling
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // --- Loading State ---
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Profile...</Text>
      </View>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load profile.</Text>
        <Text style={styles.errorDetail}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadProfile}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Ensure profile is not null before rendering the main content
  if (!profile) {
    // This case should ideally be covered by the error state, but is a good safeguard
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No profile data available.</Text>
      </View>
    );
  }

  // --- Main Content ---
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Profile Header Section */}
      <View style={styles.header}>
        {/* In a real app, this would be an Image component */}
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>{profile.firstName[0]}{profile.lastName[0]}</Text>
        </View>
        <Text style={styles.name}>{profile.firstName} {profile.lastName}</Text>
        <Text style={styles.location}>{profile.location}</Text>
      </View>

      {/* Bio Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About Me</Text>
        <Text style={styles.bio}>{profile.bio}</Text>
      </View>

      {/* Details Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <Text style={styles.detailText}>Email: {profile.email}</Text>
        <Text style={styles.detailText}>Member Since: {new Date(profile.joinDate).toLocaleDateString()}</Text>
      </View>

      {/* Settings Preview (Simulating PWA features) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Settings</Text>
        <Text style={styles.settingItem}>Notifications: {profile.settings.notifications ? 'On' : 'Off'}</Text>
        <Text style={styles.settingItem}>Dark Mode: {profile.settings.darkMode ? 'Enabled' : 'Disabled'}</Text>
      </View>

      {/* Action Buttons (Navigation Integration) */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('EditProfile', { userId: profile.id })}
        >
          <Text style={styles.buttonText}>Edit Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.buttonText}>App Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.logoutButton]}
          onPress={() => Alert.alert('Logout', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: () => navigation.navigate('Login') },
          ])}
        >
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

// --- 4. Styling (React Native StyleSheet) ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D32F2F',
    marginBottom: 5,
  },
  errorDetail: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatarText: {
    fontSize: 40,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  location: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingBottom: 5,
  },
  bio: {
    fontSize: 16,
    color: '#555',
    lineHeight: 24,
  },
  detailText: {
    fontSize: 15,
    color: '#555',
    marginBottom: 5,
  },
  settingItem: {
    fontSize: 15,
    color: '#555',
    paddingVertical: 5,
  },
  actionButtons: {
    marginTop: 10,
  },
  button: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  buttonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    marginTop: 20,
    borderWidth: 0,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ProfileScreen;