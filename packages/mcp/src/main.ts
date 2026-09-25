import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server'

/**
 * Runs the server over stdio until the transport closes. This is what
 * `bin/opencraw-mcp.mjs` calls; an MCP host launches it as a subprocess and
 * talks JSON-RPC over stdin/stdout, so there is no argv to parse.
 */
export async function main (): Promise<void> {
  const server = createServer()
  await server.connect(new StdioServerTransport())
}
