import ApiService from './ApiService';

export interface FinancialProfile {
  monthlyIncome: number;
  monthlyExpenses: number;
  totalSavings: number;
  totalDebt: number;
  creditScore: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  financialGoals: FinancialGoal[];
  age: number;
  dependents: number;
}

export interface FinancialGoal {
  id: string;
  type: 'retirement' | 'home' | 'education' | 'emergency' | 'investment' | 'custom';
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  priority: 'low' | 'medium' | 'high';
}

export interface AIRecommendation {
  id: string;
  type: 'saving' | 'investment' | 'debt' | 'spending' | 'insurance' | 'tax';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  potentialSavings?: number;
  actionItems: string[];
  confidence: number; // 0-100
  reasoning: string;
}

export interface SpendingInsight {
  category: string;
  amount: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  percentageOfIncome: number;
  comparison: 'above' | 'below' | 'average';
  suggestion?: string;
}

export interface InvestmentSuggestion {
  assetType: 'stocks' | 'bonds' | 'etf' | 'crypto' | 'real-estate';
  symbol?: string;
  name: string;
  suggestedAmount: number;
  expectedReturn: number;
  riskLevel: 'low' | 'medium' | 'high';
  reasoning: string;
  timeHorizon: string;
}

class AIFinancialAdvisorService {
  private profile: FinancialProfile | null = null;

  async analyzeFinancialHealth(userId: string): Promise<{
    score: number;
    insights: SpendingInsight[];
    recommendations: AIRecommendation[];
  }> {
    try {
      const response = await ApiService.post('/ai/analyze-financial-health', { userId });
      return response.data;
    } catch (error) {
      console.error('Error analyzing financial health:', error);
      throw error;
    }
  }

  async getPersonalizedRecommendations(
    profile: FinancialProfile
  ): Promise<AIRecommendation[]> {
    try {
      const response = await ApiService.post('/ai/recommendations', { profile });
      return response.data.recommendations;
    } catch (error) {
      console.error('Error getting recommendations:', error);
      return this.generateFallbackRecommendations(profile);
    }
  }

  private generateFallbackRecommendations(profile: FinancialProfile): AIRecommendation[] {
    const recommendations: AIRecommendation[] = [];

    // Emergency fund recommendation
    const emergencyFundTarget = profile.monthlyExpenses * 6;
    if (profile.totalSavings < emergencyFundTarget) {
      recommendations.push({
        id: 'emergency_fund',
        type: 'saving',
        title: 'Build Emergency Fund',
        description: `You should have ${emergencyFundTarget.toLocaleString()} in emergency savings (6 months of expenses).`,
        impact: 'high',
        potentialSavings: emergencyFundTarget - profile.totalSavings,
        actionItems: [
          'Set up automatic transfers to savings account',
          'Aim to save 10-20% of monthly income',
          'Keep emergency fund in high-yield savings account',
        ],
        confidence: 95,
        reasoning: 'Emergency funds provide financial security and prevent debt accumulation during unexpected events.',
      });
    }

    // Debt reduction recommendation
    if (profile.totalDebt > profile.monthlyIncome * 3) {
      recommendations.push({
        id: 'debt_reduction',
        type: 'debt',
        title: 'Accelerate Debt Repayment',
        description: 'Your debt-to-income ratio is high. Focus on paying down high-interest debt.',
        impact: 'high',
        actionItems: [
          'List all debts by interest rate',
          'Pay minimum on all debts, extra on highest interest',
          'Consider debt consolidation if applicable',
          'Avoid taking on new debt',
        ],
        confidence: 90,
        reasoning: 'High-interest debt compounds quickly and reduces your ability to build wealth.',
      });
    }

    // Investment recommendation
    if (profile.totalSavings > emergencyFundTarget && profile.age < 50) {
      recommendations.push({
        id: 'start_investing',
        type: 'investment',
        title: 'Start Investing for Long-term Growth',
        description: 'With your emergency fund established, consider investing for long-term goals.',
        impact: 'high',
        actionItems: [
          'Open a retirement account (401k, IRA)',
          'Consider low-cost index funds',
          'Diversify across asset classes',
          'Invest consistently regardless of market conditions',
        ],
        confidence: 85,
        reasoning: 'Starting early allows compound interest to work in your favor over time.',
      });
    }

    // Spending optimization
    const spendingRatio = profile.monthlyExpenses / profile.monthlyIncome;
    if (spendingRatio > 0.7) {
      recommendations.push({
        id: 'reduce_spending',
        type: 'spending',
        title: 'Optimize Monthly Spending',
        description: 'You\'re spending a high percentage of your income. Look for areas to cut back.',
        impact: 'medium',
        potentialSavings: (spendingRatio - 0.7) * profile.monthlyIncome,
        actionItems: [
          'Review and categorize all expenses',
          'Identify non-essential spending',
          'Negotiate recurring bills (insurance, subscriptions)',
          'Use budgeting app to track spending',
        ],
        confidence: 80,
        reasoning: 'Reducing expenses increases your ability to save and invest for the future.',
      });
    }

    return recommendations;
  }

  async getSpendingInsights(userId: string, period: 'week' | 'month' | 'year'): Promise<SpendingInsight[]> {
    try {
      const response = await ApiService.get(`/ai/spending-insights/${userId}?period=${period}`);
      return response.data.insights;
    } catch (error) {
      console.error('Error getting spending insights:', error);
      return [];
    }
  }

  async getInvestmentSuggestions(
    profile: FinancialProfile,
    investmentAmount: number
  ): Promise<InvestmentSuggestion[]> {
    try {
      const response = await ApiService.post('/ai/investment-suggestions', {
        profile,
        investmentAmount,
      });
      return response.data.suggestions;
    } catch (error) {
      console.error('Error getting investment suggestions:', error);
      return this.generateFallbackInvestmentSuggestions(profile, investmentAmount);
    }
  }

  private generateFallbackInvestmentSuggestions(
    profile: FinancialProfile,
    amount: number
  ): InvestmentSuggestion[] {
    const suggestions: InvestmentSuggestion[] = [];

    if (profile.riskTolerance === 'conservative') {
      suggestions.push({
        assetType: 'bonds',
        name: 'Government Bonds ETF',
        suggestedAmount: amount * 0.6,
        expectedReturn: 3.5,
        riskLevel: 'low',
        reasoning: 'Stable, low-risk investment suitable for conservative investors.',
        timeHorizon: '5+ years',
      });
      suggestions.push({
        assetType: 'etf',
        symbol: 'VTI',
        name: 'Total Stock Market ETF',
        suggestedAmount: amount * 0.4,
        expectedReturn: 7.0,
        riskLevel: 'medium',
        reasoning: 'Diversified exposure to entire stock market.',
        timeHorizon: '10+ years',
      });
    } else if (profile.riskTolerance === 'moderate') {
      suggestions.push({
        assetType: 'etf',
        symbol: 'VTI',
        name: 'Total Stock Market ETF',
        suggestedAmount: amount * 0.5,
        expectedReturn: 7.0,
        riskLevel: 'medium',
        reasoning: 'Balanced approach with diversified stock exposure.',
        timeHorizon: '10+ years',
      });
      suggestions.push({
        assetType: 'bonds',
        name: 'Corporate Bonds ETF',
        suggestedAmount: amount * 0.3,
        expectedReturn: 4.5,
        riskLevel: 'low',
        reasoning: 'Provides stability and regular income.',
        timeHorizon: '5+ years',
      });
      suggestions.push({
        assetType: 'stocks',
        name: 'Growth Stocks',
        suggestedAmount: amount * 0.2,
        expectedReturn: 10.0,
        riskLevel: 'high',
        reasoning: 'Higher growth potential for portion of portfolio.',
        timeHorizon: '10+ years',
      });
    } else {
      // Aggressive
      suggestions.push({
        assetType: 'stocks',
        name: 'Growth Stocks',
        suggestedAmount: amount * 0.5,
        expectedReturn: 10.0,
        riskLevel: 'high',
        reasoning: 'High growth potential aligned with aggressive risk tolerance.',
        timeHorizon: '10+ years',
      });
      suggestions.push({
        assetType: 'etf',
        symbol: 'QQQ',
        name: 'Tech-focused ETF',
        suggestedAmount: amount * 0.3,
        expectedReturn: 12.0,
        riskLevel: 'high',
        reasoning: 'Technology sector has shown strong growth.',
        timeHorizon: '10+ years',
      });
      suggestions.push({
        assetType: 'crypto',
        name: 'Bitcoin/Ethereum',
        suggestedAmount: amount * 0.2,
        expectedReturn: 15.0,
        riskLevel: 'high',
        reasoning: 'High-risk, high-reward alternative asset class.',
        timeHorizon: '5+ years',
      });
    }

    return suggestions;
  }

  async predictFutureBalance(
    currentBalance: number,
    monthlyContribution: number,
    months: number,
    expectedReturn: number = 7.0
  ): Promise<{ month: number; balance: number }[]> {
    const monthlyReturn = expectedReturn / 100 / 12;
    const predictions: { month: number; balance: number }[] = [];

    let balance = currentBalance;
    for (let month = 0; month <= months; month++) {
      predictions.push({ month, balance: Math.round(balance) });
      balance = balance * (1 + monthlyReturn) + monthlyContribution;
    }

    return predictions;
  }

  async optimizeBudget(
    income: number,
    currentExpenses: { [category: string]: number }
  ): Promise<{ category: string; current: number; suggested: number; savings: number }[]> {
    // 50/30/20 rule: 50% needs, 30% wants, 20% savings
    const suggestions: { category: string; current: number; suggested: number; savings: number }[] = [];

    const totalExpenses = Object.values(currentExpenses).reduce((a, b) => a + b, 0);
    const targetSavings = income * 0.2;
    const targetNeeds = income * 0.5;
    const targetWants = income * 0.3;

    // Categorize expenses
    const needs = ['housing', 'utilities', 'groceries', 'insurance', 'transportation'];
    const wants = ['dining', 'entertainment', 'shopping', 'subscriptions'];

    let currentNeeds = 0;
    let currentWants = 0;

    Object.entries(currentExpenses).forEach(([category, amount]) => {
      if (needs.includes(category)) {
        currentNeeds += amount;
      } else if (wants.includes(category)) {
        currentWants += amount;
      }
    });

    // Generate suggestions
    if (currentNeeds > targetNeeds) {
      const reduction = (currentNeeds - targetNeeds) / needs.length;
      needs.forEach((category) => {
        if (currentExpenses[category]) {
          suggestions.push({
            category,
            current: currentExpenses[category],
            suggested: Math.max(currentExpenses[category] - reduction, 0),
            savings: reduction,
          });
        }
      });
    }

    if (currentWants > targetWants) {
      const reduction = (currentWants - targetWants) / wants.length;
      wants.forEach((category) => {
        if (currentExpenses[category]) {
          suggestions.push({
            category,
            current: currentExpenses[category],
            suggested: Math.max(currentExpenses[category] - reduction, 0),
            savings: reduction,
          });
        }
      });
    }

    return suggestions;
  }

  async chatWithAdvisor(message: string, context?: any): Promise<string> {
    try {
      const response = await ApiService.post('/ai/chat', {
        message,
        context,
        profile: this.profile,
      });
      return response.data.reply;
    } catch (error) {
      console.error('Error chatting with AI advisor:', error);
      return 'I apologize, but I\'m having trouble processing your request right now. Please try again later.';
    }
  }

  setProfile(profile: FinancialProfile): void {
    this.profile = profile;
  }

  getProfile(): FinancialProfile | null {
    return this.profile;
  }
}

export default new AIFinancialAdvisorService();

