import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';

// --- Type Definitions ---

// Define the navigation stack parameter list.
// Assuming a simple stack with a 'Login' screen for navigation back.
type RootStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  // Add other screens as needed
};

type ForgotPasswordScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'ForgotPassword'
>;

interface Props {
  navigation: ForgotPasswordScreenNavigationProp;
}

// --- Mock API Service (Simulating an existing ApiService) ---

/**
 * Mock API service to simulate the password reset request.
 * In a real application, this would be an external module.
 * @param email The email address to send the reset link to.
 * @returns A promise that resolves on success or rejects on failure.
 */
const ApiService = {
  requestPasswordReset: (email: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate API success for a specific email, and failure for others
        if (email.toLowerCase() === 'success@example.com') {
          resolve();
        } else if (email.toLowerCase() === 'error@example.com') {
          reject(new Error('API Error: User not found or invalid request.'));
        } else {
          // Simulate a random success/failure for other emails
          if (Math.random() > 0.3) {
            resolve();
          } else {
            reject(new Error('Failed to send reset link. Please try again.'));
          }
        }
      }, 1500); // Simulate network delay
    });
  },
};

// --- Component Implementation ---

const ForgotPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Simple email validation
  const isValidEmail = (text: string): boolean => {
    // Basic regex for email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(text);
  };

  /**
   * Handles the submission of the forgot password form.
   * Includes loading state management and error handling.
   */
  const handleSubmit = async () => {
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsSuccess(false);

    try {
      // Call the mock API service
      await ApiService.requestPasswordReset(email);
      setIsSuccess(true);
      // Optionally, navigate to a success screen or show a persistent message
    } catch (err) {
      // Handle API errors and display a user-friendly message
      const errorMessage =
        err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      Alert.alert('Request Failed', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render Logic ---

  if (isSuccess) {
    return (
      <View style={styles.container}>
        <Text style={styles.successTitle}>Password Reset Email Sent!</Text>
        <Text style={styles.successText}>
          Please check your inbox at <Text style={styles.emailText}>{email}</Text> for instructions on how to reset your password.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.buttonText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Forgot Password</Text>
          <Text style={styles.subtitle}>
            Enter your email address and we'll send you a link to reset your password.
          </Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            editable={!isLoading}
          />

          {/* Display error message if present */}
          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, !isValidEmail(email) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading || !isValidEmail(email)}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('Login')}
            disabled={isLoading}
          >
            <Text style={styles.linkText}>Remembered your password? Log In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// --- Styling ---

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#f4f4f4', // Light background for the screen
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f4f4f4',
  },
  headerContainer: {
    marginBottom: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  formContainer: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  label: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
    fontWeight: '600',
  },
  input: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF', // Standard blue color
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#A0C4FF', // Lighter blue for disabled state
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
  },
  errorText: {
    color: '#FF3B30', // Standard red for errors
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 14,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#28A745', // Green for success
    marginBottom: 15,
  },
  successText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  emailText: {
    fontWeight: 'bold',
    color: '#007AFF',
  }
});

export default ForgotPasswordScreen;