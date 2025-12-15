import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

// Define the type for the navigation stack parameters
// Assuming a root stack with a 'Home' route.
type RootStackParamList = {
  Home: undefined;
  NotFound: undefined;
  // Add other routes as needed
};

type NotFoundScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'NotFound'
>;

// Placeholder for an assumed existing API service
// In a real application, this would be imported from a service file.
const ApiService = {
  logError: (error: string) => {
    console.log(`[ApiService] Logging error: ${error}`);
    // Simulate an API call delay
    return new Promise(resolve => setTimeout(resolve, 500));
  },
};

/**
 * Renders a "Not Found" screen (404 page) for the mobile application.
 *
 * Features:
 * - Static display of a 404 error message.
 * - Integration with react-navigation for proper navigation.
 * - A "Go Home" button to navigate back to the main screen.
 * - Placeholder for error logging via an assumed ApiService.
 * - Basic loading state for the error logging process.
 * - Proper styling using React Native's StyleSheet.
 */
const NotFoundScreen: React.FC = () => {
  const navigation = useNavigation<NotFoundScreenNavigationProp>();
  const [isLogging, setIsLogging] = React.useState(false);
  const [logError, setLogError] = React.useState<string | null>(null);

  // Simulate PWA feature: Log the 404 error on screen load
  React.useEffect(() => {
    const logNotFound = async () => {
      setIsLogging(true);
      setLogError(null);
      try {
        // In a real app, you might log the current route or a specific error message
        const errorToLog = `404 Not Found at route: ${navigation.getState().routes[navigation.getState().index].name}`;
        await ApiService.logError(errorToLog);
      } catch (e) {
        setLogError('Failed to log error to server.');
        console.error('Error logging 404:', e);
      } finally {
        setIsLogging(false);
      }
    };

    logNotFound();
  }, [navigation]);

  const handleGoHome = () => {
    // Use navigate to go to the 'Home' screen
    navigation.navigate('Home');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.errorCode}>404</Text>
        <Text style={styles.title}>Page Not Found</Text>
        <Text style={styles.message}>
          The page you are looking for does not exist or an error occurred.
        </Text>

        {/* Loading state for API service call */}
        {isLogging && (
          <Text style={styles.statusText}>Logging error...</Text>
        )}

        {/* Error handling for API service call */}
        {logError && (
          <Text style={styles.errorText}>Error: {logError}</Text>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={handleGoHome}
          disabled={isLogging} // Disable button while logging
        >
          <Text style={styles.buttonText}>Go to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff', // Use a consistent background color
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorCode: {
    fontSize: 80,
    fontWeight: 'bold',
    color: '#FF6347', // Tomato color for emphasis
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#007AFF', // Standard blue for primary action
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#FF6347',
    marginTop: 10,
    fontWeight: '500',
  },
});

export default NotFoundScreen;
