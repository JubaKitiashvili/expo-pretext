import { describe, test, expect, mock } from 'bun:test'
import {
  textStyleToFontDescriptor,
  resolveFontFamily,
  getFontKey,
  getLineHeight,
  validateFont,
} from '../font-utils'
import type { TextStyle } from '../types'

describe('font-utils', () => {
  const baseStyle: TextStyle = {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    fontStyle: 'italic',
  }

  describe('textStyleToFontDescriptor', () => {
    test('converts full style', () => {
      const desc = textStyleToFontDescriptor(baseStyle)
      expect(desc).toEqual({
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: '700',
        fontStyle: 'italic',
      })
    })

    test('handles minimal style', () => {
      const desc = textStyleToFontDescriptor({ fontFamily: 'Arial', fontSize: 14 })
      expect(desc).toEqual({
        fontFamily: 'Arial',
        fontSize: 14,
        fontWeight: undefined,
        fontStyle: undefined,
      })
    })

    test('uses System when fontFamily is omitted', () => {
      const desc = textStyleToFontDescriptor({ fontSize: 14 })
      expect(desc.fontFamily).toBe('System')
      expect(desc.fontSize).toBe(14)
    })
  })

  describe('resolveFontFamily', () => {
    test('uses System for missing or empty families', () => {
      expect(resolveFontFamily(undefined)).toBe('System')
      expect(resolveFontFamily(null)).toBe('System')
      expect(resolveFontFamily([])).toBe('System')
    })

    test('treats non-array defensive input as System instead of throwing', () => {
      expect(resolveFontFamily(42 as unknown as string[])).toBe('System')
    })
  })

  describe('validateFont', () => {
    test('accepts missing or non-array defensive input', () => {
      expect(validateFont(undefined)).toBe(true)
      expect(validateFont(null)).toBe(true)
      expect(validateFont(42 as unknown as string[])).toBe(true)
    })

    test('checks string font families through expo-font instead of defensive non-array fallback', () => {
      mock.module('expo-font', () => ({
        isLoaded: (family: string) => family === 'LoadedCustomFont',
      }))

      expect(validateFont('MissingCustomFont')).toBe(false)
      expect(validateFont('LoadedCustomFont')).toBe(true)
      expect(validateFont(['MissingCustomFont', 'LoadedCustomFont'])).toBe(true)
    })
  })

  describe('getFontKey', () => {
    test('full style produces correct key', () => {
      expect(getFontKey(baseStyle)).toBe('Inter_16_700_italic_0')
    })

    test('minimal style uses defaults', () => {
      expect(getFontKey({ fontFamily: 'Arial', fontSize: 14 })).toBe('Arial_14_400_normal_0')
    })

    test('letterSpacing changes the key', () => {
      const a = getFontKey({ fontFamily: 'Inter', fontSize: 16 })
      const b = getFontKey({ fontFamily: 'Inter', fontSize: 16, letterSpacing: 2 })
      expect(a).not.toBe(b)
      expect(b).toBe('Inter_16_400_normal_2')
    })

    test('different weights produce different keys', () => {
      const light = getFontKey({ fontFamily: 'Inter', fontSize: 16, fontWeight: '400' })
      const bold = getFontKey({ fontFamily: 'Inter', fontSize: 16, fontWeight: '700' })
      expect(light).not.toBe(bold)
    })
  })

  describe('getLineHeight', () => {
    test('returns explicit lineHeight', () => {
      expect(getLineHeight(baseStyle)).toBe(24)
    })

    test('falls back to fontSize * 1.2', () => {
      expect(getLineHeight({ fontFamily: 'Inter', fontSize: 20 })).toBe(24)
    })

    test('falls back correctly for small font', () => {
      expect(getLineHeight({ fontFamily: 'Inter', fontSize: 10 })).toBe(12)
    })
  })
})
