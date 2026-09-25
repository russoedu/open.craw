import { walkXml } from '../ooxml-package'

/**
 * The shared string table: the text of every `<si>`, rich-text runs joined.
 * Phonetic guides (`<rPh>`, the furigana over Japanese text) are not part of
 * the text and are left out.
 *
 * @param xml - The shared strings part; empty when the workbook has none.
 * @returns The strings, by index.
 */
export function sharedStrings (xml: string): string[] {
  const strings: string[] = []
  let current: string | undefined
  let inText = false
  let phonetic = 0
  walkXml(xml, {
    open: (name) => {
      if (name === 'si') current = ''
      else if (name === 'rPh') phonetic += 1
      else if (name === 't' && phonetic === 0) inText = true
    },
    text: (text) => {
      if (inText && current !== undefined) current += text
    },
    close: (name) => {
      switch (name) {
        case 't': {
          inText = false

          break
        }
        case 'rPh': {
          phonetic -= 1

          break
        }
        case 'si': {
          strings.push(current ?? '')
          current = undefined

          break
        }
      // No default
      }
    },
  })

  return strings
}
