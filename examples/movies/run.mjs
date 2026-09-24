// Crawls five movies from Netflix and five from IMDb into one `movie` output.
//
//   npm run core:build
//   node examples/movies/run.mjs                 # both sources
//   node examples/movies/run.mjs --only netflix  # or --only imdb
//
// IMDb needs a browser: `npm run playwright:install` once. Environment:
//   OPEN_CRAW_CHROMIUM=/path/to/chrome   use a browser other than the one Playwright installed
//   OPEN_CRAW_INSECURE_TLS=1             accept an intercepting proxy's certificate (sandboxes only)
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCrawler, jsonLinesSink, loadRecipeSet, traceLine } from '@open.craw/core'

const here = dirname(fileURLToPath(import.meta.url))
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined
const trace = process.argv.includes('--trace')
const inputs = [['netflix', 'netflix-movies.input.json'], ['imdb', 'imdb-top.input.json']]
  .filter(([name]) => only === undefined || only === name)
  .map(([, file]) => join(here, file))

const recipes = await loadRecipeSet({ output: join(here, 'movie.output.json'), inputs })
const crawler = createCrawler({
  sink:    jsonLinesSink(join(here, 'out', 'movies.jsonl')),
  browser: {
    executablePath:    process.env.OPEN_CRAW_CHROMIUM,
    ignoreHTTPSErrors: process.env.OPEN_CRAW_INSECURE_TLS === '1',
  },
  onEvent: (event) => {
    const line = trace ? traceLine(event) : undefined
    if (line !== undefined) console.log(line)
    if (event.type === 'record:emit') console.log(`${event.recipeId.padEnd(8)} | ${String(event.data.title).padEnd(40)} | ${event.data.genres.join(', ').padEnd(28)} | ${event.data.actors.slice(0, 4).join(', ')}`)
    if (['record:reject', 'step:skip', 'error'].includes(event.type)) console.log(`[${event.type}] ${event.recipeId}: ${event.reason ?? event.error ?? event.message}`)
  },
})
try {
  const report = await crawler.run(recipes)
  console.log(`\n${report.records} records written to ${report.sink.location}`)
  for (const recipe of report.recipes) console.log(`  ${recipe.recipeId}: ${recipe.emitted} emitted, ${recipe.rejected} rejected, ${recipe.pages} pages, ${recipe.durationMs} ms${recipe.error === undefined ? '' : `, stopped: ${recipe.error}`}`)
} finally {
  await crawler.close()
}
