import type { ExtractionScope, ScopeDocument } from '../extraction-scope'
import { findTables, isPdfDocument, pdfText } from '../pdf-document'
import type { TableQuery } from '../pdf-document'
import { fillDown, findGridTables, isWorkbookDocument, workbookText } from '../workbook-document'
import type { ExtractStep } from '../recipe-schema'
import { parseJsonText, selectHtml, selectJson, selectRegex, takeFromHtml, takeFromJson, tryParseJson } from '../selection'
import { hasPlaceholder, renderText } from '../template'
import { NoMatchError } from '../step-flow'

/**
 * Runs an `extract` step against a static document: the value bound under
 * `from`, else the scope's current document. `css` reads HTML, `jsonpath`
 * reads JSON (or a read PDF or workbook as data), `table` reads the tables of
 * a PDF or a workbook (a spreadsheet, a CSV), `regex` reads any document as
 * text; `xpath` needs a live page and is refused here.
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
      if (document.kind !== 'json' && document.kind !== 'pdf' && document.kind !== 'workbook') throw new Error(`jsonpath needs a JSON document; the current document is ${document.kind}`)
      values = selectJson(document.kind === 'json' ? document.data : document, selector).map(node => takeFromJson(node, take))

      break
    }
    case 'table': {
      values = readTables(document, step, selector)

      break
    }
    case 'css': {
      if (document.kind !== 'html') throw new Error(`css needs an HTML document; the current document is ${document.kind}${document.kind === 'workbook' || document.kind === 'pdf' ? ' (read it with kind "table")' : ''}`)
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

/** The tables a `table` extract finds in a PDF or a workbook. */
function readTables (document: ScopeDocument, step: ExtractStep, selector: string): unknown[] {
  const query = tableQuery(step, selector)
  if (document.kind === 'workbook') {
    return findGridTables(document, { ...query, sheet: optionalPattern(step.sheet, 'sheet'), headerRows: step.headerRows, fillDown: step.fillDown, includeHidden: step.includeHidden })
  }
  if (document.kind !== 'pdf') throw new Error(`table reads a PDF or a workbook (a spreadsheet, a CSV); the current document is ${document.kind} (request it with "as": "pdf" or "as": "csv")`)
  for (const option of ['sheet', 'headerRows', 'includeHidden'] as const) {
    if (step[option] !== undefined) throw new Error(`"${option}" reads workbooks (spreadsheets, CSV); the current document is a PDF`)
  }
  const tables = findTables(document, query)

  return step.fillDown === undefined ? tables : tables.map(table => ({ ...table, rows: fillDown(table.rows, step.fillDown ?? []) }))
}

/**
 * A table extract's query: the selector matches the header row, the other
 * patterns come from the step; all case-insensitive, since PDFs and
 * spreadsheets capitalise headings freely.
 */
function tableQuery (step: ExtractStep, selector: string): TableQuery {
  const columns = step.columns === undefined ? undefined : Object.fromEntries(Object.entries(step.columns).map(([key, pattern]) => [key, patternOf(pattern, `columns.${key}`)]))

  return { header: patternOf(selector, 'selector'), until: optionalPattern(step.until, 'until'), columns, align: step.align }
}

function optionalPattern (source: string | undefined, where: string): RegExp | undefined {
  return source === undefined ? undefined : patternOf(source, where)
}

function patternOf (source: string, where: string): RegExp {
  try {
    return new RegExp(source, 'i')
  } catch (error) {
    throw new Error(`${where}: invalid pattern ${source} (${(error as Error).message})`, { cause: error })
  }
}

/** The text a regex extract reads: markup, text, a PDF's or a workbook's rows, or JSON re-serialised (a list of texts joined by newlines). */
function textOf (document: ScopeDocument): string {
  if (document.kind === 'html') return document.html
  if (document.kind === 'text') return document.text
  if (document.kind === 'pdf') return pdfText(document)
  if (document.kind === 'workbook') return workbookText(document)
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
  if (isPdfDocument(source) || isWorkbookDocument(source)) return source
  if (step.kind === 'table') throw new Error(`"${step.from}" is not a PDF or a workbook; request it with "as": "pdf" or "as": "csv"`)
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
