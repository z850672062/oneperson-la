import { Fragment, type ReactNode } from 'react'
import { parseMarkdown } from '../utils/markdown'

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
const SAFE_URL_RE = /^(https?:\/\/|mailto:|\/)/i

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE_RE).filter((part) => part !== '')
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{renderInline(part.slice(2, -2), key)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={key}>{part.slice(1, -1)}</code>
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const [, label, url] = link
      if (SAFE_URL_RE.test(url)) {
        return (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer">
            {renderInline(label, key)}
          </a>
        )
      }
      return <Fragment key={key}>{renderInline(label, key)}</Fragment>
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}

interface MarkdownDocProps {
  content: string
  className?: string
}

/** 安全的 Markdown 只读渲染（不使用 dangerouslySetInnerHTML） */
export default function MarkdownDoc({ content, className }: MarkdownDocProps) {
  const blocks = parseMarkdown(content)

  if (!blocks.length) {
    return <p className="card-note">暂无内容</p>
  }

  return (
    <article className={`markdown-doc${className ? ` ${className}` : ''}`}>
      {blocks.map((block, index) => {
        const key = `block-${index}`
        switch (block.type) {
          case 'heading': {
            const level = Math.min(Math.max(block.level, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6
            const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
            return <Tag key={key}>{renderInline(block.text, key)}</Tag>
          }
          case 'paragraph':
            return <p key={key}>{renderInline(block.text, key)}</p>
          case 'list':
            return block.ordered ? (
              <ol key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </ol>
            ) : (
              <ul key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </ul>
            )
          case 'table':
            return (
              <div className="markdown-table-wrap" key={key}>
                <table>
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th key={`${key}-h-${cellIndex}`}>{renderInline(cell, `${key}-h-${cellIndex}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`${key}-r-${rowIndex}`}>
                        {block.header.map((_, cellIndex) => (
                          <td key={`${key}-r-${rowIndex}-${cellIndex}`}>
                            {renderInline(row[cellIndex] ?? '', `${key}-r-${rowIndex}-${cellIndex}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'code':
            return (
              <pre key={key}>
                <code>{block.code}</code>
              </pre>
            )
          case 'hr':
            return <hr key={key} />
          default:
            return null
        }
      })}
    </article>
  )
}
