import { namespacedAttribute, walkXml } from '../ooxml-package'

/** Formats that do not number: a bullet, or nothing. */
const UNNUMBERED = new Set(['bullet', 'none'])

/**
 * Reads `numbering.xml`: for a list (`numId`) at a level, whether its items
 * are numbered (`1.`, `a)`, `i.`) or bulleted.
 *
 * @param xml - The numbering part; empty when the document has none.
 * @returns Whether a list level is ordered.
 */
export function readNumbering (xml: string): (numId: string, level: number) => boolean {
  const formats = new Map<string, Map<number, string>>()
  const abstractOf = new Map<string, string>()
  let abstract: Map<number, string> | undefined
  let level: number | undefined
  let num: string | undefined
  walkXml(xml, {
    open: (name, attributes) => {
      switch (name) {
        case 'abstractNum': {
          abstract = new Map()
          formats.set(namespacedAttribute(attributes, 'abstractNumId') ?? '', abstract)

          break
        }
        case 'lvl': {
          level = Number(namespacedAttribute(attributes, 'ilvl') ?? 0)

          break
        }
        case 'numFmt': {
          if (abstract !== undefined && level !== undefined) abstract.set(level, namespacedAttribute(attributes, 'val') ?? 'decimal')

          break
        }
        case 'num': {
          num = namespacedAttribute(attributes, 'numId')

          break
        }
        case 'abstractNumId': {
          if (num !== undefined) abstractOf.set(num, namespacedAttribute(attributes, 'val') ?? '')

          break
        }
        // No default
      }
    },
    close: (name) => {
      switch (name) {
        case 'abstractNum': {
          abstract = undefined
          break
        }
        case 'lvl': {
          level = undefined
          break
        }
        case 'num': { {
          num = undefined
          // No default
        }
        break
        }
      }
    },
  })

  return (numId, at) => {
    const format = formats.get(abstractOf.get(numId) ?? '')?.get(at) ?? 'bullet'

    return !UNNUMBERED.has(format)
  }
}
