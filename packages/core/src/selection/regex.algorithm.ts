/**
 * Evaluates a regular expression on text: the extract kind for values that
 * live in inline scripts, attributes or prose rather than in elements or JSON.
 *
 * @param text - The document text.
 * @param pattern - A regular expression source; group 1 is returned when the
 * pattern has a capturing group, else the whole match.
 * @returns Every match, in document order.
 * @throws When the pattern is not a valid regular expression.
 */
export function selectRegex (text: string, pattern: string): string[] {
  let expression: RegExp
  try {
    expression = new RegExp(pattern, 'gs')
  } catch (error) {
    throw new Error(`invalid pattern ${pattern}: ${(error as Error).message}`, { cause: error })
  }

  const values: string[] = Array.from(text.matchAll(expression), match => match[1] ?? match[0])

  return values
}
