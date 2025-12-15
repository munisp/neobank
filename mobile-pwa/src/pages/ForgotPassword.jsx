import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Mock imports for required services and UI components
// In a real application, these would be implemented and exported from their respective paths.
import * as AuthService from '../services/AuthService';
import * as NotificationService from '../services/NotificationService';
import * as ApiService from '../services/ApiService';
import {
  Card,
  Input,
  Button,
  Spinner,
  Alert,
  OfflineIndicator,
} from '../components/ui/';

// --- Type Definitions (for better TypeScript support) ---
interface ForgotPasswordForm {
  email: string;
}

// --- Constants ---
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ForgotPasswordScreen Component
 * Handles the password recovery process: email input, submission, and status display.
 * @returns {JSX.Element} The Forgot Password page component.
 */
const ForgotPasswordScreen: React.FC = () => {
  const navigate = useNavigate();

  // --- State Management ---
  const [formData, setFormData] = useState<ForgotPasswordForm>({ email: '' });
  const [errors, setErrors] = useState<Partial<ForgotPasswordForm>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // --- Event Handlers ---

  /**
   * Handles input changes and updates the form data state.
   * @param {React.ChangeEvent<HTMLInputElement>} e - The input change event.
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error for the field being edited
    if (errors[name as keyof ForgotPasswordForm]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  /**
   * Performs client-side form validation.
   * @returns {boolean} True if the form is valid, false otherwise.
   */
  const validateForm = useCallback((): boolean => {
    const newErrors: Partial<ForgotPasswordForm> = {};
    if (!formData.email) {
      newErrors.email = 'Email is required.';
    } else if (!EMAIL_REGEX.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData.email]);

  /**
   * Handles the form submission for password recovery.
   * @param {React.FormEvent} e - The form submission event.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validateForm()) {
      NotificationService.showToast('Please correct the errors in the form.', 'error');
      return;
    }

    if (!isOnline) {
      setApiError('You are currently offline. Please check your connection and try again.');
      return;
    }

    setIsLoading(true);
    try {
      // Simulate API call for password recovery
      // In a real app, this would call AuthService.forgotPassword(formData.email)
      const response = await AuthService.forgotPassword(formData.email);

      if (response.success) {
        setIsSubmitted(true);
        NotificationService.showToast('Password reset instructions sent!', 'success');
        // Optionally navigate after a delay or show success screen
        // setTimeout(() => navigate('/login'), 5000);
      } else {
        // Handle specific API errors (e.g., email not found)
        const errorMessage = response.message || 'Failed to send reset instructions. Please try again.';
        setApiError(errorMessage);
        NotificationService.showToast(errorMessage, 'error');
      }
    } catch (error) {
      console.error('Password recovery error:', error);
      const errorMessage = ApiService.getErrorMessage(error) || 'An unexpected error occurred. Please try again later.';
      setApiError(errorMessage);
      NotificationService.showToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // --- useEffect for Offline Support Indicator ---
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Render Logic ---

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md p-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Check Your Email</h1>
          <p className="text-gray-600 mb-6">
            We have sent a password reset link to <span className="font-semibold text-indigo-600">{formData.email}</span>.
            Please check your inbox (and spam folder) to continue.
          </p>
          <Button onClick={() => navigate('/login')} fullWidth>
            Back to Login
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <OfflineIndicator isOnline={isOnline} />
      <Card className="w-full max-w-md p-6 shadow-lg">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2 text-center">
          Forgot Password
        </h1>
        <p className="text-center text-sm text-gray-600 mb-6">
          Enter the email address associated with your account to receive a password reset link.
        </p>

        {/* Error Handling */}
        {apiError && (
          <Alert type="error" message={apiError} className="mb-4" />
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4">
            <Input
              id="email"
              name="email"
              type="email"
              label="Email Address"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              error={errors.email}
              disabled={isLoading}
              required
            />
          </div>

          <Button
            type="submit"
            fullWidth
            className="mt-6"
            disabled={isLoading || !isOnline}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <Spinner size="sm" className="mr-2" />
                Sending Instructions...
              </div>
            ) : (
              'Send Reset Instructions'
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Remembered your password? Go back to Login
          </Link>
        </div>
      </Card>
      {/* Empty State: Not explicitly needed for this page, but the Card/Form structure handles the main content. */}
    </div>
  );
};

export default ForgotPasswordScreen;

// Mock implementations for services and components to satisfy imports and usage.
// In a real project, these would be external files.

// Mock AuthService
// const AuthService = {
//   forgotPassword: async (email: string) => {
//     await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
//     if (email === 'error@example.com') {
//       return { success: false, message: 'This email is not registered.' };
//     }
//     if (email === 'api@fail.com') {
//       throw new Error('Server unavailable.');
//     }
//     return { success: true };
//   }
// };

// Mock NotificationService
// const NotificationService = {
//   showToast: (message: string, type: 'success' | 'error' | 'info') => {
//     console.log(`[Toast - ${type.toUpperCase()}]: ${message}`);
//   }
// };

// Mock ApiService
// const ApiService = {
//   getErrorMessage: (error: any) => {
//     if (error instanceof Error) return error.message;
//     return 'An unknown API error occurred.';
//   }
// };

// Mock UI Components (Simplified for code generation)
// const Card = ({ children, className }: any) => <div className={\`bg-white rounded-xl \${className}\`}>{children}</div>;
// const Input = ({ label, error, ...props }: any) => (
//   <div>
//     <label className="block text-sm font-medium text-gray-700">{label}</label>
//     <input className={\`mt-1 block w-full border rounded-md shadow-sm p-2 \${error ? 'border-red-500' : 'border-gray-300'}\`} {...props} />
//     {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
//   </div>
// );
// const Button = ({ children, fullWidth, className, ...props }: any) => (
//   <button className={\`py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 \${fullWidth ? 'w-full' : ''} \${className}\`} {...props}>
//     {children}
//   </button>
// );
// const Spinner = ({ size, className }: any) => <div className={\`animate-spin rounded-full border-b-2 border-white \${size === 'sm' ? 'w-4 h-4' : 'w-8 h-8'} \${className}\`}></div>;
// const Alert = ({ type, message, className }: any) => (
//   <div className={\`p-3 rounded-md \${type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'} \${className}\`}>
//     {message}
//   </div>
// );
// const OfflineIndicator = ({ isOnline }: any) => (
//   <div className={\`fixed top-0 left-0 right-0 p-2 text-center text-sm font-medium \${isOnline ? 'hidden' : 'bg-yellow-500 text-white'}\`}>
//     {isOnline ? null : 'You are offline. Functionality may be limited.'}
//   </div>
// );