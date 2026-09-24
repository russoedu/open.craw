// From one movie to its lead actor to that actor's films, on two sites with
// different navigation, into one `filmography` output.
//
//   npm run core:build
//   node examples/filmography/run.mjs                  # both sources
//   node examples/filmography/run.mjs --only tmdb      # or --only letterboxd
//   node examples/filmography/run.mjs --trace          # print the route: pages, steps, records
//
// Neither source needs a browser. OPEN_CRAW_INSECURE_TLS=1 accepts an
// intercepting proxy's certificate (sandboxes only).
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCrawler, jsonLinesSink, loadRecipeSet, traceLine } from '@open.craw/core'

const here = dirname(fileURLToPath(import.meta.url))
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined
const trace = process.argv.includes('--trace')
const inputs = [['tmdb', 'tmdb-filmography.input.json'], ['letterboxd', 'letterboxd-filmography.input.json']]
  .filter(([name]) => only === undefined || only === name)
  .map(([, file]) => join(here, file))

const recipes = await loadRecipeSet({ output: join(here, 'filmography.output.json'), inputs })
const crawler = createCrawler({
  sink:    jsonLinesSink(join(here, 'out', 'filmography.jsonl')),
  browser: { ignoreHTTPSErrors: process.env.OPEN_CRAW_INSECURE_TLS === '1' },
  onEvent: (event) => {
    const line = trace ? traceLine(event) : undefined
    if (line !== undefined) console.log(line)
    if (event.type === 'record:emit') console.log(`${event.recipeId.padEnd(10)} | ${String(event.data.actor).padEnd(14)} | ${String(event.data.year ?? '----').padEnd(4)} | ${String(event.data.title).padEnd(34)} | ${event.data.role ?? ''}`)
    if (['record:reject', 'error'].includes(event.type)) console.log(`[${event.type}] ${event.recipeId}: ${event.reason ?? event.message}`)
  },
})
try {
  const report = await crawler.run(recipes)
  console.log(`\n${report.records} records written to ${report.sink.location}`)
  for (const recipe of report.recipes) console.log(`  ${recipe.recipeId}: ${recipe.emitted} emitted, ${recipe.rejected} rejected, ${recipe.pages} pages, ${recipe.durationMs} ms${recipe.error === undefined ? '' : `, stopped: ${recipe.error}`}`)
} finally {
  await crawler.close()
}
