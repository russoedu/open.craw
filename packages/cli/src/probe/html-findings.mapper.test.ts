import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readMarkdown } from '@opencraw/core'
import { describeHtml } from './html-findings.mapper'
import { probeReport } from './probe-report.mapper'
import { findData } from './find-data.algorithm'

describe('describeHtml', () => {
  it('lists an HTML page\'s table headers, hinting at a second header row under merged cells', () => {
    const findings = describeHtml('<table><tr><th rowspan="2">Model</th><th colspan="2">Price</th></tr><tr><th>List</th><th>Net</th></tr><tr><td>Pandina</td><td>15.950</td><td>13.955</td></tr></table>', false)
    expect(findings).toEqual({ tables: [{ table: 'table 1', text: 'Model | Price', selector: '^Model', hint: 'merged header cells: try "headerRows": 2' }, { table: 'table 1', text: 'List | Net', selector: '^List' }] })
  })

  it('outlines rendered Markdown and lists its front matter keys', async () => {
    const text = readFileSync(join(__dirname, '..', '..', '..', 'core', 'src', 'markdown-document', 'fixtures', 'listino.md'), 'utf8')
    const { html } = await readMarkdown(text, 'listino.md')
    const findings = describeHtml(html, true)
    expect(findings.frontMatter).toEqual(['title', 'updated', 'brand', 'market'])
    expect(findings.outline?.map(entry => [entry.level, entry.heading])).toEqual([[1, 'Listino'], [2, 'Prezzi'], [3, 'Accessori'], [2, 'Note']])
    expect(findings.outline?.[1].selector).toBe("section[data-heading='Prezzi' i]")
    expect(findings.tables[0]).toMatchObject({ table: 'table 1', selector: '^Modello' })
    const report = probeReport('listino.md', 200, findData(html), [], findings)
    expect(report).toContain("    section[data-heading='Prezzi' i]")
  })
})
