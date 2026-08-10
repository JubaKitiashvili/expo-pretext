// Test environment setup: mock native dependencies so the layout
// engine tests can run in bun without a React Native runtime.
import { mock } from 'bun:test'

// Components are stubbed as inert identifiers rather than real renderers:
// nothing here mounts a tree, but importing the package entry pulls in
// src/components/*, so the names have to resolve.
const Component = (): null => null

mock.module('react-native', () => ({
  Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios ?? obj.default },
  PixelRatio: { getFontScale: () => 1.0 },
  AccessibilityInfo: { addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { addEventListener: () => ({ remove: () => {} }) },
  NativeModules: {},
  NativeEventEmitter: class {},
  StyleSheet: { create: <T,>(styles: T): T => styles, flatten: (s: unknown) => s, hairlineWidth: 1, absoluteFill: {} },
  Text: Component,
  View: Component,
  Animated: { Text: Component, View: Component, Value: class {}, timing: () => ({ start: () => {} }) },
  I18nManager: { isRTL: false },
  findNodeHandle: () => null,
  UIManager: {},
}))

mock.module('expo-modules-core', () => ({
  NativeModule: class {},
  requireNativeModule: () => null,
}))
