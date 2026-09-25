import { getPath, renderText } from '../template'
import { AccessConfigError } from './access-config.error'

/** What access templates can read. */
export interface AccessTemplateContext {
  env:      Record<string, string | undefined>
  params?:  Record<string, string>
  session?: string
  country?: string
  recipe?:  { id: string }
}

/**
 * Renders one access template. An `env.*` path that is not set fails loudly:
 * an empty password would otherwise reach the provider and fail as a 407.
 *
 * @param template - The text.
 * @param context - What `{{ }}` can read.
 * @param where - The profile field, for the error.
 * @returns The rendered text.
 * @throws AccessConfigError naming the missing environment variable.
 */
export function renderAccessText (template: string, context: AccessTemplateContext, where: string): string {
  const missing: string[] = []
  const values = { env: context.env, params: context.params ?? {}, session: context.session, country: context.country, recipe: context.recipe }
  const text = renderText(template, (path) => {
    const value = getPath(values, path)
    if (value === undefined && path.startsWith('env.')) missing.push(path.slice('env.'.length))

    return value
  })
  if (missing.length > 0) throw new AccessConfigError(`${where} needs the environment variable${missing.length > 1 ? 's' : ''} ${missing.join(', ')}`)

  return text
}

/**
 * Renders every string inside a value, keeping its shape.
 *
 * @param value - Plugin options, a header map...
 * @param context - What `{{ }}` can read.
 * @param where - For errors.
 * @returns The rendered copy.
 */
export function renderAccessDeep (value: unknown, context: AccessTemplateContext, where: string): unknown {
  if (typeof value === 'string') return renderAccessText(value, context, where)
  if (Array.isArray(value)) return value.map((item, index) => renderAccessDeep(item, context, `${where}[${index}]`))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderAccessDeep(item, context, `${where}.${key}`)]))
  }

  return value
}

/**
 * Renders a header map and drops headers that render empty, so a template
 * such as `{{country ? upper(country) : ''}}` can leave a header out.
 *
 * @param headers - The templated headers.
 * @param context - What `{{ }}` can read.
 * @param where - For errors.
 * @returns The headers to send, or `undefined` when none remain.
 */
export function renderHeaders (headers: Record<string, string> | undefined, context: AccessTemplateContext, where: string): Record<string, string> | undefined {
  if (headers === undefined) return undefined
  const rendered = Object.entries(headers)
    .map(([name, value]) => [name, renderAccessText(value, context, `${where}.${name}`)] as const)
    .filter(([, value]) => value !== '')

  return rendered.length === 0 ? undefined : Object.fromEntries(rendered)
}
