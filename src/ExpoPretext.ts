// src/ExpoPretext.ts
// JS binding to the native Expo module.
// On web: uses Canvas + Intl.Segmenter backend.
// On native: uses iOS/Android Expo module.

import { NativeModule, requireNativeModule } from 'expo-modules-core'
import { Platform } from 'react-native'
import type { FontDescriptor, InkBounds, InkMeasurementDebug, NativeSegmentResult } from './types'

type MeasureNativeOptions = {
  whiteSpace?: string
  locale?: string
}

export interface ExpoPretextNativeModule extends InstanceType<typeof NativeModule> {
  segmentAndMeasure(
    text: string,
    font: FontDescriptor,
    options?: MeasureNativeOptions
  ): NativeSegmentResult

  batchSegmentAndMeasure(
    texts: string[],
    font: FontDescriptor,
    options?: MeasureNativeOptions
  ): NativeSegmentResult[]

  measureGraphemeWidths(
    segment: string,
    font: FontDescriptor
  ): number[]

  remeasureMerged(
    segments: string[],
    font: FontDescriptor
  ): number[]

  segmentAndMeasureAsync(
    text: string,
    font: FontDescriptor,
    options?: MeasureNativeOptions
  ): Promise<NativeSegmentResult>

  measureTextHeight(
    text: string,
    font: FontDescriptor,
    maxWidth: number,
    lineHeight: number
  ): { height: number; lineCount: number }

  clearNativeCache(): void

  setNativeCacheSize(size: number): void

  measureInkWidth(
    text: string,
    font: FontDescriptor
  ): number

  measureInkBounds(
    text: string,
    font: FontDescriptor
  ): InkBounds

  measureInkSafe?(
    text: string,
    font: FontDescriptor
  ): {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
    advance: number
    ascender: number
    descender: number
  }

  measureInkDebug?(
    text: string,
    font: FontDescriptor
  ): InkMeasurementDebug

  logDebugMessage?(
    message: string
  ): void

  getFontMetrics(
    font: FontDescriptor
  ): { ascender: number; descender: number; xHeight: number; capHeight: number; lineGap: number }
}

let cachedModule: ExpoPretextNativeModule | null | undefined = undefined

function getWebBackend(): ExpoPretextNativeModule {
  const { createWebBackend } = require('./web-backend') as typeof import('./web-backend')
  return createWebBackend() as unknown as ExpoPretextNativeModule
}

export function getNativeModule(): ExpoPretextNativeModule | null {
  if (cachedModule !== undefined) return cachedModule

  // Web: use Canvas + Intl.Segmenter backend
  if (Platform.OS === 'web') {
    try {
      cachedModule = getWebBackend()
      return cachedModule
    } catch {
      cachedModule = null
      return null
    }
  }

  // Native: use Expo module
  try {
    cachedModule = requireNativeModule<ExpoPretextNativeModule>('ExpoPretext')
    return cachedModule
  } catch {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[expo-pretext] Native module not available. ' +
        'Using JS estimates. Use a development build for accurate measurements.'
      )
    }
    cachedModule = null
    return null
  }
}
