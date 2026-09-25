import { readRecipeFiles } from './recipe-file.repository'
import type { RecipeBytes, RecipeDocument, RecipeSource } from './recipe-source.contract'
import { parseRecipeText } from './recipe-text.mapper'

/**
 * Reads recipes from any {@link RecipeSource}: paths, JSON or JSON Lines text,
 * bytes, decoded objects, or an array mixing them. Nothing is validated yet;
 * the documents keep where they came from, for error messages.
 *
 * @param source - Where the recipes are.
 * @param label - What to call recipes that did not come from a file.
 * @returns The decoded recipes, in the order given.
 * @throws Error naming the source when a path is missing, text does not
 * decode, or a value is not a recipe source at all.
 */
export async function readRecipeSource (source: RecipeSource, label = 'recipes'): Promise<RecipeDocument[]> {
  if (typeof source === 'string') return isRecipeText(source) ? parseRecipeText(source, label) : readRecipeFiles(source)
  if (Array.isArray(source)) {
    const documents: RecipeDocument[] = []
    for (const [index, item] of (source as readonly RecipeSource[]).entries()) documents.push(...await readRecipeSource(item, `${label}[${index}]`))

    return documents
  }
  if (isRecipeBytes(source)) return parseRecipeText(await textOf(source), nameOf(source) ?? label)
  if (typeof source === 'object' && source !== null) return [{ source: label, content: source }]

  throw new TypeError(`${label}: not a recipe source (expected a path, JSON or JSON Lines text, bytes, a recipe object, or an array of them)`)
}

/** Text, not a path: no path starts with `{` or `[` (`\s` covers a byte order mark). */
function isRecipeText (value: string): boolean {
  return /^\s*[[{]/.test(value)
}

function isRecipeBytes (value: unknown): value is RecipeBytes {
  if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true

  return typeof value === 'object' && value !== null && typeof (value as Partial<AsyncIterable<unknown>>)[Symbol.asyncIterator] === 'function'
}

async function textOf (bytes: RecipeBytes): Promise<string> {
  if (bytes instanceof Blob) return bytes.text()
  if (bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes)) return new TextDecoder().decode(bytes)
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of bytes) text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })

  return text + decoder.decode()
}

function nameOf (bytes: RecipeBytes): string | undefined {
  return typeof File === 'function' && bytes instanceof File && bytes.name !== '' ? bytes.name : undefined
}
