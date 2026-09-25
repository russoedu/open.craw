import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { chromium } from 'playwright'
import type { Browser } from 'playwright'
import { rollup } from 'rollup'

// The package promises to run outside Node: this bundles the BUILT entry point
// for the browser, the way an app's bundler would, and reads a workbook from a
// Blob in Chromium. A static import of a Node built-in would leave an
// unresolvable `import … from "node:…"` at the top of the bundle and fail the
// page; only the dynamic import that reads a path is allowed.
const dist = join(__dirname, '..', 'dist')
const fixture = readFileSync(join(__dirname, '..', 'src', 'spreadsheet', 'fixtures', 'incentivi.xlsx'))
const deck = readFileSync(join(__dirname, '..', 'src', 'presentation', 'fixtures', 'incentivi.pptx'))

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch({ executablePath: process.env.OPENCRAW_CHROMIUM })
})
afterAll(async () => {
  await browser.close()
})

async function bundle (entry: string): Promise<string> {
  const build = await rollup({ input: join(dist, entry), plugins: [nodeResolve({ browser: true })], external: id => id.startsWith('node:'), onwarn: () => {} })
  const { output } = await build.generate({ format: 'esm', inlineDynamicImports: true })
  await build.close()

  return output[0].code
}

describe('office-reader in a browser', () => {
  it('bundles with no static Node import and reads a workbook from a Blob', async () => {
    const code = await bundle('xlsx.esm.js')
    expect(code).not.toMatch(/^import[^;]*from\s*['"]node:/m)
    const page = await browser.newPage()
    try {
      await page.setContent('<!doctype html><title>office-reader</title>')
      await page.addScriptTag({ type: 'module', content: `${code}\nwindow.officeReader = { readXlsx, OfficeReadError }` })
      await page.waitForFunction('window.officeReader !== undefined')
      const rows = await page.evaluate(async (base64) => {
        const bytes = Uint8Array.from(atob(base64), char => char.codePointAt(0) ?? 0)
        const reader = (globalThis as unknown as { officeReader: { readXlsx: (source: Blob, options: unknown) => Promise<{ sheets: { rows: string[][] }[] }> } }).officeReader
        const book = await reader.readXlsx(new Blob([bytes]), { values: 'text', sheets: 'Incentivi giugno' })

        return book.sheets[0].rows.slice(4, 6)
      }, fixture.toString('base64'))
      expect(rows).toEqual([
        ['Fiat', 'Pandina', '15950', '13955.625', '0.125', '2026-06-01', 'true', 'Solo rottamazione'],
        ['', 'Pandina Cross', '17950', '15706.25', '0.125', '2026-06-01T09:30:00', 'false', '#DIV/0!'],
      ])
    } finally {
      await page.close()
    }
  })

  it('bundles the presentation reader the same way and reads a deck from a Blob', async () => {
    const code = await bundle('pptx.esm.js')
    expect(code).not.toMatch(/^import[^;]*from\s*['"]node:/m)
    const page = await browser.newPage()
    try {
      await page.setContent('<!doctype html><title>office-reader</title>')
      await page.addScriptTag({ type: 'module', content: `${code}\nwindow.officeReader = { readPptx }` })
      await page.waitForFunction('window.officeReader !== undefined')
      const slides = await page.evaluate(async (base64) => {
        const bytes = Uint8Array.from(atob(base64), char => char.codePointAt(0) ?? 0)
        const reader = (globalThis as unknown as { officeReader: { readPptx: (source: Blob) => Promise<{ slides: { title?: string, charts: unknown[] }[] }> } }).officeReader
        const read = await reader.readPptx(new Blob([bytes]))

        return read.slides.map(slide => [slide.title, slide.charts.length])
      }, deck.toString('base64'))
      expect(slides).toEqual([['Incentivi giugno', 0], ['Griglia prezzi Jeep', 0], ['Vendite', 1], ['Bozza', 0]])
    } finally {
      await page.close()
    }
  })
})
