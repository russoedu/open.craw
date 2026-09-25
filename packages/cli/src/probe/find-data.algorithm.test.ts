import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findData } from './find-data.algorithm'
import { probeReport } from './probe-report.mapper'

function fixture (name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8')
}

describe('findData', () => {
  it('finds the carPath JSON, script hosts and the api link on a configurator page', () => {
    const findings = findData(fixture('car-config.html'))
    expect(findings.jsonUrls).toContain('https://cms-api.example.com/car/example/uk/model-x.json')
    expect(findings.scriptHosts).toEqual(['cdn.example.com', 'analytics.example.net'])
    expect(findings.apiLinks).toEqual(['/uk/api/pricing'])
    expect(findings.inlineJson[0].keys).toEqual(expect.arrayContaining(['carPath', 'locale', 'featureFlags', 'trims', 'pricing']))
    expect(findings.jsonLd).toEqual([])
  })

  it('finds every JSON-LD block and its type', () => {
    const findings = findData(fixture('movie-jsonld.html'))
    expect(findings.jsonLd).toEqual([{ types: 'Movie', keys: 5 }, { types: 'BreadcrumbList', keys: 2 }])
    expect(findings.inlineJson).toEqual([])
  })

  it('ignores small or unparsable braces and non-JSON script bodies', () => {
    const findings = findData('<script>const x = {a:1}; doThing();</script><script>{"tiny":1}</script>')
    expect(findings.inlineJson).toEqual([])
  })

  it('renders a report with only the non-empty sections', () => {
    const report = probeReport('https://x/config', 200, findData(fixture('car-config.html')))
    expect(report).toContain('https://x/config (HTTP 200)')
    expect(report).toContain('.json URLs referenced:')
    expect(report).not.toContain('JSON-LD blocks:')
    const withObserved = probeReport('https://x', 200, findData(''), ['200 https://x/api/data.json'])
    expect(withObserved).toContain('JSON responses observed in the browser:')
  })
})
