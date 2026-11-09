export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'code'; language: string; code: string }
  | { type: 'hr' }

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const UL_RE = /^[-*+]\s+(.*)$/
const OL_RE = /^\d+\.\s+(.*)$/
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/
const FENCE_RE = /^```(.*)$/

function splitRow(line: string): string[] {
  const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '').replace(/\\\|/g, '\u0000')
  return normalized.split('|').map((cell) => cell.replace(/\u0000/g, '|').trim())
}

function isTableSeparator(line: string): boolean {
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function isSpecialLine(line: string): boolean {
  const trimmed = line.trim()
  return (
    !trimmed ||
    HEADING_RE.test(trimmed) ||
    UL_RE.test(trimmed) ||
    OL_RE.test(trimmed) ||
    HR_RE.test(trimmed) ||
    FENCE_RE.test(trimmed) ||
    trimmed.startsWith('|')
  )
}

/** 轻量 Markdown 解析：标题 / 段落 / 列表 / 表格 / 代码块 / 分隔线 */
export function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = (content ?? '').replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const fence = trimmed.match(FENCE_RE)
    if (fence) {
      const language = fence[1].trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push({ type: 'code', language, code: code.join('\n') })
      continue
    }

    const heading = trimmed.match(HEADING_RE)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() })
      index += 1
      continue
    }

    if (HR_RE.test(trimmed)) {
      blocks.push({ type: 'hr' })
      index += 1
      continue
    }

    if (trimmed.startsWith('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const header = splitRow(trimmed)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(splitRow(lines[index]))
        index += 1
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    if (UL_RE.test(trimmed) || OL_RE.test(trimmed)) {
      const ordered = OL_RE.test(trimmed)
      const pattern = ordered ? OL_RE : UL_RE
      const items: string[] = []
      while (index < lines.length) {
        const match = lines[index].trim().match(pattern)
        if (!match) break
        items.push(match[1].trim())
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraph: string[] = [trimmed]
    index += 1
    while (index < lines.length && !isSpecialLine(lines[index])) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }

  return blocks
}
