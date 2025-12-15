import ApiService from './ApiService';

export interface PortfolioHolding {
  symbol: string;
  shares: number;
  costBasis: number;
  currentPrice: number;
  currentValue: number;
  gainLoss: number;
  gainLossPercent: number;
  targetAllocation: number;
  currentAllocation: number;
}

export interface RebalancingPlan {
  id: string;
  createdAt: Date;
  trades: RebalancingTrade[];
  estimatedCost: number;
  estimatedTaxImpact: number;
  netBenefit: number;
}

export interface RebalancingTrade {
  symbol: string;
  action: 'buy' | 'sell';
  shares: number;
  estimatedPrice: number;
  estimatedValue: number;
  reason: string;
}

export interface TaxLossHarvestingOpportunity {
  symbol: string;
  shares: number;
  costBasis: number;
  currentValue: number;
  unrealizedLoss: number;
  replacementSymbol?: string;
  estimatedTaxSavings: number;
}

class PortfolioOptimizationService {
  private holdings: PortfolioHolding[] = [];
  private targetAllocation: { [symbol: string]: number } = {};
  private rebalancingThreshold: number = 5; // 5% drift triggers rebalancing

  async loadPortfolio(): Promise<PortfolioHolding[]> {
    try {
      const response = await ApiService.get('/portfolio/holdings');
      this.holdings = response.data.holdings;
      return this.holdings;
    } catch (error) {
      console.error('Error loading portfolio:', error);
      return [];
    }
  }

  async setTargetAllocation(allocation: { [symbol: string]: number }): Promise<void> {
    try {
      await ApiService.post('/portfolio/target-allocation', { allocation });
      this.targetAllocation = allocation;
    } catch (error) {
      console.error('Error setting target allocation:', error);
      throw error;
    }
  }

  async checkRebalancingNeeded(): Promise<boolean> {
    if (this.holdings.length === 0) {
      await this.loadPortfolio();
    }

    for (const holding of this.holdings) {
      const drift = Math.abs(holding.currentAllocation - holding.targetAllocation);
      if (drift > this.rebalancingThreshold) {
        return true;
      }
    }

    return false;
  }

  async generateRebalancingPlan(): Promise<RebalancingPlan> {
    try {
      const response = await ApiService.post('/portfolio/rebalancing/plan', {
        holdings: this.holdings,
        targetAllocation: this.targetAllocation,
        threshold: this.rebalancingThreshold,
      });

      const plan: RebalancingPlan = {
        id: response.data.planId,
        createdAt: new Date(),
        trades: response.data.trades,
        estimatedCost: response.data.estimatedCost,
        estimatedTaxImpact: response.data.estimatedTaxImpact,
        netBenefit: response.data.netBenefit,
      };

      return plan;
    } catch (error) {
      console.error('Error generating rebalancing plan:', error);
      throw error;
    }
  }

  async executeRebalancing(planId: string): Promise<{
    success: boolean;
    executedTrades: number;
    failedTrades: number;
  }> {
    try {
      const response = await ApiService.post(`/portfolio/rebalancing/execute/${planId}`);
      return response.data;
    } catch (error) {
      console.error('Error executing rebalancing:', error);
      throw error;
    }
  }

  async enableAutoRebalancing(frequency: 'monthly' | 'quarterly' | 'annually'): Promise<void> {
    try {
      await ApiService.post('/portfolio/auto-rebalancing/enable', {
        frequency,
        threshold: this.rebalancingThreshold,
      });
    } catch (error) {
      console.error('Error enabling auto-rebalancing:', error);
      throw error;
    }
  }

  async disableAutoRebalancing(): Promise<void> {
    try {
      await ApiService.post('/portfolio/auto-rebalancing/disable');
    } catch (error) {
      console.error('Error disabling auto-rebalancing:', error);
      throw error;
    }
  }

  async findTaxLossHarvestingOpportunities(): Promise<TaxLossHarvestingOpportunity[]> {
    try {
      const response = await ApiService.get('/portfolio/tax-loss-harvesting/opportunities');
      return response.data.opportunities.map((opp: any) => ({
        ...opp,
        estimatedTaxSavings: opp.unrealizedLoss * 0.25, // Assuming 25% tax rate
      }));
    } catch (error) {
      console.error('Error finding tax loss harvesting opportunities:', error);
      return [];
    }
  }

  async executeTaxLossHarvesting(
    symbol: string,
    replacementSymbol?: string
  ): Promise<{
    success: boolean;
    soldShares: number;
    realizedLoss: number;
    estimatedTaxSavings: number;
    replacementPurchased?: boolean;
  }> {
    try {
      const response = await ApiService.post('/portfolio/tax-loss-harvesting/execute', {
        symbol,
        replacementSymbol,
      });

      return response.data;
    } catch (error) {
      console.error('Error executing tax loss harvesting:', error);
      throw error;
    }
  }

  async enableAutoTaxLossHarvesting(minLoss: number = 1000): Promise<void> {
    try {
      await ApiService.post('/portfolio/tax-loss-harvesting/auto-enable', {
        minLoss,
        checkFrequency: 'daily',
      });
    } catch (error) {
      console.error('Error enabling auto tax loss harvesting:', error);
      throw error;
    }
  }

  async disableAutoTaxLossHarvesting(): Promise<void> {
    try {
      await ApiService.post('/portfolio/tax-loss-harvesting/auto-disable');
    } catch (error) {
      console.error('Error disabling auto tax loss harvesting:', error);
      throw error;
    }
  }

  async getRebalancingHistory(limit: number = 20): Promise<RebalancingPlan[]> {
    try {
      const response = await ApiService.get(`/portfolio/rebalancing/history?limit=${limit}`);
      return response.data.plans.map((plan: any) => ({
        ...plan,
        createdAt: new Date(plan.createdAt),
      }));
    } catch (error) {
      console.error('Error fetching rebalancing history:', error);
      return [];
    }
  }

  async getTaxLossHarvestingHistory(limit: number = 20): Promise<any[]> {
    try {
      const response = await ApiService.get(`/portfolio/tax-loss-harvesting/history?limit=${limit}`);
      return response.data.history;
    } catch (error) {
      console.error('Error fetching tax loss harvesting history:', error);
      return [];
    }
  }

  async getTotalTaxSavings(year?: number): Promise<number> {
    try {
      const response = await ApiService.get(`/portfolio/tax-loss-harvesting/savings${year ? `?year=${year}` : ''}`);
      return response.data.totalSavings;
    } catch (error) {
      console.error('Error fetching total tax savings:', error);
      return 0;
    }
  }

  async optimizeForDividends(): Promise<{
    recommendations: { symbol: string; reason: string }[];
    estimatedAnnualIncome: number;
  }> {
    try {
      const response = await ApiService.get('/portfolio/optimize/dividends');
      return response.data;
    } catch (error) {
      console.error('Error optimizing for dividends:', error);
      return { recommendations: [], estimatedAnnualIncome: 0 };
    }
  }

  async optimizeForGrowth(): Promise<{
    recommendations: { symbol: string; reason: string }[];
    estimatedReturn: number;
  }> {
    try {
      const response = await ApiService.get('/portfolio/optimize/growth');
      return response.data;
    } catch (error) {
      console.error('Error optimizing for growth:', error);
      return { recommendations: [], estimatedReturn: 0 };
    }
  }

  setRebalancingThreshold(threshold: number): void {
    this.rebalancingThreshold = threshold;
  }

  getRebalancingThreshold(): number {
    return this.rebalancingThreshold;
  }

  getHoldings(): PortfolioHolding[] {
    return this.holdings;
  }

  getTargetAllocation(): { [symbol: string]: number } {
    return this.targetAllocation;
  }
}

export default new PortfolioOptimizationService();

