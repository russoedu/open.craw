import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pdfText } from './pdf-document.model'
import { PdfReadError, readPdf } from './read-pdf.client'

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)))

describe('readPdf', () => {
  it('reads every page into rows of cells, and the text regex reads', async () => {
    const document = await readPdf(fixture('discounts.pdf'))
    expect(document.kind).toBe('pdf')
    expect(document.pages.map(page => [page.number, page.width, page.height])).toEqual([[1, 595, 842], [2, 595, 842]])
    expect(document.pages[0].rows[0].text).toBe('DEALER DISCOUNTS - SEPTEMBER 2026')
    expect(document.pages[0].rows.map(row => row.text)).toContain('MINI (model 103)\t0,0%\t1000 euro scrappage bonus')
    expect(pdfText(document)).toMatch(/G3 BEV\t5,0%\tstock until 30\/09\/26/)
  })

  it('refuses a scan with no text layer, and bytes that are not a PDF', async () => {
    await expect(readPdf(fixture('scanned.pdf'), 'scan.pdf')).rejects.toThrow('scan.pdf: no page has a text layer')
    await expect(readPdf(new TextEncoder().encode('not a pdf'), 'x.pdf')).rejects.toThrow(PdfReadError)
  })
})
