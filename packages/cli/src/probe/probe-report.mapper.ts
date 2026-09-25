import type { ProbeFindings } from './find-data.algorithm'

/**
 * Renders a probe's findings as text.
 *
 * @param url - The URL probed.
 * @param status - The HTTP status.
 * @param findings - What `findData` found.
 * @param observed - JSON responses a browser saw, when `--browser` was used.
 * @returns The report.
 */
export function probeReport (url: string, status: number, findings: ProbeFindings, observed: string[] = []): string {
  const sections = [
    section('JSON-LD blocks', findings.jsonLd.map(block => `  type=${block.types}, ${block.keys} keys`)),
    section('Inline JSON (candidates)', findings.inlineJson.map(block => `  ${block.where}, ${block.size} chars, keys: ${block.keys.slice(0, 8).join(', ')}`)),
    section('.json URLs referenced', findings.jsonUrls.map(url_ => `  ${url_}`)),
    section('Script hosts', findings.scriptHosts.map(host => `  ${host}`)),
    section('Links that look like an API', findings.apiLinks.map(link => `  ${link}`)),
    observed.length > 0 ? section('JSON responses observed in the browser', observed.map(entry => `  ${entry}`)) : '',
  ]

  return [`${url} (HTTP ${status})`, '', ...sections].filter(line => line !== '').join('\n')
}

function section (title: string, rows: string[]): string {
  if (rows.length === 0) return ''

  return [`${title}:`, ...rows, ''].join('\n')
}
