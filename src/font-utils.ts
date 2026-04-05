// src/font-utils.ts
import type { TextStyle, FontDescriptor } from './types'

export function textStyleToFontDescriptor(style: TextStyle): FontDescriptor {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
  }
}

export function getFontKey(style: TextStyle): string {
  const weight = style.fontWeight ?? '400'
  const fStyle = style.fontStyle ?? 'normal'
  return `${style.fontFamily}_${style.fontSize}_${weight}_${fStyle}`
}

export function getLineHeight(style: TextStyle): number {
  return style.lineHeight ?? style.fontSize * 1.2
}

const SYSTEM_FONTS = [
  'System', 'system', 'sans-serif', 'serif', 'monospace',
  // iOS built-in fonts
  'Helvetica', 'Helvetica Neue', 'Arial', 'Courier', 'Courier New',
  'Georgia', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  'American Typewriter', 'Avenir', 'Avenir Next', 'Baskerville',
  'Didot', 'Futura', 'Gill Sans', 'Menlo', 'Optima', 'Palatino',
]

export function isFontLoaded(fontFamily: string): boolean {
  // System fonts are always available
  if (SYSTEM_FONTS.includes(fontFamily)) return true
  try {
    const Font = require('expo-font')
    return Font.isLoaded(fontFamily)
  } catch {
    return true
  }
}

export function warnIfFontNotLoaded(style: TextStyle): void {
  if (__DEV__ && !isFontLoaded(style.fontFamily)) {
    console.warn(
      `[expo-pretext] Font "${style.fontFamily}" not loaded. ` +
      `Heights will be inaccurate. Use Font.loadAsync() first.`
    )
  }
}
