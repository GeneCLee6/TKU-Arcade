import { createElement, useMemo, type ReactNode } from 'react'
import styled from 'styled-components'
import { parseMarkdown, type Block, type Inline } from '../lib/markdown.ts'
import { displayType, monoType, SLANT } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

function inlines(parts: readonly Inline[]): ReactNode {
  return parts.map((part, index) => {
    switch (part.kind) {
      case 'text':
        return part.text
      case 'strong':
        return <strong key={index}>{inlines(part.children)}</strong>
      case 'em':
        return <em key={index}>{inlines(part.children)}</em>
      case 'link': {
        const outside = part.href.startsWith('http')
        return (
          <a
            key={index}
            href={part.href}
            target={outside ? '_blank' : undefined}
            rel={outside ? 'noreferrer' : undefined}
          >
            {inlines(part.children)}
          </a>
        )
      }
    }
  })
}

function block(item: Block, key: number, headingShift: number): ReactNode {
  switch (item.kind) {
    case 'heading':
      return createElement(
        `h${Math.min(item.level + headingShift, 6)}`,
        { key },
        inlines(item.content),
      )
    case 'paragraph':
      return <p key={key}>{inlines(item.content)}</p>
    case 'list':
      return createElement(
        item.ordered ? 'ol' : 'ul',
        { key },
        item.items.map((entry, index) => <li key={index}>{inlines(entry)}</li>),
      )
    case 'table':
      return (
        <TableScroll key={key}>
          <table>
            <thead>
              <tr>
                {item.head.map((cell, index) => (
                  <th key={index} scope="col">
                    {inlines(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index}>{inlines(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )
  }
}

interface MarkdownProps {
  source: string
  /** Added to each heading's level, to fit under the headings already around this text */
  headingShift?: number
}

/** First-party text from the repo; see `parseMarkdown` for what it understands */
export function Markdown({ source, headingShift = 0 }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source])
  return <Prose>{blocks.map((item, index) => block(item, index, headingShift))}</Prose>
}

const Prose = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;
  line-height: 1.6;
  overflow-wrap: anywhere;

  & :is(h2, h3, h4, h5, h6) {
    margin: ${space.md}px 0 0;
    ${displayType}
    font-size: ${fontSize.lg}px;
    line-height: 1.3;
  }

  /* A slanted square in the current hue before each heading */
  & :is(h2, h3, h4, h5, h6)::before {
    content: '';
    display: inline-block;
    width: ${space.md}px;
    height: ${space.md}px;
    margin-right: ${space.md}px;
    background: ${color.accent};
    transform: skewX(${SLANT});
  }

  & > :first-child {
    margin-top: 0;
  }

  & p {
    margin: 0;
  }

  & :is(ul, ol) {
    display: grid;
    gap: ${space.xs}px;
    margin: 0;
    padding-left: ${space.xl}px;
  }

  & a {
    color: ${color.text};
  }
`

// A table is the one thing that cannot wrap its way into a phone's width
const TableScroll = styled.div`
  overflow-x: auto;

  & table {
    border-collapse: collapse;
    font-size: ${fontSize.sm}px;
  }

  & :is(th, td) {
    padding: ${space.sm}px ${space.md}px;
    border-bottom: 1px solid ${color.border};
    text-align: left;
    overflow-wrap: normal;
  }

  & th {
    ${monoType}
    color: ${color.muted};
    font-size: ${fontSize.sm}px;
    font-weight: 700;
  }
`
