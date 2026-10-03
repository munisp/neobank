import axios from 'axios'

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Authentication API
export const authAPI = {
  login: (email, password) => 
    api.post('/auth/login', { email, password }),
  
  register: (userData) => 
    api.post('/auth/register', userData),
  
  getProfile: () => 
    api.get('/auth/profile'),
  
  logout: () => 
    api.post('/auth/logout'),
}

// Accounts API
export const accountsAPI = {
  getAccounts: () => 
    api.get('/accounts'),
  
  createAccount: (accountData) => 
    api.post('/accounts', accountData),
  
  getAccountBalance: (accountId) => 
    api.get(`/accounts/${accountId}/balance`),
  
  getAccountTransactions: (accountId, params = {}) => 
    api.get(`/accounts/${accountId}/transactions`, { params }),
}

// Transactions API
export const transactionsAPI = {
  getTransactions: (params = {}) => 
    api.get('/transactions', { params }),
  
  createTransfer: (transferData) => 
    api.post('/transfers', transferData),
  
  getTransactionDetails: (transactionId) => 
    api.get(`/transactions/${transactionId}`),
}

// KYC API
export const kycAPI = {
  initiateKYC: (customerData) => 
    api.post('/kyc/initiate', customerData),
  
  completeKYC: (kycId, documents) => 
    api.post('/kyc/complete', { kyc_id: kycId, documents }),
  
  getKYCStatus: (customerId) => 
    api.get(`/kyc/status/${customerId}`),
  
  uploadDocument: (file, documentType) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('document_type', documentType)
    return api.post('/kyc/upload-document', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}

// KYB API
export const kybAPI = {
  initiateKYB: (businessData) => 
    api.post('/kyb/initiate', businessData),
  
  getKYBStatus: (businessId) => 
    api.get(`/kyb/status/${businessId}`),
}

// Dashboard API
export const dashboardAPI = {
  getOverview: () => 
    api.get('/dashboard/overview'),
  
  getRecentTransactions: (limit = 10) => 
    api.get('/dashboard/recent-transactions', { params: { limit } }),
  
  getAccountSummary: () => 
    api.get('/dashboard/account-summary'),
}

// Fraud Detection API
export const fraudAPI = {
  checkTransaction: (transactionData) => 
    api.post('/fraud/check-transaction', transactionData),
  
  getFraudAlerts: () => 
    api.get('/fraud/alerts'),
  
  reportFraud: (transactionId, reason) => 
    api.post('/fraud/report', { transaction_id: transactionId, reason }),
}

export { api }
export default api
