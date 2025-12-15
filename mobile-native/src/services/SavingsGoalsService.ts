import ApiService from './ApiService';
import * as Notifications from 'expo-notifications';

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: Date;
  category: 'emergency' | 'vacation' | 'home' | 'car' | 'education' | 'retirement' | 'other';
  priority: 'low' | 'medium' | 'high';
  automationEnabled: boolean;
  imageUrl?: string;
}

export interface AutomationRule {
  id: string;
  goalId: string;
  enabled: boolean;
  type: 'fixed' | 'percentage' | 'roundup' | 'smart';
  fixedAmount?: number;
  percentage?: number;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  conditions?: {
    minBalance?: number;
    maxTransfer?: number;
    skipIfLowBalance?: boolean;
  };
}

export interface GoalContribution {
  id: string;
  goalId: string;
  amount: number;
  date: Date;
  type: 'manual' | 'automatic' | 'roundup';
  source: string;
}

class SavingsGoalsService {
  private goals: SavingsGoal[] = [];
  private automationRules: Map<string, AutomationRule> = new Map();

  async loadGoals(): Promise<SavingsGoal[]> {
    try {
      const response = await ApiService.get('/savings/goals');
      this.goals = response.data.goals.map((goal: any) => ({
        ...goal,
        deadline: new Date(goal.deadline),
      }));
      return this.goals;
    } catch (error) {
      console.error('Error loading goals:', error);
      return [];
    }
  }

  async createGoal(goal: Omit<SavingsGoal, 'id' | 'currentAmount'>): Promise<SavingsGoal> {
    try {
      const response = await ApiService.post('/savings/goals', goal);
      const newGoal: SavingsGoal = {
        ...response.data.goal,
        deadline: new Date(response.data.goal.deadline),
        currentAmount: 0,
      };
      this.goals.push(newGoal);

      // Schedule milestone notifications
      await this.scheduleMilestoneNotifications(newGoal);

      return newGoal;
    } catch (error) {
      console.error('Error creating goal:', error);
      throw error;
    }
  }

  async updateGoal(goalId: string, updates: Partial<SavingsGoal>): Promise<SavingsGoal> {
    try {
      const response = await ApiService.put(`/savings/goals/${goalId}`, updates);
      const updatedGoal: SavingsGoal = {
        ...response.data.goal,
        deadline: new Date(response.data.goal.deadline),
      };

      const index = this.goals.findIndex((g) => g.id === goalId);
      if (index !== -1) {
        this.goals[index] = updatedGoal;
      }

      return updatedGoal;
    } catch (error) {
      console.error('Error updating goal:', error);
      throw error;
    }
  }

  async deleteGoal(goalId: string): Promise<void> {
    try {
      await ApiService.delete(`/savings/goals/${goalId}`);
      this.goals = this.goals.filter((g) => g.id !== goalId);
      this.automationRules.delete(goalId);
    } catch (error) {
      console.error('Error deleting goal:', error);
      throw error;
    }
  }

  async contributeToGoal(goalId: string, amount: number): Promise<GoalContribution> {
    try {
      const response = await ApiService.post(`/savings/goals/${goalId}/contribute`, { amount });

      const contribution: GoalContribution = {
        id: response.data.contributionId,
        goalId,
        amount,
        date: new Date(),
        type: 'manual',
        source: 'checking',
      };

      // Update goal current amount
      const goal = this.goals.find((g) => g.id === goalId);
      if (goal) {
        goal.currentAmount += amount;

        // Check if goal is reached
        if (goal.currentAmount >= goal.targetAmount) {
          await this.notifyGoalReached(goal);
        }
      }

      return contribution;
    } catch (error) {
      console.error('Error contributing to goal:', error);
      throw error;
    }
  }

  async enableAutomation(goalId: string, rule: Omit<AutomationRule, 'id' | 'goalId'>): Promise<AutomationRule> {
    try {
      const response = await ApiService.post(`/savings/goals/${goalId}/automation/enable`, rule);

      const automationRule: AutomationRule = {
        id: response.data.ruleId,
        goalId,
        ...rule,
      };

      this.automationRules.set(goalId, automationRule);

      // Update goal
      await this.updateGoal(goalId, { automationEnabled: true });

      return automationRule;
    } catch (error) {
      console.error('Error enabling automation:', error);
      throw error;
    }
  }

  async disableAutomation(goalId: string): Promise<void> {
    try {
      await ApiService.post(`/savings/goals/${goalId}/automation/disable`);
      this.automationRules.delete(goalId);
      await this.updateGoal(goalId, { automationEnabled: false });
    } catch (error) {
      console.error('Error disabling automation:', error);
      throw error;
    }
  }

  async updateAutomationRule(goalId: string, updates: Partial<AutomationRule>): Promise<AutomationRule> {
    try {
      const response = await ApiService.put(`/savings/goals/${goalId}/automation`, updates);

      const updatedRule: AutomationRule = {
        ...response.data.rule,
      };

      this.automationRules.set(goalId, updatedRule);

      return updatedRule;
    } catch (error) {
      console.error('Error updating automation rule:', error);
      throw error;
    }
  }

  async enableRoundupSavings(goalId: string): Promise<void> {
    await this.enableAutomation(goalId, {
      enabled: true,
      type: 'roundup',
      frequency: 'daily',
    });
  }

  async enableSmartSavings(goalId: string): Promise<void> {
    // Smart savings analyzes spending patterns and saves when possible
    await this.enableAutomation(goalId, {
      enabled: true,
      type: 'smart',
      frequency: 'daily',
      conditions: {
        minBalance: 500, // Keep at least $500 in checking
        maxTransfer: 50, // Max $50 per transfer
        skipIfLowBalance: true,
      },
    });
  }

  async getContributionHistory(goalId: string, limit: number = 50): Promise<GoalContribution[]> {
    try {
      const response = await ApiService.get(`/savings/goals/${goalId}/contributions?limit=${limit}`);
      return response.data.contributions.map((contribution: any) => ({
        ...contribution,
        date: new Date(contribution.date),
      }));
    } catch (error) {
      console.error('Error fetching contribution history:', error);
      return [];
    }
  }

  async getGoalProgress(goalId: string): Promise<{
    percentage: number;
    remaining: number;
    daysLeft: number;
    onTrack: boolean;
    recommendedMonthlyContribution: number;
  }> {
    const goal = this.goals.find((g) => g.id === goalId);
    if (!goal) {
      throw new Error('Goal not found');
    }

    const percentage = (goal.currentAmount / goal.targetAmount) * 100;
    const remaining = goal.targetAmount - goal.currentAmount;
    const now = new Date();
    const daysLeft = Math.ceil((goal.deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const monthsLeft = daysLeft / 30;

    const recommendedMonthlyContribution = monthsLeft > 0 ? remaining / monthsLeft : remaining;

    // Check if on track
    const expectedProgress = ((now.getTime() - now.getTime()) / (goal.deadline.getTime() - now.getTime())) * 100;
    const onTrack = percentage >= expectedProgress;

    return {
      percentage,
      remaining,
      daysLeft,
      onTrack,
      recommendedMonthlyContribution,
    };
  }

  async getGoalsByPriority(priority: 'low' | 'medium' | 'high'): Promise<SavingsGoal[]> {
    return this.goals.filter((goal) => goal.priority === priority);
  }

  async getGoalsByCategory(category: SavingsGoal['category']): Promise<SavingsGoal[]> {
    return this.goals.filter((goal) => goal.category === category);
  }

  async getTotalSavings(): Promise<number> {
    return this.goals.reduce((total, goal) => total + goal.currentAmount, 0);
  }

  async getMonthlyContributions(month?: number, year?: number): Promise<number> {
    const now = new Date();
    const targetMonth = month !== undefined ? month : now.getMonth();
    const targetYear = year !== undefined ? year : now.getFullYear();

    try {
      const response = await ApiService.get(`/savings/contributions/monthly?month=${targetMonth}&year=${targetYear}`);
      return response.data.total;
    } catch (error) {
      console.error('Error fetching monthly contributions:', error);
      return 0;
    }
  }

  private async scheduleMilestoneNotifications(goal: SavingsGoal): Promise<void> {
    const milestones = [0.25, 0.5, 0.75, 1.0];

    for (const milestone of milestones) {
      const milestoneAmount = goal.targetAmount * milestone;

      // This would be triggered by backend when milestone is reached
      console.log(`Milestone notification scheduled for ${milestone * 100}% of ${goal.name}`);
    }
  }

  private async notifyGoalReached(goal: SavingsGoal): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎉 Goal Reached!',
        body: `Congratulations! You've reached your ${goal.name} goal of $${goal.targetAmount.toFixed(2)}`,
        data: { goalId: goal.id },
      },
      trigger: null, // Immediate
    });
  }

  getAutomationRule(goalId: string): AutomationRule | undefined {
    return this.automationRules.get(goalId);
  }

  getAllGoals(): SavingsGoal[] {
    return this.goals;
  }

  getGoalById(goalId: string): SavingsGoal | undefined {
    return this.goals.find((g) => g.id === goalId);
  }

  async calculateOptimalSavings(): Promise<{
    recommendedMonthly: number;
    breakdown: { goalId: string; amount: number }[];
  }> {
    // Calculate optimal savings distribution across all goals
    const highPriorityGoals = this.goals.filter((g) => g.priority === 'high');
    const mediumPriorityGoals = this.goals.filter((g) => g.priority === 'medium');
    const lowPriorityGoals = this.goals.filter((g) => g.priority === 'low');

    const breakdown: { goalId: string; amount: number }[] = [];
    let totalRecommended = 0;

    // Allocate 60% to high priority
    for (const goal of highPriorityGoals) {
      const progress = await this.getGoalProgress(goal.id);
      const amount = progress.recommendedMonthlyContribution * 0.6;
      breakdown.push({ goalId: goal.id, amount });
      totalRecommended += amount;
    }

    // Allocate 30% to medium priority
    for (const goal of mediumPriorityGoals) {
      const progress = await this.getGoalProgress(goal.id);
      const amount = progress.recommendedMonthlyContribution * 0.3;
      breakdown.push({ goalId: goal.id, amount });
      totalRecommended += amount;
    }

    // Allocate 10% to low priority
    for (const goal of lowPriorityGoals) {
      const progress = await this.getGoalProgress(goal.id);
      const amount = progress.recommendedMonthlyContribution * 0.1;
      breakdown.push({ goalId: goal.id, amount });
      totalRecommended += amount;
    }

    return {
      recommendedMonthly: totalRecommended,
      breakdown,
    };
  }
}

export default new SavingsGoalsService();

