import { parseXml } from '@opencraw/core'
import { xmlReport } from './probe-report.mapper'
import { describeXml } from './xml-findings.mapper'

// eslint-disable-next-line unicorn/prefer-https -- a namespace is a name, not a link: it must match the feed byte for byte
const MEDIA = 'http://search.yahoo.com/mrss/'

const FEED = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>Incentivi</title>
<entry><title>Pandina</title><link href="/p/1"/><media:thumbnail url="/1.jpg"/></entry>
<entry><title>600e</title><link href="/p/2"/></entry></feed>`

describe('describeXml', () => {
  it('finds the namespaces, the repeated elements and the structure', () => {
    const findings = describeXml(parseXml(FEED, 'feed.xml'))
    expect(findings.root).toBe('feed')
    expect(findings.namespaces).toEqual({ '': 'http://www.w3.org/2005/Atom', 'media': MEDIA })
    expect(findings.lists).toEqual([{ path: '//feed/entry', count: 2, children: ['title', 'link', 'thumbnail'] }])
    expect(findings.tree).toEqual(['/feed', '/feed/title  "Incentivi"', '/feed/entry  ×2', '/feed/entry/title  ×2  "Pandina"', '/feed/entry/link  ×2  @href', '/feed/entry/thumbnail  @url'])
    const report = xmlReport('https://x/feed.xml', findings)
    expect(report).toContain('query with "namespaces": { "x": "http://www.w3.org/2005/Atom" } and //x:feed')
    expect(report).toContain('//feed/entry  2 entries')
  })

  it('recognises a sitemap and counts its locations', () => {
    const findings = describeXml(parseXml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://x/1</loc></url><url><loc>https://x/2</loc></url></urlset>', 'sitemap.xml'))
    expect(findings.sitemap).toEqual({ kind: 'urlset', locations: 2 })
    expect(xmlReport('https://x/sitemap.xml', findings)).toContain('(XML: urlset, a sitemap of 2 pages)')
  })
})
