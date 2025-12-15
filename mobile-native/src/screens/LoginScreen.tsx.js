import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';

// --- MOCK DEPENDENCIES ---

// 1. Mock Navigation Types (Assuming React Navigation v6+)
// In a real app, these would be defined in a separate file like 'types/navigation.ts'
type RootStackParamList = {
  LoginScreen: undefined;
  HomeScreen: undefined;
  ForgotPasswordScreen: undefined;
  RegisterScreen: undefined;
};

type LoginScreenNavigationProp = NavigationProp<
  RootStackParamList,
  'LoginScreen'
>;

// 2. Mock ApiService
// Simulates an existing ApiService with a login method.
// In a real app, this would be imported from a file like 'services/ApiService.ts'
const mockApiService = {
  login: (email: string, password: string): Promise<{ success: boolean; token?: string; error?: string }> => {
    return new Promise((resolve, reject) => {
      // Simulate network delay
      setTimeout(() => {
        if (email === 'user@example.com' && password === 'password123') {
          // Successful login
          resolve({ success: true, token: 'mock-jwt-token-12345' });
        } else if (email === 'error@example.com') {
          // API error simulation
          reject(new Error('Network error or server unavailable.'));
        } else {
          // Failed login (e.g., invalid credentials)
          resolve({ success: false, error: 'Invalid email or password.' });
        }
      }, 1500);
    });
  },
  // Mock for a "Remember Me" feature persistence (e.g., using AsyncStorage)
  saveAuthToken: async (token: string) => {
    console.log('Saving token:', token);
    // In a real app, this would use AsyncStorage or similar
  },
};

// --- COMPONENT START ---

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handles the login process by calling the mock API service.
   * Includes loading state management and error handling.
   */
  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await mockApiService.login(email, password);

      if (response.success && response.token) {
        // 1. Save token (simulating "Remember Me" if needed)
        if (rememberMe) {
          await mockApiService.saveAuthToken(response.token);
        }

        // 2. Navigate to the main screen
        // NOTE: In a real app, you would replace 'HomeScreen' with the appropriate route name.
        navigation.navigate('HomeScreen');
      } else if (response.error) {
        // Handle API-specific validation errors
        setError(response.error);
      } else {
        // Generic failure
        setError('Login failed. Please try again.');
      }
    } catch (e) {
      // Handle network or unexpected errors
      const errorMessage = e instanceof Error ? e.message : 'An unexpected error occurred.';
      setError(errorMessage);
      Alert.alert('Login Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const navigateToForgotPassword = () => {
    // NOTE: In a real app, you would replace 'ForgotPasswordScreen' with the appropriate route name.
    navigation.navigate('ForgotPasswordScreen');
  };

  const navigateToRegister = () => {
    // NOTE: In a real app, you would replace 'RegisterScreen' with the appropriate route name.
    navigation.navigate('RegisterScreen');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue to your account.</Text>

        {/* Error Message Display */}
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Email Input */}
        <TextInput
          style={styles.input}
          placeholder="Email or Username"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!isLoading}
        />

        {/* Password Input */}
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!isLoading}
        />

        {/* Remember Me & Forgot Password */}
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setRememberMe(!rememberMe)}
            disabled={isLoading}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Text style={styles.checkboxCheckmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>Remember Me</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={navigateToForgotPassword} disabled={isLoading}>
            <Text style={styles.linkText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {/* Login Button */}
        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>LOG IN</Text>
          )}
        </TouchableOpacity>

        {/* Separator (Simulating PWA's visual break) */}
        <View style={styles.separatorContainer}>
          <View style={styles.separatorLine} />
          <Text style={styles.separatorText}>OR</Text>
          <View style={styles.separatorLine} />
        </View>

        {/* Social Login Buttons (Simulating PWA feature) */}
        <TouchableOpacity style={[styles.button, styles.socialButton, { backgroundColor: '#4285F4' }]} disabled={isLoading}>
          <Text style={styles.buttonText}>Sign in with Google</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.socialButton, { backgroundColor: '#3b5998' }]} disabled={isLoading}>
          <Text style={styles.buttonText}>Sign in with Facebook</Text>
        </TouchableOpacity>

        {/* Register Link */}
        <View style={styles.registerContainer}>
          <Text style={styles.registerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={navigateToRegister} disabled={isLoading}>
            <Text style={styles.linkText}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// --- STYLESHEET ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    height: 20,
    width: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#007AFF',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkboxCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    height: 50,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    elevation: 3, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  buttonDisabled: {
    backgroundColor: '#a0cfff',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  socialButton: {
    // Placeholder color for social buttons
    // Real implementation would use specific brand colors
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 14,
  },
  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ccc',
  },
  separatorText: {
    width: 50,
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  registerText: {
    fontSize: 14,
    color: '#666',
  },
});

export default LoginScreen;

// --- END OF FILE ---