import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { RecipeBindingError, RecipeSet, RecipeValidationError, createCrawler, jsonLinesSink, memorySink } from '@open.craw/core'
import type { CrawlReport } from '@open.craw/core'
import { loadForRun, resolveAccess } from '@open.craw/cli'
import { z } from 'zod'
import { recipeSourceOf, recipeSourceShape } from '../recipe-source'
import type { RecipeSourceArgs } from '../recipe-source'

const RECORD_CAP = 50

/** Input schema for the `run` tool. */
export const runInputShape = {
  ...recipeSourceShape,
  out:         z.string().optional().describe('Write records to this JSON Lines file instead of returning them inline. Use for a crawl expected to produce more than a handful of records.'),
  append:      z.boolean().optional().describe('Keep what "out" holds and add to it; each line carries _key. Needs "out".'),
  resume:      z.boolean().optional().describe('Skip records "out" already has. Needs "append".'),
  only:        z.array(z.string()).optional().describe('Run only these input recipe ids.'),
  dryRun:      z.boolean().optional().describe('One record per input recipe, with the scope it was mapped from, instead of a full crawl. For checking a recipe under construction.'),
  headed:      z.boolean().optional().describe('Show the browser instead of running headless.'),
  browserPath: z.string().optional().describe('A browser binary other than the one Playwright installed. Defaults to OPEN_CRAW_CHROMIUM in the server\'s environment.'),
  insecureTls: z.boolean().optional().describe("Accept an intercepting proxy's certificate. Defaults to OPEN_CRAW_INSECURE_TLS=1 in the server's environment."),
  userAgent:   z.string().optional().describe('The user agent to send.'),
  access:      z.string().optional().describe('An access profile (a proxy) from the server\'s access config file, OPEN_CRAW_ACCESS, used by every recipe that names none. The error for an unknown name lists the profiles.'),
}

interface RunArgs extends RecipeSourceArgs {
  out?:         string,
  append?:      boolean,
  resume?:      boolean,
  only?:        string[],
  dryRun?:      boolean,
  headed?:      boolean,
  browserPath?: string,
  insecureTls?: boolean,
  userAgent?:   string
  access?:      string
}

/** What the `run` tool returns. */
export interface RunResult {
  report:     CrawlReport
  /** Present when "out" was not given: the records this call produced, capped. */
  records?:   Record<string, unknown>[]
  truncated?: boolean
}

/**
 * The `run` tool: crawls the recipes in `paths` or `recipes` (exactly one
 * output recipe, any number of inputs) and returns what happened,
 * structured, instead of the cli's printed summary.
 *
 * @param args - The tool's parsed input.
 * @returns The MCP tool result.
 */
export async function runTool (args: RunArgs): Promise<CallToolResult> {
  let set: RecipeSet
  try {
    set = await loadForRun(recipeSourceOf(args), args.only ?? [])
  } catch (error) {
    return { content: [{ type: 'text', text: loadErrorText(error) }], isError: true }
  }
  if (set.inputs.length === 0) {
    return { content: [{ type: 'text', text: args.only !== undefined && args.only.length > 0 ? `no input recipe matches "only": ${args.only.join(', ')}` : 'no input recipes found' }], isError: true }
  }

  let crawler: ReturnType<typeof createCrawler>
  const sink = args.dryRun === true || args.out === undefined ? memorySink() : jsonLinesSink(args.out, { append: args.append })
  try {
    crawler = createCrawler({
      sink,
      access:  await resolveAccess({ insecureTls: false, access: serverAccessFile(), accessProfile: args.access }),
      resume:  args.resume,
      browser: {
        headless:          args.headed !== true,
        executablePath:    args.browserPath ?? process.env.OPEN_CRAW_CHROMIUM,
        ignoreHTTPSErrors: args.insecureTls === true || process.env.OPEN_CRAW_INSECURE_TLS === '1',
      },
    })
  } catch (error) {
    return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
  }
  try {
    const inputs = args.dryRun === true ? set.inputs.map(input => ({ ...input, limits: { ...input.limits, maxRecords: 1 } })) : set.inputs
    const report = await crawler.run(new RecipeSet(set.output, inputs))
    const result: RunResult = { report }
    if (args.out === undefined) {
      const records = (sink as ReturnType<typeof memorySink>).records.map(record => record.data)
      result.records = records.slice(0, RECORD_CAP)
      result.truncated = records.length > RECORD_CAP
    }

    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown>, isError: report.recipes.some(recipe => recipe.error !== undefined) }
  } finally {
    await crawler.close()
  }
}

/** The access config file the server was started with; the tool picks a profile from it, never a file. */
function serverAccessFile (): string | undefined {
  const file = process.env.OPEN_CRAW_ACCESS

  return file === undefined || file === '' ? undefined : file
}

function loadErrorText (error: unknown): string {
  if (error instanceof RecipeValidationError) return error.issues.map(issue => `${error.source}: ${issue.path === '' ? '(root)' : issue.path}: ${issue.message}`).join('\n')
  if (error instanceof RecipeBindingError) return error.issues.map(issue => `${issue.recipeId}: ${issue.path}: ${issue.message}`).join('\n')

  return error instanceof Error ? error.message : String(error)
}
