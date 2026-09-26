import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import type { HttpSender } from '../http-session'
import type { InputRecipe, PaginateNext, Step } from '../recipe-schema'
import { selectJson } from '../selection'
import { RunGate } from '../step-flow'
import type { NextPageResult, StepRunner } from '../step-flow'
import { renderText } from '../template'
import { extractFromDocument } from './extract-from-document.use-case'
import { sendRequest } from './send-request.use-case'

/**
 * The next page a `next.jsonpath` finds in the page body's last fetched JSON
 * document: a URL to fetch, or (with `as`) a cursor the next body reads.
 *
 * @param next - The paginate rule.
 * @param scope - The page scope, holding the document.
 * @returns The next page, or `null` when the value is empty.
 */
export function nextFromDocument (next: { jsonpath: string, as?: string }, scope: ExtractionScope): NextPageResult {
  const document = scope.document
  if (document?.kind !== 'json') throw new Error('next.jsonpath needs a JSON document from a request in the page body')
  const value = selectJson(document.data, next.jsonpath)[0]
  if ([undefined, null, '', false].includes(value as null)) return null
  if (next.as !== undefined) return { kind: 'value', name: next.as, value }
  if (typeof value !== 'string') throw new Error(`next.jsonpath ${next.jsonpath} must yield a URL; got ${typeof value} (use "as" to bind a cursor instead)`)

  return { kind: 'url', url: new URL(value, scope.pageState?.url).href }
}

/** Runs api-mode leaf steps against an HTTP sender. */
export class ApiStepRunner implements StepRunner {
  constructor (
    private readonly client: HttpSender & { dispose?: () => Promise<void> },
    private readonly recipe: InputRecipe,
    private readonly events: EventBus,
    private readonly gate: RunGate = new RunGate(1, recipe.limits?.delayMs ?? 0),
  ) {}

  async runLeaf (step: Step, scope: ExtractionScope): Promise<void> {
    if (step.type === 'request') return sendRequest(step, scope, this.client, this.recipe, this.gate, this.events)
    if (step.type === 'extract') return extractFromDocument(step, scope)
    throw new Error(`"${step.type}" needs a browser; this recipe runs in api mode`)
  }

  async nextPage (next: PaginateNext, scope: ExtractionScope): Promise<NextPageResult> {
    if ('selector' in next) throw new Error('next.selector needs a browser; use next.url or next.jsonpath in api mode')
    const current = scope.pageState?.url
    if ('url' in next) {
      const url = renderText(next.url, path => scope.lookup(path))

      return url === '' ? null : { kind: 'url', url: new URL(url, current).href }
    }

    return nextFromDocument(next, scope)
  }

  async dispose (): Promise<void> {
    await this.client.dispose?.()
  }
}
