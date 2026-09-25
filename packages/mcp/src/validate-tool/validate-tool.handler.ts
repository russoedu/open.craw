import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { RecipeBindingError, RecipeValidationError, bindRecipeSet, parseInputRecipe, parseOutputRecipe } from '@open.craw/core'
import { readRecipeFiles } from '@open.craw/cli'
import { recipeSourceOf, recipeSourceShape } from '../recipe-source'
import type { RecipeSourceArgs } from '../recipe-source'

/** Input schema for the `validate` tool. */
export const validateInputShape = recipeSourceShape

interface Issue {
  path:    string
  message: string
  /** The file (`path:line` in JSON Lines), `recipes[i]` / `recipes:line` for inline recipes, or the recipe id when the issue came from binding. */
  source:  string
}

/** What the `validate` tool returns. */
export interface ValidateResult {
  ok:      boolean
  output?: string
  inputs:  string[]
  issues:  Issue[]
}

/**
 * The `validate` tool: loads and binds recipes, returning every problem
 * with its JSON path instead of a printed report, so an agent authoring a
 * recipe can check it without a round trip through a terminal.
 *
 * @param args - The tool's parsed input.
 * @returns The MCP tool result.
 */
export async function validateTool (args: RecipeSourceArgs): Promise<CallToolResult> {
  let files: Awaited<ReturnType<typeof readRecipeFiles>>
  try {
    files = await readRecipeFiles(recipeSourceOf(args))
  } catch (error) {
    return reply({ ok: false, inputs: [], issues: issuesOf(error, '') })
  }
  const issues: Issue[] = files.others.map(path => ({ path: '', message: '"kind" is missing or not "input"/"output"', source: path }))
  if (files.outputs.length === 0) issues.push({ path: '', message: 'no output recipe found', source: '' })
  if (files.outputs.length > 1) issues.push({ path: '', message: `more than one output recipe: ${files.outputs.map(file => file.path).join(', ')}`, source: '' })

  const result: ValidateResult = { ok: issues.length === 0, inputs: [], issues }
  if (files.outputs.length === 1) {
    try {
      const output = parseOutputRecipe(files.outputs[0].recipe, files.outputs[0].path)
      result.output = output.id
      const inputs = files.inputs.flatMap((file) => {
        try {
          const input = parseInputRecipe(file.recipe, file.path)
          result.inputs.push(input.id)

          return [input]
        } catch (error) {
          issues.push(...issuesOf(error, file.path))

          return []
        }
      })
      try {
        bindRecipeSet(output, inputs)
      } catch (error) {
        issues.push(...issuesOf(error, output.id))
      }
    } catch (error) {
      issues.push(...issuesOf(error, files.outputs[0].path))
    }
  }
  result.ok = issues.length === 0

  return reply(result)
}

function reply (result: ValidateResult): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> }
}

function issuesOf (error: unknown, source: string): Issue[] {
  if (error instanceof RecipeValidationError) return error.issues.map(issue => ({ path: issue.path, message: issue.message, source: error.source }))
  if (error instanceof RecipeBindingError) return error.issues.map(issue => ({ path: issue.path, message: issue.message, source: issue.recipeId }))

  return [{ path: '', message: error instanceof Error ? error.message : String(error), source }]
}
