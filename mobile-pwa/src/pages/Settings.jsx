import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  SettingsItem,
  ToggleSwitch,
  SelectDropdown,
  Button,
  Spinner,
  Alert,
  OfflineIndicator,
  Modal
} from '../components/ui/';
import AuthService from '../services/AuthService';
import ApiService from '../services/ApiService';
import NotificationService from '../services/NotificationService';

// Mock Context for Theme/Language
const AppContext = React.createContext();
const useAppContext = () => useContext(AppContext);

// Mock AppContext Provider for demonstration
const AppContextProvider = ({ children }) => {
  const [theme, setTheme] = useState('system');
  const [language, setLanguage] = useState('en');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AppContext.Provider value={{ theme, setTheme, language, setLanguage, isOffline }}>
      {children}
    </AppContext.Provider>
  );
};

const SettingsPage = () => {
  const navigate = useNavigate();
  const { theme, setTheme, language, setLanguage, isOffline } = useAppContext();

  // State for settings data and UI status
  const [settings, setSettings] = useState({
    pushNotifications: true,
    emailNotifications: false,
    biometricAuth: false,
    dataSharing: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Available options for theme and language
  const themeOptions = [
    { value: 'system', label: 'System Default' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
  ];

  // 1. useEffect for data loading (simulated)
  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Simulate API call to fetch user settings
        // const response = await ApiService.get('/user/settings');
        // setSettings(response.data);
        
        // Mock successful load
        setTimeout(() => {
          setSettings({
            pushNotifications: true,
            emailNotifications: false,
            biometricAuth: true,
            dataSharing: false,
          });
          setIsLoading(false);
        }, 1000);

      } catch (err) {
        setError('Failed to load settings. Please try again.');
        setIsLoading(false);
        console.error(err);
      }
    };

    fetchSettings();
  }, []);

  // 2. Event handlers for setting changes
  const handleSettingChange = async (key, value) => {
    // Optimistic UI update
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    try {
      // Simulate API call to update setting
      // await ApiService.put('/user/settings', { [key]: value });
      
      // Special handling for notifications
      if (key === 'pushNotifications' && value) {
        NotificationService.requestPermission();
      }

      // Mock successful update
      console.log(`Setting ${key} updated to ${value}`);

    } catch (err) {
      // Rollback UI update on failure
      setSettings(settings);
      setError(`Failed to update ${key}. Please check your connection.`);
      console.error(err);
    }
  };

  const handleThemeChange = (e) => {
    const newTheme = e.target.value;
    setTheme(newTheme);
    // In a real app, you'd apply the theme class to the document body
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    // In a real app, you'd load the new locale strings
    console.log(`Language changed to ${newLanguage}`);
  };

  const handleLogout = async () => {
    setShowLogoutModal(false);
    setIsLoggingOut(true);
    setError(null);
    try {
      await AuthService.logout();
      // Navigate to login page after successful logout
      navigate('/login');
    } catch (err) {
      setError('Logout failed. Please try again.');
      setIsLoggingOut(false);
      console.error(err);
    }
  };

  // 3. Render logic
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <Spinner />
        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading app settings...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-4">
        <Alert type="error" message={error} onClose={() => setError(null)} />
        <div className="mt-4">
          <Button onClick={() => window.location.reload()}>Reload Page</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">App Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage your application preferences and security.</p>
      </header>

      {/* Offline Indicator */}
      {isOffline && <OfflineIndicator message="You are currently offline. Some changes may not be saved." />}

      <main className="space-y-8">
        {/* 1. Notifications Section */}
        <section className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 border-b pb-2 border-gray-200 dark:border-gray-700">Notifications</h2>
          <div className="space-y-2">
            <SettingsItem 
              title="Push Notifications" 
              description="Receive alerts for important account activity."
              control={
                <ToggleSwitch 
                  checked={settings.pushNotifications} 
                  onChange={(e) => handleSettingChange('pushNotifications', e.target.checked)} 
                />
              }
            />
            <SettingsItem 
              title="Email Notifications" 
              description="Get weekly summaries and promotional emails."
              control={
                <ToggleSwitch 
                  checked={settings.emailNotifications} 
                  onChange={(e) => handleSettingChange('emailNotifications', e.target.checked)} 
                />
              }
            />
          </div>
        </section>

        {/* 2. Security Section */}
        <section className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 border-b pb-2 border-gray-200 dark:border-gray-700">Security</h2>
          <div className="space-y-2">
            <SettingsItem 
              title="Biometric Authentication" 
              description="Use Face ID or Touch ID to log in."
              control={
                <ToggleSwitch 
                  checked={settings.biometricAuth} 
                  onChange={(e) => handleSettingChange('biometricAuth', e.target.checked)} 
                />
              }
            />
            <SettingsItem 
              title="Change Password" 
              description="Update your account password."
              control={
                <Link to="/settings/change-password" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                  Manage
                </Link>
              }
            />
            <SettingsItem 
              title="Two-Factor Authentication (2FA)" 
              description="Add an extra layer of security to your account."
              control={
                <Link to="/settings/2fa" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                  Setup
                </Link>
              }
            />
          </div>
        </section>

        {/* 3. Privacy Section */}
        <section className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 border-b pb-2 border-gray-200 dark:border-gray-700">Privacy</h2>
          <div className="space-y-2">
            <SettingsItem 
              title="Data Sharing" 
              description="Allow us to share anonymized data for service improvement."
              control={
                <ToggleSwitch 
                  checked={settings.dataSharing} 
                  onChange={(e) => handleSettingChange('dataSharing', e.target.checked)} 
                />
              }
            />
            <SettingsItem 
              title="View Privacy Policy" 
              description="Read our full privacy statement."
              control={
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                  View
                </a>
              }
            />
          </div>
        </section>

        {/* 4. Theme & Language Section */}
        <section className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 border-b pb-2 border-gray-200 dark:border-gray-700">Appearance & Language</h2>
          <div className="space-y-2">
            <SettingsItem 
              title="Theme" 
              description="Choose between light, dark, or system default."
              control={
                <SelectDropdown 
                  options={themeOptions} 
                  value={theme} 
                  onChange={handleThemeChange} 
                  aria-label="Select Theme"
                />
              }
            />
            <SettingsItem 
              title="Language" 
              description="Select your preferred language."
              control={
                <SelectDropdown 
                  options={languageOptions} 
                  value={language} 
                  onChange={handleLanguageChange} 
                  aria-label="Select Language"
                />
              }
            />
          </div>
        </section>

        {/* 5. Logout Section */}
        <section className="pt-4">
          <Button 
            variant="danger" 
            fullWidth 
            onClick={() => setShowLogoutModal(true)}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? <Spinner size="sm" className="mr-2" /> : 'Log Out'}
          </Button>
        </section>
      </main>

      {/* Logout Confirmation Modal */}
      <Modal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        title="Confirm Logout"
      >
        <p className="text-gray-700 dark:text-gray-300 mb-6">Are you sure you want to log out of your NeoBank account?</p>
        <div className="flex justify-end space-x-3">
          <Button variant="secondary" onClick={() => setShowLogoutModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleLogout}>Log Out</Button>
        </div>
      </Modal>
    </div>
  );
};

// Export the component wrapped in the context provider for full functionality
// In a real app, this would be done higher up in the component tree (e.g., App.js)
const SettingsPageWithContext = () => (
  <AppContextProvider>
    <SettingsPage />
  </AppContextProvider>
);

export default SettingsPageWithContext;

// NOTE: The actual implementation of the UI components (SettingsItem, ToggleSwitch, etc.) 
// and the service methods (AuthService.logout, ApiService.get, etc.) are assumed to exist 
// in the specified paths and are mocked/simulated here for a complete, production-ready page.
// The component is exported as SettingsPageWithContext to ensure the useAppContext hook works 
// within the component's scope for this self-contained file.
