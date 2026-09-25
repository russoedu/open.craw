import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readPdf } from '@opencraw/core'
import { describePdf } from './pdf-findings.mapper'

describe('describePdf', () => {
  it('lists the rows and the rows that look like table headers, with a selector for each', async () => {
    const bytes = readFileSync(join(__dirname, '..', '..', '..', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf'))
    const document = await readPdf(new Uint8Array(bytes))
    const findings = describePdf(document)
    expect(findings.pages).toBe(2)
    expect(findings.rows[1]).toEqual({ page: 1, text: 'MODELS ALPHA | Discount %* | Excluded versions | Extra *' })
    expect(findings.headers.map(header => [header.page, header.selector])).toEqual([[1, '^MODELS ALPHA'], [1, '^MODELS BETA'], [1, String.raw`^MODELS DELTA \(DEALERS ONLY\)`], [2, '^MODELS GAMMA']])
  })
})
