import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Deck } from './deck.model'
import { readPptx } from './read-pptx.use-case'
import type { ReadPptxOptions } from './read-pptx.use-case'

const incentivi = join(__dirname, 'fixtures', 'incentivi.pptx')
const packages = join(__dirname, '..', 'ooxml-package', 'fixtures')

async function deck (options?: ReadPptxOptions): Promise<Deck> {
  return readPptx(incentivi, options)
}

async function slides (options?: ReadPptxOptions): Promise<Deck['slides']> {
  const read = await deck(options)

  return read.slides
}

async function slideNumbers (slides: ReadPptxOptions['slides']): Promise<number[]> {
  const read = await deck({ slides })

  return read.slides.map(slide => slide.number)
}

describe('readPptx', () => {
  it('reads slides in presentation order, with the slide size in points', async () => {
    const read = await deck()
    expect([read.width, read.height]).toEqual([960, 540])
    expect(read.slides.map(slide => [slide.number, slide.title, slide.hidden])).toEqual([[1, 'Incentivi giugno', false], [2, 'Griglia prezzi Jeep', false], [3, 'Vendite', false], [4, 'Bozza', true]])
  })

  it('places a title from its layout and a body from the master, and leaves slide numbers out', async () => {
    const [first, , third] = await slides()
    expect(first.shapes).toEqual([{ x: 60, y: 30, width: 840, height: 60, text: 'Incentivi giugno', placeholder: 'title' }])
    expect(third.shapes[1]).toEqual({ x: 60, y: 110, width: 840, height: 380, text: 'Fonte: UNRAE', placeholder: 'body' })
  })

  it('reads a native table as a sheet, merged cells as ranges', async () => {
    const [first] = await slides()
    expect(first.tables).toEqual([{
      name:       'table 1',
      hidden:     false,
      rows:       [['Incentivi giugno 2026', '', '', ''], ['Modello', 'Prezzo', '', 'Sconto'], ['', 'Listino', 'Netto', ''], ['Pandina', '15.950 €', '13.955 €', '12,5%'], ['Pandina Cross', '17.950 €', '15.706 €', '12,5%']],
      hiddenRows: [],
      merges:     ['A1:D1', 'A2:A3', 'B2:C2', 'D2:D3'],
    }])
    expect(first.notes).toBe('Prezzi IVA inclusa.\nValidi fino al 30 giugno.')
  })

  it('places grouped text boxes through the group\'s scaling, in reading order', async () => {
    const [, second] = await slides()
    expect(second.shapes.slice(1, 4).map(shape => [shape.x, shape.y, shape.width, shape.height, shape.text])).toEqual([[60, 120, 190, 25, 'Modello'], [260, 120, 190, 25, 'Prezzo'], [460, 120, 190, 25, 'Sconto']])
    expect(second.shapes.at(-1)).toMatchObject({ x: 460, y: 180, text: '10%' })
  })

  it('reads a chart from its cache: series, categories, missing points, the title but not an axis\'s', async () => {
    const chart = { type: 'bar', title: 'Immatricolazioni', series: [{ name: 'Pandina', categories: ['Aprile', 'Maggio', 'Giugno'], values: [1200, 1350.5, 1410] }, { name: '600e', categories: ['Aprile', 'Maggio', 'Giugno'], values: [300, null, 410] }] }
    const [typed] = await slides({ slides: [3] })
    expect(typed.charts).toEqual([chart])
    const asText = await readPptx(incentivi, { slides: [3], values: 'text' })
    expect(asText.slides[0].charts[0].series[1].values).toEqual(['300', '', '410'])
  })

  it('reads the slides asked for, and leaves notes and charts out when told to', async () => {
    expect(await slideNumbers([2, 4])).toEqual([2, 4])
    expect(await slideNumbers(/^(vendite|bozza)$/i)).toEqual([3, 4])
    expect(await slideNumbers(slide => !slide.hidden)).toEqual([1, 2, 3])
    const lean = await deck({ notes: false, charts: false })
    expect(lean.slides.map(slide => [slide.notes, slide.charts.length])).toEqual([['', 0], ['', 0], ['', 0], ['', 0]])
  })

  it('reads a Blob, and refuses what is not a presentation, saying what it is', async () => {
    const bytes = readFileSync(incentivi)
    const read = await readPptx(new Blob([bytes]), { slides: [1] })
    expect(read.slides[0].title).toBe('Incentivi giugno')
    const workbook = join(__dirname, '..', 'spreadsheet', 'fixtures', 'incentivi.xlsx')
    await expect(readPptx(workbook)).rejects.toMatchObject({ code: 'not-pptx', message: expect.stringMatching(/readXlsx/) })
    await expect(readPptx(join(packages, 'legacy.xls'))).rejects.toMatchObject({ code: 'legacy-format' })
  })
})
