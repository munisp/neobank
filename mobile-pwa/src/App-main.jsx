import React, { useState, useEffect } from 'react';
import { applyColorMode } from './design/tenantTheme';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Components
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import LoadingSpinner from './components/LoadingSpinner';
import NotificationCenter from './components/NotificationCenter';

// Pages
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';

// Banking Pages
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Transfers from './pages/Transfers';
import CardManagement from './pages/CardManagement';

// Loan Pages
import Loans from './pages/Loans';
import LoanApplication from './pages/LoanApplication';
import CreditScore from './pages/CreditScore';

// Payment Pages
import BillPayments from './pages/BillPayments';

// Investment Pages
import Investments from './pages/Investments';
import CryptocurrencyScreen from './pages/CryptocurrencyScreen';
import StockTrading from './pages/StockTrading';

// Insurance Pages
import Insurance from './pages/Insurance';
import InsuranceQuote from './pages/InsuranceQuote';
import InsuranceClaims from './pages/InsuranceClaims';

// User Pages
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import Documents from './pages/Documents';

// Analytics Pages
import Budget from './pages/Budget';
import SpendingInsightsScreen from './pages/SpendingInsightsScreen';
import Onboarding from './pages/Onboarding';
import SecurityCenter from './pages/SecurityCenter';
import AppStore from './pages/AppStore';

// Services
import { AuthService } from './services/AuthService';
import { NotificationService } from './services/NotificationService';

// Context
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = React.useContext(AuthContext);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);

  useEffect(() => {
    // Initialize notification service
    NotificationService.initialize();
    
    // Theme boot is handled by initTheme() in main.jsx (system-aware);
    // mirror the applied mode into local state once.
    setDarkMode(document.documentElement.classList.contains('dark'));

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered:', registration);
        })
        .catch(error => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    applyColorMode(next ? 'dark' : 'light');
  };

  return (
    <AuthProvider>
      <NotificationProvider>
        <Router>
          <div className={`min-h-screen bg-[var(--nb-surface-secondary)] transition-colors duration-200 ${darkMode ? 'dark' : ''}`}>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />

              {/* Protected Routes */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <div className="flex h-screen overflow-hidden">
                      {/* Sidebar */}
                      <Sidebar 
                        open={sidebarOpen} 
                        onClose={() => setSidebarOpen(false)}
                        darkMode={darkMode}
                      />
                      
                      {/* Main Content */}
                      <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Navbar */}
                        <Navbar 
                          onMenuClick={() => setSidebarOpen(true)}
                          onNotificationClick={() => setNotificationCenterOpen(true)}
                          darkMode={darkMode}
                          onToggleTheme={toggleTheme}
                        />
                        
                        {/* Page Content */}
                        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
                          <Routes>
                            <Route path="/" element={<Navigate to="/dashboard" replace />} />
                            <Route path="/dashboard" element={<Dashboard />} />
                            
                            {/* Banking Routes */}
                            <Route path="/accounts" element={<Accounts />} />
                            <Route path="/transactions" element={<Transactions />} />
                            <Route path="/transfers" element={<Transfers />} />
                            <Route path="/cards" element={<CardManagement />} />
                            
                            {/* Loan Routes */}
                            <Route path="/loans" element={<Loans />} />
                            <Route path="/loans/apply" element={<LoanApplication />} />
                            <Route path="/credit-score" element={<CreditScore />} />
                            
                            {/* Payment Routes */}
                            <Route path="/bills" element={<BillPayments />} />
                            
                            {/* Investment Routes */}
                            <Route path="/investments" element={<Investments />} />
                            <Route path="/investments/crypto" element={<CryptocurrencyScreen />} />
                            <Route path="/investments/stocks" element={<StockTrading />} />
                            
                            {/* Insurance Routes */}
                            <Route path="/insurance" element={<Insurance />} />
                            <Route path="/insurance/quote" element={<InsuranceQuote />} />
                            <Route path="/insurance/claims" element={<InsuranceClaims />} />
                            
                            {/* User Routes */}
                            <Route path="/profile" element={<Profile />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/security" element={<SecurityCenter />} />
                            <Route path="/store" element={<AppStore />} />
                            <Route path="/notifications" element={<Notifications />} />
                            <Route path="/documents" element={<Documents />} />
                            
                            {/* Analytics Routes */}
                            <Route path="/budget" element={<Budget />} />
                            <Route path="/insights" element={<SpendingInsightsScreen />} />
                            <Route path="/onboarding" element={<Onboarding />} />
                            
                            {/* 404 */}
                            <Route path="*" element={<Navigate to="/dashboard" replace />} />
                          </Routes>
                        </main>
                      </div>
                    </div>

                    {/* Notification Center */}
                    {notificationCenterOpen && (
                      <NotificationCenter
                        onClose={() => setNotificationCenterOpen(false)}
                      />
                    )}
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </Router>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
