import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listRecipesInputShape, listRecipesTool } from '../list-tool'
import { probeInputShape, probeTool } from '../probe-tool'
import { runInputShape, runTool } from '../run-tool'
import { validateInputShape, validateTool } from '../validate-tool'

const SERVER_INFO = { name: 'open-craw', version: '0.0.1' }

/**
 * Builds the MCP server: one tool per crawl primitive (`probe`, `validate`,
 * `run`, `list_recipes`), each a thin wrapper over `@open.craw/core` and
 * `@open.craw/cli`'s structured helpers. No transport is attached; `main`
 * connects it over stdio.
 *
 * @returns The server, ready to `connect`.
 */
export function createServer (): McpServer {
  const server = new McpServer(SERVER_INFO)

  server.registerTool(
    'probe',
    { description: 'Fetch a page and report where its data lives: JSON-LD blocks, inline JSON objects, .json URLs, script hosts, API-looking links. Use before writing an input recipe, to see the shape a site\'s data actually takes.', inputSchema: probeInputShape },
    args => probeTool(args),
  )
  server.registerTool(
    'validate',
    { description: 'Load and bind recipe files (an output recipe plus its input recipes): parse each against its schema, check every mapping resolves, report every problem with its JSON path.', inputSchema: validateInputShape },
    args => validateTool(args),
  )
  server.registerTool(
    'run',
    { description: 'Crawl the recipes at the given paths. Use dryRun to check a recipe under construction (one record per input, returned inline); use "out" for anything beyond a handful of records.', inputSchema: runInputShape },
    args => runTool(args),
  )
  server.registerTool(
    'list_recipes',
    { description: 'List the recipe files in a directory, split by kind, with their ids. Check before writing a new recipe, or to see what an existing output recipe covers.', inputSchema: listRecipesInputShape },
    args => listRecipesTool(args),
  )

  return server
}
