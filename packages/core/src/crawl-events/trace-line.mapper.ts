import type { CrawlEvent } from './crawl-event.contract'

/**
 * One line of a crawl trace: the route a recipe takes (pages visited, steps
 * run, records produced, policies fired), indented by how deep in the step
 * tree the event happened. `step:start` yields nothing; `step:finish` carries
 * the duration, so every step prints once.
 *
 * @param event - Any crawl event.
 * @returns The line, or `undefined` for events a trace does not show.
 */
export function traceLine (event: CrawlEvent): string | undefined {
  switch (event.type) {
    case 'recipe:start': { return `▶ ${event.recipeId} (${event.mode})`
    }
    case 'recipe:finish': { return `■ ${event.recipeId}: ${event.emitted} emitted, ${event.rejected} rejected, ${event.duplicates} duplicates, ${event.skipped > 0 ? `${event.skipped} skipped, ` : ''}${(event.stepsSkipped ?? 0) > 0 ? `${event.stepsSkipped} steps skipped, ` : ''}${event.pages} pages, ${event.durationMs} ms${event.error === undefined ? '' : `\n  ✖ stopped: ${event.error}`}`
    }
    case 'access:lease': { return `${indent(1)}⇄ access ${event.profile} (${event.kind}${event.server === undefined ? '' : ` ${event.server}`}${event.session === undefined ? '' : `, session ${event.session}`})`
    }
    case 'access:blocked': { return `${indent(1)}⛔ blocked ${event.url}: ${event.reason}`
    }
    case 'access:rotate': { return `${indent(1)}↻ new access lease (attempt ${event.attempt})`
    }
    case 'request:retry': { return `${indent(1)}↺ ${event.url}: ${event.reason}, try ${event.attempt} in ${event.delayMs} ms`
    }
    case 'captcha:detected': { return `${indent(1)}⚿ captcha ${event.kind} on ${event.url}`
    }
    case 'captcha:solve': { return undefined
    }
    case 'captcha:solved': { return `${indent(1)}✓ captcha solved by ${event.solver} (attempt ${event.attempt}, ${event.durationMs} ms)`
    }
    case 'captcha:failed': { return `${indent(1)}✗ captcha attempt ${event.attempt} failed: ${event.reason}`
    }
    case 'captcha:budget': { return `${indent(1)}⛔ captcha left unsolved: the run's ${event.max} solves are spent`
    }
    case 'page:visit': { return `${indent(1)}⇢ page ${event.number}  ${event.url}${event.status === undefined || (event.status >= 200 && event.status < 300) ? '' : `  [${event.status}]`}`
    }
    case 'step:start': { return undefined
    }
    case 'step:finish': { return `${indent(depthOf(event.path))}· ${stepLabel(event)}  ${event.durationMs} ms`
    }
    case 'step:retry': { return `${indent(depthOf(event.path))}↻ ${stepLabel(event)}  retry ${event.attempt}: ${event.error}`
    }
    case 'step:skip': { return `${indent(depthOf(event.path))}↷ ${stepLabel(event)}  skipped: ${event.error}`
    }
    case 'step:branch': { return `${indent(depthOf(event.path))}⑂ ${event.path}  ${event.branch}`
    }
    case 'record:emit': { return `${indent(1)}✚ record ${event.key ?? '(no key)'}`
    }
    case 'record:reject': { return `${indent(1)}✖ record rejected: ${event.field}: ${event.reason}`
    }
    case 'record:duplicate': { return `${indent(1)}≡ duplicate ${event.key}`
    }
    case 'record:skipped': { return `${indent(1)}⤼ skipped ${event.key}`
    }
    case 'warning': { return `${indent(1)}! ${event.message}`
    }
    case 'error': { return `${indent(1)}✖ ${event.message}`
    }
  }
}

/** How deep a step path such as `steps.8.steps.2` or `steps.1.else.0` sits: one level per nested `steps` or `else`. */
export function depthOf (path: string): number {
  return path.split('.').filter(segment => ['steps', 'else'].includes(segment)).length
}

function stepLabel (event: { stepType: string, stepId?: string, path: string }): string {
  return `${event.path}  ${event.stepType}${event.stepId === undefined ? '' : ` ${event.stepId}`}`
}

function indent (depth: number): string {
  return '  '.repeat(depth)
}
