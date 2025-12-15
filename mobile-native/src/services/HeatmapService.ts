import ApiService from './ApiService';
import AnalyticsEngineService from './AnalyticsEngineService';

export interface HeatmapData {
  screenName: string;
  clicks: ClickPoint[];
  scrollDepth: ScrollData[];
  attentionTime: AttentionData[];
  generatedAt: Date;
}

export interface ClickPoint {
  x: number;
  y: number;
  elementId?: string;
  elementType?: string;
  timestamp: Date;
  userId?: string;
  sessionId: string;
}

export interface ScrollData {
  depth: number; // 0-100 percentage
  reachedCount: number;
  averageTimeToReach: number;
}

export interface AttentionData {
  elementId: string;
  totalViewTime: number;
  viewCount: number;
  averageViewTime: number;
}

export interface InteractionEvent {
  screenName: string;
  eventType: 'tap' | 'long_press' | 'swipe' | 'scroll';
  coordinates: { x: number; y: number };
  elementId?: string;
  elementType?: string;
  timestamp: Date;
}

class HeatmapService {
  private interactionQueue: InteractionEvent[] = [];
  private screenDimensions: { width: number; height: number } = { width: 375, height: 812 };
  private currentScreen: string = '';
  private screenStartTime: Date = new Date();

  setScreenDimensions(width: number, height: number): void {
    this.screenDimensions = { width, height };
  }

  setCurrentScreen(screenName: string): void {
    if (this.currentScreen !== screenName) {
      this.flushInteractions();
      this.currentScreen = screenName;
      this.screenStartTime = new Date();
    }
  }

  async trackTap(
    x: number,
    y: number,
    elementId?: string,
    elementType?: string
  ): Promise<void> {
    const event: InteractionEvent = {
      screenName: this.currentScreen,
      eventType: 'tap',
      coordinates: this.normalizeCoordinates(x, y),
      elementId,
      elementType,
      timestamp: new Date(),
    };

    this.interactionQueue.push(event);

    // Track in analytics
    await AnalyticsEngineService.trackEvent('ui_tap', 'button_click', {
      screenName: this.currentScreen,
      elementId,
      elementType,
      x: event.coordinates.x,
      y: event.coordinates.y,
    });

    // Auto-flush if queue is large
    if (this.interactionQueue.length >= 20) {
      await this.flushInteractions();
    }
  }

  async trackLongPress(
    x: number,
    y: number,
    elementId?: string,
    elementType?: string
  ): Promise<void> {
    const event: InteractionEvent = {
      screenName: this.currentScreen,
      eventType: 'long_press',
      coordinates: this.normalizeCoordinates(x, y),
      elementId,
      elementType,
      timestamp: new Date(),
    };

    this.interactionQueue.push(event);

    await AnalyticsEngineService.trackEvent('ui_long_press', 'button_click', {
      screenName: this.currentScreen,
      elementId,
      elementType,
    });
  }

  async trackSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<void> {
    const event: InteractionEvent = {
      screenName: this.currentScreen,
      eventType: 'swipe',
      coordinates: this.normalizeCoordinates(startX, startY),
      timestamp: new Date(),
    };

    this.interactionQueue.push(event);

    await AnalyticsEngineService.trackEvent('ui_swipe', 'custom', {
      screenName: this.currentScreen,
      direction: this.getSwipeDirection(startX, startY, endX, endY),
    });
  }

  async trackScroll(scrollY: number, maxScrollY: number): Promise<void> {
    const scrollDepth = (scrollY / maxScrollY) * 100;

    const event: InteractionEvent = {
      screenName: this.currentScreen,
      eventType: 'scroll',
      coordinates: { x: 0, y: scrollDepth },
      timestamp: new Date(),
    };

    this.interactionQueue.push(event);

    // Track scroll milestones
    if (scrollDepth >= 25 && scrollDepth < 50) {
      await AnalyticsEngineService.trackEvent('scroll_25', 'custom', {
        screenName: this.currentScreen,
      });
    } else if (scrollDepth >= 50 && scrollDepth < 75) {
      await AnalyticsEngineService.trackEvent('scroll_50', 'custom', {
        screenName: this.currentScreen,
      });
    } else if (scrollDepth >= 75 && scrollDepth < 100) {
      await AnalyticsEngineService.trackEvent('scroll_75', 'custom', {
        screenName: this.currentScreen,
      });
    } else if (scrollDepth >= 100) {
      await AnalyticsEngineService.trackEvent('scroll_100', 'custom', {
        screenName: this.currentScreen,
      });
    }
  }

  private normalizeCoordinates(x: number, y: number): { x: number; y: number } {
    // Normalize to 0-1 range for device-independent storage
    return {
      x: x / this.screenDimensions.width,
      y: y / this.screenDimensions.height,
    };
  }

  private getSwipeDirection(startX: number, startY: number, endX: number, endY: number): string {
    const deltaX = endX - startX;
    const deltaY = endY - startY;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX > 0 ? 'right' : 'left';
    } else {
      return deltaY > 0 ? 'down' : 'up';
    }
  }

  private async flushInteractions(): Promise<void> {
    if (this.interactionQueue.length === 0) {
      return;
    }

    const interactions = [...this.interactionQueue];
    this.interactionQueue = [];

    try {
      // Send to middleware for Lakehouse storage
      await ApiService.post('/analytics/heatmap/interactions', {
        interactions,
        sessionId: AnalyticsEngineService.getSessionId(),
        userId: AnalyticsEngineService.getUserId(),
        deviceId: AnalyticsEngineService.getDeviceId(),
      });

      console.log(`Flushed ${interactions.length} interaction events`);
    } catch (error) {
      console.error('Failed to flush interactions:', error);
      // Re-add to queue for retry
      this.interactionQueue.unshift(...interactions);
    }
  }

  async getHeatmapData(screenName: string, startDate: Date, endDate: Date): Promise<HeatmapData | null> {
    try {
      const response = await ApiService.get('/analytics/heatmap', {
        params: {
          screenName,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });

      return {
        ...response.data,
        generatedAt: new Date(response.data.generatedAt),
      };
    } catch (error) {
      console.error('Failed to get heatmap data:', error);
      return null;
    }
  }

  async getClickDensity(screenName: string): Promise<ClickPoint[]> {
    try {
      const response = await ApiService.get(`/analytics/heatmap/${screenName}/clicks`);
      return response.data.clicks.map((click: any) => ({
        ...click,
        timestamp: new Date(click.timestamp),
      }));
    } catch (error) {
      console.error('Failed to get click density:', error);
      return [];
    }
  }

  async getScrollDepthAnalytics(screenName: string): Promise<ScrollData[]> {
    try {
      const response = await ApiService.get(`/analytics/heatmap/${screenName}/scroll`);
      return response.data.scrollData;
    } catch (error) {
      console.error('Failed to get scroll depth analytics:', error);
      return [];
    }
  }

  async getAttentionAnalytics(screenName: string): Promise<AttentionData[]> {
    try {
      const response = await ApiService.get(`/analytics/heatmap/${screenName}/attention`);
      return response.data.attentionData;
    } catch (error) {
      console.error('Failed to get attention analytics:', error);
      return [];
    }
  }

  async getMostClickedElements(screenName: string, limit: number = 10): Promise<{
    elementId: string;
    elementType: string;
    clickCount: number;
  }[]> {
    try {
      const response = await ApiService.get(`/analytics/heatmap/${screenName}/top-elements`, {
        params: { limit },
      });
      return response.data.elements;
    } catch (error) {
      console.error('Failed to get most clicked elements:', error);
      return [];
    }
  }

  async cleanup(): Promise<void> {
    await this.flushInteractions();
  }

  getCurrentScreen(): string {
    return this.currentScreen;
  }

  getQueueSize(): number {
    return this.interactionQueue.length;
  }
}

export default new HeatmapService();

