import React, { useRef } from 'react';
import { View, StyleSheet, Animated, PanResponder } from 'react-native';
import * as Haptics from 'expo-haptics';

interface GestureControlsProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  swipeThreshold?: number;
}

export default function GestureControls({
  children,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  onDoubleTap,
  onLongPress,
  swipeThreshold = 50,
}: GestureControlsProps) {
  const pan = useRef(new Animated.ValueXY()).current;
  const lastTap = useRef<number>(0);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 5 || Math.abs(dy) > 5;
      },

      onPanResponderGrant: () => {
        // Handle long press
        if (onLongPress) {
          longPressTimer.current = setTimeout(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onLongPress();
          }, 500);
        }

        // Handle double tap
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;
        
        if (lastTap.current && now - lastTap.current < DOUBLE_TAP_DELAY) {
          if (onDoubleTap) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onDoubleTap();
          }
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
      },

      onPanResponderMove: (_, gestureState) => {
        // Clear long press timer if user moves
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }

        Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        })(_, gestureState);
      },

      onPanResponderRelease: (_, gestureState) => {
        // Clear long press timer
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }

        const { dx, dy } = gestureState;

        // Detect swipe direction
        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal swipe
          if (Math.abs(dx) > swipeThreshold) {
            if (dx > 0 && onSwipeRight) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSwipeRight();
            } else if (dx < 0 && onSwipeLeft) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSwipeLeft();
            }
          }
        } else {
          // Vertical swipe
          if (Math.abs(dy) > swipeThreshold) {
            if (dy > 0 && onSwipeDown) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSwipeDown();
            } else if (dy < 0 && onSwipeUp) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSwipeUp();
            }
          }
        }

        // Reset position
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[styles.container, { transform: pan.getTranslateTransform() }]}
      {...panResponder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

