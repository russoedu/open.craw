import type { ProbeFindings } from './find-data.algorithm'
import type { PdfFindings } from './pdf-findings.mapper'

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

/**
 * Renders what a probe found in a PDF as text.
 *
 * @param url - The URL or file probed.
 * @param pdf - What `describePdf` found.
 * @returns The report.
 */
export function pdfReport (url: string, pdf: PdfFindings): string {
  return [
    `${url} (PDF, ${pdf.pages} page${pdf.pages === 1 ? '' : 's'})`,
    '',
    section('Likely table headers (a "table" extract selector for each)', pdf.headers.map(header => `  p${header.page}  ${header.selector}\n        ${header.text}`)),
    section('First rows (cells separated by " | ")', pdf.rows.map(row => `  p${row.page}  ${row.text}`)),
  ].filter(line => line !== '').join('\n')
}

function section (title: string, rows: string[]): string {
  if (rows.length === 0) return ''

  return [`${title}:`, ...rows, ''].join('\n')
}
