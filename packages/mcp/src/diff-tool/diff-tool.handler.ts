import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { diffRecords, readRecordsFile } from '@opencraw/core'
import type { RecordChange } from '@opencraw/core'
import { diffReport } from '@opencraw/cli'
import { z } from 'zod'

/** Changes returned at most; the counts cover all of them. */
const CHANGE_LIMIT = 200

/** Input schema for the `diff` tool. */
export const diffInputShape = {
  previous: z.string().describe('The earlier run\'s JSON Lines file (a run\'s "out").'),
  current:  z.string().describe('The later run\'s JSON Lines file.'),
  key:      z.array(z.string()).optional().describe('The fields that identify a record (the output recipe\'s key fields). Default: each line\'s _key, which an appending run writes.'),
  ignore:   z.array(z.string()).optional().describe('Fields left out of the comparison, such as a scrapedAt the crawl stamps.'),
}

interface DiffArgs {
  previous: string
  current:  string
  key?:     string[]
  ignore?:  string[]
}

/** What the `diff` tool returns. */
export interface DiffResult {
  added:     number
  removed:   number
  changed:   number
  unchanged: number
  /** Set when the current run lost most of the previous run's records. */
  shrunk?:   { previous: number, current: number }
  /** The report a person reads, one line per change. */
  summary:   string[]
  /** The changes, up to 200: removed, changed (with each field's before and after), added. */
  changes:   RecordChange[]
}

/**
 * The `diff` tool: compares two runs' records by key, so an agent watching a
 * source can say what changed since last time instead of re-reading it all.
 *
 * @param args - The tool's parsed input.
 * @returns The MCP tool result.
 */
export async function diffTool (args: DiffArgs): Promise<CallToolResult> {
  try {
    const [previous, current] = await Promise.all([readRecordsFile(args.previous), readRecordsFile(args.current)])
    const diff = diffRecords(previous, current, { key: args.key, ignore: args.ignore })
    const result: DiffResult = {
      added:     diff.added,
      removed:   diff.removed,
      changed:   diff.changed,
      unchanged: diff.unchanged,
      ...(diff.shrunk !== undefined && { shrunk: diff.shrunk }),
      summary:   diffReport(diff),
      changes:   diff.changes.slice(0, CHANGE_LIMIT),
    }

    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> }
  } catch (error) {
    return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
  }
}
