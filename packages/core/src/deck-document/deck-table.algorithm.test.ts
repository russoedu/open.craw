import type { DeckDocument } from './deck-document.model'
import { deckText } from './deck-document.model'
import { findDeckTables } from './deck-table.algorithm'

const deck: DeckDocument = {
  kind:   'deck',
  width:  960,
  height: 540,
  slides: [
    {
      number: 1,
      title:  'Incentivi giugno',
      hidden: false,
      shapes: [{ x: 60, y: 30, width: 840, height: 60, text: 'Incentivi giugno', placeholder: 'title' }],
      tables: [{
        name:   'table 1',
        rows:   [['Incentivi giugno 2026', '', '', ''], ['Modello', 'Prezzo', '', 'Sconto'], ['', 'Listino', 'Netto', ''], ['Pandina', '15.950 €', '13.955 €', '12,5%']],
        merges: ['A1:D1', 'A2:A3', 'B2:C2', 'D2:D3'],
      }],
      charts: [],
      notes:  'Prezzi IVA inclusa.',
    },
    {
      number: 2,
      title:  'Griglia prezzi',
      hidden: false,
      shapes: [
        { x: 60, y: 30, width: 840, height: 60, text: 'Griglia prezzi', placeholder: 'title' },
        ...[['Modello', 'Prezzo'], ['Avenger', '24.950 €'], ['Compass', '39.900 €']].flatMap((cells, row) => cells.map((text, column) => ({ x: 60 + (column * 200), y: 120 + (row * 30), width: 190, height: 25, text }))),
      ],
      tables: [],
      charts: [],
      notes:  '',
    },
    { number: 3, title: 'Bozza', hidden: true, shapes: [], tables: [{ name: 'table 1', rows: [['Modello', 'Prezzo'], ['Old', '1']] }], charts: [], notes: '' },
  ],
}

describe('findDeckTables', () => {
  it('reads native tables through the workbook reader: merged cells filled, a two-row header joined', () => {
    const [table] = findDeckTables(deck, { header: /^Modello Prezzo/i, headerRows: 2 })
    expect(table).toEqual({
      slide:      1,
      slideTitle: 'Incentivi giugno',
      title:      'Modello',
      header:     ['Modello', 'Prezzo Listino', 'Prezzo Netto', 'Sconto'],
      rows:       [{ 'Modello': 'Pandina', 'Prezzo Listino': '15.950 €', 'Prezzo Netto': '13.955 €', 'Sconto': '12,5%' }],
    })
  })

  it('reads text boxes laid out as a table, each box a cell', () => {
    const tables = findDeckTables(deck, { header: /^Modello Prezzo/i, shapes: true, columns: { model: /^Modello/i, price: /^Prezzo/i } })
    expect(tables).toEqual([{ slide: 2, slideTitle: 'Griglia prezzi', title: 'Modello', header: ['Modello', 'Prezzo'], rows: [{ model: 'Avenger', price: '24.950 €' }, { model: 'Compass', price: '39.900 €' }] }])
  })

  it('skips hidden slides unless asked, and reads only the slides whose title matches', () => {
    expect(findDeckTables(deck, { header: /^Modello Prezzo$/i }).map(table => table.slide)).toEqual([])
    expect(findDeckTables(deck, { header: /^Modello Prezzo$/i, includeHidden: true }).map(table => table.slide)).toEqual([3])
    expect(findDeckTables(deck, { header: /^Modello/i, slide: /^incentivi/i }).map(table => table.slide)).toEqual([1])
  })
})

describe('deckText', () => {
  it('reads visible slides: text boxes, table rows, notes', () => {
    expect(deckText(deck).split('\n\n', 1)[0]).toBe('Incentivi giugno\nIncentivi giugno 2026\t\t\t\nModello\tPrezzo\t\tSconto\n\tListino\tNetto\t\nPandina\t15.950 €\t13.955 €\t12,5%\nNotes: Prezzi IVA inclusa.')
    expect(deckText(deck)).not.toContain('Bozza')
  })
})
