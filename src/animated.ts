// src/animated.ts
// Separate entry point for Reanimated-powered hooks.
// Import from 'expo-pretext/animated' to use these.
// Requires react-native-reanimated >= 3.0.0 as peer dependency.

export { useAnimatedTextHeight } from './hooks/useAnimatedTextHeight'
export type { HeightAnimationConfig } from './hooks/useAnimatedTextHeight'
export { useCollapsibleHeight } from './hooks/useCollapsibleHeight'
export type { CollapsibleHeightResult } from './hooks/useCollapsibleHeight'
export { usePinchToZoomText } from './hooks/usePinchToZoomText'
export type { PinchToZoomResult } from './hooks/usePinchToZoomText'
