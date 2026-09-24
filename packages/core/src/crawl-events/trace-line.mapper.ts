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
    case 'recipe:finish': { return `■ ${event.recipeId}: ${event.emitted} emitted, ${event.rejected} rejected, ${event.duplicates} duplicates, ${event.pages} pages, ${event.durationMs} ms${event.error === undefined ? '' : `\n  ✖ stopped: ${event.error}`}`
    }
    case 'page:visit': { return `${indent(1)}⇢ page ${event.number}  ${event.url}`
    }
    case 'step:start': { return undefined
    }
    case 'step:finish': { return `${indent(depthOf(event.path))}· ${stepLabel(event)}  ${event.durationMs} ms`
    }
    case 'step:retry': { return `${indent(depthOf(event.path))}↻ ${stepLabel(event)}  retry ${event.attempt}: ${event.error}`
    }
    case 'step:skip': { return `${indent(depthOf(event.path))}↷ ${stepLabel(event)}  skipped: ${event.error}`
    }
    case 'record:emit': { return `${indent(1)}✚ record ${event.key ?? '(no key)'}`
    }
    case 'record:reject': { return `${indent(1)}✖ record rejected: ${event.field}: ${event.reason}`
    }
    case 'record:duplicate': { return `${indent(1)}≡ duplicate ${event.key}`
    }
    case 'warning': { return `${indent(1)}! ${event.message}`
    }
    case 'error': { return `${indent(1)}✖ ${event.message}`
    }
  }
}

/** How deep a step path such as `steps.8.steps.2` sits: one level per nested `steps`. */
export function depthOf (path: string): number {
  return path.split('.').filter(segment => segment === 'steps').length
}

function stepLabel (event: { stepType: string, stepId?: string, path: string }): string {
  return `${event.path}  ${event.stepType}${event.stepId === undefined ? '' : ` ${event.stepId}`}`
}

function indent (depth: number): string {
  return '  '.repeat(depth)
}
