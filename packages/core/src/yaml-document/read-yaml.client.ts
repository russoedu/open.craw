/** How YAML scalars are read: typed as YAML 1.2 types them, or as the text written. */
export type YamlScalars = 'typed' | 'text'

/** A YAML text, read. */
export interface YamlRead {
  /** The document's value; several documents (`---`) give an array of their values. */
  data:      unknown
  documents: number
  /** What the parser noticed but read anyway: an unknown tag (`!!js/function`) is kept as its plain value. */
  warnings:  string[]
}

/** Aliases one document may expand: a "billion laughs" document needs far more. */
const MAX_ALIASES = 100

/**
 * Parses YAML with the `yaml` package, imported on first use. The version is
 * pinned to YAML 1.2 (core schema) whatever the document declares: under a
 * `%YAML 1.1` directive, `NO` would read as `false` and `0123` as octal `83`.
 * Merge keys (`<<: *base`) are applied, duplicate keys are an error, aliases
 * are capped, and custom tags never build values: nothing in the text runs.
 *
 * @param text - The YAML.
 * @param source - Where it came from, for messages.
 * @param scalars - `typed` (default), or `text` to keep every scalar as written (`0123` stays `"0123"`).
 * @returns The data, the number of documents and the warnings.
 * @throws Error naming the source, with the line and column, for YAML that does not parse.
 */
export async function readYaml (text: string, source: string, scalars: YamlScalars = 'typed'): Promise<YamlRead> {
  const { parseAllDocuments } = await import('yaml')
  const parsed = parseAllDocuments(text, { version: '1.2', schema: scalars === 'text' ? 'failsafe' : 'core', merge: true, uniqueKeys: true, prettyErrors: true })
  const documents = Array.isArray(parsed) ? parsed : [parsed]
  const warnings: string[] = []
  const values: unknown[] = []
  for (const document of documents) {
    const [error] = document.errors
    if (error !== undefined) throw new Error(`${source}: not YAML (${error.message.split('\n', 1)[0]})`, { cause: error })
    warnings.push(...document.warnings.map(warning => warning.message.split('\n', 1)[0]))
    try {
      values.push(document.toJS({ maxAliasCount: MAX_ALIASES }))
    } catch (error) {
      throw new Error(`${source}: ${(error as Error).message}`, { cause: error })
    }
  }

  return { data: values.length === 1 ? values[0] : values, documents: values.length, warnings }
}
