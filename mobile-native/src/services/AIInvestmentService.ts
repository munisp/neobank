import ApiService from './ApiService';

export interface InvestmentProfile {
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  timeHorizon: number; // years
  investmentGoals: string[];
  monthlyInvestment: number;
  currentPortfolioValue: number;
  age: number;
  income: number;
  existingInvestments: { type: string; value: number }[];
}

export interface InvestmentRecommendation {
  id: string;
  type: 'stock' | 'etf' | 'bond' | 'crypto' | 'realestate';
  symbol: string;
  name: string;
  recommendedAmount: number;
  recommendedPercentage: number;
  rationale: string;
  expectedReturn: number;
  riskLevel: 'low' | 'medium' | 'high';
  confidence: number;
  timeframe: 'short' | 'medium' | 'long';
}

export interface PortfolioAllocation {
  stocks: number;
  bonds: number;
  cash: number;
  crypto: number;
  realEstate: number;
  commodities: number;
}

class AIInvestmentService {
  private profile: InvestmentProfile | null = null;
  private recommendations: InvestmentRecommendation[] = [];

  async loadInvestmentProfile(): Promise<InvestmentProfile> {
    try {
      const response = await ApiService.get('/investments/profile');
      this.profile = response.data.profile;
      return this.profile;
    } catch (error) {
      console.error('Error loading investment profile:', error);
      throw error;
    }
  }

  async updateInvestmentProfile(updates: Partial<InvestmentProfile>): Promise<InvestmentProfile> {
    try {
      const response = await ApiService.put('/investments/profile', updates);
      this.profile = response.data.profile;
      return this.profile;
    } catch (error) {
      console.error('Error updating investment profile:', error);
      throw error;
    }
  }

  async getAIRecommendations(): Promise<InvestmentRecommendation[]> {
    try {
      const response = await ApiService.post('/investments/ai/recommendations', {
        profile: this.profile,
      });

      this.recommendations = response.data.recommendations;
      return this.recommendations;
    } catch (error) {
      console.error('Error getting AI recommendations:', error);
      return [];
    }
  }

  async getPersonalizedPortfolio(): Promise<PortfolioAllocation> {
    if (!this.profile) {
      await this.loadInvestmentProfile();
    }

    try {
      const response = await ApiService.post('/investments/ai/portfolio', {
        profile: this.profile,
      });

      return response.data.allocation;
    } catch (error) {
      console.error('Error getting personalized portfolio:', error);
      // Return default allocation based on risk tolerance
      return this.getDefaultAllocation();
    }
  }

  private getDefaultAllocation(): PortfolioAllocation {
    if (!this.profile) {
      return { stocks: 60, bonds: 30, cash: 10, crypto: 0, realEstate: 0, commodities: 0 };
    }

    switch (this.profile.riskTolerance) {
      case 'conservative':
        return { stocks: 30, bonds: 50, cash: 15, crypto: 0, realEstate: 5, commodities: 0 };
      case 'moderate':
        return { stocks: 60, bonds: 25, cash: 10, crypto: 3, realEstate: 2, commodities: 0 };
      case 'aggressive':
        return { stocks: 75, bonds: 10, cash: 5, crypto: 7, realEstate: 3, commodities: 0 };
      default:
        return { stocks: 60, bonds: 30, cash: 10, crypto: 0, realEstate: 0, commodities: 0 };
    }
  }

  async analyzeStock(symbol: string): Promise<{
    recommendation: 'buy' | 'hold' | 'sell';
    targetPrice: number;
    confidence: number;
    factors: { name: string; impact: number; description: string }[];
  }> {
    try {
      const response = await ApiService.post('/investments/ai/analyze-stock', { symbol });
      return response.data.analysis;
    } catch (error) {
      console.error('Error analyzing stock:', error);
      throw error;
    }
  }

  async getMarketInsights(): Promise<{
    sentiment: 'bullish' | 'bearish' | 'neutral';
    trends: string[];
    opportunities: string[];
    risks: string[];
  }> {
    try {
      const response = await ApiService.get('/investments/ai/market-insights');
      return response.data.insights;
    } catch (error) {
      console.error('Error getting market insights:', error);
      return {
        sentiment: 'neutral',
        trends: [],
        opportunities: [],
        risks: [],
      };
    }
  }

  async getDiversificationScore(): Promise<{
    score: number;
    suggestions: string[];
    overexposedAssets: string[];
    underexposedAssets: string[];
  }> {
    try {
      const response = await ApiService.get('/investments/ai/diversification');
      return response.data;
    } catch (error) {
      console.error('Error getting diversification score:', error);
      return {
        score: 0,
        suggestions: [],
        overexposedAssets: [],
        underexposedAssets: [],
      };
    }
  }

  async predictPortfolioPerformance(years: number): Promise<{
    expectedValue: number;
    bestCase: number;
    worstCase: number;
    confidence: number;
  }> {
    try {
      const response = await ApiService.post('/investments/ai/predict', {
        years,
        profile: this.profile,
      });
      return response.data.prediction;
    } catch (error) {
      console.error('Error predicting portfolio performance:', error);
      throw error;
    }
  }

  async getRetirementProjection(): Promise<{
    projectedValue: number;
    monthlyIncome: number;
    sufficient: boolean;
    recommendations: string[];
  }> {
    try {
      const response = await ApiService.post('/investments/ai/retirement', {
        profile: this.profile,
      });
      return response.data.projection;
    } catch (error) {
      console.error('Error getting retirement projection:', error);
      throw error;
    }
  }

  async optimizeForTaxes(): Promise<{
    potentialSavings: number;
    suggestions: string[];
    taxLossHarvestingOpportunities: { symbol: string; loss: number }[];
  }> {
    try {
      const response = await ApiService.get('/investments/ai/tax-optimization');
      return response.data;
    } catch (error) {
      console.error('Error optimizing for taxes:', error);
      return {
        potentialSavings: 0,
        suggestions: [],
        taxLossHarvestingOpportunities: [],
      };
    }
  }

  async getRebalancingRecommendations(): Promise<{
    needsRebalancing: boolean;
    trades: { symbol: string; action: 'buy' | 'sell'; shares: number; reason: string }[];
    estimatedCost: number;
  }> {
    try {
      const response = await ApiService.get('/investments/ai/rebalancing');
      return response.data;
    } catch (error) {
      console.error('Error getting rebalancing recommendations:', error);
      return {
        needsRebalancing: false,
        trades: [],
        estimatedCost: 0,
      };
    }
  }

  async executeRecommendation(recommendationId: string): Promise<{
    success: boolean;
    transactionId?: string;
  }> {
    try {
      const response = await ApiService.post(`/investments/ai/execute/${recommendationId}`);
      return {
        success: true,
        transactionId: response.data.transactionId,
      };
    } catch (error) {
      console.error('Error executing recommendation:', error);
      return { success: false };
    }
  }

  getProfile(): InvestmentProfile | null {
    return this.profile;
  }

  getRecommendations(): InvestmentRecommendation[] {
    return this.recommendations;
  }
}

export default new AIInvestmentService();

