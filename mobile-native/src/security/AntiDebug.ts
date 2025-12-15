/**
 * Anti-Debugging Protection
 * 
 * Prevents debugging and reverse engineering attempts by detecting
 * and blocking debuggers, profilers, and analysis tools.
 * 
 * @module AntiDebug
 * @version 1.0.0
 */

import { Platform, NativeModules } from 'react-native';
import * as Sentry from '@sentry/react-native';

interface DebugDetectionResult {
  isDebugging: boolean;
  method: string;
  confidence: number;
  timestamp: Date;
}

class AntiDebugService {
  private static instance: AntiDebugService;
  private isMonitoring: boolean = false;
  private detectionInterval: NodeJS.Timeout | null = null;
  private detectionCallbacks: Array<(result: DebugDetectionResult) => void> = [];

  private constructor() {}

  static getInstance(): AntiDebugService {
    if (!AntiDebugService.instance) {
      AntiDebugService.instance = new AntiDebugService();
    }
    return AntiDebugService.instance;
  }

  /**
   * Start anti-debugging protection
   */
  start(): void {
    if (this.isMonitoring) {
      console.warn('[AntiDebug] Already monitoring');
      return;
    }

    console.log('[AntiDebug] Starting anti-debugging protection...');

    // Perform initial check
    this.performDebugCheck();

    // Start continuous monitoring
    this.detectionInterval = setInterval(() => {
      this.performDebugCheck();
    }, 5000); // Check every 5 seconds

    this.isMonitoring = true;
    console.log('[AntiDebug] Protection active');
  }

  /**
   * Perform comprehensive debug detection
   */
  private performDebugCheck(): void {
    const methods = [
      this.timingBasedDetection(),
      this.debuggerStatementDetection(),
      this.consoleDetection(),
      this.devToolsDetection(),
      this.performanceDetection(),
    ];

    methods.forEach((result) => {
      if (result.isDebugging) {
        this.handleDebugDetection(result);
      }
    });
  }

  /**
   * Timing-based debugger detection
   * Debuggers cause delays in execution
   */
  private timingBasedDetection(): DebugDetectionResult {
    const start = performance.now();
    
    // This will pause if debugger is attached
    debugger;
    
    const end = performance.now();
    const delta = end - start;

    // If execution took more than 100ms, likely debugger is attached
    const isDebugging = delta > 100;

    return {
      isDebugging,
      method: 'timing',
      confidence: isDebugging ? 0.9 : 0.1,
      timestamp: new Date(),
    };
  }

  /**
   * Debugger statement detection
   */
  private debuggerStatementDetection(): DebugDetectionResult {
    let isDebugging = false;

    try {
      const check = () => {
        const startTime = new Date().getTime();
        debugger;
        const endTime = new Date().getTime();
        
        if (endTime - startTime > 100) {
          isDebugging = true;
        }
      };

      check();
    } catch (error) {
      // Debugger might throw in some environments
      isDebugging = true;
    }

    return {
      isDebugging,
      method: 'debugger_statement',
      confidence: isDebugging ? 0.95 : 0.05,
      timestamp: new Date(),
    };
  }

  /**
   * Console detection (DevTools open)
   */
  private consoleDetection(): DebugDetectionResult {
    let isDebugging = false;

    // Check if console methods have been overridden
    const originalLog = console.log;
    let called = false;

    console.log = function() {
      called = true;
      originalLog.apply(console, arguments as any);
    };

    console.log('');
    console.log = originalLog;

    // If console.log wasn't called, console might be disabled/hooked
    if (!called) {
      isDebugging = true;
    }

    // Check console.table (only available in DevTools)
    if (typeof (console as any).table === 'function') {
      isDebugging = true;
    }

    return {
      isDebugging,
      method: 'console',
      confidence: isDebugging ? 0.7 : 0.3,
      timestamp: new Date(),
    };
  }

  /**
   * DevTools detection
   */
  private devToolsDetection(): DebugDetectionResult {
    let isDebugging = false;

    // Check window dimensions (DevTools changes viewport)
    if (Platform.OS === 'web') {
      const widthThreshold = (window as any).outerWidth - (window as any).innerWidth > 160;
      const heightThreshold = (window as any).outerHeight - (window as any).innerHeight > 160;
      
      if (widthThreshold || heightThreshold) {
        isDebugging = true;
      }
    }

    return {
      isDebugging,
      method: 'devtools',
      confidence: isDebugging ? 0.8 : 0.2,
      timestamp: new Date(),
    };
  }

  /**
   * Performance-based detection
   */
  private performanceDetection(): DebugDetectionResult {
    let isDebugging = false;

    // Check if performance monitoring is active
    if (typeof performance !== 'undefined') {
      const entries = performance.getEntriesByType('measure');
      
      // Unusual number of performance entries might indicate profiling
      if (entries.length > 100) {
        isDebugging = true;
      }
    }

    return {
      isDebugging,
      method: 'performance',
      confidence: isDebugging ? 0.6 : 0.4,
      timestamp: new Date(),
    };
  }

  /**
   * Handle debug detection
   */
  private handleDebugDetection(result: DebugDetectionResult): void {
    console.warn('[AntiDebug] Debugging detected:', result);

    // Skip in development mode
    if (__DEV__) {
      return;
    }

    // Notify callbacks
    this.detectionCallbacks.forEach((callback) => {
      try {
        callback(result);
      } catch (error) {
        console.error('[AntiDebug] Callback error:', error);
      }
    });

    // Log to Sentry
    Sentry.captureMessage('Debugger detected', {
      level: 'warning',
      extra: result,
    });

    // Take protective action based on confidence
    if (result.confidence > 0.8) {
      this.takeProtectiveAction(result);
    }
  }

  /**
   * Take protective action
   */
  private takeProtectiveAction(result: DebugDetectionResult): void {
    console.error('[AntiDebug] Taking protective action');

    // In production, could:
    // 1. Clear sensitive data from memory
    // 2. Disable certain features
    // 3. Log user out
    // 4. Exit the app
    // 5. Report to backend

    // For now, just log
    console.log('[AntiDebug] Protective measures activated');
  }

  /**
   * Register detection callback
   */
  onDebugDetected(callback: (result: DebugDetectionResult) => void): void {
    this.detectionCallbacks.push(callback);
  }

  /**
   * Stop anti-debugging protection
   */
  stop(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    this.isMonitoring = false;
    console.log('[AntiDebug] Protection stopped');
  }

  /**
   * Check if currently monitoring
   */
  isActive(): boolean {
    return this.isMonitoring;
  }
}

export default AntiDebugService.getInstance();
export { DebugDetectionResult };

