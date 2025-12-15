import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { LoginScreenProps, LoginCredentials } from './src/types';
import { AuthService } from './src/services/AuthService';
import { NotificationService, StorageService } from './src/services/OtherServices';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from './src/styles/theme';

// --- Custom Components for Reusability and Platform Consistency ---

/**
 * A simple button component.
 */
const PrimaryButton: React.FC<{ title: string; onPress: () => void; disabled?: boolean; loading?: boolean }> = ({
  title,
  onPress,
  disabled = false,
  loading = false,
}) => (
  <TouchableOpacity
    style={[styles.button, disabled && styles.buttonDisabled]}
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.7}>
    {loading ? (
      <ActivityIndicator color={COLORS.card} />
    ) : (
      <Text style={styles.buttonText}>{title}</Text>
    )}
  </TouchableOpacity>
);

/**
 * A custom text input component.
 */
const CustomTextInput: React.FC<{
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'email-address' | 'default';
}> = ({ placeholder, value, onChangeText, secureTextEntry = false, keyboardType = 'default' }) => (
  <TextInput
    style={styles.input}
    placeholder={placeholder}
    placeholderTextColor={COLORS.textSecondary}
    value={value}
    onChangeText={onChangeText}
    secureTextEntry={secureTextEntry}
    keyboardType={keyboardType}
    autoCapitalize="none"
  />
);

/**
 * A component for the "Remember Me" checkbox.
 */
const RememberMeCheckbox: React.FC<{ checked: boolean; onToggle: () => void }> = ({ checked, onToggle }) => (
  <TouchableOpacity style={styles.checkboxContainer} onPress={onToggle} activeOpacity={0.7}>
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked && <Text style={styles.checkboxCheckmark}>✓</Text>}
    </View>
    <Text style={styles.checkboxLabel}>Remember Me</Text>
  </TouchableOpacity>
);

/**
 * A component for social login buttons.
 */
const SocialButton: React.FC<{ provider: 'Google' | 'Facebook' | 'Apple'; onPress: () => void }> = ({
  provider,
  onPress,
}) => {
  const color =
    provider === 'Google'
      ? COLORS.socialGoogle
      : provider === 'Facebook'
      ? COLORS.socialFacebook
      : COLORS.socialApple;
  const icon = provider === 'Apple' ? '' : provider.charAt(0); // Simplified icon for mock

  return (
    <TouchableOpacity
      style={[styles.socialButton, { backgroundColor: color }]}
      onPress={onPress}
      activeOpacity={0.7}>
      <Text style={styles.socialButtonIcon}>{icon}</Text>
      <Text style={styles.socialButtonText}>Login with {provider}</Text>
    </TouchableOpacity>
  );
};

// --- Main Screen Component ---

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onForgotPassword, onSignUp }) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState<boolean>(false);

  // 1. Check for biometric support on mount
  useEffect(() => {
    const checkBiometric = async () => {
      try {
        const supported = await AuthService.isBiometricSupported();
        setIsBiometricAvailable(supported);
      } catch (e) {
        console.error('Biometric check failed:', e);
        setIsBiometricAvailable(false);
      }
    };
    checkBiometric();
  }, []);

  // 2. Handle standard email/password login
  const handleLogin = useCallback(async () => {
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const credentials: LoginCredentials = { email, password };
      const user = await AuthService.login(credentials);

      // Handle "Remember Me" storage
      if (rememberMe) {
        await StorageService.setItem('rememberMe', 'true');
        // In a real app, you might store a refresh token or user ID here
      } else {
        await StorageService.removeItem('rememberMe');
      }

      NotificationService.showSuccess('Login successful!');
      onLoginSuccess(user);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during login.';
      setError(errorMessage);
      NotificationService.showError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [email, password, rememberMe, onLoginSuccess]);

  // 3. Handle biometric login
  const handleBiometricLogin = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await AuthService.biometricLogin();
      NotificationService.showSuccess('Biometric login successful!');
      onLoginSuccess(user);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Biometric login failed.';
      setError(errorMessage);
      NotificationService.showError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [onLoginSuccess]);

  // 4. Handle social login
  const handleSocialLogin = useCallback(
    async (provider: 'Google' | 'Facebook' | 'Apple') => {
      setLoading(true);
      setError(null);
      try {
        const user = await AuthService.socialLogin(provider);
        NotificationService.showSuccess(`${provider} login successful!`);
        onLoginSuccess(user);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : `${provider} login failed.`;
        setError(errorMessage);
        NotificationService.showError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [onLoginSuccess],
  );

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to access your NeoBank account</Text>

        {/* Error Display */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Email and Password Fields */}
        <CustomTextInput
          placeholder="Email Address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
        />
        <CustomTextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {/* Remember Me and Forgot Password */}
        <View style={styles.row}>
          <RememberMeCheckbox checked={rememberMe} onToggle={() => setRememberMe(prev => !prev)} />
          <TouchableOpacity onPress={onForgotPassword} activeOpacity={0.7}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {/* Login Button */}
        <PrimaryButton
          title="Log In"
          onPress={handleLogin}
          disabled={!email || !password}
          loading={loading}
        />

        {/* Biometric Login Option */}
        {isBiometricAvailable && (
          <View style={styles.biometricContainer}>
            <Text style={styles.dividerText}>OR</Text>
            <TouchableOpacity
              style={styles.biometricButton}
              onPress={handleBiometricLogin}
              disabled={loading}
              activeOpacity={0.7}>
              <Text style={styles.biometricButtonText}>Use Biometrics</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Social Login Buttons */}
        <View style={styles.socialContainer}>
          <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
          <View style={styles.socialButtonsRow}>
            <SocialButton provider="Google" onPress={() => handleSocialLogin('Google')} />
            <SocialButton provider="Facebook" onPress={() => handleSocialLogin('Facebook')} />
            {Platform.OS !== 'web' && ( // Apple login is often restricted on web
              <SocialButton provider="Apple" onPress={() => handleSocialLogin('Apple')} />
            )}
          </View>
        </View>

        {/* Sign Up Link */}
        <View style={styles.signUpContainer}>
          <Text style={styles.signUpText}>Don't have an account? </Text>
          <TouchableOpacity onPress={onSignUp} activeOpacity={0.7}>
            <Text style={styles.signUpLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

// --- Stylesheet for Responsiveness and Aesthetics ---

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.md,
  },
  container: {
    width: '100%',
    maxWidth: 400, // Max width for web/desktop responsiveness
    alignSelf: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.default,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.medium,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  input: {
    height: 50,
    backgroundColor: COLORS.inputBackground,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    fontSize: FONT_SIZES.medium,
    color: COLORS.text,
    // Web-specific styles for better appearance
    ...(Platform.OS === 'web' && {
      outlineStyle: 'none',
      boxShadow: '0 0 0 1px transparent',
      transition: 'box-shadow 0.2s',
      ':focus': {
        boxShadow: `0 0 0 2px ${COLORS.primary}`,
      },
    }),
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginRight: SPACING.sm,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
  },
  checkboxCheckmark: {
    color: COLORS.card,
    fontSize: FONT_SIZES.small,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: FONT_SIZES.medium,
    color: COLORS.text,
  },
  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.medium,
    fontWeight: '600',
  },
  button: {
    height: 50,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  buttonDisabled: {
    backgroundColor: `${COLORS.primary}80`, // 50% opacity
  },
  buttonText: {
    color: COLORS.card,
    fontSize: FONT_SIZES.large,
    fontWeight: 'bold',
  },
  errorBox: {
    backgroundColor: `${COLORS.error}10`, // Light red background
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    fontSize: FONT_SIZES.medium,
  },
  biometricContainer: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  biometricButton: {
    height: 50,
    width: '100%',
    backgroundColor: COLORS.secondary,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  biometricButtonText: {
    color: COLORS.card,
    fontSize: FONT_SIZES.large,
    fontWeight: '600',
  },
  dividerText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    marginVertical: SPACING.md,
  },
  socialContainer: {
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  socialButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: SPACING.md,
  },
  socialButton: {
    flex: 1,
    height: 50,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: SPACING.xs,
    flexDirection: 'row',
  },
  socialButtonIcon: {
    color: COLORS.card,
    fontSize: FONT_SIZES.large,
    marginRight: SPACING.sm,
    fontWeight: 'bold',
  },
  socialButtonText: {
    color: COLORS.card,
    fontSize: FONT_SIZES.medium,
    fontWeight: '600',
    // Hide text on smaller screens/mobile to show only icon
    ...(Platform.OS === 'web' && {
      '@media (max-width: 400px)': {
        display: 'none',
      },
    }),
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  signUpText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.medium,
  },
  signUpLink: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.medium,
    fontWeight: '600',
  },
});

export default LoginScreen;