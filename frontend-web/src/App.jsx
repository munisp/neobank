import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
// import { Toaster } from '@/components/ui/toaster.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import AccountsPage from './pages/AccountsPage'
import TransactionsPage from './pages/TransactionsPage'
import TransferPage from './pages/TransferPage'
import KYCPage from './pages/KYCPage'
import SettingsPage from './pages/SettingsPage'
import InvestmentsPage from './pages/InvestmentsPage'
import TradingPage from './pages/TradingPage'
import LoansPage from './pages/LoansPage'
import InsurancePage from './pages/InsurancePage'
import InsuranceQuotePage from './pages/InsuranceQuotePage'
import InsuranceClaimsPage from './pages/InsuranceClaimsPage'
import NotificationsPage from './pages/NotificationsPage'
import DesignSystemPage from './pages/DesignSystemPage'
import TenantBrandingPage from './pages/TenantBrandingPage'
import SegmentsAdminPage from './pages/SegmentsAdminPage'
import DeveloperPortalPage from './pages/DeveloperPortalPage'
import Layout from './components/Layout'
import './App.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }
  
  return isAuthenticated ? children : <Navigate to="/login" />
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }
  
  return !isAuthenticated ? children : <Navigate to="/dashboard" />
}

function AppRoutes() {
  return (
    <Routes>
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        } 
      />
      <Route path="/design-system" element={<DesignSystemPage />} />
      <Route path="/branding" element={<TenantBrandingPage />} />
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="transfer" element={<TransferPage />} />
        <Route path="kyc" element={<KYCPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="investments" element={<InvestmentsPage />} />
        <Route path="investments/trading" element={<TradingPage />} />
        <Route path="loans" element={<LoansPage />} />
        <Route path="insurance" element={<InsurancePage />} />
        <Route path="insurance/quote" element={<InsuranceQuotePage />} />
        <Route path="insurance/claims" element={<InsuranceClaimsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="admin/segments" element={<SegmentsAdminPage />} />
        <Route path="developers" element={<DeveloperPortalPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <div className="min-h-screen" style={{ background: "var(--nb-surface-secondary)" }}>
            <AppRoutes />
            {/* <Toaster /> */}
          </div>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
