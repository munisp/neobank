/**
 * Haptic Feedback Utility
 * Provides contextual haptic feedback for all user interactions
 * World-class UX enhancement
 */

import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Platform } from 'react-native';

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export const HapticFeedback = {
  /**
   * Light impact - for subtle interactions
   * Use for: Button taps, list item selection
   */
  light: () => {
    ReactNativeHapticFeedback.trigger('impactLight', options);
  },

  /**
   * Medium impact - for standard interactions
   * Use for: Toggle switches, confirmations
   */
  medium: () => {
    ReactNativeHapticFeedback.trigger('impactMedium', options);
  },

  /**
   * Heavy impact - for significant interactions
   * Use for: Important actions, deletions
   */
  heavy: () => {
    ReactNativeHapticFeedback.trigger('impactHeavy', options);
  },

  /**
   * Success notification - for successful operations
   * Use for: Transaction complete, login success
   */
  success: () => {
    ReactNativeHapticFeedback.trigger('notificationSuccess', options);
  },

  /**
   * Warning notification - for warnings
   * Use for: Low balance, approaching limit
   */
  warning: () => {
    ReactNativeHapticFeedback.trigger('notificationWarning', options);
  },

  /**
   * Error notification - for errors
   * Use for: Failed transaction, validation error
   */
  error: () => {
    ReactNativeHapticFeedback.trigger('notificationError', options);
  },

  /**
   * Selection - for scrolling through values
   * Use for: Picker scrolling, slider movement
   */
  selection: () => {
    ReactNativeHapticFeedback.trigger('selection', options);
  },

  /**
   * Rigid impact - for rigid UI elements (iOS only)
   * Use for: Reaching limits, boundaries
   */
  rigid: () => {
    if (Platform.OS === 'ios') {
      ReactNativeHapticFeedback.trigger('rigid', options);
    } else {
      HapticFeedback.heavy();
    }
  },

  /**
   * Soft impact - for soft UI elements (iOS only)
   * Use for: Gentle feedback
   */
  soft: () => {
    if (Platform.OS === 'ios') {
      ReactNativeHapticFeedback.trigger('soft', options);
    } else {
      HapticFeedback.light();
    }
  },
};

/**
 * Haptic patterns for common scenarios
 */
export const HapticPatterns = {
  /**
   * Payment sent successfully
   */
  paymentSuccess: () => {
    HapticFeedback.light();
    setTimeout(() => HapticFeedback.success(), 100);
  },

  /**
   * Payment failed
   */
  paymentFailed: () => {
    HapticFeedback.heavy();
    setTimeout(() => HapticFeedback.error(), 100);
  },

  /**
   * Biometric authentication success
   */
  biometricSuccess: () => {
    HapticFeedback.success();
  },

  /**
   * Biometric authentication failed
   */
  biometricFailed: () => {
    HapticFeedback.error();
    setTimeout(() => HapticFeedback.error(), 200);
  },

  /**
   * Pull to refresh triggered
   */
  pullToRefresh: () => {
    HapticFeedback.light();
  },

  /**
   * Swipe action (delete, archive)
   */
  swipeAction: () => {
    HapticFeedback.medium();
  },

  /**
   * Long press detected
   */
  longPress: () => {
    HapticFeedback.medium();
  },

  /**
   * Reached scroll boundary
   */
  scrollBoundary: () => {
    HapticFeedback.rigid();
  },

  /**
   * Value changed (slider, picker)
   */
  valueChanged: () => {
    HapticFeedback.selection();
  },
};

export default HapticFeedback;

