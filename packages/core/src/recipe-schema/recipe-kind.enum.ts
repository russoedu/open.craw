/** The closed vocabularies a recipe file can use. Each is a `readonly` tuple so zod and TypeScript share it. */

export const RECIPE_KINDS = ['input', 'output'] as const
export const CRAWL_MODES = ['web', 'api'] as const
export const SELECTOR_KINDS = ['css', 'xpath', 'jsonpath', 'regex', 'table'] as const
/** `take` also accepts `attr:<name>`, which is validated by pattern rather than listed. */
export const TAKE_KINDS = ['text', 'html', 'value', 'json'] as const
export const BODY_KINDS = ['json', 'jsonl', 'html', 'text', 'pdf', 'csv', 'xlsx', 'pptx', 'yaml', 'markdown'] as const
export const YAML_SCALARS = ['typed', 'text'] as const
/** How a PDF table aligns a row's values against a cell wrapped over several lines. */
export const TABLE_ALIGNS = ['auto', 'top', 'center', 'bottom'] as const
export const FIELD_TYPES = ['string', 'number', 'integer', 'boolean', 'date', 'datetime', 'currency', 'url', 'enum', 'array', 'object', 'json'] as const
export const MISSING_POLICIES = ['fail', 'skip-record', 'null', 'default'] as const
export const RECIPE_MISSING_POLICIES = ['fail', 'skip-record', 'null'] as const
export const ERROR_POLICIES = ['fail', 'skip', 'retry'] as const
export const GENERATED_VALUES = ['now', 'uuid', 'sourceUrl', 'recipeId'] as const
export const KEEP_KINDS = ['cookies', 'localStorage'] as const
export const WAIT_UNTIL = ['load', 'domcontentloaded', 'networkidle', 'commit'] as const
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const

/** Steps that only make sense with a live browser page. */
export const WEB_ONLY_STEPS = ['goto', 'click', 'fill', 'press', 'select', 'scroll', 'wait', 'evaluate', 'screenshot'] as const
/** Steps that only make sense against an HTTP request context. */
export const API_ONLY_STEPS = ['request'] as const

export type RecipeKind = typeof RECIPE_KINDS[number]
export type CrawlMode = typeof CRAWL_MODES[number]
export type SelectorKind = typeof SELECTOR_KINDS[number]
export type BodyKind = typeof BODY_KINDS[number]
export type TableAlign = typeof TABLE_ALIGNS[number]
export type FieldType = typeof FIELD_TYPES[number]
export type MissingPolicy = typeof MISSING_POLICIES[number]
export type RecipeMissingPolicy = typeof RECIPE_MISSING_POLICIES[number]
export type GeneratedValue = typeof GENERATED_VALUES[number]
export type KeepKind = typeof KEEP_KINDS[number]
export type WaitUntil = typeof WAIT_UNTIL[number]
export type HttpMethod = typeof HTTP_METHODS[number]
