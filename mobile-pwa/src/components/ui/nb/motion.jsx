/**
 * NeoBank motion system — spring-physics primitives, haptics, and
 * shared motion presets. The "last 10%" layer that makes the design
 * system feel alive. Every animation honors prefers-reduced-motion.
 *
 * Usage:
 *   import { Pressable, Stagger, StaggerItem, SheetMotion, SuccessCheck, useHaptics, SPRING } from '../components/ui/nb';
 */
import React, { useCallback } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';

/** Spring presets tuned for a financial app: fast, confident, never bouncy-silly. */
export const SPRING = {
  snappy: { type: 'spring', stiffness: 500, damping: 35, mass: 0.8 },
  gentle: { type: 'spring', stiffness: 260, damping: 26 },
  bouncy: { type: 'spring', stiffness: 400, damping: 22 },
};

/** Haptic feedback via the Vibration API (no-op where unsupported). */
export const useHaptics = () => {
  const fire = useCallback((pattern) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* haptics unsupported */ }
  }, []);
  return {
    tap: () => fire(8),
    confirm: () => fire([10, 30, 10]),
    success: () => fire([12, 40, 12]),
    error: () => fire(60),
  };
};

/** Page-level enter/exit transition. */
export const MotionPage = ({ children, className }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -8 }}
      transition={SPRING.gentle}
    >
      {children}
    </motion.div>
  );
};

/**
 * Pressable — spring scale-down on tap + light haptic. Use in place of
 * <button> for cards, tiles, and tappable rows. Forwards all other props.
 */
export const Pressable = ({ children, onClick, className, haptic = true, ...rest }) => {
  const reduce = useReducedMotion();
  const haptics = useHaptics();
  return (
    <motion.button
      type="button"
      className={className}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={SPRING.snappy}
      onClick={(e) => { if (haptic) haptics.tap(); onClick && onClick(e); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (haptic) haptics.tap(); onClick && onClick(e); } }}
      {...rest}
    >
      {children}
    </motion.button>
  );
};

/** Staggered list entrance: wrap items in <StaggerItem>. */
export const Stagger = ({ children, className, delay = 0 }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: reduce ? 0 : 0.05, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
};

export const StaggerItem = ({ children, className }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? {} : { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: SPRING.gentle },
      }}
    >
      {children}
    </motion.div>
  );
};

/**
 * SheetMotion — bottom-sheet spring entrance with drag-to-dismiss.
 * Dismisses on a >120px drag or a fast flick (velocity > 600).
 */
export const SheetMotion = ({ children, onDismiss, className, ...rest }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      {...rest}
      initial={reduce ? { opacity: 0 } : { y: '100%' }}
      animate={reduce ? { opacity: 1 } : { y: 0 }}
      exit={reduce ? { opacity: 0 } : { y: '100%' }}
      transition={SPRING.bouncy}
      drag={reduce ? false : 'y'}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.6 }}
      onDragEnd={(e, info) => {
        if (info.offset.y > 120 || info.velocity.y > 600) onDismiss && onDismiss();
      }}
    >
      {children}
    </motion.div>
  );
};

/** SuccessCheck — animated checkmark draw + success haptic on mount. */
export const SuccessCheck = ({ size = 56, className }) => {
  const reduce = useReducedMotion();
  const haptics = useHaptics();
  React.useEffect(() => { haptics.success(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 52 52" className={className}
      initial={reduce ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={SPRING.bouncy}
    >
      <motion.circle
        cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3"
        className="text-success-500"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      <motion.path
        d="M15 27l7 7 15-16" fill="none" stroke="currentColor" strokeWidth="4"
        strokeLinecap="round" strokeLinejoin="round" className="text-success-600"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, delay: reduce ? 0 : 0.35, ease: 'easeOut' }}
      />
    </motion.svg>
  );
};

export { AnimatePresence };
