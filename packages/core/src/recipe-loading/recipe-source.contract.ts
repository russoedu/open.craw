/**
 * Raw bytes holding recipe JSON or JSON Lines, UTF-8: a `Buffer` or any other
 * typed array, an `ArrayBuffer`, a `Blob` or `File`, or a stream of chunks (a
 * Node `Readable`, a web `ReadableStream`, any async iterable of bytes or text).
 */
export type RecipeBytes = Blob | ArrayBuffer | ArrayBufferView | AsyncIterable<Uint8Array | string>

/**
 * Where recipes come from. Each form holds one recipe or many:
 *
 * - a string starting with `{` or `[` (after whitespace): JSON text (one recipe
 *   or an array of them) or JSON Lines text (one recipe per line);
 * - any other string: a path to a `.json` or `.jsonl` file, or a directory whose
 *   `.json` and `.jsonl` files are read (sorted, not recursive);
 * - {@link RecipeBytes}: the same text, still encoded;
 * - an object: one recipe, already decoded;
 * - an array: any mix of the above.
 */
export type RecipeSource = string | RecipeBytes | object | readonly RecipeSource[]

/** One decoded recipe before validation, with where it came from. */
export interface RecipeDocument {
  /**
   * A file path, `path:line` for a JSON Lines file, a `File`'s name, or a
   * positional label (`recipes[2]`, `recipes:3`) for recipes that came from memory.
   */
  source:  string
  content: unknown
}
