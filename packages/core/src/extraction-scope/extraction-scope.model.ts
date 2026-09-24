/**
 * The values a recipe has extracted so far, by id, with the lexical nesting the
 * steps create: `forEach` and `paginate` open a child scope per iteration or page
 * and drop it afterwards, so nothing from one page leaks into the next. A read
 * walks up the chain; a write lands in the scope it is made on.
 *
 * Page state (the current URL, page number and the document `extract` reads by
 * default) is scope state too, bound in the innermost scope that navigated.
 */

/** A fetched or rendered document a later `extract` can read. */
export type ScopeDocument =
  | { kind: 'json', data: unknown } |
  { kind: 'html', html: string } |
  { kind: 'text', text: string }

/** Where the crawl is: bound by whichever scope last navigated. */
export interface PageState {
  url:       string
  number:    number
  document?: ScopeDocument
}

/** Paths a template can read besides ids: `page.url`, `page.number`, `start.url`, `vars.*`. */
export const RESERVED_ROOTS = ['page', 'start', 'vars'] as const

export class ExtractionScope {
  private readonly values = new Map<string, unknown>()
  private page: PageState | undefined

  constructor (private readonly parent?: ExtractionScope) {}

  /** Opens a nested scope; reads fall through to this one. */
  child (): ExtractionScope {
    return new ExtractionScope(this)
  }

  /** Binds a value in this scope, shadowing any parent binding of the same id. */
  set (id: string, value: unknown): void {
    this.values.set(id, value)
  }

  /** Whether the id is bound here or in a parent. */
  has (id: string): boolean {
    return this.values.has(id) || (this.parent?.has(id) ?? false)
  }

  /** The nearest binding of the id; `undefined` when unbound. */
  get (id: string): unknown {
    if (this.values.has(id)) return this.values.get(id)

    return this.parent?.get(id)
  }

  /** Records a navigation in this scope. Missing fields inherit from the nearest page state. */
  setPage (state: Partial<PageState>): void {
    const current = this.pageState
    this.page = { url: state.url ?? current?.url ?? '', number: state.number ?? current?.number ?? 1, document: state.document ?? current?.document }
  }

  /** Replaces only the current document, keeping URL and number. */
  setDocument (document: ScopeDocument): void {
    this.setPage({ document })
  }

  /** The nearest page state up the chain, if any scope navigated. */
  get pageState (): PageState | undefined {
    return this.page ?? this.parent?.pageState
  }

  /** The document `extract` reads when no `from` is given. */
  get document (): ScopeDocument | undefined {
    return this.pageState?.document
  }

  /**
   * Every binding visible from here, child shadowing parent, plus `page` as
   * `{ url, number }`. This is what `emit` hands to the mapping.
   */
  snapshot (): Record<string, unknown> {
    const merged: Record<string, unknown> = this.parent?.snapshot() ?? {}
    for (const [id, value] of this.values) merged[id] = value
    const page = this.pageState
    if (page !== undefined) merged.page = { url: page.url, number: page.number }

    return merged
  }

  /**
   * Resolves a dotted path the way templates do: the first segment is an id (or
   * `page`), the rest walks into the value.
   *
   * @param path - A dotted path such as `item.href` or `page.url`.
   * @returns The value, or `undefined`.
   */
  lookup (path: string): unknown {
    const [head, ...rest] = path.replaceAll(/\[(\d+)\]/g, '.$1').split('.')
    let value: unknown = head === 'page' && !this.has('page') ? pageSnapshotOf(this.pageState) : this.get(head)
    for (const segment of rest) {
      if (value === null || value === undefined || typeof value !== 'object') return undefined
      value = (value as Record<string, unknown>)[segment]
    }

    return value
  }
}

function pageSnapshotOf (page: PageState | undefined): { url: string, number: number } | undefined {
  return page === undefined ? undefined : { url: page.url, number: page.number }
}
