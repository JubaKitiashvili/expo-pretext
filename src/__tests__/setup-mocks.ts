// Test environment setup: mock native dependencies so the layout
// engine tests can run in bun without a React Native runtime.
import { mock } from 'bun:test'

mock.module('react-native', () => ({
  Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios ?? obj.default },
  NativeModules: {},
  NativeEventEmitter: class {},
}))

mock.module('expo-modules-core', () => ({
  NativeModule: class {},
  requireNativeModule: () => null,
}))
