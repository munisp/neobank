import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

// --- Type Definitions ---

// Define the shape of the registration form data
interface RegistrationForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

// Define the shape of the API response for registration
interface RegistrationResponse {
  success: boolean;
  message: string;
  // Add other fields expected from the API, e.g., userId, token
}

// Define the shape of the navigation prop (simplified for this example)
type NavigationProp = {
  navigate: (screen: string, params?: object) => void;
  goBack: () => void;
};

// --- Mock API Service (Replace with actual ApiService) ---

/**
 * Mock API service to simulate a registration call.
 * In a real application, this would be an imported service
 * that handles network requests (e.g., using fetch or axios).
 * @param data The registration form data.
 * @returns A promise that resolves with a RegistrationResponse.
 */
const ApiService = {
  register: (data: RegistrationForm): Promise<RegistrationResponse> => {
    return new Promise((resolve, reject) => {
      // Simulate network delay
      setTimeout(() => {
        // Basic validation for mock
        if (data.email.includes('error')) {
          reject({ success: false, message: 'Email already in use.' });
        } else if (data.password !== data.confirmPassword) {
          reject({ success: false, message: 'Passwords do not match.' });
        } else {
          // Simulate successful registration
          resolve({ success: true, message: 'Registration successful!' });
        }
      }, 1500);
    });
  },
};

// --- Validation Logic ---

/**
 * Performs client-side validation on the registration form data.
 * @param data The registration form data.
 * @returns A string containing the error message, or null if validation passes.
 */
const validateForm = (data: RegistrationForm): string | null => {
  if (!data.firstName || !data.lastName || !data.email || !data.password || !data.confirmPassword) {
    return 'All fields are required.';
  }
  if (data.password.length < 6) {
    return 'Password must be at least 6 characters long.';
  }
  if (data.password !== data.confirmPassword) {
    return 'Passwords do not match.';
  }
  // Simple email regex for client-side check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return 'Please enter a valid email address.';
  }
  return null;
};

// --- Register Screen Component ---

const RegisterScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  // State for form data
  const [formData, setFormData] = useState<RegistrationForm>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  // State for UI feedback
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handles changes to the form input fields.
   * @param field The name of the field being updated.
   * @param value The new value of the field.
   */
  const handleChange = (field: keyof RegistrationForm, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error message on user input
    if (error) setError(null);
  };

  /**
   * Handles the registration submission process.
   */
  const handleRegister = async () => {
    // 1. Client-side validation
    const validationError = validateForm(formData);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 2. API Service Call
      const response = await ApiService.register(formData);

      if (response.success) {
        // 3. Success handling: Navigate to a success screen or login
        Alert.alert('Success', response.message);
        // Assuming 'Login' is the next screen after successful registration
        navigation.navigate('Login');
      } else {
        // This path is for API responses that indicate a business logic error
        setError(response.message || 'Registration failed. Please try again.');
      }
    } catch (apiError: any) {
      // 4. Error handling: Catch network errors or API rejections
      const errorMessage = apiError.message || 'An unexpected error occurred during registration.';
      setError(errorMessage);
      Alert.alert('Registration Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create Your Account</Text>

        {/* Error Display */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* First Name Input */}
        <TextInput
          style={styles.input}
          placeholder="First Name"
          value={formData.firstName}
          onChangeText={text => handleChange('firstName', text)}
          autoCapitalize="words"
          editable={!isLoading}
        />

        {/* Last Name Input */}
        <TextInput
          style={styles.input}
          placeholder="Last Name"
          value={formData.lastName}
          onChangeText={text => handleChange('lastName', text)}
          autoCapitalize="words"
          editable={!isLoading}
        />

        {/* Email Input */}
        <TextInput
          style={styles.input}
          placeholder="Email Address"
          value={formData.email}
          onChangeText={text => handleChange('email', text)}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!isLoading}
        />

        {/* Password Input */}
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={formData.password}
          onChangeText={text => handleChange('password', text)}
          secureTextEntry
          editable={!isLoading}
        />

        {/* Confirm Password Input */}
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          value={formData.confirmPassword}
          onChangeText={text => handleChange('confirmPassword', text)}
          secureTextEntry
          editable={!isLoading}
        />

        {/* Register Button */}
        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Register</Text>
          )}
        </TouchableOpacity>

        {/* Navigation to Login */}
        <View style={styles.loginPrompt}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Log In</Text>
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
    backgroundColor: '#f5f5f5', // Light background for the whole screen
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 30,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#007AFF', // Primary blue color
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#a0c8ff', // Lighter blue when disabled
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginPrompt: {
    flexDirection: 'row',
    marginTop: 20,
  },
  loginText: {
    fontSize: 16,
    color: '#666',
  },
  loginLink: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: 'bold',
  },
  errorBox: {
    width: '100%',
    padding: 10,
    backgroundColor: '#ffdddd', // Light red background for error
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ff0000',
  },
  errorText: {
    color: '#ff0000',
    textAlign: 'center',
    fontSize: 14,
  },
});

export default RegisterScreen;