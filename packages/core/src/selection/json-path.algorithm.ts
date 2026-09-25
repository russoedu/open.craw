import { JSONPath } from 'jsonpath-plus'

/**
 * Evaluates a JSONPath expression on a decoded JSON document.
 *
 * @param document - The JSON value.
 * @param path - A JSONPath such as `$.items[*].url`.
 * @returns Every match, in document order.
 */
export function selectJson (document: unknown, path: string): unknown[] {
  return JSONPath({ path, json: document as JSONPathJson, wrap: true, resultType: 'value' })
}

type JSONPathJson = Parameters<typeof JSONPath>[0] extends { json: infer J } ? J : never
