import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { User, Shield, Bell, CreditCard, Smartphone, Mail, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [profile, setProfile] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone_number: user?.phone_number || '',
    date_of_birth: '',
    address: ''
  });

  const [security, setSecurity] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
    two_factor_enabled: false,
    biometric_enabled: true
  });

  const [notifications, setNotifications] = useState({
    email_notifications: true,
    sms_notifications: true,
    push_notifications: true,
    transaction_alerts: true,
    security_alerts: true,
    marketing_emails: false
  });

  const [limits, setLimits] = useState({
    daily_transfer_limit: 500000,
    monthly_transfer_limit: 5000000,
    daily_withdrawal_limit: 200000,
    pos_transaction_limit: 100000
  });

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError('Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (security.new_password !== security.confirm_password) {
      setError('New passwords do not match');
      setLoading(false);
      return;
    }

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSuccess('Password changed successfully!');
      setSecurity({
        ...security,
        current_password: '',
        new_password: '',
        confirm_password: ''
      });
    } catch (err) {
      setError('Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationUpdate = async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      setSuccess('Notification preferences updated!');
    } catch (err) {
      setError('Failed to update preferences.');
    } finally {
      setLoading(false);
    }
  };

  const handleLimitsUpdate = async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      setSuccess('Transaction limits updated!');
    } catch (err) {
      setError('Failed to update limits.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Manage your account preferences and security settings</p>
      </div>

      {success && (
        <Alert className="mb-6 border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="mb-6 border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile" className="flex items-center">
            <User className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center">
            <Shield className="w-4 h-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center">
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="limits" className="flex items-center">
            <CreditCard className="w-4 h-4 mr-2" />
            Limits
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      value={profile.full_name}
                      onChange={(e) => setProfile({...profile, full_name: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({...profile, email: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone_number">Phone Number</Label>
                    <Input
                      id="phone_number"
                      value={profile.phone_number}
                      onChange={(e) => setProfile({...profile, phone_number: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="date_of_birth">Date of Birth</Label>
                    <Input
                      id="date_of_birth"
                      type="date"
                      value={profile.date_of_birth}
                      onChange={(e) => setProfile({...profile, date_of_birth: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={profile.address}
                    onChange={(e) => setProfile({...profile, address: e.target.value})}
                    placeholder="Enter your full address"
                  />
                </div>

                <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                  {loading ? 'Updating...' : 'Update Profile'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <Label htmlFor="current_password">Current Password</Label>
                    <Input
                      id="current_password"
                      type="password"
                      value={security.current_password}
                      onChange={(e) => setSecurity({...security, current_password: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="new_password">New Password</Label>
                      <Input
                        id="new_password"
                        type="password"
                        value={security.new_password}
                        onChange={(e) => setSecurity({...security, new_password: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="confirm_password">Confirm New Password</Label>
                      <Input
                        id="confirm_password"
                        type="password"
                        value={security.confirm_password}
                        onChange={(e) => setSecurity({...security, confirm_password: e.target.value})}
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                    {loading ? 'Changing...' : 'Change Password'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security Features</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Smartphone className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-gray-600">Add an extra layer of security</p>
                    </div>
                  </div>
                  <Switch
                    checked={security.two_factor_enabled}
                    onCheckedChange={(checked) => setSecurity({...security, two_factor_enabled: checked})}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Shield className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium">Biometric Authentication</p>
                      <p className="text-sm text-gray-600">Use fingerprint or face recognition</p>
                    </div>
                  </div>
                  <Switch
                    checked={security.biometric_enabled}
                    onCheckedChange={(checked) => setSecurity({...security, biometric_enabled: checked})}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Mail className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-gray-600">Receive updates via email</p>
                  </div>
                </div>
                <Switch
                  checked={notifications.email_notifications}
                  onCheckedChange={(checked) => setNotifications({...notifications, email_notifications: checked})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Smartphone className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="font-medium">SMS Notifications</p>
                    <p className="text-sm text-gray-600">Receive updates via SMS</p>
                  </div>
                </div>
                <Switch
                  checked={notifications.sms_notifications}
                  onCheckedChange={(checked) => setNotifications({...notifications, sms_notifications: checked})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Bell className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="font-medium">Push Notifications</p>
                    <p className="text-sm text-gray-600">Receive app notifications</p>
                  </div>
                </div>
                <Switch
                  checked={notifications.push_notifications}
                  onCheckedChange={(checked) => setNotifications({...notifications, push_notifications: checked})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <CreditCard className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="font-medium">Transaction Alerts</p>
                    <p className="text-sm text-gray-600">Get notified of all transactions</p>
                  </div>
                </div>
                <Switch
                  checked={notifications.transaction_alerts}
                  onCheckedChange={(checked) => setNotifications({...notifications, transaction_alerts: checked})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Shield className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="font-medium">Security Alerts</p>
                    <p className="text-sm text-gray-600">Important security notifications</p>
                  </div>
                </div>
                <Switch
                  checked={notifications.security_alerts}
                  onCheckedChange={(checked) => setNotifications({...notifications, security_alerts: checked})}
                />
              </div>

              <Button onClick={handleNotificationUpdate} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                {loading ? 'Updating...' : 'Update Preferences'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Limits Tab */}
        <TabsContent value="limits">
          <Card>
            <CardHeader>
              <CardTitle>Transaction Limits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="daily_transfer_limit">Daily Transfer Limit</Label>
                  <Input
                    id="daily_transfer_limit"
                    type="number"
                    value={limits.daily_transfer_limit}
                    onChange={(e) => setLimits({...limits, daily_transfer_limit: parseInt(e.target.value)})}
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Current: {formatCurrency(limits.daily_transfer_limit)}
                  </p>
                </div>

                <div>
                  <Label htmlFor="monthly_transfer_limit">Monthly Transfer Limit</Label>
                  <Input
                    id="monthly_transfer_limit"
                    type="number"
                    value={limits.monthly_transfer_limit}
                    onChange={(e) => setLimits({...limits, monthly_transfer_limit: parseInt(e.target.value)})}
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Current: {formatCurrency(limits.monthly_transfer_limit)}
                  </p>
                </div>

                <div>
                  <Label htmlFor="daily_withdrawal_limit">Daily Withdrawal Limit</Label>
                  <Input
                    id="daily_withdrawal_limit"
                    type="number"
                    value={limits.daily_withdrawal_limit}
                    onChange={(e) => setLimits({...limits, daily_withdrawal_limit: parseInt(e.target.value)})}
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Current: {formatCurrency(limits.daily_withdrawal_limit)}
                  </p>
                </div>

                <div>
                  <Label htmlFor="pos_transaction_limit">POS Transaction Limit</Label>
                  <Input
                    id="pos_transaction_limit"
                    type="number"
                    value={limits.pos_transaction_limit}
                    onChange={(e) => setLimits({...limits, pos_transaction_limit: parseInt(e.target.value)})}
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Current: {formatCurrency(limits.pos_transaction_limit)}
                  </p>
                </div>
              </div>

              <Alert>
                <AlertDescription>
                  Changes to transaction limits may require additional verification and can take up to 24 hours to take effect.
                </AlertDescription>
              </Alert>

              <Button onClick={handleLimitsUpdate} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                {loading ? 'Updating...' : 'Update Limits'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
