import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';

// Mocking required services and types as they are not provided
// In a real application, these would be imported from 'src/services'
interface AuthService {
  requestPasswordReset: (email: string) => Promise<void>;
  verifyResetCode: (email: string, code: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

const mockAuthService: AuthService = {
  requestPasswordReset: async (email: string) => {
    console.log(`Requesting password reset for: ${email}`);
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (email.includes('error')) {
      throw new Error('User not found or invalid email format.');
    }
    console.log('Password reset request successful.');
  },
  verifyResetCode: async (email: string, code: string) => {
    console.log(`Verifying code ${code} for ${email}`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (code !== '123456') {
      throw new Error('Invalid verification code.');
    }
    console.log('Code verification successful.');
  },
  resetPassword: async (email: string, code: string, newPassword: string) => {
    console.log(`Resetting password for ${email} with new password: ${newPassword}`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    console.log('Password reset successful.');
  },
};

// --- Component Types ---
type ResetStep = 'email' | 'code' | 'new_password' | 'success';

interface ForgotPasswordScreenProps {
  onSuccess: () => void; // Optional prop for navigation after success
  onGoBack: () => void; // Optional prop to handle back navigation
}

const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({ onSuccess, onGoBack }) => {
  const [step, setStep] = useState<ResetStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Handlers ---

  const handleRequestCode = useCallback(async () => {
    setError(null);
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await mockAuthService.requestPasswordReset(email);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request reset code.');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleVerifyCode = useCallback(async () => {
    setError(null);
    if (code.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      await mockAuthService.verifyResetCode(email, code);
      setStep('new_password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify code.');
    } finally {
      setLoading(false);
    }
  }, [email, code]);

  const handleResetPassword = useCallback(async () => {
    setError(null);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await mockAuthService.resetPassword(email, code, newPassword);
      setStep('success');
      // Optional: call onSuccess prop if provided
      if (onSuccess) {
        setTimeout(onSuccess, 3000); // Auto-navigate after 3 seconds
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  }, [email, code, newPassword, confirmPassword, onSuccess]);

  // --- UI Rendering Logic (To be implemented in Phase 2) ---

  const renderEmailStep = () => (
    <View>
      <Text style={styles.title}>Forgot Password</Text>
      <Text style={styles.subtitle}>Enter your email address to receive a verification code.</Text>
      
      {error && <Text style={styles.errorText}>{error}</Text>}

      <TextInput
        style={styles.input}
        placeholder="Email Address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleRequestCode}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Send Code</Text>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.linkButton} onPress={onGoBack}>
        <Text style={styles.linkButtonText}>Back to Login</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCodeStep = () => (
    <View>
      <Text style={styles.title}>Verify Code</Text>
      <Text style={styles.subtitle}>A 6-digit code has been sent to {email}.</Text>
      
      {error && <Text style={styles.errorText}>{error}</Text>}

      <TextInput
        style={styles.input}
        placeholder="Verification Code"
        value={code}
        onChangeText={setCode}
        keyboardType="numeric"
        maxLength={6}
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerifyCode}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Verify Code</Text>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.linkButton} onPress={() => setStep('email')}>
        <Text style={styles.linkButtonText}>Change Email</Text>
      </TouchableOpacity>
    </View>
  );

  const renderNewPasswordStep = () => (
    <View>
      <Text style={styles.title}>Set New Password</Text>
      <Text style={styles.subtitle}>Enter your new password and confirm it.</Text>
      
      {error && <Text style={styles.errorText}>{error}</Text>}

      <TextInput
        style={styles.input}
        placeholder="New Password (min 8 characters)"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        autoCapitalize="none"
        editable={!loading}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm New Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoCapitalize="none"
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleResetPassword}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Reset Password</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderSuccessStep = () => (
    <View style={styles.successContainer}>
      <Text style={styles.successTitle}>Password Reset Successful!</Text>
      <Text style={styles.successMessage}>
        Your password has been successfully updated. You can now log in with your new password.
      </Text>
      <TouchableOpacity style={styles.button} onPress={onGoBack}>
        <Text style={styles.buttonText}>Go to Login</Text>
      </TouchableOpacity>
    </View>
  );

  const renderContent = () => {
    switch (step) {
      case 'email':
        return renderEmailStep();
      case 'code':
        return renderCodeStep();
      case 'new_password':
        return renderNewPasswordStep();
      case 'success':
        return renderSuccessStep();
      default:
        return null;
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.contentWrapper}>
        {renderContent()}
      </View>
    </ScrollView>
  );
};

// --- Styles (Responsive Design for Mobile/Web) ---
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f7fa', // Light background
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 400, // Max width for web/tablet view
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#007bff', // Primary NeoBank color
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonDisabled: {
    backgroundColor: '#a0c8ff',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  linkButton: {
    padding: 10,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#007bff',
    fontSize: 16,
  },
  errorText: {
    color: '#dc3545', // Danger color
    textAlign: 'center',
    marginBottom: 15,
    fontWeight: '600',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#28a745', // Success color
    marginBottom: 10,
  },
  successMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
});

export default ForgotPasswordScreen;