import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { probeUrl } from '@opencraw/cli'
import { z } from 'zod'

/** Input schema for the `probe` tool: a raw zod shape, as `McpServer.registerTool` expects. */
export const probeInputShape = {
  url:         z.string().describe('The page to fetch and inspect.'),
  browser:     z.boolean().optional().describe('Also render the page in a browser and list the JSON responses it fetches while settling. Slower (a few seconds); finds endpoints a plain fetch of the initial HTML cannot.'),
  browserPath: z.string().optional().describe('A browser binary other than the one Playwright installed. Defaults to OPENCRAW_CHROMIUM in the server\'s environment.'),
  insecureTls: z.boolean().optional().describe("Accept an intercepting proxy's certificate. Defaults to OPENCRAW_INSECURE_TLS=1 in the server's environment."),
  userAgent:   z.string().optional().describe('The user agent to send.'),
  access:      z.string().optional().describe('An access profile (a proxy) from the server\'s access config file, OPENCRAW_ACCESS.'),
}

/**
 * The `probe` tool: fetches a page and reports where its data lives, so an
 * agent can write an extraction recipe without guessing selectors.
 *
 * @param args - The tool's parsed input.
 * @returns The MCP tool result: the probe findings as JSON text.
 */
export async function probeTool (args: { url: string, browser?: boolean, browserPath?: string, insecureTls?: boolean, userAgent?: string, access?: string }): Promise<CallToolResult> {
  try {
    const result = await probeUrl(args.url, {
      browser:       args.browser ?? false,
      browserPath:   args.browserPath ?? process.env.OPENCRAW_CHROMIUM,
      insecureTls:   args.insecureTls === true || process.env.OPENCRAW_INSECURE_TLS === '1',
      userAgent:     args.userAgent,
      access:        process.env.OPENCRAW_ACCESS === '' ? undefined : process.env.OPENCRAW_ACCESS,
      accessProfile: args.access,
    })

    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> }
  } catch (error) {
    return { content: [{ type: 'text', text: `probe failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true }
  }
}
