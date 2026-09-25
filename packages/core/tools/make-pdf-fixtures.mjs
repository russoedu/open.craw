// Writes the PDF fixtures the pdf-document tests read, by hand: a tiny PDF
// writer (Helvetica, positioned text) is enough, and it keeps third-party
// documents out of the repository. The layout reproduces what real price and
// discount lists do to a table: values a few points off their label, a name
// wrapped around centred values, a list wrapped above and below its row, one
// header over two columns, bottom-aligned two-line notes, columns that move
// from table to table, and footnotes.
//
//   node packages/core/tools/make-pdf-fixtures.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'pdf-document', 'fixtures')

const t = (x, y, text) => ({ x, y, text })

const pageOne = [
  t(100, 810, 'DEALER DISCOUNTS - SEPTEMBER 2026'),
  // A: headers centred over left-aligned columns.
  t(92, 790, 'MODELS ALPHA'), t(212, 790, 'Discount %*'), t(261, 790, 'Excluded versions'), t(430, 790, 'Extra *'),
  t(40, 780, 'CITY (model 101)'), t(218, 780, '19,0%'), t(326, 780, '+3% registration bonus'),
  t(40, 771, 'CITY EV (model 102)'), t(220, 771, '3,0%'),
  // The value sits 3 points above its label: a two-line cell centred beside it.
  t(40, 759, 'MINI (model 103)'), t(220, 762, '0,0%'), t(326, 762, '1000 euro scrappage bonus'),
  // Excluded versions wrapped above and below the row.
  t(254, 750, 'Special 100 edition'), t(40, 741, 'SEDAN (model 104)'), t(218, 741, '16,0%'), t(254, 741, '104.8RU-Top'), t(254, 732, 'Sport 104.LRU'),
  // A name wrapped over three lines, its values centred on the middle line.
  t(40, 723, 'WAGON base series 1 (104.E23 without'), t(220, 714, '12,0%'), t(326, 714, '3% stock bonus'), t(40, 705, 'OPT JFS-JFR)'),
  t(40, 696, 'COUPE (model 105)'), t(218, 696, '11,0%'),
  t(40, 687, 'NOTE: invoices dated before 01/07/2025 are excluded'),
  // B: the notes column sits left of its header, which it does not overlap.
  t(160, 660, 'MODELS BETA'), t(278, 660, 'Discount %*'), t(390, 660, 'Extras*'),
  t(142, 650, 'ROADSTER'), t(283, 650, '20,0%'), t(314, 650, '+ 3% trade-in'),
  t(142, 641, 'VAN'), t(283, 641, '18,5%'), t(314, 641, '+ 2% trade-in'),
  // C: one header over two columns.
  t(40, 610, 'MODELS DELTA (DEALERS ONLY)'), t(199, 610, '(PROMO ONLY AT DEALERS)'), t(422, 610, 'Extra *'),
  t(40, 600, 'TRUCK 290'), t(218, 600, '18,0%'), t(254, 600, 'M1/M2'), t(326, 600, 'Extra 2% trade-in'),
  t(40, 591, 'TRUCK 505'), t(218, 591, '14,0%'),
]

const pageTwo = [
  // D: two-line notes, bottom-aligned: the first line sits between two rows.
  t(90, 790, 'MODELS GAMMA'), t(295, 790, 'Discount %*'), t(420, 790, 'Extras*'),
  t(360, 780, '+ Eu 800 trade-in _ Eu 1500'),
  t(60, 771, 'G3 MHEV'), t(300, 771, '7,0%'), t(360, 771, 'stock until 30/09/26'),
  t(360, 762, '+ Eu 1000 trade-in _ Eu 1500'),
  t(60, 753, 'G3 BEV'), t(300, 753, '5,0%'), t(360, 753, 'stock until 30/09/26'),
  t(60, 730, '*Discounts apply to the base list price'),
]

writeFileSync(join(out, 'discounts.pdf'), pdf([pageOne, pageTwo]))
writeFileSync(join(out, 'scanned.pdf'), pdf([[]], '0 0 1 rg 100 100 300 300 re f'))

/**
 * A minimal PDF: one Helvetica font, 7 pt text at absolute positions.
 *
 * @param pages - Per page, the texts.
 * @param drawing - Extra content-stream operators for every page (no text).
 * @returns The file.
 */
function pdf (pages, drawing = '') {
  const objects = []
  const add = (body) => {
    objects.push(body)

    return objects.length
  }
  const catalog = add('')
  const tree = add('')
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const kids = pages.map((texts) => {
    const content = [drawing, ...texts.map(({ x, y, text }) => `BT /F1 7 Tf 1 0 0 1 ${x} ${y} Tm (${text.replaceAll(/[()\\]/g, match => `\\${match}`)}) Tj ET`)].filter(Boolean).join('\n')
    const stream = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`)

    return add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`)
  })
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`
  objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map(kid => `${kid} 0 R`).join(' ')}] /Count ${kids.length} >>`
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(body, 'latin1')
    body += `${index + 1} 0 obj\n${object}\nendobj\n`

    return offset
  })
  const xref = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`

  return Buffer.from(body, 'latin1')
}
