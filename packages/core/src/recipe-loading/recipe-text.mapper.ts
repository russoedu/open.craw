import type { RecipeDocument } from './recipe-source.contract'

/**
 * Decodes recipe text: one JSON document (a recipe, or an array of recipes) or
 * JSON Lines (one recipe per non-blank line).
 *
 * @param text - The text.
 * @param label - Where it came from, prefixed to each document's source.
 * @returns The decoded recipes: `label` for a single one, `label[i]` for array
 * items, `label:line` for JSON Lines.
 * @throws Error naming the label (and the line, for JSON Lines) when the text
 * is neither.
 */
export function parseRecipeText (text: string, label: string): RecipeDocument[] {
  const body = text.replace(/^\u{FEFF}/u, '')
  if (body.trim() === '') throw new Error(`${label}: empty, expected JSON or JSON Lines`)
  const whole = parseJson(body)

  return 'value' in whole ? documentsOf(whole.value, label) : parseLines(body, label, whole.error)
}

function parseLines (body: string, label: string, wholeError: Error): RecipeDocument[] {
  const lines = body.split(/\r?\n/).map((text, index) => ({ text, number: index + 1 })).filter(line => line.text.trim() !== '')
  const documents: RecipeDocument[] = []
  for (const line of lines) {
    const parsed = parseJson(line.text)
    if ('error' in parsed) {
      // A first line that does not parse means this is not JSON Lines at all: a
      // broken JSON document, whose own error points at the real problem.
      if (documents.length === 0) throw new Error(`${label}: not valid JSON (${wholeError.message})`, { cause: wholeError })
      throw new Error(`${label}:${line.number}: not valid JSON (${parsed.error.message})`, { cause: parsed.error })
    }
    documents.push(...documentsOf(parsed.value, `${label}:${line.number}`))
  }

  return documents
}

function parseJson (text: string): { value: unknown } | { error: Error } {
  try {
    return { value: JSON.parse(text) as unknown }
  } catch (error) {
    return { error: error as Error }
  }
}

function documentsOf (value: unknown, label: string): RecipeDocument[] {
  return Array.isArray(value) ? value.map((content: unknown, index) => ({ source: `${label}[${index}]`, content })) : [{ source: label, content: value }]
}
