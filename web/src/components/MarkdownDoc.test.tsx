import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MarkdownDoc from './MarkdownDoc'

describe('MarkdownDoc', () => {
  it('renders report markdown headings, lists and tables', () => {
    const content = [
      '# 法务周报',
      '',
      '## 一、汇总概览',
      '',
      '- 新增：3 项',
      '- 办结：2 项',
      '',
      '| 事项 | 状态 |',
      '| --- | --- |',
      '| 合同审查 | 办结 |',
      '',
      '**重点** 请复核逾期事项。',
    ].join('\n')

    const { container } = render(<MarkdownDoc content={content} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('法务周报')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('一、汇总概览')
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('合同审查')).toBeInTheDocument()
    expect(container.querySelector('strong')).toHaveTextContent('重点')
  })

  it('renders raw HTML as plain text instead of injecting it', () => {
    const { container } = render(
      <MarkdownDoc content={'<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>'} />,
    )

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">')
  })
})
