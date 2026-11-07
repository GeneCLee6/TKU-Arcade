// The little markdown the rules pages use (e7-t07): headings, paragraphs, lists, tables, bold, italics
// and links. Parsed to data that React renders as elements, so nothing here ever becomes raw HTML, and
// no reader pays for a library. Anything else stays plain text.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'em'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] }

export type Block =
  | { kind: 'heading'; level: number; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] }

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/
const SAFE_HREF = /^(https?:\/\/|\/|#)/

export function parseInline(source: string): Inline[] {
  const parts: Inline[] = []
  let rest = source
  while (rest !== '') {
    const match = INLINE.exec(rest)
    if (!match) {
      parts.push({ kind: 'text', text: rest })
      break
    }
    if (match.index > 0) parts.push({ kind: 'text', text: rest.slice(0, match.index) })
    const [whole, strong, em, label, href] = match
    if (strong !== undefined) parts.push({ kind: 'strong', children: parseInline(strong) })
    else if (em !== undefined) parts.push({ kind: 'em', children: parseInline(em) })
    else if (SAFE_HREF.test(href)) parts.push({ kind: 'link', href, children: parseInline(label) })
    else parts.push(...parseInline(label))
    rest = rest.slice(match.index + whole.length)
  }
  return parts
}

const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^[-*]\s+(.*)$/
const NUMBERED = /^\d+\.\s+(.*)$/
const TABLE_ROW = /^\|.*\|$/
const TABLE_RULE = /^\|(\s*:?-+:?\s*\|)+$/

const cellsOf = (row: string): Inline[][] =>
  row
    .slice(1, -1)
    .split('|')
    .map((cell) => parseInline(cell.trim()))

/** Consecutive lines that `pattern` matches, from `start`: each one's capture, or else the line */
function run(lines: readonly string[], start: number, pattern: RegExp): string[] {
  const taken: string[] = []
  for (let at = start; at < lines.length; at++) {
    const match = pattern.exec(lines[at])
    if (!match) break
    taken.push(match[1] ?? match[0])
  }
  return taken
}

const startsBlock = (line: string) =>
  HEADING.test(line) || BULLET.test(line) || NUMBERED.test(line) || TABLE_ROW.test(line)

export function parseMarkdown(source: string): Block[] {
  const lines = source.split(/\r?\n/).map((line) => line.trim())
  const blocks: Block[] = []
  let at = 0
  while (at < lines.length) {
    const line = lines[at]
    const heading = HEADING.exec(line)
    if (line === '') {
      at++
    } else if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, content: parseInline(heading[2]) })
      at++
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line)
      const items = run(lines, at, ordered ? NUMBERED : BULLET)
      blocks.push({ kind: 'list', ordered, items: items.map(parseInline) })
      at += items.length
    } else if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[at + 1] ?? '')) {
      const rows = run(lines, at + 2, TABLE_ROW)
      blocks.push({ kind: 'table', head: cellsOf(line), rows: rows.map(cellsOf) })
      at += 2 + rows.length
    } else {
      // A paragraph runs until a blank line or the next thing that is not one
      const end = lines.findIndex((next, index) => index > at && (next === '' || startsBlock(next)))
      const stop = end < 0 ? lines.length : end
      blocks.push({ kind: 'paragraph', content: parseInline(lines.slice(at, stop).join(' ')) })
      at = stop
    }
  }
  return blocks
}
