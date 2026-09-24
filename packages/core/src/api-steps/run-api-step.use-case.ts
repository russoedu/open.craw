import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import type { HttpSender } from '../http-session'
import type { InputRecipe, PaginateNext, Step } from '../recipe-schema'
import { selectJson } from '../selection'
import type { NextPageResult, StepRunner } from '../step-flow'
import { renderText } from '../template'
import { extractFromDocument } from './extract-from-document.use-case'
import { sendRequest } from './send-request.use-case'

/** Runs api-mode leaf steps against an HTTP sender. */
export class ApiStepRunner implements StepRunner {
  constructor (
    private readonly client: HttpSender & { dispose?: () => Promise<void> },
    private readonly recipe: InputRecipe,
    private readonly events: EventBus,
  ) {}

  async runLeaf (step: Step, scope: ExtractionScope): Promise<void> {
    if (step.type === 'request') return sendRequest(step, scope, this.client, this.recipe.limits ?? {}, this.events, this.recipe.id)
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
    const document = scope.document
    if (document?.kind !== 'json') throw new Error('next.jsonpath needs a JSON document from a request in the page body')
    const value = selectJson(document.data, next.jsonpath)[0]
    if ([undefined, null, '', false].includes(value as null)) return null
    if (next.as !== undefined) return { kind: 'value', name: next.as, value }
    if (typeof value !== 'string') throw new Error(`next.jsonpath ${next.jsonpath} must yield a URL; got ${typeof value} (use "as" to bind a cursor instead)`)

    return { kind: 'url', url: new URL(value, current).href }
  }

  async dispose (): Promise<void> {
    await this.client.dispose?.()
  }
}
