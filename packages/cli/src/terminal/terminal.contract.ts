/** Where a command writes: results to `out`, diagnostics and progress to `err`. Tests capture both. */
export interface Terminal {
  out: (line: string) => void
  err: (line: string) => void
}
