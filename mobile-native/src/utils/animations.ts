/**
 * Animation Utilities
 * Micro-animations and transitions for world-class UX
 * Revolut-style fluid animations
 */

import { Animated, Easing } from 'react-native';

export const Animations = {
  /**
   * Fade in animation
   */
  fadeIn: (value: Animated.Value, duration = 300) => {
    return Animated.timing(value, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
  },

  /**
   * Fade out animation
   */
  fadeOut: (value: Animated.Value, duration = 300) => {
    return Animated.timing(value, {
      toValue: 0,
      duration,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
  },

  /**
   * Slide up animation (from bottom)
   */
  slideUp: (value: Animated.Value, duration = 400) => {
    return Animated.spring(value, {
      toValue: 0,
      tension: 65,
      friction: 10,
      useNativeDriver: true,
    });
  },

  /**
   * Slide down animation (to bottom)
   */
  slideDown: (value: Animated.Value, toValue: number, duration = 400) => {
    return Animated.spring(value, {
      toValue,
      tension: 65,
      friction: 10,
      useNativeDriver: true,
    });
  },

  /**
   * Scale in animation
   */
  scaleIn: (value: Animated.Value, duration = 250) => {
    return Animated.spring(value, {
      toValue: 1,
      tension: 100,
      friction: 7,
      useNativeDriver: true,
    });
  },

  /**
   * Scale out animation
   */
  scaleOut: (value: Animated.Value, duration = 250) => {
    return Animated.spring(value, {
      toValue: 0,
      tension: 100,
      friction: 7,
      useNativeDriver: true,
    });
  },

  /**
   * Bounce animation
   */
  bounce: (value: Animated.Value) => {
    return Animated.sequence([
      Animated.spring(value, {
        toValue: 1.2,
        tension: 100,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.spring(value, {
        toValue: 1,
        tension: 100,
        friction: 7,
        useNativeDriver: true,
      }),
    ]);
  },

  /**
   * Shake animation (for errors)
   */
  shake: (value: Animated.Value) => {
    return Animated.sequence([
      Animated.timing(value, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]);
  },

  /**
   * Pulse animation (for notifications)
   */
  pulse: (value: Animated.Value) => {
    return Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1.1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
  },

  /**
   * Rotate animation
   */
  rotate: (value: Animated.Value, duration = 1000) => {
    return Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
  },

  /**
   * Number count-up animation
   */
  countUp: (value: Animated.Value, toValue: number, duration = 1000) => {
    return Animated.timing(value, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // Can't use native driver for non-transform values
    });
  },
};

/**
 * Complex animation sequences
 */
export const AnimationSequences = {
  /**
   * Card flip animation
   */
  cardFlip: (frontValue: Animated.Value, backValue: Animated.Value) => {
    return Animated.sequence([
      Animated.timing(frontValue, {
        toValue: 90,
        duration: 150,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(backValue, {
        toValue: 0,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]);
  },

  /**
   * Success checkmark animation
   */
  successCheckmark: (scaleValue: Animated.Value, opacityValue: Animated.Value) => {
    return Animated.parallel([
      Animated.spring(scaleValue, {
        toValue: 1,
        tension: 80,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(opacityValue, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);
  },

  /**
   * Stagger animation for list items
   */
  staggerList: (values: Animated.Value[], delay = 50) => {
    return Animated.stagger(
      delay,
      values.map(value =>
        Animated.spring(value, {
          toValue: 1,
          tension: 80,
          friction: 10,
          useNativeDriver: true,
        })
      )
    );
  },

  /**
   * Loading shimmer animation
   */
  shimmer: (value: Animated.Value) => {
    return Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
  },
};

/**
 * Interpolation helpers
 */
export const Interpolations = {
  /**
   * Rotate interpolation (0 to 360 degrees)
   */
  rotate: (value: Animated.Value) => {
    return value.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });
  },

  /**
   * Flip interpolation (0 to 180 degrees)
   */
  flip: (value: Animated.Value) => {
    return value.interpolate({
      inputRange: [0, 90, 180],
      outputRange: ['0deg', '90deg', '180deg'],
    });
  },

  /**
   * Shimmer gradient interpolation
   */
  shimmer: (value: Animated.Value, width: number) => {
    return value.interpolate({
      inputRange: [0, 1],
      outputRange: [-width, width],
    });
  },
};

export default Animations;

