import { AccessibilityInfo, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

export interface AccessibilityPreferences {
  screenReaderEnabled: boolean;
  highContrastMode: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  voiceGuidance: boolean;
  textToSpeechRate: number; // 0.5 to 2.0
  fontSize: 'small' | 'medium' | 'large' | 'extra-large';
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
}

class AccessibilityService {
  private preferences: AccessibilityPreferences = {
    screenReaderEnabled: false,
    highContrastMode: false,
    largeText: false,
    reducedMotion: false,
    voiceGuidance: false,
    textToSpeechRate: 1.0,
    fontSize: 'medium',
    colorBlindMode: 'none',
  };

  private screenReaderChangeListener: any = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadPreferences();
    await this.detectSystemSettings();
    this.setupListeners();
  }

  private async detectSystemSettings() {
    try {
      // Check if screen reader is enabled
      const screenReaderEnabled = await AccessibilityInfo.isScreenReaderEnabled();
      if (screenReaderEnabled !== this.preferences.screenReaderEnabled) {
        this.preferences.screenReaderEnabled = screenReaderEnabled;
      }

      // Check if reduced motion is enabled (iOS only)
      if (Platform.OS === 'ios') {
        const reducedMotionEnabled = await AccessibilityInfo.isReduceMotionEnabled();
        if (reducedMotionEnabled !== this.preferences.reducedMotion) {
          this.preferences.reducedMotion = reducedMotionEnabled;
        }
      }
    } catch (error) {
      console.error('Error detecting system accessibility settings:', error);
    }
  }

  private setupListeners() {
    // Listen for screen reader changes
    this.screenReaderChangeListener = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (isEnabled: boolean) => {
        this.preferences.screenReaderEnabled = isEnabled;
        this.savePreferences();
      }
    );

    // Listen for reduced motion changes (iOS)
    if (Platform.OS === 'ios') {
      AccessibilityInfo.addEventListener('reduceMotionChanged', (isEnabled: boolean) => {
        this.preferences.reducedMotion = isEnabled;
        this.savePreferences();
      });
    }
  }

  async announceForAccessibility(message: string): Promise<void> {
    if (this.preferences.screenReaderEnabled) {
      AccessibilityInfo.announceForAccessibility(message);
    } else if (this.preferences.voiceGuidance) {
      await this.speak(message);
    }
  }

  async speak(text: string, options?: { rate?: number; pitch?: number }): Promise<void> {
    if (!this.preferences.voiceGuidance && !this.preferences.screenReaderEnabled) {
      return;
    }

    const rate = options?.rate || this.preferences.textToSpeechRate;
    const pitch = options?.pitch || 1.0;

    await Speech.speak(text, {
      rate,
      pitch,
      language: 'en-US',
    });
  }

  async stopSpeaking(): Promise<void> {
    await Speech.stop();
  }

  async updatePreferences(updates: Partial<AccessibilityPreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...updates };
    await this.savePreferences();
  }

  private async savePreferences(): Promise<void> {
    try {
      await AsyncStorage.setItem('accessibility_preferences', JSON.stringify(this.preferences));
    } catch (error) {
      console.error('Error saving accessibility preferences:', error);
    }
  }

  private async loadPreferences(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('accessibility_preferences');
      if (stored) {
        this.preferences = { ...this.preferences, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Error loading accessibility preferences:', error);
    }
  }

  getPreferences(): AccessibilityPreferences {
    return { ...this.preferences };
  }

  getFontSize(): number {
    const fontSizeMap = {
      small: 14,
      medium: 16,
      large: 18,
      'extra-large': 22,
    };
    return fontSizeMap[this.preferences.fontSize];
  }

  getScaleFactor(): number {
    const scaleMap = {
      small: 0.875,
      medium: 1.0,
      large: 1.125,
      'extra-large': 1.375,
    };
    return scaleMap[this.preferences.fontSize];
  }

  getColorFilter(): string | null {
    if (!this.preferences.colorBlindMode || this.preferences.colorBlindMode === 'none') {
      return null;
    }

    // SVG filters for color blindness simulation
    const filters = {
      protanopia: 'url(#protanopia)',
      deuteranopia: 'url(#deuteranopia)',
      tritanopia: 'url(#tritanopia)',
    };

    return filters[this.preferences.colorBlindMode];
  }

  getContrastColors(): { background: string; text: string } {
    if (this.preferences.highContrastMode) {
      return {
        background: '#000000',
        text: '#FFFFFF',
      };
    }
    return {
      background: '#FFFFFF',
      text: '#000000',
    };
  }

  shouldReduceMotion(): boolean {
    return this.preferences.reducedMotion;
  }

  isScreenReaderEnabled(): boolean {
    return this.preferences.screenReaderEnabled;
  }

  isVoiceGuidanceEnabled(): boolean {
    return this.preferences.voiceGuidance;
  }

  getAccessibleLabel(element: string, value?: string | number): string {
    const labels: Record<string, string> = {
      balance: `Total balance: ${value ? `$${value}` : 'loading'}`,
      transaction: `Transaction: ${value || 'details'}`,
      button: `Button: ${value || 'action'}`,
      input: `Input field: ${value || 'enter text'}`,
      link: `Link: ${value || 'navigate'}`,
      image: `Image: ${value || 'visual content'}`,
      alert: `Alert: ${value || 'notification'}`,
    };

    return labels[element] || `${element}: ${value || ''}`;
  }

  getAccessibleHint(action: string): string {
    const hints: Record<string, string> = {
      tap: 'Double tap to activate',
      swipe: 'Swipe left or right to navigate',
      longPress: 'Long press for options',
      scroll: 'Swipe up or down to scroll',
      input: 'Double tap to edit',
      dismiss: 'Swipe right to dismiss',
    };

    return hints[action] || 'Interact to perform action';
  }

  cleanup(): void {
    if (this.screenReaderChangeListener) {
      this.screenReaderChangeListener.remove();
    }
    this.stopSpeaking();
  }
}

export default new AccessibilityService();

