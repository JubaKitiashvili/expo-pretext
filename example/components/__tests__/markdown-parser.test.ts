import { describe, test, expect } from 'bun:test'
import { parseSpans, parseMarkdown, estimateBlocksHeight, blocksToPlainText } from '../markdown-parser'

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

describe('parseMarkdown — basic blocks', () => {
  test('single paragraph', () => {
    expect(parseMarkdown('hello world')).toEqual([
      { type: 'paragraph', spans: [{ t: 'text', v: 'hello world' }] },
    ])
  })

  test('two paragraphs separated by blank line', () => {
    const result = parseMarkdown('first\n\nsecond')
    expect(result).toHaveLength(2)
    expect(result[0]!.type).toBe('paragraph')
    expect(result[1]!.type).toBe('paragraph')
  })

  test('multi-line paragraph joined', () => {
    const result = parseMarkdown('line one\nline two')
    expect(result).toEqual([
      { type: 'paragraph', spans: [{ t: 'text', v: 'line one line two' }] },
    ])
  })

  test('heading levels', () => {
    expect(parseMarkdown('# Title')[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(parseMarkdown('## Sub')[0]).toMatchObject({ type: 'heading', level: 2 })
    expect(parseMarkdown('### Small')[0]).toMatchObject({ type: 'heading', level: 3 })
  })

  test('heading with inline formatting', () => {
    const result = parseMarkdown('## Hello **world**')
    expect(result[0]).toMatchObject({
      type: 'heading',
      level: 2,
      spans: [
        { t: 'text', v: 'Hello ' },
        { t: 'bold', v: 'world' },
      ],
    })
  })

  test('code fence', () => {
    const result = parseMarkdown('```ts\nconst x = 1\n```')
    expect(result[0]).toEqual({ type: 'code', lang: 'ts', text: 'const x = 1' })
  })

  test('code fence without language', () => {
    const result = parseMarkdown('```\nhello\n```')
    expect(result[0]).toEqual({ type: 'code', lang: '', text: 'hello' })
  })

  test('code fence multiline', () => {
    const result = parseMarkdown('```js\na\nb\nc\n```')
    expect(result[0]).toEqual({ type: 'code', lang: 'js', text: 'a\nb\nc' })
  })

  test('horizontal rule', () => {
    expect(parseMarkdown('---')[0]).toEqual({ type: 'rule' })
    expect(parseMarkdown('-----')[0]).toEqual({ type: 'rule' })
  })

  test('mixed blocks', () => {
    const md = '# Title\n\nSome text.\n\n```ts\ncode\n```\n\n---'
    const result = parseMarkdown(md)
    expect(result).toHaveLength(4)
    expect(result[0]!.type).toBe('heading')
    expect(result[1]!.type).toBe('paragraph')
    expect(result[2]!.type).toBe('code')
    expect(result[3]!.type).toBe('rule')
  })
})

describe('parseMarkdown — blockquotes', () => {
  test('simple blockquote', () => {
    const result = parseMarkdown('> hello world')
    expect(result[0]).toMatchObject({
      type: 'quote',
      blocks: [{ type: 'paragraph', spans: [{ t: 'text', v: 'hello world' }] }],
    })
  })

  test('multi-line blockquote', () => {
    const result = parseMarkdown('> line one\n> line two')
    expect(result[0]!.type).toBe('quote')
    expect((result[0] as any).blocks[0].spans[0].v).toBe('line one line two')
  })

  test('nested blockquote', () => {
    const result = parseMarkdown('> > nested')
    expect(result[0]!.type).toBe('quote')
    expect((result[0] as any).blocks[0].type).toBe('quote')
  })

  test('blockquote with multiple paragraphs', () => {
    const result = parseMarkdown('> para one\n>\n> para two')
    expect(result[0]!.type).toBe('quote')
    expect((result[0] as any).blocks).toHaveLength(2)
  })
})

describe('parseMarkdown — unordered lists', () => {
  test('simple list', () => {
    const result = parseMarkdown('- one\n- two\n- three')
    expect(result[0]).toMatchObject({ type: 'list', ordered: false })
    expect((result[0] as any).items).toHaveLength(3)
  })

  test('nested list', () => {
    const result = parseMarkdown('- parent\n  - child')
    expect(result[0]!.type).toBe('list')
    const items = (result[0] as any).items
    expect(items).toHaveLength(1)
    expect(items[0].blocks).toHaveLength(2) // paragraph + nested list
  })

  test('list with inline formatting', () => {
    const result = parseMarkdown('- **bold** item')
    const items = (result[0] as any).items
    expect(items[0].blocks[0].spans).toEqual([
      { t: 'bold', v: 'bold' },
      { t: 'text', v: ' item' },
    ])
  })
})

describe('parseMarkdown — ordered lists', () => {
  test('simple ordered list', () => {
    const result = parseMarkdown('1. first\n2. second')
    expect(result[0]).toMatchObject({ type: 'list', ordered: true })
    expect((result[0] as any).items).toHaveLength(2)
  })
})

describe('parseMarkdown — task lists', () => {
  test('unchecked task', () => {
    const result = parseMarkdown('- [ ] todo item')
    const item = (result[0] as any).items[0]
    expect(item.checked).toBe(false)
  })

  test('checked task', () => {
    const result = parseMarkdown('- [x] done item')
    const item = (result[0] as any).items[0]
    expect(item.checked).toBe(true)
  })

  test('mixed task list', () => {
    const result = parseMarkdown('- [x] done\n- [ ] todo\n- normal')
    const items = (result[0] as any).items
    expect(items[0].checked).toBe(true)
    expect(items[1].checked).toBe(false)
    expect(items[2].checked).toBeUndefined()
  })
})

describe('parseMarkdown — tables', () => {
  test('simple table', () => {
    const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |'
    const result = parseMarkdown(md)
    expect(result[0]!.type).toBe('table')
    const table = result[0] as any
    expect(table.headers).toHaveLength(2)
    expect(table.headers[0][0]).toMatchObject({ t: 'text', v: 'Name' })
    expect(table.headers[1][0]).toMatchObject({ t: 'text', v: 'Age' })
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0][0][0]).toMatchObject({ t: 'text', v: 'Alice' })
    expect(table.rows[1][1][0]).toMatchObject({ t: 'text', v: '25' })
  })

  test('table with inline formatting', () => {
    const md = '| **Bold** | `code` |\n| --- | --- |\n| data | data |'
    const result = parseMarkdown(md)
    const table = result[0] as any
    expect(table.headers[0][0]).toMatchObject({ t: 'bold', v: 'Bold' })
    expect(table.headers[1][0]).toMatchObject({ t: 'code', v: 'code' })
  })
})

describe('parseMarkdown — images', () => {
  test('image placeholder', () => {
    const result = parseMarkdown('![diagram](https://example.com/img.png)')
    expect(result[0]).toEqual({
      type: 'image',
      alt: 'diagram',
      url: 'https://example.com/img.png',
    })
  })

  test('image between paragraphs', () => {
    const md = 'text before\n\n![pic](url)\n\ntext after'
    const result = parseMarkdown(md)
    expect(result).toHaveLength(3)
    expect(result[0]!.type).toBe('paragraph')
    expect(result[1]!.type).toBe('image')
    expect(result[2]!.type).toBe('paragraph')
  })
})

describe('blocksToPlainText', () => {
  test('paragraph', () => {
    const blocks = parseMarkdown('hello **world**')
    expect(blocksToPlainText(blocks)).toBe('hello world')
  })

  test('multiple blocks', () => {
    const blocks = parseMarkdown('# Title\n\nparagraph')
    expect(blocksToPlainText(blocks)).toBe('Title\nparagraph')
  })

  test('code block', () => {
    const blocks = parseMarkdown('```ts\nconst x = 1\n```')
    expect(blocksToPlainText(blocks)).toBe('const x = 1')
  })

  test('list', () => {
    const blocks = parseMarkdown('- one\n- two')
    expect(blocksToPlainText(blocks)).toBe('one\ntwo')
  })
})

describe('estimateBlocksHeight', () => {
  test('single short paragraph', () => {
    const blocks = parseMarkdown('hello')
    const h = estimateBlocksHeight(blocks, 300)
    expect(h).toBe(22) // 1 line * lineHeight 22
  })

  test('code block height includes padding', () => {
    const blocks = parseMarkdown('```\nline1\nline2\n```')
    const h = estimateBlocksHeight(blocks, 300)
    // 2 lines * 18 + 12 * 2 padding = 60
    expect(h).toBe(60)
  })

  test('code block with lang label adds height', () => {
    const blocks = parseMarkdown('```ts\nline1\n```')
    const h = estimateBlocksHeight(blocks, 300)
    // 1 line * 18 + 12 * 2 padding + 18 lang label = 60
    expect(h).toBe(60)
  })

  test('multiple blocks add gap', () => {
    const blocks = parseMarkdown('hello\n\nworld')
    const h = estimateBlocksHeight(blocks, 300)
    // 2 paragraphs * 22 + 10 gap = 54
    expect(h).toBe(54)
  })

  test('image placeholder height', () => {
    const blocks = parseMarkdown('![pic](url)')
    const h = estimateBlocksHeight(blocks, 300)
    expect(h).toBe(48)
  })

  test('horizontal rule', () => {
    const blocks = parseMarkdown('---')
    const h = estimateBlocksHeight(blocks, 300)
    expect(h).toBe(18)
  })

  test('table height', () => {
    const blocks = parseMarkdown('| A | B |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |')
    const h = estimateBlocksHeight(blocks, 300)
    // rowHeight(22) + 2 rows * rowHeight(22) + (rows.length + 1) borders
    // = 22 + 44 + 3 = 69
    expect(h).toBe(69)
  })
})
