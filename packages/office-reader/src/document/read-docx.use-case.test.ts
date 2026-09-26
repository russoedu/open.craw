import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OfficeReadError } from '../read-error'
import { readDocx } from './read-docx.use-case'

const fixture = (name: string): Uint8Array => readFileSync(join(__dirname, 'fixtures', name))
const pkgFixture = (name: string): Uint8Array => readFileSync(join(__dirname, '..', 'ooxml-package', 'fixtures', name))

describe('readDocx', () => {
  it('reads paragraphs with their headings, lists and links, in order', async () => {
    const document = await readDocx(fixture('incentivi.docx'))
    expect(document.title).toBe('Circolare giugno')
    const paragraphs = document.body.filter(block => block.kind === 'paragraph')
    expect(paragraphs.map(({ text, heading, list }) => [text, heading ?? null, list ?? null])).toEqual([
      ['Circolare incentivi giugno 2026', 1, null],
      ['Condizioni', 1, null],
      ['Valido dal 1 al 30 giugno 2026.', null, null],
      ['Solo rottamazione', null, { level: 0, ordered: false }],
      ['Non cumulabile', null, { level: 0, ordered: false }],
      ['Prenota', null, { level: 0, ordered: true }],
      ['Entro il 15', null, { level: 1, ordered: true }],
      ['Prezzi', 2, null],
      ['Listino completo: listino giugno, vedi Prezzi', null, null],
      ['Prezzi IVA inclusa', null, null],
      ['Marca\tModello\nFiat', null, null],
      ['Offerta limitata', null, null],
    ])
    expect(paragraphs[8].links).toEqual([{ text: 'listino giugno', href: 'https://example.com/listino-giugno.pdf' }, { text: 'Prezzi', href: '#prezzi' }])
    expect(paragraphs[7].style).toBe('Titolo2')
  })

  it('reads a table as a grid with its merges across and down, in its place in the body', async () => {
    const { body } = await readDocx(fixture('incentivi.docx'))
    const index = body.findIndex(block => block.kind === 'table')
    expect(body[index - 1]).toMatchObject({ text: 'Prezzi' })
    expect(body[index]).toEqual({
      kind:       'table',
      name:       'table 1',
      hidden:     false,
      hiddenRows: [],
      rows:       [['Modello', 'Prezzo', '', 'Sconto'], ['', 'Listino', 'Netto', ''], ['Pandina', '15.950', '13.955', '12,5%'], ['600e', '36.950', '32.950', '10%']],
      merges:     ['B1:C1', 'A1:A2', 'D1:D2'],
    })
  })

  it('reads headers, footers and footnotes, and leaves them out when asked', async () => {
    const document = await readDocx(fixture('incentivi.docx'))
    expect(document.headers).toEqual([[{ kind: 'paragraph', text: 'Stellantis Italia – riservato' }]])
    expect(document.footers).toEqual([[{ kind: 'paragraph', text: 'Pagina' }]])
    expect(document.notes).toEqual([{ kind: 'footnote', id: '1', text: 'Prezzi chiavi in mano, IPT esclusa.' }])
    expect(await readDocx(fixture('incentivi.docx'), { extras: false })).toMatchObject({ headers: [], footers: [], notes: [] })
  })

  it('refuses what is not a Word document, saying what it is', async () => {
    await expect(readDocx(pkgFixture('legacy.xls'))).rejects.toThrow(/save it as \.xlsx, \.pptx or \.docx/)
    const refusal = readDocx(pkgFixture('presentation.pptx'))
    await expect(refusal).rejects.toBeInstanceOf(OfficeReadError)
    await expect(refusal).rejects.toMatchObject({ code: 'not-docx' })
    await expect(readDocx(pkgFixture('sheet.ods'))).rejects.toMatchObject({ code: 'unsupported-format' })
  })
})
