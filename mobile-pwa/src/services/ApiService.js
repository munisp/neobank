/**
 * API Service for NeoBank PWA
 * Centralized API communication with error handling, retry logic, and offline support
 */

import { AuthService } from './AuthService';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export class ApiService {
  /**
   * Make API request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<any>} Response data
   */
  static async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
        ...options.headers,
      },
    };

    const config = { ...defaultOptions, ...options };

    try {
      const response = await fetch(url, config);

      // Handle 401 Unauthorized - try to refresh token
      if (response.status === 401) {
        const refreshed = await this.handleUnauthorized();
        if (refreshed) {
          // Retry request with new token
          config.headers = {
            ...config.headers,
            ...this.getAuthHeaders(),
          };
          return await this.request(endpoint, options);
        }
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request error:', error);
      
      // Store failed request for offline sync
      if (!navigator.onLine) {
        await this.storeOfflineRequest(endpoint, config);
      }
      
      throw error;
    }
  }

  /**
   * GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @returns {Promise<any>} Response data
   */
  static async get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    
    return this.request(url, { method: 'GET' });
  }

  /**
   * POST request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<any>} Response data
   */
  static async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * PUT request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<any>} Response data
   */
  static async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request
   * @param {string} endpoint - API endpoint
   * @returns {Promise<any>} Response data
   */
  static async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  /**
   * Get auth headers
   * @returns {Object} Auth headers
   */
  static getAuthHeaders() {
    const token = AuthService.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  /**
   * Handle unauthorized response
   * @returns {Promise<boolean>} Success status
   */
  static async handleUnauthorized() {
    try {
      await AuthService.refreshToken();
      return true;
    } catch (error) {
      AuthService.logout();
      window.location.href = '/login';
      return false;
    }
  }

  /**
   * Store offline request for later sync
   * @param {string} endpoint - API endpoint
   * @param {Object} config - Request config
   * @returns {Promise<void>}
   */
  static async storeOfflineRequest(endpoint, config) {
    try {
      const db = await this.openDB();
      const transaction = db.transaction(['offlineRequests'], 'readwrite');
      const store = transaction.objectStore('offlineRequests');
      
      await store.add({
        endpoint,
        config,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Store offline request error:', error);
    }
  }

  /**
   * Sync offline requests
   * @returns {Promise<void>}
   */
  static async syncOfflineRequests() {
    try {
      const db = await this.openDB();
      const transaction = db.transaction(['offlineRequests'], 'readonly');
      const store = transaction.objectStore('offlineRequests');
      
      const requests = await store.getAll();
      
      for (const request of requests) {
        try {
          await this.request(request.endpoint, request.config);
          
          // Remove synced request
          const deleteTransaction = db.transaction(['offlineRequests'], 'readwrite');
          const deleteStore = deleteTransaction.objectStore('offlineRequests');
          await deleteStore.delete(request.id);
        } catch (error) {
          console.error('Sync request error:', error);
        }
      }
    } catch (error) {
      console.error('Sync offline requests error:', error);
    }
  }

  /**
   * Open IndexedDB
   * @returns {Promise<IDBDatabase>}
   */
  static openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('NeobankPWA', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('offlineRequests')) {
          db.createObjectStore('offlineRequests', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  // ===== Account APIs =====

  static async getAccounts() {
    return this.get('/accounts');
  }

  static async getAccountDetails(accountId) {
    return this.get(`/accounts/${accountId}`);
  }

  static async getAccountBalance(accountId) {
    return this.get(`/accounts/${accountId}/balance`);
  }

  // ===== Transaction APIs =====

  static async getTransactions(accountId, params = {}) {
    return this.get(`/accounts/${accountId}/transactions`, params);
  }

  static async getTransactionDetails(transactionId) {
    return this.get(`/transactions/${transactionId}`);
  }

  static async createTransfer(transferData) {
    return this.post('/transfers', transferData);
  }

  // ===== Card APIs =====

  static async getCards() {
    return this.get('/cards');
  }

  static async getCardDetails(cardId) {
    return this.get(`/cards/${cardId}`);
  }

  static async freezeCard(cardId) {
    return this.post(`/cards/${cardId}/freeze`);
  }

  static async unfreezeCard(cardId) {
    return this.post(`/cards/${cardId}/unfreeze`);
  }

  static async requestCard(cardData) {
    return this.post('/cards/request', cardData);
  }

  // ===== Loan APIs =====

  static async getLoans() {
    return this.get('/loans');
  }

  static async getLoanDetails(loanId) {
    return this.get(`/loans/${loanId}`);
  }

  static async applyForLoan(loanData) {
    return this.post('/loans/apply', loanData);
  }

  static async repayLoan(loanId, amount) {
    return this.post(`/loans/${loanId}/repay`, { amount });
  }

  // ===== Investment APIs (African Exchanges: NGX, JSE, NSE, etc.) =====

  static async getExchanges() {
    return this.get('/investment/exchanges');
  }

  static async getStocksByExchange(exchangeCode) {
    return this.get(`/investment/exchanges/${exchangeCode}/stocks`);
  }

  static async getStockDetails(symbol) {
    return this.get(`/investment/stocks/${symbol}`);
  }

  static async buyStock(stockData) {
    return this.post('/investment/stocks/buy', stockData);
  }

  static async sellStock(stockData) {
    return this.post('/investment/stocks/sell', stockData);
  }

  static async getPortfolio() {
    return this.get('/investment/portfolio');
  }

  static async getETFs() {
    return this.get('/investment/etfs');
  }

  static async buyETF(etfData) {
    return this.post('/investment/etfs/buy', etfData);
  }

  static async getCommodities() {
    return this.get('/investment/commodities');
  }

  static async buyCommodity(commodityData) {
    return this.post('/investment/commodities/buy', commodityData);
  }

  static async getWatchlist() {
    return this.get('/investment/watchlist');
  }

  static async addToWatchlist(watchlistData) {
    return this.post('/investment/watchlist', watchlistData);
  }

  // Legacy crypto methods
  static async getCryptocurrencies() {
    return this.get('/investments/crypto');
  }

  static async buyCrypto(cryptoData) {
    return this.post('/investments/crypto/buy', cryptoData);
  }

  static async sellCrypto(cryptoData) {
    return this.post('/investments/crypto/sell', cryptoData);
  }

  // ===== Insurance APIs =====

  static async getInsuranceProducts() {
    return this.get('/insurance/products');
  }

  static async getInsurancePolicies() {
    return this.get('/insurance/policies');
  }

  static async getInsuranceQuote(quoteData) {
    return this.post('/insurance/quote', quoteData);
  }

  static async purchaseInsurance(policyData) {
    return this.post('/insurance/purchase', policyData);
  }

  static async fileClaim(claimData) {
    return this.post('/insurance/claims', claimData);
  }

  static async getClaims() {
    return this.get('/insurance/claims');
  }

  // ===== Bill Payment APIs =====

  static async getBillers() {
    return this.get('/bills/billers');
  }

  static async getBillReminders() {
    return this.get('/bills/reminders');
  }

  static async payBill(billData) {
    return this.post('/bills/pay', billData);
  }

  static async createBillReminder(reminderData) {
    return this.post('/bills/reminders', reminderData);
  }

  // ===== Budget APIs =====

  static async getBudgets() {
    return this.get('/budgets');
  }

  static async createBudget(budgetData) {
    return this.post('/budgets', budgetData);
  }

  static async updateBudget(budgetId, budgetData) {
    return this.put(`/budgets/${budgetId}`, budgetData);
  }

  static async deleteBudget(budgetId) {
    return this.delete(`/budgets/${budgetId}`);
  }

  // ===== Analytics APIs =====

  static async getSpendingInsights(params = {}) {
    return this.get('/analytics/spending', params);
  }

  static async getCreditScore() {
    return this.get('/credit-score');
  }

  // ===== Document APIs =====

  static async getDocuments() {
    return this.get('/documents');
  }

  static async uploadDocument(formData) {
    return this.request('/documents/upload', {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
      },
      body: formData,
    });
  }

  static async downloadDocument(documentId) {
    return this.get(`/documents/${documentId}/download`);
  }

  // ===== Savings APIs (Vaults, Fixed Deposits, Group Savings) =====

  static async createVault(vaultData) {
    return this.post('/savings/vaults', vaultData);
  }

  static async getVaults() {
    return this.get('/savings/vaults');
  }

  static async getVaultDetails(vaultId) {
    return this.get(`/savings/vaults/${vaultId}`);
  }

  static async depositToVault(vaultId, depositData) {
    return this.post(`/savings/vaults/${vaultId}/deposit`, depositData);
  }

  static async withdrawFromVault(vaultId, withdrawData) {
    return this.post(`/savings/vaults/${vaultId}/withdraw`, withdrawData);
  }

  static async getFixedDepositRates() {
    return this.get('/savings/fixed-deposits/rates');
  }

  static async createFixedDeposit(depositData) {
    return this.post('/savings/fixed-deposits', depositData);
  }

  static async getFixedDeposits() {
    return this.get('/savings/fixed-deposits');
  }

  static async createSavingsGroup(groupData) {
    return this.post('/savings/groups', groupData);
  }

  static async getSavingsGroups() {
    return this.get('/savings/groups');
  }

  static async contributeToGroup(groupId, contributionData) {
    return this.post(`/savings/groups/${groupId}/contribute`, contributionData);
  }

  static async checkSalaryAdvanceEligibility() {
    return this.get('/savings/salary-advance/eligibility');
  }

  static async requestSalaryAdvance(advanceData) {
    return this.post('/savings/salary-advance', advanceData);
  }

  static async getSalaryAdvances() {
    return this.get('/savings/salary-advance');
  }

  // ===== BNPL APIs (Buy Now Pay Later) =====

  static async checkBNPLEligibility() {
    return this.get('/bnpl/eligibility');
  }

  static async getBNPLPlans() {
    return this.get('/bnpl/plans');
  }

  static async calculateInstallments(calculationData) {
    return this.post('/bnpl/calculate', calculationData);
  }

  static async createBNPLOrder(orderData) {
    return this.post('/bnpl/orders', orderData);
  }

  static async getBNPLOrders() {
    return this.get('/bnpl/orders');
  }

  static async getBNPLOrderDetails(orderId) {
    return this.get(`/bnpl/orders/${orderId}`);
  }

  static async getBNPLPaymentSchedule(orderId) {
    return this.get(`/bnpl/orders/${orderId}/schedule`);
  }

  static async makeBNPLPayment(orderId, paymentData) {
    return this.post(`/bnpl/orders/${orderId}/pay`, paymentData);
  }

  static async getBNPLMerchants() {
    return this.get('/bnpl/merchants');
  }

  // ===== Accounts APIs (Kids, Joint) =====

  static async createJointAccount(accountData) {
    return this.post('/accounts/joint', accountData);
  }

  static async inviteToJointAccount(accountId, inviteData) {
    return this.post(`/accounts/joint/${accountId}/invite`, inviteData);
  }

  static async getInvitations() {
    return this.get('/accounts/invitations');
  }

  static async respondToInvitation(invitationId, responseData) {
    return this.post(`/accounts/invitations/${invitationId}/respond`, responseData);
  }

  static async createKidsAccount(accountData) {
    return this.post('/accounts/kids', accountData);
  }

  static async getKidsAccounts() {
    return this.get('/accounts/kids');
  }

  static async setKidsSpendingLimit(accountId, limitData) {
    return this.post(`/accounts/kids/${accountId}/spending-limit`, limitData);
  }

  static async setKidsCategoryRestrictions(accountId, restrictionData) {
    return this.post(`/accounts/kids/${accountId}/categories`, restrictionData);
  }

  static async createKidsTask(accountId, taskData) {
    return this.post(`/accounts/kids/${accountId}/tasks`, taskData);
  }

  static async completeKidsTask(accountId, taskId) {
    return this.post(`/accounts/kids/${accountId}/tasks/${taskId}/complete`);
  }

  static async transferToKidsAccount(accountId, transferData) {
    return this.post(`/accounts/kids/${accountId}/transfer`, transferData);
  }

  // ===== Rewards APIs (Cashback, Points, Referrals) =====

  static async getRewardPrograms() {
    return this.get('/rewards/programs');
  }

  static async getRewardsSummary() {
    return this.get('/rewards/summary');
  }

  static async earnReward(rewardData) {
    return this.post('/rewards/earn', rewardData);
  }

  static async getRewardHistory() {
    return this.get('/rewards/history');
  }

  static async redeemPoints(redemptionData) {
    return this.post('/rewards/redeem/points', redemptionData);
  }

  static async redeemCashback(redemptionData) {
    return this.post('/rewards/redeem/cashback', redemptionData);
  }

  static async getRedemptions() {
    return this.get('/rewards/redemptions');
  }

  static async getPartners() {
    return this.get('/rewards/partners');
  }

  static async getPartnerDetails(partnerId) {
    return this.get(`/rewards/partners/${partnerId}`);
  }

  static async getReferralCode() {
    return this.get('/rewards/referral-code');
  }

  static async applyReferralCode(referralData) {
    return this.post('/rewards/referral/apply', referralData);
  }

  static async getReferrals() {
    return this.get('/rewards/referrals');
  }

  static async getRewardTiers() {
    return this.get('/rewards/tiers');
  }

  // ===== Telecom APIs (Airtime, Data, eSIM) =====

  static async getNetworks(country = null) {
    const params = country ? { country } : {};
    return this.get('/telecom/networks', params);
  }

  static async getNetworkDetails(networkId) {
    return this.get(`/telecom/networks/${networkId}`);
  }

  static async getDataPlans(networkId) {
    return this.get(`/telecom/networks/${networkId}/data-plans`);
  }

  static async validatePhone(phoneData) {
    return this.post('/telecom/validate-phone', phoneData);
  }

  static async buyAirtime(airtimeData) {
    return this.post('/telecom/airtime', airtimeData);
  }

  static async getAirtimeHistory() {
    return this.get('/telecom/airtime/history');
  }

  static async buyData(dataData) {
    return this.post('/telecom/data', dataData);
  }

  static async getDataHistory() {
    return this.get('/telecom/data/history');
  }

  static async getESIMPlans(region = null) {
    const params = region ? { region } : {};
    return this.get('/telecom/esim/plans', params);
  }

  static async getESIMRegions() {
    return this.get('/telecom/esim/regions');
  }

  static async buyESIM(esimData) {
    return this.post('/telecom/esim', esimData);
  }

  static async getMyESIMs() {
    return this.get('/telecom/esim/my');
  }

  static async getESIMDetails(esimId) {
    return this.get(`/telecom/esim/${esimId}`);
  }

  static async activateESIM(esimId) {
    return this.post(`/telecom/esim/${esimId}/activate`);
  }

  static async saveBeneficiary(beneficiaryData) {
    return this.post('/telecom/beneficiaries', beneficiaryData);
  }

  static async getBeneficiaries() {
    return this.get('/telecom/beneficiaries');
  }

  static async deleteBeneficiary(beneficiaryId) {
    return this.delete(`/telecom/beneficiaries/${beneficiaryId}`);
  }
}

export default ApiService;
