import { useEffect, useRef } from 'react';

export interface MemoryLeakReport {
  leaksDetected: number;
  leakTypes: string[];
  totalMemoryFreed: number;
  recommendations: string[];
}

class MemoryLeakPreventionService {
  private activeTimers: Set<NodeJS.Timeout> = new Set();
  private activeIntervals: Set<NodeJS.Timeout> = new Set();
  private activeListeners: Map<string, any[]> = new Map();
  private activeSubscriptions: Set<() => void> = new Set();
  private componentRegistry: Map<string, Set<any>> = new Map();

  /**
   * Register timer for automatic cleanup
   */
  setTimeout(callback: () => void, delay: number, componentId?: string): NodeJS.Timeout {
    const timer = setTimeout(() => {
      callback();
      this.activeTimers.delete(timer);
    }, delay);

    this.activeTimers.add(timer);

    if (componentId) {
      this.registerComponentResource(componentId, 'timer', timer);
    }

    return timer;
  }

  /**
   * Register interval for automatic cleanup
   */
  setInterval(callback: () => void, delay: number, componentId?: string): NodeJS.Timeout {
    const interval = setInterval(callback, delay);
    this.activeIntervals.add(interval);

    if (componentId) {
      this.registerComponentResource(componentId, 'interval', interval);
    }

    return interval;
  }

  /**
   * Clear timer and remove from tracking
   */
  clearTimeout(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    this.activeTimers.delete(timer);
  }

  /**
   * Clear interval and remove from tracking
   */
  clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.activeIntervals.delete(interval);
  }

  /**
   * Register event listener for automatic cleanup
   */
  addEventListener(
    target: any,
    event: string,
    handler: any,
    componentId?: string
  ): void {
    const key = `${event}_${componentId || 'global'}`;
    const listeners = this.activeListeners.get(key) || [];
    listeners.push({ target, event, handler });
    this.activeListeners.set(key, listeners);

    if (componentId) {
      this.registerComponentResource(componentId, 'listener', { target, event, handler });
    }

    target.addEventListener(event, handler);
  }

  /**
   * Remove event listener and cleanup
   */
  removeEventListener(target: any, event: string, handler: any, componentId?: string): void {
    const key = `${event}_${componentId || 'global'}`;
    const listeners = this.activeListeners.get(key) || [];
    const index = listeners.findIndex(
      (l) => l.target === target && l.event === event && l.handler === handler
    );

    if (index > -1) {
      listeners.splice(index, 1);
      this.activeListeners.set(key, listeners);
    }

    target.removeEventListener(event, handler);
  }

  /**
   * Register subscription for automatic cleanup
   */
  registerSubscription(unsubscribe: () => void, componentId?: string): void {
    this.activeSubscriptions.add(unsubscribe);

    if (componentId) {
      this.registerComponentResource(componentId, 'subscription', unsubscribe);
    }
  }

  /**
   * Unsubscribe and cleanup
   */
  unsubscribe(unsubscribe: () => void): void {
    unsubscribe();
    this.activeSubscriptions.delete(unsubscribe);
  }

  /**
   * Register component resource for tracking
   */
  private registerComponentResource(componentId: string, type: string, resource: any): void {
    const resources = this.componentRegistry.get(componentId) || new Set();
    resources.add({ type, resource });
    this.componentRegistry.set(componentId, resources);
  }

  /**
   * Cleanup all resources for a component
   */
  cleanupComponent(componentId: string): void {
    const resources = this.componentRegistry.get(componentId);
    if (!resources) return;

    resources.forEach((item: any) => {
      switch (item.type) {
        case 'timer':
          this.clearTimeout(item.resource);
          break;
        case 'interval':
          this.clearInterval(item.resource);
          break;
        case 'listener':
          this.removeEventListener(
            item.resource.target,
            item.resource.event,
            item.resource.handler
          );
          break;
        case 'subscription':
          this.unsubscribe(item.resource);
          break;
      }
    });

    this.componentRegistry.delete(componentId);
    console.log(`✅ Cleaned up resources for component: ${componentId}`);
  }

  /**
   * Cleanup all active resources
   */
  cleanupAll(): void {
    // Clear all timers
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers.clear();

    // Clear all intervals
    this.activeIntervals.forEach((interval) => clearInterval(interval));
    this.activeIntervals.clear();

    // Remove all event listeners
    this.activeListeners.forEach((listeners) => {
      listeners.forEach(({ target, event, handler }) => {
        target.removeEventListener(event, handler);
      });
    });
    this.activeListeners.clear();

    // Unsubscribe all subscriptions
    this.activeSubscriptions.forEach((unsubscribe) => unsubscribe());
    this.activeSubscriptions.clear();

    // Clear component registry
    this.componentRegistry.clear();

    console.log('✅ All resources cleaned up');
  }

  /**
   * Detect potential memory leaks
   */
  detectLeaks(): MemoryLeakReport {
    const leaks: string[] = [];
    let leaksDetected = 0;

    // Check for excessive timers
    if (this.activeTimers.size > 50) {
      leaks.push(`Excessive timers: ${this.activeTimers.size}`);
      leaksDetected++;
    }

    // Check for excessive intervals
    if (this.activeIntervals.size > 20) {
      leaks.push(`Excessive intervals: ${this.activeIntervals.size}`);
      leaksDetected++;
    }

    // Check for excessive listeners
    if (this.activeListeners.size > 100) {
      leaks.push(`Excessive event listeners: ${this.activeListeners.size}`);
      leaksDetected++;
    }

    // Check for excessive subscriptions
    if (this.activeSubscriptions.size > 50) {
      leaks.push(`Excessive subscriptions: ${this.activeSubscriptions.size}`);
      leaksDetected++;
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (leaksDetected > 0) {
      recommendations.push('Clean up unused timers and intervals');
      recommendations.push('Remove event listeners when components unmount');
      recommendations.push('Unsubscribe from observables and subscriptions');
      recommendations.push('Use useEffect cleanup functions in React components');
    }

    return {
      leaksDetected,
      leakTypes: leaks,
      totalMemoryFreed: 0,
      recommendations,
    };
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    activeTimers: number;
    activeIntervals: number;
    activeListeners: number;
    activeSubscriptions: number;
    trackedComponents: number;
  } {
    return {
      activeTimers: this.activeTimers.size,
      activeIntervals: this.activeIntervals.size,
      activeListeners: this.activeListeners.size,
      activeSubscriptions: this.activeSubscriptions.size,
      trackedComponents: this.componentRegistry.size,
    };
  }

  /**
   * Force garbage collection (if available)
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
      console.log('✅ Garbage collection triggered');
    } else {
      console.log('⚠️ Garbage collection not available');
    }
  }
}

export default new MemoryLeakPreventionService();

/**
 * React Hook for automatic cleanup
 */
export function useCleanup(componentId: string) {
  useEffect(() => {
    return () => {
      MemoryLeakPreventionService.cleanupComponent(componentId);
    };
  }, [componentId]);
}

/**
 * React Hook for safe timeout
 */
export function useSafeTimeout(
  callback: () => void,
  delay: number,
  componentId: string
): void {
  useEffect(() => {
    const timer = MemoryLeakPreventionService.setTimeout(callback, delay, componentId);
    return () => {
      MemoryLeakPreventionService.clearTimeout(timer);
    };
  }, [callback, delay, componentId]);
}

/**
 * React Hook for safe interval
 */
export function useSafeInterval(
  callback: () => void,
  delay: number,
  componentId: string
): void {
  useEffect(() => {
    const interval = MemoryLeakPreventionService.setInterval(callback, delay, componentId);
    return () => {
      MemoryLeakPreventionService.clearInterval(interval);
    };
  }, [callback, delay, componentId]);
}

/**
 * React Hook for safe event listener
 */
export function useSafeEventListener(
  target: any,
  event: string,
  handler: any,
  componentId: string
): void {
  useEffect(() => {
    MemoryLeakPreventionService.addEventListener(target, event, handler, componentId);
    return () => {
      MemoryLeakPreventionService.removeEventListener(target, event, handler, componentId);
    };
  }, [target, event, handler, componentId]);
}

/**
 * React Hook for safe subscription
 */
export function useSafeSubscription(
  subscribe: () => () => void,
  componentId: string
): void {
  useEffect(() => {
    const unsubscribe = subscribe();
    MemoryLeakPreventionService.registerSubscription(unsubscribe, componentId);
    return () => {
      MemoryLeakPreventionService.unsubscribe(unsubscribe);
    };
  }, [subscribe, componentId]);
}

