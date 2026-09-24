import type { OutputRecord } from '../output-mapping'

/** How far de-duplication reaches: the whole run, one input recipe, or not at all. */
export type DedupeScope = 'run' | 'recipe' | 'off'

/** Drops records whose key was already seen. First record wins; keyless records always pass. */
export class DedupePolicy {
  private seen = new Set<string>()

  constructor (readonly scope: DedupeScope = 'run') {}

  /** Called when an input recipe starts; forgets keys under `recipe` scope. */
  startRecipe (): void {
    if (this.scope === 'recipe') this.seen = new Set()
  }

  /**
   * @param record - A validated record.
   * @returns `true` when the record repeats an earlier key and must be dropped.
   */
  isDuplicate (record: OutputRecord): boolean {
    if (this.scope === 'off' || record.key === null) return false
    if (this.seen.has(record.key)) return true
    this.seen.add(record.key)

    return false
  }
}
