import type { ExtractionScope, ScopeDocument } from '../extraction-scope'
import type { ExtractStep } from '../recipe-schema'
import { selectHtml, selectJson, takeFromHtml, takeFromJson } from '../selection'
import { NoMatchError } from '../step-flow'

/**
 * Runs an `extract` step against a static document: the value bound under
 * `from`, else the scope's current document. `css` reads HTML, `jsonpath`
 * reads JSON; `xpath` needs a live page and is refused here.
 *
 * A `jsonpath` extract whose `from` is text parses that text as JSON, and a
 * list of texts (every `<script type="application/ld+json">` of a page) becomes
 * an array of the entries that parse, so `$[*].actors[*].name` finds the block
 * that has actors wherever it sits.
 *
 * @param step - The extract step.
 * @param scope - Where the document and the result live.
 * @throws NoMatchError when a single extract matches nothing.
 */
export function extractFromDocument (step: ExtractStep, scope: ExtractionScope): void {
  const document = documentFor(step, scope)
  const take = step.take ?? 'text'
  let values: unknown[]
  if (step.kind === 'jsonpath') {
    if (document.kind !== 'json') throw new Error(`jsonpath needs a JSON document; the current document is ${document.kind}`)
    values = selectJson(document.data, step.selector).map(node => takeFromJson(node, take))
  } else if (step.kind === 'css') {
    if (document.kind !== 'html') throw new Error(`css needs an HTML document; the current document is ${document.kind}`)
    values = selectHtml(document.html, step.selector).map(match => takeFromHtml(match, take))
  } else {
    throw new Error('xpath works on a live page only; use css on fetched HTML')
  }
  if (step.many === true) {
    if (step.id !== undefined) scope.set(step.id, values)

    return
  }
  if (values.length === 0) throw new NoMatchError(step.selector)
  if (step.id !== undefined) scope.set(step.id, values[0])
}

function documentFor (step: ExtractStep, scope: ExtractionScope): ScopeDocument {
  if (step.from === undefined) {
    const current = scope.document
    if (current === undefined) throw new Error('nothing to extract from: no request ran yet and no "from" is given')

    return current
  }
  const source = scope.get(step.from)
  if (source === undefined) throw new Error(`"${step.from}" is not bound`)
  if (step.kind !== 'jsonpath') {
    if (typeof source !== 'string') throw new Error(`"${step.from}" is not HTML text; use kind "jsonpath" for data`)

    return { kind: 'html', html: source }
  }
  if (typeof source === 'string') return { kind: 'json', data: parseJsonText(source, step.from) }
  if (Array.isArray(source) && source.every(entry => typeof entry === 'string')) {
    const parsed = source.map(entry => tryParseJson(entry)).filter(entry => entry !== undefined)
    if (parsed.length === 0 && source.length > 0) throw new Error(`none of the ${source.length} texts bound to "${step.from}" is JSON`)

    return { kind: 'json', data: parsed }
  }

  return { kind: 'json', data: source }
}

function parseJsonText (text: string, id: string): unknown {
  const parsed = tryParseJson(text)
  if (parsed === undefined) throw new Error(`"${id}" is text but not JSON`)

  return parsed
}

function tryParseJson (text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
