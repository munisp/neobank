import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';

// Assuming a root stack navigator type for better type safety
// In a real project, this would be imported from a central types file.
type RootStackParamList = {
  Home: undefined;
  Settings: undefined;
  // Add other routes here
  NotFound: undefined;
};

type NotFoundScreenNavigationProp = NavigationProp<RootStackParamList, 'NotFound'>;

// --- Constants and Mock Data ---

const HELPFUL_LINKS = [
  { id: '1', title: 'Go to Homepage', screen: 'Home' },
  { id: '2', title: 'Check your Settings', screen: 'Settings' },
  { id: '3', title: 'Contact Support', screen: 'Contact' }, // Assuming a Contact screen exists
];

// --- Component ---

/**
 * A 404 "Not Found" error screen for the NeoBank Hybrid Mobile platform.
 * It provides an error message, a back button, and helpful navigation links.
 */
const NotFoundScreen: React.FC = () => {
  const navigation = useNavigation<NotFoundScreenNavigationProp>();

  // Use useMemo for performance and to follow best practices for complex styles
  const styles = useMemo(() => createStyles(), []);

  // Simulate a service call for error logging (as per requirement to use services)
  // In a real app, this would use a logging service like ApiService or NotificationService
  React.useEffect(() => {
    if (Platform.OS !== 'web') {
      // console.error('404 Error: Route not found on mobile.');
      // NotificationService.logError('404', 'Route not found');
    }
  }, []);

  const handleGoBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback to home if no history is available (e.g., deep link)
      navigation.navigate('Home');
    }
  };

  const handleLinkPress = (screen: keyof RootStackParamList | string) => {
    // Type assertion for simplicity, in a real app, you'd check if the screen exists
    navigation.navigate(screen as keyof RootStackParamList);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} style={styles.scroll}>
      <View style={styles.header}>
        <Text style={styles.errorCode}>404</Text>
        <Text style={styles.title}>Page Not Found</Text>
      </View>

      <Text style={styles.message}>
        We're sorry, but the page you requested could not be found. It might have been moved or deleted.
      </Text>

      {/* Navigation Back Button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={handleGoBack}
        activeOpacity={0.7}
      >
        <Text style={styles.backButtonText}>← Go Back</Text>
      </TouchableOpacity>

      <View style={styles.linksSection}>
        <Text style={styles.linksTitle}>What can you do next?</Text>
        {HELPFUL_LINKS.map((link) => (
          <TouchableOpacity
            key={link.id}
            style={styles.linkItem}
            onPress={() => handleLinkPress(link.screen)}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>{link.title}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Responsive Design Consideration for Web */}
      {Platform.OS === 'web' && (
        <Text style={styles.webHint}>
          This is a hybrid mobile application screen, optimized for both mobile and web.
        </Text>
      )}
    </ScrollView>
  );
};

// --- Styling ---

const createStyles = () => StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#f8f8f8', // Light background
  },
  container: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    // Max width for web responsiveness
    maxWidth: Platform.OS === 'web' ? 600 : '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: 30,
    alignItems: 'center',
  },
  errorCode: {
    fontSize: 80,
    fontWeight: 'bold',
    color: '#E74C3C', // Red color for error
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  backButton: {
    backgroundColor: '#3498DB', // Primary blue color
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginBottom: 40,
    // Shadow for mobile
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  backButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  linksSection: {
    width: '100%',
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  linksTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  linkItem: {
    width: '100%',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  linkText: {
    color: '#2980B9', // Secondary blue for links
    fontSize: 16,
    fontWeight: '500',
  },
  webHint: {
    marginTop: 50,
    fontSize: 12,
    color: '#aaa',
    textAlign: 'center',
  }
});

export default NotFoundScreen;