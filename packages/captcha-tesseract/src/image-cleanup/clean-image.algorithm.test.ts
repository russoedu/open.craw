import { PNG } from 'pngjs'
import { cleanImage, otsuThreshold } from './clean-image.algorithm'

/** A PNG from rows of characters: `#` green ink, `.` white, `o` speckle (grey), `w` white on a dark ground. */
function png (rows: string[]): Buffer {
  const image = new PNG({ width: rows[0].length, height: rows.length })
  for (const [y, row] of rows.entries()) {
    for (const [x, cell] of [...row].entries()) {
      const offset = ((y * row.length) + x) * 4
      const [r, g, b] = { '#': [10, 107, 10], '.': [255, 255, 255], 'o': [90, 90, 90], 'w': [20, 20, 60] }[cell] ?? [255, 255, 255]
      image.data.set([r, g, b, 255], offset)
    }
  }

  return PNG.sync.write(image)
}

/** The cleaned image as rows of `#` (black) and `.` (white), padding included. */
function rowsOf (buffer: Buffer): string[] {
  const image = PNG.sync.read(buffer)
  const rows: string[] = []
  for (let y = 0; y < image.height; y += 1) {
    let row = ''
    for (let x = 0; x < image.width; x += 1) row += image.data[((y * image.width) + x) * 4] === 0 ? '#' : '.'
    rows.push(row)
  }

  return rows
}

/** The cleaned rows of an image given as rows. */
function cleaned (rows: string[], options: Parameters<typeof cleanImage>[1]): string[] {
  return rowsOf(cleanImage(png(rows), options))
}

describe('cleanImage', () => {
  it('turns ink black and the ground white, scales with hard edges and pads with white', () => {
    expect(cleaned(['#.', '.#'], { scale: 2, padding: 1 })).toEqual([
      '......',
      '.##...',
      '.##...',
      '...##.',
      '...##.',
      '......',
    ])
  })

  it('turns light text on a dark ground the right way round', () => {
    expect(cleaned(['ww.', 'www', 'www'], { scale: 1, padding: 0 })).toEqual(['..#', '...', '...'])
    expect(cleaned(['ww.', 'www', 'www'], { scale: 1, padding: 0, invert: false })).toEqual(['##.', '###', '###'])
  })

  it('removes a lone speck with the median filter', () => {
    const speckled = ['.....', '.....', '..o..', '.....', '.....']
    expect(cleaned(speckled, { scale: 1, padding: 0, threshold: 128 }).join('')).toContain('#')
    expect(cleaned(speckled, { scale: 1, padding: 0, threshold: 128, median: true }).join('')).not.toContain('#')
  })
})

describe('otsuThreshold', () => {
  it('splits two groups of luminance between them', () => {
    const threshold = otsuThreshold(Uint8Array.from([20, 22, 25, 30, 230, 235, 240, 250]))
    expect(threshold).toBeGreaterThanOrEqual(30)
    expect(threshold).toBeLessThan(230)
  })
})
