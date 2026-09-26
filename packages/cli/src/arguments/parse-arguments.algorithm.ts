import { parseArgs } from 'node:util'
import type { Command, CommonOptions } from './command.contract'

export const USAGE = `opencraw <command> [options]

Commands
  validate <recipe files or directories...>   Parse and bind the recipes; list every problem with its path.
  run <recipe files or directories...>        Crawl. Records go to --out as JSON Lines, or to stdout.
  probe <url>                                 Fetch a page and report where its data lives.

Options for run
  --out <file>        Write records to this JSON Lines file (default: stdout).
  --append            Keep what --out holds and add to it (each line carries _key).
  --resume            Skip records --out already has (needs --append).
  --only <id>         Run only this input recipe (repeatable).
  --dry-run           One record per input, printed with the scope it was mapped from.
  --trace             Print the crawl trace to stderr.
  --headed            Show the browser.
  --profiles <dir>    Where recipes' session.browserProfile profiles live (or OPENCRAW_PROFILES;
                      default .opencraw/profiles).
  --host-delay <ms>   At least this long between two requests to one site, across every recipe.
  --host-concurrency <n>
                      At most this many requests to one site in flight, across every recipe.
                      Both override the access config's "throttle" defaults.

Options for probe
  --browser           Also render the page in a browser and list the JSON it fetches.

Options for both
  --browser-path <p>  A browser binary other than the one Playwright installed (or OPENCRAW_CHROMIUM).
  --insecure-tls      Accept an intercepting proxy's certificate (or OPENCRAW_INSECURE_TLS=1).
  --user-agent <ua>   The user agent to send.
  --access <file>     An access config: proxy profiles, credentials as {{env.NAME}} (or OPENCRAW_ACCESS).
  --access-profile <name>
                      The access profile to use when a recipe names none.
  --plugins <file>    A JavaScript module exporting hooks (the recipes' hook steps and transforms),
                      accessPlugins (for { kind: "plugin" } access profiles) and captchaSolvers
                      (for session.captcha and captcha steps); --hooks, or OPENCRAW_PLUGINS /
                      OPENCRAW_HOOKS. It runs as your code: trust it.
  --help, --version`

const OPTIONS = {
  'out':              { type: 'string' },
  'append':           { type: 'boolean' },
  'resume':           { type: 'boolean' },
  'only':             { type: 'string', multiple: true },
  'dry-run':          { type: 'boolean' },
  'trace':            { type: 'boolean' },
  'headed':           { type: 'boolean' },
  'profiles':         { type: 'string' },
  'host-delay':       { type: 'string' },
  'host-concurrency': { type: 'string' },
  'hooks':            { type: 'string' },
  'plugins':          { type: 'string' },
  'browser':          { type: 'boolean' },
  'browser-path':     { type: 'string' },
  'insecure-tls':     { type: 'boolean' },
  'user-agent':       { type: 'string' },
  'access':           { type: 'string' },
  'access-profile':   { type: 'string' },
  'help':             { type: 'boolean', short: 'h' },
  'version':          { type: 'boolean', short: 'v' },
} as const

/**
 * Turns argv into a command.
 *
 * @param argv - The arguments after the program name.
 * @param env - The environment, for the defaults some options have.
 * @returns The command.
 * @throws Error with a usage message on bad input.
 */
export function parseArguments (argv: readonly string[], env: Record<string, string | undefined> = {}): Command {
  const { values, positionals } = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true })
  if (values.help === true) return { name: 'help' }
  if (values.version === true) return { name: 'version' }
  const [name, ...rest] = positionals
  const options: CommonOptions = {
    browserPath:   values['browser-path'] ?? env.OPENCRAW_CHROMIUM,
    insecureTls:   values['insecure-tls'] === true || env.OPENCRAW_INSECURE_TLS === '1',
    userAgent:     values['user-agent'],
    access:        values.access ?? (env.OPENCRAW_ACCESS === '' ? undefined : env.OPENCRAW_ACCESS),
    accessProfile: values['access-profile'],
    plugins:       values.plugins ?? values.hooks ?? nonEmpty(env.OPENCRAW_PLUGINS) ?? nonEmpty(env.OPENCRAW_HOOKS),
  }
  switch (name) {
    case undefined: { return { name: 'help' }
    }
    case 'validate': {
      if (rest.length === 0) throw new Error('validate needs at least one recipe file or directory')

      return { name: 'validate', paths: rest }
    }
    case 'run': {
      if (rest.length === 0) throw new Error('run needs at least one recipe file or directory')
      if (values.resume === true && values.append !== true) throw new Error('--resume needs --append (and --out)')
      if ((values.append === true || values.resume === true) && values.out === undefined) throw new Error('--append and --resume need --out')

      return { name: 'run', paths: rest, out: values.out, append: values.append === true, resume: values.resume === true, trace: values.trace === true, dryRun: values['dry-run'] === true, only: values.only ?? [], headed: values.headed === true, profiles: values.profiles ?? nonEmpty(env.OPENCRAW_PROFILES), throttle: { delayMs: integer(values['host-delay'], '--host-delay', 0), concurrency: integer(values['host-concurrency'], '--host-concurrency', 1) }, options }
    }
    case 'probe': {
      if (rest.length !== 1) throw new Error('probe needs exactly one URL')

      return { name: 'probe', url: rest[0], browser: values.browser === true, options }
    }
    default: { throw new Error(`unknown command "${name}"`)
    }
  }
}

function integer (value: string | undefined, name: string, minimum: number): number | undefined {
  if (value === undefined) return undefined
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error(`${name} needs a whole number of at least ${minimum}, not "${value}"`)

  return number
}

function nonEmpty (value: string | undefined): string | undefined {
  return value === '' ? undefined : value
}
