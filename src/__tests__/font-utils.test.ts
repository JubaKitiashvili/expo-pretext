import { describe, test, expect } from 'bun:test'
import {
  textStyleToFontDescriptor,
  getFontKey,
  getLineHeight,
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
