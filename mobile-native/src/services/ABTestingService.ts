import ApiService from './ApiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AnalyticsEngineService from './AnalyticsEngineService';

export interface Experiment {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  variants: Variant[];
  targetingRules?: TargetingRule[];
  startDate: Date;
  endDate?: Date;
  metrics: string[];
}

export interface Variant {
  id: string;
  name: string;
  weight: number;
  config: Record<string, any>;
  isControl: boolean;
}

export interface TargetingRule {
  type: 'user_property' | 'device' | 'location' | 'custom';
  property: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: any;
}

export interface Assignment {
  experimentId: string;
  variantId: string;
  assignedAt: Date;
  userId?: string;
  deviceId: string;
}

class ABTestingService {
  private experiments: Map<string, Experiment> = new Map();
  private assignments: Map<string, Assignment> = new Map();
  private remoteConfig: Map<string, any> = new Map();

  async initialize(): Promise<void> {
    // Load experiments from middleware
    await this.loadExperiments();
    
    // Load assignments from local storage
    await this.loadAssignments();
    
    // Load remote config
    await this.loadRemoteConfig();
  }

  private async loadExperiments(): Promise<void> {
    try {
      const response = await ApiService.get('/experiments/active');
      const experiments: Experiment[] = response.data.experiments;

      experiments.forEach(exp => {
        this.experiments.set(exp.id, {
          ...exp,
          startDate: new Date(exp.startDate),
          endDate: exp.endDate ? new Date(exp.endDate) : undefined,
        });
      });

      console.log(`Loaded ${experiments.length} active experiments`);
    } catch (error) {
      console.error('Failed to load experiments:', error);
    }
  }

  private async loadAssignments(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('ab_test_assignments');
      if (stored) {
        const assignments: Assignment[] = JSON.parse(stored);
        assignments.forEach(assignment => {
          this.assignments.set(assignment.experimentId, {
            ...assignment,
            assignedAt: new Date(assignment.assignedAt),
          });
        });
      }
    } catch (error) {
      console.error('Failed to load assignments:', error);
    }
  }

  private async saveAssignments(): Promise<void> {
    try {
      const assignments = Array.from(this.assignments.values());
      await AsyncStorage.setItem('ab_test_assignments', JSON.stringify(assignments));
    } catch (error) {
      console.error('Failed to save assignments:', error);
    }
  }

  private async loadRemoteConfig(): Promise<void> {
    try {
      const response = await ApiService.get('/config/remote');
      const config = response.data.config;

      Object.entries(config).forEach(([key, value]) => {
        this.remoteConfig.set(key, value);
      });

      console.log(`Loaded ${this.remoteConfig.size} remote config values`);
    } catch (error) {
      console.error('Failed to load remote config:', error);
    }
  }

  async getVariant(experimentId: string): Promise<Variant | null> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      return null;
    }

    // Check if already assigned
    let assignment = this.assignments.get(experimentId);
    if (assignment) {
      const variant = experiment.variants.find(v => v.id === assignment!.variantId);
      return variant || null;
    }

    // Check targeting rules
    if (experiment.targetingRules && experiment.targetingRules.length > 0) {
      const matches = await this.evaluateTargetingRules(experiment.targetingRules);
      if (!matches) {
        return null;
      }
    }

    // Assign variant
    const variant = this.assignVariant(experiment);
    if (variant) {
      assignment = {
        experimentId,
        variantId: variant.id,
        assignedAt: new Date(),
        userId: AnalyticsEngineService.getUserId(),
        deviceId: AnalyticsEngineService.getDeviceId(),
      };

      this.assignments.set(experimentId, assignment);
      await this.saveAssignments();

      // Track assignment
      await AnalyticsEngineService.trackEvent('experiment_assigned', 'custom', {
        experimentId,
        experimentName: experiment.name,
        variantId: variant.id,
        variantName: variant.name,
        isControl: variant.isControl,
      });

      // Send to middleware for storage in Postgres
      try {
        await ApiService.post('/experiments/assignments', assignment);
      } catch (error) {
        console.error('Failed to save assignment to backend:', error);
      }
    }

    return variant;
  }

  private assignVariant(experiment: Experiment): Variant | null {
    // Weighted random selection
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;

    for (const variant of experiment.variants) {
      random -= variant.weight;
      if (random <= 0) {
        return variant;
      }
    }

    return experiment.variants[0] || null;
  }

  private async evaluateTargetingRules(rules: TargetingRule[]): Promise<boolean> {
    // All rules must match (AND logic)
    for (const rule of rules) {
      const matches = await this.evaluateRule(rule);
      if (!matches) {
        return false;
      }
    }
    return true;
  }

  private async evaluateRule(rule: TargetingRule): Promise<boolean> {
    // Implementation would check user properties, device info, etc.
    // For now, return true to allow all users
    return true;
  }

  async getConfig<T = any>(key: string, defaultValue: T): Promise<T> {
    // Check remote config first
    if (this.remoteConfig.has(key)) {
      return this.remoteConfig.get(key) as T;
    }

    // Check experiments for config overrides
    for (const [experimentId, experiment] of this.experiments) {
      const assignment = this.assignments.get(experimentId);
      if (assignment && experiment.status === 'running') {
        const variant = experiment.variants.find(v => v.id === assignment.variantId);
        if (variant && key in variant.config) {
          return variant.config[key] as T;
        }
      }
    }

    return defaultValue;
  }

  async trackConversion(experimentId: string, metricName: string, value?: number): Promise<void> {
    const assignment = this.assignments.get(experimentId);
    if (!assignment) {
      return;
    }

    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      return;
    }

    const variant = experiment.variants.find(v => v.id === assignment.variantId);
    if (!variant) {
      return;
    }

    // Track conversion event
    await AnalyticsEngineService.trackEvent('experiment_conversion', 'custom', {
      experimentId,
      experimentName: experiment.name,
      variantId: variant.id,
      variantName: variant.name,
      metricName,
      value,
      isControl: variant.isControl,
    });

    // Send to middleware for TigerBeetle financial tracking if value provided
    if (value !== undefined) {
      try {
        await ApiService.post('/experiments/conversions', {
          experimentId,
          variantId: variant.id,
          metricName,
          value,
          timestamp: new Date().toISOString(),
          userId: AnalyticsEngineService.getUserId(),
        });
      } catch (error) {
        console.error('Failed to track conversion:', error);
      }
    }
  }

  async getExperimentResults(experimentId: string): Promise<{
    variants: {
      variantId: string;
      variantName: string;
      participants: number;
      conversions: Record<string, number>;
      conversionRates: Record<string, number>;
    }[];
    winner?: string;
    confidence?: number;
  } | null> {
    try {
      const response = await ApiService.get(`/experiments/${experimentId}/results`);
      return response.data;
    } catch (error) {
      console.error('Failed to get experiment results:', error);
      return null;
    }
  }

  async refreshExperiments(): Promise<void> {
    await this.loadExperiments();
    await this.loadRemoteConfig();
  }

  getActiveExperiments(): Experiment[] {
    return Array.from(this.experiments.values()).filter(exp => exp.status === 'running');
  }

  getAssignment(experimentId: string): Assignment | undefined {
    return this.assignments.get(experimentId);
  }

  getAllAssignments(): Assignment[] {
    return Array.from(this.assignments.values());
  }

  async clearAssignments(): Promise<void> {
    this.assignments.clear();
    await AsyncStorage.removeItem('ab_test_assignments');
  }
}

export default new ABTestingService();

