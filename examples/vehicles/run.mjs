// Every version and priced configuration of one model on BYD UK (Seal) and Kia UK (EV3),
// into one `vehicle-configuration` output.
//
//   npm run core:build
//   node examples/vehicles/run.mjs                 # both sources
//   node examples/vehicles/run.mjs --only byd-uk   # or --only kia-uk
//   node examples/vehicles/run.mjs --trace         # print the route: pages, steps, records
//
// Neither source needs a browser. OPEN_CRAW_INSECURE_TLS=1 accepts an intercepting
// proxy's certificate (sandboxes only).
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCrawler, jsonLinesSink, loadRecipeSet, traceLine } from '@open.craw/core'

const here = dirname(fileURLToPath(import.meta.url))
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined
const trace = process.argv.includes('--trace')
const inputs = [['byd-uk', 'byd-seal.input.json'], ['kia-uk', 'kia-ev3.input.json']]
  .filter(([name]) => only === undefined || only === name)
  .map(([, file]) => join(here, file))

const recipes = await loadRecipeSet({ output: join(here, 'vehicle-configuration.output.json'), inputs })
const crawler = createCrawler({
  sink:    jsonLinesSink(join(here, 'out', 'vehicles.jsonl')),
  browser: { ignoreHTTPSErrors: process.env.OPEN_CRAW_INSECURE_TLS === '1' },
  onEvent: (event) => {
    const line = trace ? traceLine(event) : undefined
    if (line !== undefined) console.log(line)
    if (event.type === 'record:emit') {
      const d = event.data
      console.log(`${d.make} ${d.model} | ${String(d.trim).padEnd(10)} | £${d.price.amount.toLocaleString('en-GB')} | ${d.configuration ?? d.version} | ${d.engine ?? '-'} | boot ${d.bootVolumeLitres ?? '-'} | ${d.colours.length} colours`)
    }
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
