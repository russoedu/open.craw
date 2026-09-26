import { namespacedAttribute, walkXml } from '../ooxml-package'

/** What a paragraph style says about the paragraphs that use it. */
interface StyleFacts {
  name:     string
  basedOn?: string
  outline?: number
  numId?:   string
  level?:   number
}

/** How a paragraph style reads: as a heading of some level, as a list, or neither. */
export interface ParagraphStyles {
  heading: (styleId: string | undefined) => number | undefined
  list:    (styleId: string | undefined) => { numId: string, level: number } | undefined
}

/**
 * Reads the paragraph styles of `styles.xml`. A heading is a style named
 * `heading N` (the built-in names stay English whatever the document's
 * language: an Italian `Titolo1` is still named `heading 1`), a style with an
 * outline level, or `Title`; either can be inherited through `basedOn`. A
 * style can also carry list numbering (`List Bullet`).
 *
 * @param xml - The styles part; empty when the document has none.
 * @returns The lookups.
 */
export function readStyles (xml: string): ParagraphStyles {
  const styles = new Map<string, StyleFacts>()
  let current: StyleFacts | undefined
  let inNumbering = false
  walkXml(xml, {
    open: (name, attributes) => {
      const value = namespacedAttribute(attributes, 'val')
      if (name === 'style') {
        current = namespacedAttribute(attributes, 'type') === 'paragraph' ? { name: '' } : undefined
        if (current !== undefined) styles.set(namespacedAttribute(attributes, 'styleId') ?? '', current)

        return
      }
      if (current === undefined) return
      switch (name) {
        case 'name': {
          current.name = (value ?? '').toLowerCase()
          break
        }
        case 'basedOn': {
          current.basedOn = value
          break
        }
        case 'outlineLvl': {
          current.outline = Number(value)
          break
        }
        case 'numPr': {
          inNumbering = true
          break
        }
        default: { if (inNumbering && name === 'numId') current.numId = value
        else if (inNumbering && name === 'ilvl') current.level = Number(value)
        }
      }
    },
    close: (name) => {
      if (name === 'numPr') inNumbering = false
      else if (name === 'style') current = undefined
    },
  })
  const chain = (styleId: string | undefined): StyleFacts[] => {
    const seen: StyleFacts[] = []
    for (let id = styleId, facts = id === undefined ? undefined : styles.get(id); facts !== undefined && seen.length < 20; id = facts.basedOn, facts = id === undefined ? undefined : styles.get(id)) seen.push(facts)

    return seen
  }

  return {
    heading: (styleId) => {
      for (const facts of chain(styleId)) {
        const named = /^heading ([1-9])$/.exec(facts.name)
        if (named !== null) return Number(named[1])
        if (facts.name === 'title') return 1
        if (facts.outline !== undefined && facts.outline < 9) return facts.outline + 1
      }

      return
    },
    list: (styleId) => {
      const facts = chain(styleId).find(entry => entry.numId !== undefined)

      return facts?.numId === undefined ? undefined : { numId: facts.numId, level: facts.level ?? 0 }
    },
  }
}
