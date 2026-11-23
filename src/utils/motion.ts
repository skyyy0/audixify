import type { Transition } from 'motion/react';

export const IOS_SPRING: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 28,
  mass: 0.85,
};

export const IOS_SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 390,
  damping: 28,
  mass: 0.72,
};

export const IOS_SPRING_SHEET: Transition = {
  type: 'spring',
  stiffness: 290,
  damping: 29,
  mass: 0.88,
};

export const IOS_EASE: [number, number, number, number] = [0.22, 1.06, 0.36, 1];

