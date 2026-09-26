import type { OutputRecord } from '../output-mapping'

/** How far de-duplication reaches: the whole run, one input recipe, or not at all. */
export type DedupeScope = 'run' | 'recipe' | 'off'

/** One input recipe's view of de-duplication: whether a record repeats a key already seen. */
export interface RecipeDedupe {
  /**
   * @param record - A validated record.
   * @returns `true` when the record repeats an earlier key and must be dropped.
   */
  isDuplicate: (record: OutputRecord) => boolean
}

/**
 * Drops records whose key was already seen. First record wins; keyless
 * records always pass. Recipes running in parallel each get their own view:
 * under `recipe` scope they never see each other's keys, under `run` scope
 * they share them (and whichever emits a key first keeps it).
 */
export class DedupePolicy {
  private readonly shared = new Set<string>()

  constructor (readonly scope: DedupeScope = 'run') {}

  /**
   * The de-duplication one input recipe run uses.
   *
   * @returns Its view: keys shared with the run, its own, or none checked.
   */
  forRecipe (): RecipeDedupe {
    if (this.scope === 'off') return { isDuplicate: () => false }
    const seen = this.scope === 'run' ? this.shared : new Set<string>()

    return {
      isDuplicate: (record) => {
        if (record.key === null) return false
        if (seen.has(record.key)) return true
        seen.add(record.key)

        return false
      },
    }
  }
}
