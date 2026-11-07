import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from '../../src/lib/markdown.ts'

describe('parseInline', () => {
  it('finds bold, italics and links among plain text', () => {
    expect(parseInline('a **b** *c* [d](/e) f')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'c' }] },
      { kind: 'text', text: ' ' },
      { kind: 'link', href: '/e', children: [{ kind: 'text', text: 'd' }] },
      { kind: 'text', text: ' f' },
    ])
  })

  it('keeps only the words of a link it would not trust', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([
      { kind: 'text', text: 'x' },
      { kind: 'text', text: ')' },
    ])
  })

  it('leaves markup-looking text as text', () => {
    expect(parseInline('<img src=x onerror=y>')).toEqual([
      { kind: 'text', text: '<img src=x onerror=y>' },
    ])
  })
})

describe('parseMarkdown', () => {
  it('splits headings, paragraphs and both kinds of list', () => {
    const blocks = parseMarkdown('## One\n\nline a\nline b\n\n- x\n- y\n\n1. p\n2. q\n')
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list', 'list'])
    expect(blocks[0]).toMatchObject({ level: 2 })
    expect(blocks[1]).toMatchObject({ content: [{ text: 'line a line b' }] })
    expect(blocks[2]).toMatchObject({ ordered: false, items: [[{ text: 'x' }], [{ text: 'y' }]] })
    expect(blocks[3]).toMatchObject({ ordered: true, items: [[{ text: 'p' }], [{ text: 'q' }]] })
  })

  it('reads a table, its header apart from its rows', () => {
    expect(parseMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |')).toEqual([
      {
        kind: 'table',
        head: [[{ kind: 'text', text: 'a' }], [{ kind: 'text', text: 'b' }]],
        rows: [
          [[{ kind: 'text', text: '1' }], [{ kind: 'text', text: '2' }]],
          [[{ kind: 'text', text: '3' }], [{ kind: 'text', text: '4' }]],
        ],
      },
    ])
  })

  it('ends a paragraph at a list with no blank line between, and handles CRLF', () => {
    const blocks = parseMarkdown('intro\r\n- x\r\n')
    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'list'])
  })

  it('treats a pipe line with no rule under it as a paragraph, and terminates', () => {
    expect(parseMarkdown('| a |')).toMatchObject([{ kind: 'paragraph' }])
  })
})
