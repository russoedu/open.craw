import { PNG } from 'pngjs'

/** How a captcha image is cleaned before Tesseract reads it. */
export interface CleanupOptions {
  /** How many times larger: Tesseract reads glyphs of 20 px and more best. Default 3. */
  scale?:     number
  /** The luminance (0–255) under which a pixel is ink; `'otsu'` (the default) finds it from the image. */
  threshold?: number | 'otsu'
  /** Light text on a dark ground is turned dark on light: `'auto'` (the default) when ink covers most of the image. */
  invert?:    boolean | 'auto'
  /** A 3×3 median filter against salt-and-pepper noise, run after thresholding. Default off. */
  median?:    boolean
  /** White margin around the text, in output pixels: Tesseract misses glyphs touching the edge. Default 10. */
  padding?:   number
}

const WHITE = 255
const BLACK = 0

/**
 * Cleans a captcha image for OCR: grayscale, black ink on white (a threshold
 * picked by Otsu's method unless given, turned the right way round), an
 * optional median filter, scaled up with hard edges, and a white margin.
 *
 * Like photocopying a smudged note at high contrast before reading it.
 *
 * @param png - The image, as PNG bytes (a screenshot).
 * @param options - The cleanup settings.
 * @returns The cleaned image, as PNG bytes.
 */
export function cleanImage (png: Buffer, options: CleanupOptions = {}): Buffer {
  const image = PNG.sync.read(png)
  const scale = Math.max(1, Math.round(options.scale ?? 3))
  const padding = Math.max(0, Math.round(options.padding ?? 10))
  // Scaled up smoothly before thresholding: anti-aliased edges become smooth curves, not staircases (an 8 stays an 8).
  const width = image.width * scale
  const height = image.height * scale
  const luminance = upscale(luminanceOf(image.data, image.width * image.height), image.width, image.height, scale)
  const threshold = options.threshold === undefined || options.threshold === 'otsu' ? otsuThreshold(luminance) : options.threshold
  let ink: Uint8Array = luminance.map(value => (value <= threshold ? 1 : 0))
  const inkShare = ink.reduce((sum, value) => sum + value, 0) / ink.length
  if (options.invert === true || ((options.invert ?? 'auto') === 'auto' && inkShare > 0.5)) ink = ink.map(value => 1 - value)
  if (options.median === true) ink = medianOf(ink, width, height)

  return PNG.sync.write(render(ink, width, height, padding))
}

/**
 * The threshold that best splits the luminances in two groups (Otsu): the
 * value maximising the variance between ink and ground.
 *
 * @param luminance - One 0–255 value per pixel.
 * @returns The threshold: values at or under it are ink.
 */
export function otsuThreshold (luminance: Uint8Array): number {
  const histogram: number[] = Array.from({ length: 256 }, () => 0)
  for (const value of luminance) histogram[value] += 1
  const total = luminance.length
  const sum = histogram.reduce((accumulator, count, value) => accumulator + value * count, 0)
  let below = 0
  let belowSum = 0
  let best = -1
  let threshold = 127
  for (let value = 0; value < 256; value += 1) {
    below += histogram[value]
    if (below === 0) continue
    const above = total - below
    if (above === 0) break
    belowSum += value * histogram[value]
    const between = below * above * ((belowSum / below) - ((sum - belowSum) / above)) ** 2
    if (between > best) {
      best = between
      threshold = value
    }
  }

  return threshold
}

function luminanceOf (rgba: Uint8Array, pixels: number): Uint8Array {
  const luminance = new Uint8Array(pixels)
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4
    const alpha = rgba[offset + 3] / 255
    // A transparent pixel is the white page behind it.
    const blend = (channel: number): number => (channel * alpha) + (WHITE * (1 - alpha))
    const red = blend(rgba[offset])
    const green = blend(rgba[offset + 1])
    const blue = blend(rgba[offset + 2])
    luminance[pixel] = Math.round((0.299 * red) + (0.587 * green) + (0.114 * blue))
  }

  return luminance
}

function medianOf (ink: Uint8Array, width: number, height: number): Uint8Array {
  const filtered = new Uint8Array(ink.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) filtered[(y * width) + x] = majorityAround(ink, width, height, x, y)
  }

  return filtered
}

/** 1 when most of the pixel's 3×3 neighbourhood (inside the image) is ink. */
function majorityAround (ink: Uint8Array, width: number, height: number, x: number, y: number): number {
  let votes = 0
  let seen = 0
  for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny += 1) {
    for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx += 1) {
      votes += ink[(ny * width) + nx]
      seen += 1
    }
  }

  return votes * 2 > seen ? 1 : 0
}

function render (ink: Uint8Array, width: number, height: number, padding: number): PNG {
  const outWidth = width + (padding * 2)
  const out = new PNG({ width: outWidth, height: height + (padding * 2) })
  out.data.fill(WHITE)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = (((y + padding) * outWidth) + x + padding) * 4
      if (ink[(y * width) + x] === 1) out.data.fill(BLACK, start, start + 3)
    }
  }

  return out
}

/** Bilinear upscaling of a luminance map. */
function upscale (luminance: Uint8Array, width: number, height: number, scale: number): Uint8Array {
  if (scale === 1) return luminance
  const outWidth = width * scale
  const scaled = new Uint8Array(outWidth * height * scale)
  const at = (x: number, y: number): number => luminance[(Math.min(height - 1, y) * width) + Math.min(width - 1, x)]
  for (let y = 0; y < height * scale; y += 1) {
    const sourceY = Math.max(0, ((y + 0.5) / scale) - 0.5)
    const top = Math.floor(sourceY)
    const down = sourceY - top
    for (let x = 0; x < outWidth; x += 1) {
      const sourceX = Math.max(0, ((x + 0.5) / scale) - 0.5)
      const left = Math.floor(sourceX)
      const right = sourceX - left
      const upper = (at(left, top) * (1 - right)) + (at(left + 1, top) * right)
      const lower = (at(left, top + 1) * (1 - right)) + (at(left + 1, top + 1) * right)
      scaled[(y * outWidth) + x] = Math.round((upper * (1 - down)) + (lower * down))
    }
  }

  return scaled
}
