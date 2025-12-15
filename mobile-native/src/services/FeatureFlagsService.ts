import ApiService from './ApiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AnalyticsEngineService from './AnalyticsEngineService';

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetingRules?: TargetingRule[];
  variants?: FlagVariant[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FlagVariant {
  id: string;
  name: string;
  value: any;
  weight: number;
}

export interface TargetingRule {
  type: 'user_id' | 'device_id' | 'user_property' | 'device_property' | 'location';
  property?: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'in' | 'not_in';
  value: any;
}

class FeatureFlagsService {
  private flags: Map<string, FeatureFlag> = new Map();
  private evaluationCache: Map<string, boolean> = new Map();
  private variantCache: Map<string, any> = new Map();

  async initialize(): Promise<void> {
    // Load flags from middleware
    await this.loadFlags();
    
    // Load cached evaluations
    await this.loadCache();
  }

  private async loadFlags(): Promise<void> {
    try {
      const response = await ApiService.get('/feature-flags');
      const flags: FeatureFlag[] = response.data.flags;

      flags.forEach(flag => {
        this.flags.set(flag.name, {
          ...flag,
          createdAt: new Date(flag.createdAt),
          updatedAt: new Date(flag.updatedAt),
        });
      });

      console.log(`Loaded ${flags.length} feature flags`);
    } catch (error) {
      console.error('Failed to load feature flags:', error);
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const cached = await AsyncStorage.getItem('feature_flags_cache');
      if (cached) {
        const data = JSON.parse(cached);
        Object.entries(data.evaluations || {}).forEach(([key, value]) => {
          this.evaluationCache.set(key, value as boolean);
        });
        Object.entries(data.variants || {}).forEach(([key, value]) => {
          this.variantCache.set(key, value);
        });
      }
    } catch (error) {
      console.error('Failed to load feature flags cache:', error);
    }
  }

  private async saveCache(): Promise<void> {
    try {
      const data = {
        evaluations: Object.fromEntries(this.evaluationCache),
        variants: Object.fromEntries(this.variantCache),
      };
      await AsyncStorage.setItem('feature_flags_cache', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save feature flags cache:', error);
    }
  }

  async isEnabled(flagName: string): Promise<boolean> {
    // Check cache first
    if (this.evaluationCache.has(flagName)) {
      return this.evaluationCache.get(flagName)!;
    }

    const flag = this.flags.get(flagName);
    if (!flag) {
      // Flag doesn't exist, default to false
      return false;
    }

    if (!flag.enabled) {
      // Flag is disabled globally
      this.evaluationCache.set(flagName, false);
      await this.saveCache();
      return false;
    }

    // Check targeting rules
    if (flag.targetingRules && flag.targetingRules.length > 0) {
      const matches = await this.evaluateTargetingRules(flag.targetingRules);
      if (!matches) {
        this.evaluationCache.set(flagName, false);
        await this.saveCache();
        return false;
      }
    }

    // Check rollout percentage
    const isInRollout = await this.isInRollout(flag);
    this.evaluationCache.set(flagName, isInRollout);
    await this.saveCache();

    // Track flag evaluation
    await AnalyticsEngineService.trackEvent('feature_flag_evaluated', 'custom', {
      flagName,
      enabled: isInRollout,
      rolloutPercentage: flag.rolloutPercentage,
    });

    return isInRollout;
  }

  private async isInRollout(flag: FeatureFlag): Promise<boolean> {
    if (flag.rolloutPercentage >= 100) {
      return true;
    }

    if (flag.rolloutPercentage <= 0) {
      return false;
    }

    // Consistent hashing based on user/device ID
    const userId = AnalyticsEngineService.getUserId();
    const deviceId = AnalyticsEngineService.getDeviceId();
    const identifier = userId || deviceId;

    const hash = this.hashString(identifier + flag.name);
    const bucket = hash % 100;

    return bucket < flag.rolloutPercentage;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
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
    const userId = AnalyticsEngineService.getUserId();
    const deviceId = AnalyticsEngineService.getDeviceId();

    switch (rule.type) {
      case 'user_id':
        return this.evaluateOperator(userId, rule.operator, rule.value);
      case 'device_id':
        return this.evaluateOperator(deviceId, rule.operator, rule.value);
      default:
        return true;
    }
  }

  private evaluateOperator(actual: any, operator: TargetingRule['operator'], expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'contains':
        return String(actual).includes(String(expected));
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      default:
        return false;
    }
  }

  async getVariant(flagName: string): Promise<any> {
    // Check cache first
    if (this.variantCache.has(flagName)) {
      return this.variantCache.get(flagName);
    }

    const flag = this.flags.get(flagName);
    if (!flag || !flag.variants || flag.variants.length === 0) {
      return null;
    }

    // Check if flag is enabled first
    const isEnabled = await this.isEnabled(flagName);
    if (!isEnabled) {
      return null;
    }

    // Weighted random selection
    const totalWeight = flag.variants.reduce((sum, v) => sum + v.weight, 0);
    const userId = AnalyticsEngineService.getUserId();
    const deviceId = AnalyticsEngineService.getDeviceId();
    const identifier = userId || deviceId;
    
    const hash = this.hashString(identifier + flagName);
    const bucket = hash % totalWeight;

    let currentWeight = 0;
    for (const variant of flag.variants) {
      currentWeight += variant.weight;
      if (bucket < currentWeight) {
        this.variantCache.set(flagName, variant.value);
        await this.saveCache();

        // Track variant assignment
        await AnalyticsEngineService.trackEvent('feature_flag_variant', 'custom', {
          flagName,
          variantId: variant.id,
          variantName: variant.name,
        });

        return variant.value;
      }
    }

    return flag.variants[0]?.value || null;
  }

  async refreshFlags(): Promise<void> {
    await this.loadFlags();
    // Clear caches to force re-evaluation
    this.evaluationCache.clear();
    this.variantCache.clear();
    await this.saveCache();
  }

  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  getFlag(flagName: string): FeatureFlag | undefined {
    return this.flags.get(flagName);
  }

  clearCache(): void {
    this.evaluationCache.clear();
    this.variantCache.clear();
    AsyncStorage.removeItem('feature_flags_cache');
  }
}

export default new FeatureFlagsService();

