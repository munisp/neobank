import ApiService from './ApiService';
import AnalyticsEngineService from './AnalyticsEngineService';

export interface Funnel {
  id: string;
  name: string;
  description?: string;
  steps: FunnelStep[];
  createdAt: Date;
}

export interface FunnelStep {
  id: string;
  name: string;
  eventName: string;
  order: number;
  required: boolean;
}

export interface FunnelProgress {
  funnelId: string;
  userId?: string;
  deviceId: string;
  sessionId: string;
  currentStep: number;
  completedSteps: string[];
  startedAt: Date;
  completedAt?: Date;
  abandoned: boolean;
}

export interface RevenueEvent {
  id: string;
  eventType: 'purchase' | 'subscription' | 'transaction_fee' | 'interest' | 'other';
  amount: number;
  currency: string;
  userId?: string;
  deviceId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface RevenueMetrics {
  totalRevenue: number;
  averageRevenuePerUser: number;
  lifetimeValue: number;
  conversionRate: number;
  revenueBySource: Record<string, number>;
  revenueByType: Record<string, number>;
}

class FunnelAnalyticsService {
  private funnels: Map<string, Funnel> = new Map();
  private activeFunnels: Map<string, FunnelProgress> = new Map();

  async initialize(): Promise<void> {
    await this.loadFunnels();
  }

  private async loadFunnels(): Promise<void> {
    try {
      const response = await ApiService.get('/analytics/funnels');
      const funnels: Funnel[] = response.data.funnels;

      funnels.forEach(funnel => {
        this.funnels.set(funnel.id, {
          ...funnel,
          createdAt: new Date(funnel.createdAt),
        });
      });

      console.log(`Loaded ${funnels.length} funnels`);
    } catch (error) {
      console.error('Failed to load funnels:', error);
    }
  }

  async startFunnel(funnelId: string): Promise<void> {
    const funnel = this.funnels.get(funnelId);
    if (!funnel) {
      console.error(`Funnel ${funnelId} not found`);
      return;
    }

    const progress: FunnelProgress = {
      funnelId,
      userId: AnalyticsEngineService.getUserId(),
      deviceId: AnalyticsEngineService.getDeviceId(),
      sessionId: AnalyticsEngineService.getSessionId(),
      currentStep: 0,
      completedSteps: [],
      startedAt: new Date(),
      abandoned: false,
    };

    this.activeFunnels.set(funnelId, progress);

    // Track funnel start
    await AnalyticsEngineService.trackEvent('funnel_started', 'custom', {
      funnelId,
      funnelName: funnel.name,
    });

    // Send to middleware for Postgres storage
    try {
      await ApiService.post('/analytics/funnels/progress', progress);
    } catch (error) {
      console.error('Failed to save funnel progress:', error);
    }
  }

  async trackFunnelStep(funnelId: string, stepId: string): Promise<void> {
    const funnel = this.funnels.get(funnelId);
    const progress = this.activeFunnels.get(funnelId);

    if (!funnel || !progress) {
      return;
    }

    const step = funnel.steps.find(s => s.id === stepId);
    if (!step) {
      return;
    }

    // Update progress
    if (!progress.completedSteps.includes(stepId)) {
      progress.completedSteps.push(stepId);
      progress.currentStep = step.order;
    }

    // Check if funnel is completed
    const allStepsCompleted = funnel.steps.every(s => 
      progress.completedSteps.includes(s.id)
    );

    if (allStepsCompleted) {
      progress.completedAt = new Date();
      progress.abandoned = false;

      // Track funnel completion
      await AnalyticsEngineService.trackEvent('funnel_completed', 'custom', {
        funnelId,
        funnelName: funnel.name,
        duration: (progress.completedAt.getTime() - progress.startedAt.getTime()) / 1000,
      });

      this.activeFunnels.delete(funnelId);
    } else {
      // Track step completion
      await AnalyticsEngineService.trackEvent('funnel_step_completed', 'custom', {
        funnelId,
        funnelName: funnel.name,
        stepId,
        stepName: step.name,
        stepOrder: step.order,
      });
    }

    // Update in backend
    try {
      await ApiService.put(`/analytics/funnels/progress/${funnelId}`, progress);
    } catch (error) {
      console.error('Failed to update funnel progress:', error);
    }
  }

  async abandonFunnel(funnelId: string): Promise<void> {
    const progress = this.activeFunnels.get(funnelId);
    if (!progress) {
      return;
    }

    progress.abandoned = true;

    // Track abandonment
    await AnalyticsEngineService.trackEvent('funnel_abandoned', 'custom', {
      funnelId,
      currentStep: progress.currentStep,
      completedSteps: progress.completedSteps.length,
    });

    // Update in backend
    try {
      await ApiService.put(`/analytics/funnels/progress/${funnelId}`, progress);
    } catch (error) {
      console.error('Failed to update funnel progress:', error);
    }

    this.activeFunnels.delete(funnelId);
  }

  async getFunnelAnalytics(funnelId: string): Promise<{
    totalStarted: number;
    totalCompleted: number;
    totalAbandoned: number;
    conversionRate: number;
    averageDuration: number;
    stepConversion: { stepId: string; stepName: string; conversionRate: number }[];
  } | null> {
    try {
      const response = await ApiService.get(`/analytics/funnels/${funnelId}/analytics`);
      return response.data;
    } catch (error) {
      console.error('Failed to get funnel analytics:', error);
      return null;
    }
  }

  async trackRevenue(
    eventType: RevenueEvent['eventType'],
    amount: number,
    currency: string = 'USD',
    metadata?: Record<string, any>
  ): Promise<void> {
    const revenueEvent: RevenueEvent = {
      id: `revenue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      eventType,
      amount,
      currency,
      userId: AnalyticsEngineService.getUserId(),
      deviceId: AnalyticsEngineService.getDeviceId(),
      timestamp: new Date(),
      metadata,
    };

    // Track in analytics
    await AnalyticsEngineService.trackEvent('revenue', 'transaction', {
      eventType,
      amount,
      currency,
      ...metadata,
    });

    // Send to middleware for TigerBeetle financial tracking
    try {
      await ApiService.post('/analytics/revenue', revenueEvent);
    } catch (error) {
      console.error('Failed to track revenue:', error);
    }
  }

  async trackPurchase(
    productId: string,
    productName: string,
    amount: number,
    currency: string = 'USD'
  ): Promise<void> {
    await this.trackRevenue('purchase', amount, currency, {
      productId,
      productName,
    });
  }

  async trackSubscription(
    planId: string,
    planName: string,
    amount: number,
    currency: string = 'USD',
    billingPeriod: 'monthly' | 'yearly'
  ): Promise<void> {
    await this.trackRevenue('subscription', amount, currency, {
      planId,
      planName,
      billingPeriod,
    });
  }

  async trackTransactionFee(
    transactionId: string,
    transactionType: string,
    feeAmount: number,
    currency: string = 'USD'
  ): Promise<void> {
    await this.trackRevenue('transaction_fee', feeAmount, currency, {
      transactionId,
      transactionType,
    });
  }

  async getRevenueMetrics(startDate: Date, endDate: Date): Promise<RevenueMetrics | null> {
    try {
      const response = await ApiService.get('/analytics/revenue/metrics', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
      return response.data;
    } catch (error) {
      console.error('Failed to get revenue metrics:', error);
      return null;
    }
  }

  async getLifetimeValue(userId?: string): Promise<number> {
    try {
      const targetUserId = userId || AnalyticsEngineService.getUserId();
      if (!targetUserId) {
        return 0;
      }

      const response = await ApiService.get(`/analytics/revenue/ltv/${targetUserId}`);
      return response.data.lifetimeValue;
    } catch (error) {
      console.error('Failed to get lifetime value:', error);
      return 0;
    }
  }

  async getConversionRate(funnelId: string): Promise<number> {
    const analytics = await this.getFunnelAnalytics(funnelId);
    return analytics?.conversionRate || 0;
  }

  getFunnels(): Funnel[] {
    return Array.from(this.funnels.values());
  }

  getActiveFunnels(): FunnelProgress[] {
    return Array.from(this.activeFunnels.values());
  }

  async refreshFunnels(): Promise<void> {
    await this.loadFunnels();
  }
}

export default new FunnelAnalyticsService();

