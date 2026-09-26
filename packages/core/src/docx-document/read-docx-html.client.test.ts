import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'cheerio'
import { readDocxHtml } from './read-docx-html.client'

const bytes = readFileSync(join(__dirname, '..', '..', '..', 'office-reader', 'src', 'document', 'fixtures', 'incentivi.docx'))

describe('readDocxHtml', () => {
  it('turns headings into sections, lists into nested lists, links into anchors', async () => {
    const $ = load(await readDocxHtml(bytes, 'incentivi.docx'))
    expect($('title').text()).toBe('Circolare giugno')
    expect($('section[data-level="1"]').map((_, section) => $(section).attr('data-heading')).get()).toEqual(['Circolare incentivi giugno 2026', 'Condizioni'])
    expect($("section[data-heading='Prezzi'] > h2").attr('id')).toBe('prezzi')
    expect($('ul > li').map((_, item) => $(item).text()).get()).toEqual(['Solo rottamazione', 'Non cumulabile'])
    expect($('ol > li').first().contents().first().text()).toBe('Prenota')
    expect($('ol > li > ol > li').text()).toBe('Entro il 15')
    expect($('a').map((_, anchor) => [[$(anchor).text(), $(anchor).attr('href')]]).get()).toEqual([['listino giugno', 'https://example.com/listino-giugno.pdf'], ['Prezzi', '#prezzi']])
    expect($('p:contains("Marca")').html()).toBe('Marca\tModello<br>Fiat')
  })

  it('writes merged table cells as rowspan and colspan, under their section', async () => {
    const $ = load(await readDocxHtml(bytes, 'incentivi.docx'))
    const table = $("section[data-heading='Prezzi'] table")
    expect(table.find('tr').first().html()).toBe('<td rowspan="2">Modello</td><td colspan="2">Prezzo</td><td rowspan="2">Sconto</td>')
    expect(table.find('tr').eq(1).html()).toBe('<td>Listino</td><td>Netto</td>')
    expect(table.find('tr').eq(2).text()).toBe('Pandina15.95013.95512,5%')
  })

  it('puts headers, footers and notes after the body, outside its sections', async () => {
    const $ = load(await readDocxHtml(bytes, 'incentivi.docx'))
    expect($('body > header[data-part="header"]').text()).toBe('Stellantis Italia – riservato')
    expect($('body > footer[data-part="footer"]').text()).toBe('Pagina')
    expect($('body > aside[data-part="notes"] li#footnote-1').text()).toBe('Prezzi chiavi in mano, IPT esclusa.')
  })

  it('names the source of a file that is not a Word document', async () => {
    // An OLE compound file: what a legacy .doc is.
    const legacy = new Uint8Array(608)
    legacy.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
    await expect(readDocxHtml(legacy, 'old.doc')).rejects.toThrow(/^old\.doc: /)
  })
})
