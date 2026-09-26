import { gzipSync } from 'node:zlib'
import { gunzipIfNeeded, htmlAsXml, parseXml } from './xml-parser.client'
import { selectXpath, takeFromXml } from './xpath.algorithm'

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Incentivi</title>
  <entry><title>Pandina &amp; 600e</title><link href="https://x/1"/><media:thumbnail url="https://x/1.jpg"/></entry>
  <entry><title><![CDATA[Avenger <new>]]></title><link href="https://x/2"/></entry>
</feed>`

function values (xml: string, expression: string, take: Parameters<typeof takeFromXml>[1], options?: Parameters<typeof selectXpath>[2]): unknown[] {
  return selectXpath(parseXml(xml, 'feed.xml'), expression, options).map(node => takeFromXml(node, take))
}

describe('XML documents', () => {
  it('queries a namespaced feed with declared prefixes, root prefixes, or no namespaces at all', () => {
    expect(values(ATOM, '//a:entry/a:title', 'text', { namespaces: { a: 'http://www.w3.org/2005/Atom' } })).toEqual(['Pandina & 600e', 'Avenger <new>'])
    expect(values(ATOM, '//media:thumbnail/@url', 'value')).toEqual(['https://x/1.jpg'])
    expect(values(ATOM, '//entry/link', 'attr:href', { ignoreNamespaces: true })).toEqual(['https://x/1', 'https://x/2'])
    expect(values(ATOM, '//entry/title', 'text')).toEqual([])
    expect(values(ATOM, 'count(//*[local-name()="entry"])', 'text')).toEqual(['2'])
    expect(values(ATOM, 'string(/*/*[local-name()="title"])', 'value')).toEqual(['Incentivi'])
  })

  it('takes an entry as markup that a nested query can parse again, namespace and all', () => {
    const [entry] = values(ATOM, '//a:entry', 'json', { namespaces: { a: 'http://www.w3.org/2005/Atom' } }) as string[]
    expect(entry).toContain('xmlns="http://www.w3.org/2005/Atom"')
    expect(values(entry, '/a:entry/a:link/@href', 'value', { namespaces: { a: 'http://www.w3.org/2005/Atom' } })).toEqual(['https://x/1'])
  })

  it('never expands entities a DOCTYPE declares, nor fetches external ones', () => {
    const laughs = '<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]><l>&c;</l>'
    expect(values(laughs, 'string(/l)', 'value')[0]).toBe('&c;')
    const xxe = '<?xml version="1.0"?><!DOCTYPE f [<!ENTITY x SYSTEM "file:///etc/passwd">]><f>&x;</f>'
    expect(values(xxe, 'string(/f)', 'value')[0]).toBe('&x;')
  })

  it('refuses markup that is not XML, and a query with an unknown prefix, saying what to do', () => {
    expect(() => parseXml('<a><b></a>', 'broken.xml')).toThrow(/^broken\.xml: not well-formed XML/)
    expect(() => values(ATOM, '//atom:entry', 'text')).toThrow(/declare it in "namespaces", or set "ignoreNamespaces": true/)
  })

  it('reads HTML the way a browser does, for XPath on fetched pages', () => {
    const page = htmlAsXml('<!doctype html><html xmlns="http://www.w3.org/1999/xhtml"><body><table><tr><td>1<td>2</table><p>a<br>b &nbsp;c<script>if (a < b) {}</script></body></html>')
    expect(selectXpath(page, '//table/tbody/tr/td').map(node => takeFromXml(node, 'text'))).toEqual(['1', '2'])
    expect(selectXpath(page, 'string(//p)').map(node => takeFromXml(node, 'text'))).toEqual(['ab cif (a < b) {}'])
    const fragment = htmlAsXml('<tr><td class="size">M</td><td class="price">12,00 €</td></tr>')
    expect(selectXpath(fragment, "//td[@class='price']").map(node => takeFromXml(node, 'text'))).toEqual(['12,00 €'])
  })

  it('gunzips a gzipped sitemap and leaves plain bytes alone', () => {
    const plain = new TextEncoder().encode('<urlset/>')
    const gunzipped = gunzipIfNeeded(gzipSync(plain))
    expect(new TextDecoder().decode(gunzipped)).toBe('<urlset/>')
    expect(gunzipIfNeeded(plain)).toBe(plain)
  })
})
