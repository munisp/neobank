import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Service Imports
import * as AuthService from '../services/AuthService';
import * as ApiService from '../services/ApiService';
import * as NotificationService from '../services/NotificationService';
// UI Component Imports (assuming standard components like Button, Input, Card, Spinner)
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { Alert } from '../components/ui/Alert';
import { BiometricsIcon, LockIcon, MailIcon, UserIcon, WifiOffIcon } from '../components/ui/Icons';

// Mock Context for demonstration, assuming a real AuthContext would be provided
// import { AuthContext } from '../contexts/AuthContext';

// --- Types ---
interface LoginFormData {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
}

// --- Constants ---
const OFFLINE_MESSAGE = "You appear to be offline. Login functionality may be limited.";

const LoginScreen: React.FC = () => {
  // const { isAuthenticated, login } = useContext(AuthContext); // Use real context if available
  const navigate = useNavigate();

  // --- State Management ---
  const [formData, setFormData] = useState<LoginFormData>({ email: '', password: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState<boolean>(false);

  // --- Utility Functions ---
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.email) {
      newErrors.email = 'Email is required.';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email address is invalid.';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required.';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // --- Event Handlers ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Clear error for the field being edited
    if (errors[e.target.name as keyof FormErrors]) {
      setErrors({ ...errors, [e.target.name as keyof FormErrors]: undefined });
    }
    setApiError(null); // Clear API error on input change
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validateForm()) {
      NotificationService.notify('Please correct the errors in the form.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      // Simulate API call using AuthService
      const response = await AuthService.login(formData.email, formData.password);
      
      if (response.success) {
        // login(response.token); // Use real context login function
        NotificationService.notify('Login successful!', 'success');
        // Simulate successful navigation
        navigate('/dashboard', { replace: true });
      } else {
        setApiError(response.message || 'Login failed. Please check your credentials.');
        NotificationService.notify(response.message || 'Login failed.', 'error');
      }
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = ApiService.getErrorMessage(error) || 'An unexpected error occurred during login.';
      setApiError(errorMessage);
      NotificationService.notify(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setApiError(null);
    setIsLoading(true);
    try {
      // Simulate biometric authentication flow
      const response = await AuthService.biometricLogin();
      
      if (response.success) {
        // login(response.token); // Use real context login function
        NotificationService.notify('Biometric login successful!', 'success');
        navigate('/dashboard', { replace: true });
      } else {
        setApiError(response.message || 'Biometric login failed.');
        NotificationService.notify(response.message || 'Biometric login failed.', 'error');
      }
    } catch (error) {
      console.error('Biometric login error:', error);
      const errorMessage = ApiService.getErrorMessage(error) || 'Biometric authentication failed.';
      setApiError(errorMessage);
      NotificationService.notify(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // --- useEffect for side effects ---
  useEffect(() => {
    // Check for biometric availability on mount
    const checkBiometrics = async () => {
      const available = await AuthService.checkBiometricAvailability();
      setIsBiometricAvailable(available);
    };
    checkBiometrics();

    // Offline status listener
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Render ---
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4 sm:p-6">
      {/* Offline Indicator */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <Alert type="warning" icon={<WifiOffIcon className="w-5 h-5" />}>
            {OFFLINE_MESSAGE}
          </Alert>
        </div>
      )}

      <Card className="w-full max-w-md mt-10 sm:mt-0 p-6 sm:p-8 shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">Welcome Back</h1>
          <p className="mt-2 text-sm text-gray-600">Sign in to your NeoBank account</p>
        </div>

        {/* API Error Display */}
        {apiError && (
          <Alert type="error" className="mb-4">
            {apiError}
          </Alert>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          {/* Email Input */}
          <Input
            id="email"
            name="email"
            type="email"
            label="Email Address"
            placeholder="you@example.com"
            value={formData.email}
            onChange={handleChange}
            error={errors.email}
            icon={<MailIcon className="w-5 h-5 text-gray-400" />}
            required
          />

          {/* Password Input */}
          <Input
            id="password"
            name="password"
            type="password"
            label="Password"
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange}
            error={errors.password}
            icon={<LockIcon className="w-5 h-5 text-gray-400" />}
            required
          />

          {/* Forgot Password Link */}
          <div className="flex items-center justify-end">
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition duration-150 ease-in-out"
            >
              Forgot your password?
            </Link>
          </div>

          {/* Login Button */}
          <Button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            disabled={isLoading || isOffline}
          >
            {isLoading ? <Spinner className="w-5 h-5 mr-2" /> : 'Sign In'}
          </Button>
        </form>

        {/* Biometric Option */}
        {isBiometricAvailable && (
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>
            <Button
              onClick={handleBiometricLogin}
              className="mt-6 w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              disabled={isLoading || isOffline}
            >
              <BiometricsIcon className="w-5 h-5 mr-2" />
              {isLoading ? <Spinner className="w-5 h-5 mr-2" /> : 'Sign In with Biometrics'}
            </Button>
          </div>
        )}

        {/* Registration Link */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-medium text-indigo-600 hover:text-indigo-500 transition duration-150 ease-in-out"
            >
              Register Now
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
};

export default LoginScreen;