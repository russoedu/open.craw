import { USAGE, parseArguments } from './arguments'
import { probePage } from './probe'
import { readFileSync } from 'node:fs'
import { runRecipes } from './run'
import type { Terminal } from './terminal'
import { validateRecipes } from './validate'

const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version

/**
 * Runs one cli invocation: parses argv, dispatches to a use case, writes
 * through `terminal`. Never throws; a bad command or a use case failure both
 * become a non-zero return.
 *
 * @param argv - Arguments after the program name.
 * @param terminal - Where output goes.
 * @returns The process exit code.
 */
export async function main (argv: readonly string[], terminal: Terminal): Promise<number> {
  let command
  try {
    command = parseArguments(argv, process.env)
  } catch (error) {
    terminal.err(error instanceof Error ? error.message : String(error))
    terminal.err(USAGE)

    return 1
  }
  switch (command.name) {
    case 'help': { terminal.out(USAGE)

      return 0
    }
    case 'version': { terminal.out(VERSION)

      return 0
    }
    case 'validate': { return validateRecipes(command.paths, terminal)
    }
    case 'run': { return runRecipes(command, terminal)
    }
    case 'probe': { return probePage(command.url, { browser: command.browser, ...command.options }, terminal)
    }
  }
}
