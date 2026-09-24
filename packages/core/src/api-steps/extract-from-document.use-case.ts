import type { ExtractionScope, ScopeDocument } from '../extraction-scope'
import type { ExtractStep } from '../recipe-schema'
import { selectHtml, selectJson, takeFromHtml, takeFromJson } from '../selection'
import { NoMatchError } from '../step-flow'

/**
 * Runs an `extract` step against a static document: the value bound under
 * `from`, else the scope's current document. `css` reads HTML, `jsonpath`
 * reads JSON; `xpath` needs a live page and is refused here.
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
  if (typeof source === 'string') return { kind: 'html', html: source }
  if (source === undefined) throw new Error(`"${step.from}" is not bound`)

  return { kind: 'json', data: source }
}
