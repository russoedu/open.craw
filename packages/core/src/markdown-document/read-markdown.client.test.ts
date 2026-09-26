import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'cheerio'
import { readMarkdown } from './read-markdown.client'

const listino = readFileSync(join(__dirname, 'fixtures', 'listino.md'), 'utf8')

describe('readMarkdown', () => {
  it('wraps each heading and its content in a section, sections nesting by level, headings slugged', async () => {
    const { html } = await readMarkdown(listino, 'listino.md')
    const $ = load(html)
    expect($('section[data-level="1"]').attr('data-heading')).toBe('Listino')
    expect($('section[data-heading="Prezzi"] table tbody tr').length).toBe(3)
    expect($('section[data-heading="Prezzi"] section[data-heading="Accessori"] li').length).toBe(2)
    expect($('section[data-heading="Note"] section').length).toBe(0)
    expect($('h2').map((_index, heading) => $(heading).attr('id')).get()).toEqual(['prezzi', 'note'])
  })

  it('renders GitHub tables: an escaped pipe stays in its cell, a short row is padded', async () => {
    const { html } = await readMarkdown(listino, 'listino.md')
    const $ = load(html)
    const rows = $('section[data-heading="Prezzi"] tbody tr').get().map(row => $(row).find('td').get().map(cell => $(cell).text()))
    expect(rows).toEqual([['Pandina', '1.0 Hybrid', '15.950 €', 'con | pipe'], ['600e', 'La Prima', '36.950 €', 'bold link'], ['Solo due celle', 'x', '', '']])
  })

  it('reads the front matter as YAML 1.2 into a JSON script in the head', async () => {
    const { html, frontMatter } = await readMarkdown(listino, 'listino.md')
    expect(frontMatter).toEqual({ title: 'Listino giugno', updated: '2026-06-01', brand: 'Fiat', market: 'NO' })
    expect(JSON.parse(load(html)('script[data-front-matter]').text())).toEqual(frontMatter)
  })

  it('keeps raw HTML as data: selectable, never run', async () => {
    const { html } = await readMarkdown(listino, 'listino.md')
    const $ = load(html)
    expect($('details table td').last().text()).toBe('30 giugno')
    expect($('script:not([data-front-matter])').text()).toBe('window.pwned = true')
  })

  it('reads Markdown without front matter, and names the source of bad front matter', async () => {
    const { html, frontMatter } = await readMarkdown('# Hi\n\ntext', 'a.md')
    expect(frontMatter).toBeUndefined()
    expect(html).toContain('<section data-heading="Hi" data-level="1"><h1 id="hi">Hi</h1>')
    await expect(readMarkdown('---\na: [1\n---\n# x', 'bad.md')).rejects.toThrow(/bad\.md front matter: not YAML/)
  })
})
