import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { HttpClient } from '@opencraw/core'
import { describeDeck } from './deck-findings.mapper'
import { deckReport } from './probe-report.mapper'

const fixture = join(__dirname, '..', '..', '..', 'office-reader', 'src', 'presentation', 'fixtures', 'incentivi.pptx')

describe('describeDeck', () => {
  it('lists slides, native table headers, charts and text-box grids', async () => {
    const client = await HttpClient.open()
    try {
      const { body } = await client.send({ url: pathToFileURL(fixture).href })
      if (body.kind !== 'deck') throw new Error(`read as ${body.kind}`)
      const findings = describeDeck(body)
      expect(findings.slides.map(slide => [slide.number, slide.title, slide.tables, slide.charts])).toEqual([[1, 'Incentivi giugno', 1, 0], [2, 'Griglia prezzi Jeep', 0, 0], [3, 'Vendite', 0, 1], [4, 'Bozza', 0, 0]])
      expect(findings.headers).toEqual([{ slide: 1, text: 'Modello | Prezzo | Sconto', selector: '^Modello', hint: 'merged header cells: try "headerRows": 2' }, { slide: 1, text: 'Listino | Netto', selector: '^Listino' }])
      expect(findings.grids).toEqual([{ slide: 2, title: 'Griglia prezzi Jeep', boxes: 9 }])
      expect(findings.charts).toEqual([{ slide: 3, type: 'bar', title: 'Immatricolazioni', series: [{ name: 'Pandina', points: 3 }, { name: '600e', points: 3 }] }])
      expect(deckReport('x.pptx', findings)).toContain('slide 2  Griglia prezzi Jeep: 9 short boxes')
    } finally {
      await client.dispose()
    }
  })
})
