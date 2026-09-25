import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { readRecipeFiles } from '@open.craw/cli'
import { z } from 'zod'

/** Input schema for the `list_recipes` tool. */
export const listRecipesInputShape = {
  dir: z.string().describe('A directory of recipe files.'),
}

/** What the `list_recipes` tool returns. */
export interface ListRecipesResult {
  outputs: { path: string, id?: string }[]
  inputs:  { path: string, id?: string, output?: string, mode?: string }[]
  others:  string[]
}

/**
 * The `list_recipes` tool: what recipes already exist in a directory, cheaper
 * than a full `validate` call, so an agent can check before writing a new one
 * or find what an existing output recipe already covers.
 *
 * @param args - The tool's parsed input.
 * @returns The MCP tool result.
 */
export async function listRecipesTool (args: { dir: string }): Promise<CallToolResult> {
  const files = await readRecipeFiles([args.dir])
  const result: ListRecipesResult = {
    outputs: files.outputs.map(file => ({ path: file.path, id: idOf(file.recipe) })),
    inputs:  files.inputs.map(file => ({ path: file.path, id: idOf(file.recipe), output: fieldOf(file.recipe, 'output'), mode: fieldOf(file.recipe, 'mode') })),
    others:  files.others,
  }

  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> }
}

function idOf (recipe: unknown): string | undefined {
  return fieldOf(recipe, 'id')
}

function fieldOf (recipe: unknown, name: string): string | undefined {
  if (typeof recipe !== 'object' || recipe === null) return undefined
  const value = (recipe as Record<string, unknown>)[name]

  return typeof value === 'string' ? value : undefined
}
