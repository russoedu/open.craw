import { walkXml } from '../ooxml-package'

/**
 * The speaker notes of a notes-slide part: the text of its body placeholder
 * (the slide image and the slide number placeholders are left out).
 *
 * @param xml - The notes-slide part.
 * @returns The notes, paragraphs joined by line breaks.
 */
export function readNotes (xml: string): string {
  const paragraphs: string[] = []
  let inBody = false
  let paragraph: string | undefined
  let inText = false
  walkXml(xml, {
    open: (name, attributes) => {
      if (name === 'sp') inBody = false
      else if (name === 'ph') inBody = (attributes.type ?? 'body') === 'body'
      else if (inBody && name === 'p') paragraph = ''
      else if (name === 't') inText = paragraph !== undefined
      else if (name === 'br' && paragraph !== undefined) paragraph += '\n'
    },
    text: (text) => {
      if (inText && paragraph !== undefined) paragraph += text
    },
    close: (name) => {
      if (name === 't') {
        inText = false
      } else if (name === 'p' && paragraph !== undefined) {
        paragraphs.push(paragraph)
        paragraph = undefined
      }
    },
  })

  return paragraphs.join('\n').trim()
}
