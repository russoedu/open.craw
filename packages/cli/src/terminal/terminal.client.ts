import type { Terminal } from './terminal.contract'

/** The process's stdout and stderr. */
export function processTerminal (): Terminal {
  return {
    out: (line) => { process.stdout.write(`${line}\n`) },
    err: (line) => { process.stderr.write(`${line}\n`) },
  }
}
