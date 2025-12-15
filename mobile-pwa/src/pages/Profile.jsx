import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Assume these services exist in the specified path
import * as AuthService from '../services/AuthService';
import * as ApiService from '../services/ApiService';
import * as NotificationService from '../services/NotificationService';

// Assume these UI components exist in the specified path
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { OfflineIndicator } from '../components/ui/OfflineIndicator';
import { Avatar } from '../components/ui/Avatar';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { ErrorMessage } from '../components/ui/ErrorMessage';

// Mocking a UserContext for demonstration of useContext
// In a real app, this would provide global state like the current user
const UserContext = React.createContext(null);

// --- Types ---
interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  isOnline: boolean;
}

interface Settings {
  notificationsEnabled: boolean;
  darkMode: boolean;
}

// --- Component ---

const ProfileScreen: React.FC = () => {
  const navigate = useNavigate();
  const userContext = useContext(UserContext); // Example useContext usage

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<Settings>({ notificationsEnabled: true, darkMode: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Form state for editing
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  });
  const [formErrors, setFormErrors] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  });

  // --- Utility Functions ---

  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = { firstName: '', lastName: '', phone: '' };

    if (!editForm.firstName.trim()) {
      newErrors.firstName = 'First name is required.';
      isValid = false;
    }
    if (!editForm.lastName.trim()) {
      newErrors.lastName = 'Last name is required.';
      isValid = false;
    }
    // Simple phone validation (e.g., must contain only digits and be at least 10 chars)
    if (editForm.phone.trim() && !/^\d{10,}$/.test(editForm.phone.trim().replace(/[\s-()]/g, ''))) {
      newErrors.phone = 'Invalid phone number format.';
      isValid = false;
    }

    setFormErrors(newErrors);
    return isValid;
  }, [editForm]);

  // --- Event Handlers ---

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const handleEditClick = () => {
    if (profile) {
      setEditForm({
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
      });
      setFormErrors({ firstName: '', lastName: '', phone: '' });
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormErrors({ firstName: '', lastName: '', phone: '' });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      NotificationService.notify('Please correct the errors in the form.', 'error');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Mock API call to update profile
      const updatedProfile = await ApiService.updateProfile({
        ...editForm,
        id: profile?.id,
        email: profile?.email,
        avatarUrl: profile?.avatarUrl,
        isOnline: profile?.isOnline,
      });

      setProfile(updatedProfile);
      setIsEditing(false);
      NotificationService.notify('Profile updated successfully!', 'success');
    } catch (err) {
      setError('Failed to save profile. Please try again.');
      NotificationService.notify('Failed to save profile.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSettingToggle = (setting: keyof Settings) => {
    setSettings(prev => ({ ...prev, [setting]: !prev[setting] }));
    // Mock service call to update settings
    NotificationService.notify(`${setting} toggled.`, 'info');
  };

  const handleLogout = async () => {
    try {
      await AuthService.logout();
      NotificationService.notify('Logged out successfully.', 'success');
      navigate('/login'); // Navigate to login page after logout
    } catch (err) {
      NotificationService.notify('Logout failed.', 'error');
    }
  };

  // --- useEffect for Data Loading and Offline Status ---

  useEffect(() => {
    const fetchProfileData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Mock API call to fetch profile data
        const data: UserProfile = await ApiService.fetchProfile();
        setProfile(data);
      } catch (err) {
        setError('Failed to load profile data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfileData();

    // Setup offline/online listeners
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Render Logic ---

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <Spinner size="lg" />
        <p className="ml-3 text-gray-600">Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 max-w-md mx-auto mt-10">
        <ErrorMessage message={error} />
        <Button onClick={() => window.location.reload()} className="mt-4 w-full">
          Try Again
        </Button>
      </div>
    );
  }

  if (!profile) {
    // Empty state
    return (
      <div className="p-4 max-w-md mx-auto mt-10 text-center">
        <h2 className="text-xl font-semibold text-gray-800">Profile Not Found</h2>
        <p className="text-gray-600 mt-2">
          We could not load your profile. Please try logging in again.
        </p>
        <Button onClick={handleLogout} className="mt-4 w-full">
          Go to Login
        </Button>
      </div>
    );
  }

  // --- Main Render ---

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      <OfflineIndicator isOffline={isOffline} />
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2">My Profile</h1>

        {/* Profile Picture and Basic Info Card */}
        <Card className="mb-6 p-6 flex flex-col items-center sm:flex-row sm:items-start">
          <div className="relative mb-4 sm:mb-0 sm:mr-6">
            <Avatar src={profile.avatarUrl} alt="Profile Picture" size="xl" />
            <button
              onClick={() => NotificationService.notify('Feature: Change profile picture', 'info')}
              className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition duration-150"
              aria-label="Change profile picture"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.218A2 2 0 0110.73 4h2.54a2 2 0 011.664.89l.812 1.218A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </button>
          </div>
          <div className="text-center sm:text-left">
            <h2 className="text-2xl font-semibold text-gray-900">
              {profile.firstName} {profile.lastName}
            </h2>
            <p className="text-gray-600">{profile.email}</p>
            <p className="text-gray-600">{profile.phone}</p>
            <Button
              onClick={handleEditClick}
              variant="secondary"
              className="mt-3"
              disabled={isEditing}
            >
              {isEditing ? 'Editing...' : 'Edit Profile'}
            </Button>
          </div>
        </Card>

        {/* Edit Profile Form Section */}
        <Card className="mb-6 p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Personal Information</h2>
          {isEditing ? (
            <form onSubmit={handleSaveProfile}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  name="firstName"
                  value={editForm.firstName}
                  onChange={handleFormChange}
                  error={formErrors.firstName}
                  required
                />
                <Input
                  label="Last Name"
                  name="lastName"
                  value={editForm.lastName}
                  onChange={handleFormChange}
                  error={formErrors.lastName}
                  required
                />
                <Input
                  label="Phone Number"
                  name="phone"
                  type="tel"
                  value={editForm.phone}
                  onChange={handleFormChange}
                  error={formErrors.phone}
                />
                <Input
                  label="Email (Read-only)"
                  name="email"
                  type="email"
                  value={profile.email}
                  disabled
                />
              </div>
              <div className="flex justify-end space-x-4 mt-6">
                <Button type="button" variant="secondary" onClick={handleCancelEdit} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Spinner size="sm" className="mr-2" /> : null}
                  Save Changes
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <p><strong>First Name:</strong> {profile.firstName}</p>
              <p><strong>Last Name:</strong> {profile.lastName}</p>
              <p><strong>Email:</strong> {profile.email}</p>
              <p><strong>Phone:</strong> {profile.phone || 'N/A'}</p>
            </div>
          )}
        </Card>

        {/* Account Settings Section */}
        <Card className="mb-6 p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Account Settings</h2>
          <div className="space-y-4">
            {/* Setting 1: Notifications */}
            <div className="flex justify-between items-center py-2 border-b last:border-b-0">
              <div>
                <p className="font-medium text-gray-700">Push Notifications</p>
                <p className="text-sm text-gray-500">Receive alerts about transactions and security.</p>
              </div>
              <ToggleSwitch
                checked={settings.notificationsEnabled}
                onChange={() => handleSettingToggle('notificationsEnabled')}
              />
            </div>

            {/* Setting 2: Dark Mode */}
            <div className="flex justify-between items-center py-2 border-b last:border-b-0">
              <div>
                <p className="font-medium text-gray-700">Dark Mode</p>
                <p className="text-sm text-gray-500">Switch to a darker theme for better viewing.</p>
              </div>
              <ToggleSwitch
                checked={settings.darkMode}
                onChange={() => handleSettingToggle('darkMode')}
              />
            </div>

            {/* Setting 3: Change Password */}
            <div className="flex justify-between items-center py-2 border-b last:border-b-0">
              <div>
                <p className="font-medium text-gray-700">Change Password</p>
                <p className="text-sm text-gray-500">Update your account security password.</p>
              </div>
              <Link to="/settings/change-password">
                <Button variant="link">Manage</Button>
              </Link>
            </div>

            {/* Setting 4: Privacy Policy Link */}
            <div className="flex justify-between items-center py-2 border-b last:border-b-0">
              <div>
                <p className="font-medium text-gray-700">Privacy Policy</p>
                <p className="text-sm text-gray-500">Review our data usage and privacy terms.</p>
              </div>
              <Link to="/legal/privacy">
                <Button variant="link">View</Button>
              </Link>
            </div>
          </div>
        </Card>

        {/* Logout Button */}
        <div className="mt-8">
          <Button onClick={handleLogout} variant="danger" className="w-full">
            Log Out
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProfileScreen;
