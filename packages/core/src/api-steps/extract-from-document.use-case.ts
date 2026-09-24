import type { ExtractionScope, ScopeDocument } from '../extraction-scope'
import type { ExtractStep } from '../recipe-schema'
import { selectHtml, selectJson, selectRegex, takeFromHtml, takeFromJson } from '../selection'
import { hasPlaceholder, renderText } from '../template'
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
  const selector = renderSelector(step.selector, scope)
  let values: unknown[]
  switch (step.kind) {
    case 'jsonpath': {
      if (document.kind !== 'json') throw new Error(`jsonpath needs a JSON document; the current document is ${document.kind}`)
      values = selectJson(document.data, selector).map(node => takeFromJson(node, take))

      break
    }
    case 'css': {
      if (document.kind !== 'html') throw new Error(`css needs an HTML document; the current document is ${document.kind}`)
      values = selectHtml(document.html, selector).map(match => takeFromHtml(match, take))

      break
    }
    case 'regex': {
      values = selectRegex(textOf(document), selector)

      break
    }
    default: {
      throw new Error('xpath works on a live page only; use css on fetched HTML')
    }
  }
  if (step.many === true) {
    if (step.id !== undefined) scope.set(step.id, values)

    return
  }
  if (values.length === 0) throw new NoMatchError(step.selector)
  if (step.id !== undefined) scope.set(step.id, values[0])
}

/**
 * A selector may carry `{{ }}` placeholders (a trim name, an id): they render
 * against the scope before the selector runs.
 *
 * @param selector - The recipe's selector.
 * @param scope - The current scope.
 * @returns The selector to run.
 */
export function renderSelector (selector: string, scope: ExtractionScope): string {
  return hasPlaceholder(selector) ? renderText(selector, path => scope.lookup(path)) : selector
}

/** The text a regex extract reads: markup, text, or JSON re-serialised (a list of texts joined by newlines). */
function textOf (document: ScopeDocument): string {
  if (document.kind === 'html') return document.html
  if (document.kind === 'text') return document.text
  if (Array.isArray(document.data) && document.data.every(entry => typeof entry === 'string')) return document.data.join('\n')

  return typeof document.data === 'string' ? document.data : JSON.stringify(document.data)
}

function documentFor (step: ExtractStep, scope: ExtractionScope): ScopeDocument {
  if (step.from === undefined) {
    const current = scope.document
    if (current === undefined) throw new Error('nothing to extract from: no request ran yet and no "from" is given')

    return current
  }
  const source = scope.get(step.from)
  if (source === undefined) throw new Error(`"${step.from}" is not bound`)
  if (step.kind === 'regex') {
    if (typeof source === 'string') return { kind: 'text', text: source }

    return { kind: 'json', data: source }
  }
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

/** Comment guards sites wrap inline JSON-LD in: a CDATA marker inside a block comment, or an HTML comment. */
const GUARDS = /^\s*(?:\/\*\s*<!\[CDATA\[\s*\*\/|<!\[CDATA\[|<!--)\s*|\s*(?:\/\*\s*\]\]>\s*\*\/|\]\]>|-->)\s*$/g

function tryParseJson (text: string): unknown {
  try {
    return JSON.parse(text.replaceAll(GUARDS, '')) as unknown
  } catch {
    return undefined
  }
}
