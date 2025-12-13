import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// API Configuration
const API_BASE_URL = __DEV__
  ? 'http://localhost:8000/api/v1'
  : 'https://api.yourdomain.com/api/v1';

const API_TIMEOUT = 30000; // 30 seconds

// Storage Keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: '@neobank:access_token',
  REFRESH_TOKEN: '@neobank:refresh_token',
  USER_DATA: '@neobank:user_data',
};

class ApiService {
  private client: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value?: unknown) => void;
    reject: (reason?: any) => void;
  }> = [];

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Handle 401 Unauthorized
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then(() => this.client(originalRequest))
              .catch((err) => Promise.reject(err));
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const refreshToken = await AsyncStorage.getItem(
              STORAGE_KEYS.REFRESH_TOKEN
            );

            if (!refreshToken) {
              throw new Error('No refresh token available');
            }

            const response = await axios.post(
              `${API_BASE_URL}/auth/refresh`,
              { refresh_token: refreshToken }
            );

            const { access_token } = response.data;
            await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, access_token);

            this.failedQueue.forEach((prom) => prom.resolve());
            this.failedQueue = [];

            return this.client(originalRequest);
          } catch (refreshError) {
            this.failedQueue.forEach((prom) => prom.reject(refreshError));
            this.failedQueue = [];

            // Clear stored data and redirect to login
            await this.clearAuthData();
            throw refreshError;
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private async clearAuthData() {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.USER_DATA,
    ]);
  }

  // Authentication
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    const { access_token, refresh_token, user } = response.data;

    await AsyncStorage.multiSet([
      [STORAGE_KEYS.ACCESS_TOKEN, access_token],
      [STORAGE_KEYS.REFRESH_TOKEN, refresh_token],
      [STORAGE_KEYS.USER_DATA, JSON.stringify(user)],
    ]);

    return response.data;
  }

  async register(userData: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    password: string;
  }) {
    const response = await this.client.post('/auth/register', userData);
    return response.data;
  }

  async forgotPassword(email: string) {
    const response = await this.client.post('/auth/forgot-password', { email });
    return response.data;
  }

  async logout() {
    try {
      await this.client.post('/auth/logout');
    } finally {
      await this.clearAuthData();
    }
  }

  // User Profile
  async getProfile() {
    const response = await this.client.get('/user/profile');
    return response.data;
  }

  async updateProfile(data: any) {
    const response = await this.client.put('/user/profile', data);
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await this.client.post('/user/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  }

  // Loans
  async getLoanDashboard(userId: string) {
    const response = await this.client.get(`/loans/dashboard/${userId}`);
    return response.data;
  }

  async getActiveLoans(userId: string) {
    const response = await this.client.get(`/loans/active/${userId}`);
    return response.data;
  }

  async applyForLoan(loanData: any) {
    const response = await this.client.post('/loans/apply', loanData);
    return response.data;
  }

  async getLoanDetails(loanId: string) {
    const response = await this.client.get(`/loans/${loanId}`);
    return response.data;
  }

  async makeLoanPaymentWithMethod(loanId: string, amount: number, paymentMethod: string) {
    const response = await this.client.post(`/loans/${loanId}/payment`, {
      amount,
      payment_method: paymentMethod,
    });
    return response.data;
  }

  // Stock Trading
  async getStocks() {
    const response = await this.client.get('/stocks');
    return response.data;
  }

  async getMarketStatus() {
    const response = await this.client.get('/stocks/market-status');
    return response.data;
  }

  async getStockQuote(exchange: string, symbol: string) {
    const response = await this.client.get(`/stocks/quote/${exchange}/${symbol}`);
    return response.data;
  }

  async getStockPortfolio() {
    const response = await this.client.get('/stocks/portfolio');
    return response.data;
  }

  async tradeStock(data: {
    symbol: string;
    shares: number;
    type: 'buy' | 'sell';
    price: number;
  }) {
    const response = await this.client.post('/stocks/trade', data);
    return response.data;
  }

  async buyStock(data: {
    exchange: string;
    symbol: string;
    shares: number;
    price: number;
  }) {
    const response = await this.client.post('/stocks/buy', data);
    return response.data;
  }

  async sellStock(data: {
    exchange: string;
    symbol: string;
    shares: number;
    price: number;
  }) {
    const response = await this.client.post('/stocks/sell', data);
    return response.data;
  }

  // Cryptocurrency
  async getCryptocurrencies() {
    const response = await this.client.get('/crypto');
    return response.data;
  }

  async getCryptoHoldings() {
    const response = await this.client.get('/crypto/holdings');
    return response.data;
  }

  async getCryptoPrices() {
    const response = await this.client.get('/crypto/prices');
    return response.data;
  }

  async getCryptoWallet(userId: string) {
    const response = await this.client.get(`/crypto/wallet/${userId}`);
    return response.data;
  }

  async buyCrypto(data: { symbol: string; amount: number; price: number }) {
    const response = await this.client.post('/crypto/buy', data);
    return response.data;
  }

  async sellCrypto(data: { symbol: string; amount: number; price: number }) {
    const response = await this.client.post('/crypto/sell', data);
    return response.data;
  }

  async tradeCrypto(data: {
    symbol: string;
    amount: number;
    type: 'buy' | 'sell';
    price: number;
  }) {
    const response = await this.client.post('/crypto/trade', data);
    return response.data;
  }

  // Credit Score
  async getCreditScore() {
    const response = await this.client.get('/credit-score');
    return response.data;
  }

  async getCreditScoreHistory(userId: string) {
    const response = await this.client.get(`/credit-score/${userId}/history`);
    return response.data;
  }

  async getCreditScoreFactors(userId: string) {
    const response = await this.client.get(`/credit-score/${userId}/factors`);
    return response.data;
  }

  async getCreditScoreRecommendations(userId: string) {
    const response = await this.client.get(`/credit-score/${userId}/recommendations`);
    return response.data;
  }

  // Documents
  async uploadDocument(userId: string, file: any, type: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const response = await this.client.post(`/documents/${userId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async getDocuments(userId?: string) {
    const url = userId ? `/documents/${userId}` : '/documents';
    const response = await this.client.get(url);
    return response.data;
  }

  async downloadDocument(documentId: string) {
    const response = await this.client.get(`/documents/${documentId}/download`);
    return response.data;
  }

  // Loan Details API
  async getLoanPaymentHistory(loanId: string) {
    const response = await this.client.get(`/loans/${loanId}/payments`);
    return response.data;
  }

  async getLoanAmortizationSchedule(loanId: string) {
    const response = await this.client.get(`/loans/${loanId}/amortization`);
    return response.data;
  }

  async makeLoanPayment(loanId: string, amount: number) {
    const response = await this.client.post(`/loans/${loanId}/payments`, { amount });
    return response.data;
  }

  // Payments
  async initiatePayment(data: any) {
    const response = await this.client.post('/payments/initiate', data);
    return response.data;
  }

  async getPaymentHistory(userId: string) {
    const response = await this.client.get(`/payments/history/${userId}`);
    return response.data;
  }

  // ===== Investment APIs (African Exchanges: NGX, JSE, NSE, etc.) =====

  async getExchanges() {
    const response = await this.client.get('/investment/exchanges');
    return response.data;
  }

  async getStocksByExchange(exchangeCode: string) {
    const response = await this.client.get(`/investment/exchanges/${exchangeCode}/stocks`);
    return response.data;
  }

  async getStockDetails(symbol: string) {
    const response = await this.client.get(`/investment/stocks/${symbol}`);
    return response.data;
  }

  async getPortfolio() {
    const response = await this.client.get('/investment/portfolio');
    return response.data;
  }

  async getETFs() {
    const response = await this.client.get('/investment/etfs');
    return response.data;
  }

  async buyETF(data: { etf_id: string; amount: number; shares: number }) {
    const response = await this.client.post('/investment/etfs/buy', data);
    return response.data;
  }

  async getCommodities() {
    const response = await this.client.get('/investment/commodities');
    return response.data;
  }

  async buyCommodity(data: { commodity_id: string; amount: number; quantity: number }) {
    const response = await this.client.post('/investment/commodities/buy', data);
    return response.data;
  }

  async getWatchlist() {
    const response = await this.client.get('/investment/watchlist');
    return response.data;
  }

  async addToWatchlist(data: { symbol: string; exchange: string }) {
    const response = await this.client.post('/investment/watchlist', data);
    return response.data;
  }

  // ===== Savings APIs (Vaults, Fixed Deposits, Group Savings) =====

  async createVault(data: { name: string; target_amount: number; target_date?: string; vault_type: string }) {
    const response = await this.client.post('/savings/vaults', data);
    return response.data;
  }

  async getVaults() {
    const response = await this.client.get('/savings/vaults');
    return response.data;
  }

  async getVaultDetails(vaultId: string) {
    const response = await this.client.get(`/savings/vaults/${vaultId}`);
    return response.data;
  }

  async depositToVault(vaultId: string, data: { amount: number }) {
    const response = await this.client.post(`/savings/vaults/${vaultId}/deposit`, data);
    return response.data;
  }

  async withdrawFromVault(vaultId: string, data: { amount: number }) {
    const response = await this.client.post(`/savings/vaults/${vaultId}/withdraw`, data);
    return response.data;
  }

  async getFixedDepositRates() {
    const response = await this.client.get('/savings/fixed-deposits/rates');
    return response.data;
  }

  async createFixedDeposit(data: { amount: number; term_months: number; currency: string }) {
    const response = await this.client.post('/savings/fixed-deposits', data);
    return response.data;
  }

  async getFixedDeposits() {
    const response = await this.client.get('/savings/fixed-deposits');
    return response.data;
  }

  async createSavingsGroup(data: { name: string; type: string; contribution_amount: number; frequency: string; max_members: number }) {
    const response = await this.client.post('/savings/groups', data);
    return response.data;
  }

  async getSavingsGroups() {
    const response = await this.client.get('/savings/groups');
    return response.data;
  }

  async contributeToGroup(groupId: string, data: { amount: number }) {
    const response = await this.client.post(`/savings/groups/${groupId}/contribute`, data);
    return response.data;
  }

  async checkSalaryAdvanceEligibility() {
    const response = await this.client.get('/savings/salary-advance/eligibility');
    return response.data;
  }

  async requestSalaryAdvance(data: { amount: number }) {
    const response = await this.client.post('/savings/salary-advance', data);
    return response.data;
  }

  async getSalaryAdvances() {
    const response = await this.client.get('/savings/salary-advance');
    return response.data;
  }

  // ===== BNPL APIs (Buy Now Pay Later) =====

  async checkBNPLEligibility() {
    const response = await this.client.get('/bnpl/eligibility');
    return response.data;
  }

  async getBNPLPlans() {
    const response = await this.client.get('/bnpl/plans');
    return response.data;
  }

  async calculateInstallments(data: { amount: number; plan_id: string }) {
    const response = await this.client.post('/bnpl/calculate', data);
    return response.data;
  }

  async createBNPLOrder(data: { merchant_id: string; amount: number; plan_id: string; items: Array<{ name: string; price: number; quantity: number }> }) {
    const response = await this.client.post('/bnpl/orders', data);
    return response.data;
  }

  async getBNPLOrders() {
    const response = await this.client.get('/bnpl/orders');
    return response.data;
  }

  async getBNPLOrderDetails(orderId: string) {
    const response = await this.client.get(`/bnpl/orders/${orderId}`);
    return response.data;
  }

  async getBNPLPaymentSchedule(orderId: string) {
    const response = await this.client.get(`/bnpl/orders/${orderId}/schedule`);
    return response.data;
  }

  async makeBNPLPayment(orderId: string, data: { amount: number }) {
    const response = await this.client.post(`/bnpl/orders/${orderId}/pay`, data);
    return response.data;
  }

  async getBNPLMerchants() {
    const response = await this.client.get('/bnpl/merchants');
    return response.data;
  }

  // ===== Accounts APIs (Kids, Joint) =====

  async createJointAccount(data: { name: string; currency: string }) {
    const response = await this.client.post('/accounts/joint', data);
    return response.data;
  }

  async inviteToJointAccount(accountId: string, data: { email: string }) {
    const response = await this.client.post(`/accounts/joint/${accountId}/invite`, data);
    return response.data;
  }

  async getInvitations() {
    const response = await this.client.get('/accounts/invitations');
    return response.data;
  }

  async respondToInvitation(invitationId: string, data: { accept: boolean }) {
    const response = await this.client.post(`/accounts/invitations/${invitationId}/respond`, data);
    return response.data;
  }

  async createKidsAccount(data: { child_name: string; child_dob: string; currency: string }) {
    const response = await this.client.post('/accounts/kids', data);
    return response.data;
  }

  async getKidsAccounts() {
    const response = await this.client.get('/accounts/kids');
    return response.data;
  }

  async setKidsSpendingLimit(accountId: string, data: { daily_limit: number; weekly_limit: number; monthly_limit: number }) {
    const response = await this.client.post(`/accounts/kids/${accountId}/spending-limit`, data);
    return response.data;
  }

  async setKidsCategoryRestrictions(accountId: string, data: { allowed_categories: string[]; blocked_categories: string[] }) {
    const response = await this.client.post(`/accounts/kids/${accountId}/categories`, data);
    return response.data;
  }

  async createKidsTask(accountId: string, data: { title: string; description: string; reward_amount: number; due_date: string }) {
    const response = await this.client.post(`/accounts/kids/${accountId}/tasks`, data);
    return response.data;
  }

  async completeKidsTask(accountId: string, taskId: string) {
    const response = await this.client.post(`/accounts/kids/${accountId}/tasks/${taskId}/complete`);
    return response.data;
  }

  async transferToKidsAccount(accountId: string, data: { amount: number }) {
    const response = await this.client.post(`/accounts/kids/${accountId}/transfer`, data);
    return response.data;
  }

  // ===== Rewards APIs (Cashback, Points, Referrals) =====

  async getRewardPrograms() {
    const response = await this.client.get('/rewards/programs');
    return response.data;
  }

  async getRewardsSummary() {
    const response = await this.client.get('/rewards/summary');
    return response.data;
  }

  async earnReward(data: { transaction_id: string; amount: number; merchant_id?: string }) {
    const response = await this.client.post('/rewards/earn', data);
    return response.data;
  }

  async getRewardHistory() {
    const response = await this.client.get('/rewards/history');
    return response.data;
  }

  async redeemPoints(data: { points: number; redemption_type: string }) {
    const response = await this.client.post('/rewards/redeem/points', data);
    return response.data;
  }

  async redeemCashback(data: { amount: number }) {
    const response = await this.client.post('/rewards/redeem/cashback', data);
    return response.data;
  }

  async getRedemptions() {
    const response = await this.client.get('/rewards/redemptions');
    return response.data;
  }

  async getPartners() {
    const response = await this.client.get('/rewards/partners');
    return response.data;
  }

  async getPartnerDetails(partnerId: string) {
    const response = await this.client.get(`/rewards/partners/${partnerId}`);
    return response.data;
  }

  async getReferralCode() {
    const response = await this.client.get('/rewards/referral-code');
    return response.data;
  }

  async applyReferralCode(data: { code: string }) {
    const response = await this.client.post('/rewards/referral/apply', data);
    return response.data;
  }

  async getReferrals() {
    const response = await this.client.get('/rewards/referrals');
    return response.data;
  }

  async getRewardTiers() {
    const response = await this.client.get('/rewards/tiers');
    return response.data;
  }

  // ===== Telecom APIs (Airtime, Data, eSIM) =====

  async getNetworks(country?: string) {
    const params = country ? { country } : {};
    const response = await this.client.get('/telecom/networks', { params });
    return response.data;
  }

  async getNetworkDetails(networkId: string) {
    const response = await this.client.get(`/telecom/networks/${networkId}`);
    return response.data;
  }

  async getDataPlans(networkId: string) {
    const response = await this.client.get(`/telecom/networks/${networkId}/data-plans`);
    return response.data;
  }

  async validatePhone(data: { phone_number: string; network_id: string }) {
    const response = await this.client.post('/telecom/validate-phone', data);
    return response.data;
  }

  async buyAirtime(data: { phone_number: string; network_id: string; amount: number }) {
    const response = await this.client.post('/telecom/airtime', data);
    return response.data;
  }

  async getAirtimeHistory() {
    const response = await this.client.get('/telecom/airtime/history');
    return response.data;
  }

  async buyData(data: { phone_number: string; network_id: string; plan_id: string }) {
    const response = await this.client.post('/telecom/data', data);
    return response.data;
  }

  async getDataHistory() {
    const response = await this.client.get('/telecom/data/history');
    return response.data;
  }

  async getESIMPlans(region?: string) {
    const params = region ? { region } : {};
    const response = await this.client.get('/telecom/esim/plans', { params });
    return response.data;
  }

  async getESIMRegions() {
    const response = await this.client.get('/telecom/esim/regions');
    return response.data;
  }

  async buyESIM(data: { plan_id: string }) {
    const response = await this.client.post('/telecom/esim', data);
    return response.data;
  }

  async getMyESIMs() {
    const response = await this.client.get('/telecom/esim/my');
    return response.data;
  }

  async getESIMDetails(esimId: string) {
    const response = await this.client.get(`/telecom/esim/${esimId}`);
    return response.data;
  }

  async activateESIM(esimId: string) {
    const response = await this.client.post(`/telecom/esim/${esimId}/activate`);
    return response.data;
  }

  async saveBeneficiary(data: { phone_number: string; network_id: string; name: string }) {
    const response = await this.client.post('/telecom/beneficiaries', data);
    return response.data;
  }

  async getBeneficiaries() {
    const response = await this.client.get('/telecom/beneficiaries');
    return response.data;
  }

  async deleteBeneficiary(beneficiaryId: string) {
    const response = await this.client.delete(`/telecom/beneficiaries/${beneficiaryId}`);
    return response.data;
  }

  // ===== Analytics APIs (Spending, Budgets, Insights) =====

  async getAnalyticsSummary(period?: string) {
    const params = period ? { period } : {};
    const response = await this.client.get('/analytics/summary', { params });
    return response.data;
  }

  async getSpendingByCategory(period?: string) {
    const params = period ? { period } : {};
    const response = await this.client.get('/analytics/spending/categories', { params });
    return response.data;
  }

  async getSpendingByMerchant(period?: string) {
    const params = period ? { period } : {};
    const response = await this.client.get('/analytics/spending/merchants', { params });
    return response.data;
  }

  async getBudgets() {
    const response = await this.client.get('/analytics/budgets');
    return response.data;
  }

  async createBudget(data: { category: string; amount: number; period: string }) {
    const response = await this.client.post('/analytics/budgets', data);
    return response.data;
  }

  async updateBudget(budgetId: string, data: { amount: number }) {
    const response = await this.client.put(`/analytics/budgets/${budgetId}`, data);
    return response.data;
  }

  async deleteBudget(budgetId: string) {
    const response = await this.client.delete(`/analytics/budgets/${budgetId}`);
    return response.data;
  }

  async getBudgetAlerts() {
    const response = await this.client.get('/analytics/budgets/alerts');
    return response.data;
  }

  async getFinancialInsights() {
    const response = await this.client.get('/analytics/insights');
    return response.data;
  }

  async getRecurringTransactions() {
    const response = await this.client.get('/analytics/recurring');
    return response.data;
  }

  // ===== Insurance APIs =====

  async getInsuranceProducts(type?: string) {
    const params = type ? { type } : {};
    const response = await this.client.get('/insurance/products', { params });
    return response.data;
  }

  async getInsuranceQuote(data: { product_id: string; coverage_amount: number; duration_months: number }) {
    const response = await this.client.post('/insurance/quote', data);
    return response.data;
  }

  async purchaseInsurance(data: { product_id: string; coverage_amount: number; duration_months: number; beneficiaries?: Array<{ name: string; relationship: string; percentage: number }> }) {
    const response = await this.client.post('/insurance/purchase', data);
    return response.data;
  }

  async getInsurancePolicies() {
    const response = await this.client.get('/insurance/policies');
    return response.data;
  }

  async getInsurancePolicyDetails(policyId: string) {
    const response = await this.client.get(`/insurance/policies/${policyId}`);
    return response.data;
  }

  async fileClaim(policyId: string, data: { type: string; description: string; amount: number; documents?: string[] }) {
    const response = await this.client.post(`/insurance/policies/${policyId}/claims`, data);
    return response.data;
  }

  async getClaims() {
    const response = await this.client.get('/insurance/claims');
    return response.data;
  }

  // ===== Bills APIs =====

  async getBillers(category?: string) {
    const params = category ? { category } : {};
    const response = await this.client.get('/bills/billers', { params });
    return response.data;
  }

  async getBillerDetails(billerId: string) {
    const response = await this.client.get(`/bills/billers/${billerId}`);
    return response.data;
  }

  async payBill(data: { biller_id: string; account_number: string; amount: number }) {
    const response = await this.client.post('/bills/pay', data);
    return response.data;
  }

  async getBillPaymentHistory() {
    const response = await this.client.get('/bills/payments');
    return response.data;
  }

  async getSubscriptions() {
    const response = await this.client.get('/bills/subscriptions');
    return response.data;
  }

  async createScheduledPayment(data: { biller_id: string; account_number: string; amount: number; frequency: string; start_date: string }) {
    const response = await this.client.post('/bills/scheduled', data);
    return response.data;
  }

  async getScheduledPayments() {
    const response = await this.client.get('/bills/scheduled');
    return response.data;
  }

  async cancelScheduledPayment(paymentId: string) {
    const response = await this.client.delete(`/bills/scheduled/${paymentId}`);
    return response.data;
  }
}

export default new ApiService();
export { STORAGE_KEYS };

