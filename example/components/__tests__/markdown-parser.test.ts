import { describe, test, expect } from 'bun:test'
import { parseSpans } from '../markdown-parser'

describe('parseSpans', () => {
  test('plain text', () => {
    expect(parseSpans('hello world')).toEqual([
      { t: 'text', v: 'hello world' },
    ])
  })

  test('bold', () => {
    expect(parseSpans('say **hello** now')).toEqual([
      { t: 'text', v: 'say ' },
      { t: 'bold', v: 'hello' },
      { t: 'text', v: ' now' },
    ])
  })

  test('italic', () => {
    expect(parseSpans('say *hello* now')).toEqual([
      { t: 'text', v: 'say ' },
      { t: 'italic', v: 'hello' },
      { t: 'text', v: ' now' },
    ])
  })

  test('bolditalic', () => {
    expect(parseSpans('say ***hello*** now')).toEqual([
      { t: 'text', v: 'say ' },
      { t: 'bolditalic', v: 'hello' },
      { t: 'text', v: ' now' },
    ])
  })

  test('strikethrough', () => {
    expect(parseSpans('say ~~hello~~ now')).toEqual([
      { t: 'text', v: 'say ' },
      { t: 'strike', v: 'hello' },
      { t: 'text', v: ' now' },
    ])
  })

  test('inline code', () => {
    expect(parseSpans('use `code` here')).toEqual([
      { t: 'text', v: 'use ' },
      { t: 'code', v: 'code' },
      { t: 'text', v: ' here' },
    ])
  })

  test('link', () => {
    expect(parseSpans('see [docs](https://example.com) now')).toEqual([
      { t: 'text', v: 'see ' },
      { t: 'link', v: 'docs', url: 'https://example.com' },
      { t: 'text', v: ' now' },
    ])
  })

  test('mixed spans', () => {
    const result = parseSpans('**bold** and `code` and [link](url)')
    expect(result).toEqual([
      { t: 'bold', v: 'bold' },
      { t: 'text', v: ' and ' },
      { t: 'code', v: 'code' },
      { t: 'text', v: ' and ' },
      { t: 'link', v: 'link', url: 'url' },
    ])
  })

  test('empty string', () => {
    expect(parseSpans('')).toEqual([])
  })
})
