import type { Transition } from 'motion/react';

export const IOS_SPRING: Transition = {
  type: 'spring',
  stiffness: 350,
  damping: 32,
  mass: 0.85,
};

export const IOS_SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 430,
  damping: 34,
  mass: 0.72,
};

export const IOS_SPRING_SHEET: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 32,
  mass: 0.9,
};

export const IOS_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
