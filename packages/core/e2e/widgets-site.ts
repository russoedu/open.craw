import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'

/**
 * Report controls as script-heavy public forms build them: a hidden
 * `<select multiple>` of states (a widget would draw its own overlay) whose
 * `change` loads the RTO list for exactly one state, after a delay; a visible
 * multi-select of fuels; `#picked` shows what the form would post. And export
 * buttons that download a CSV and an Excel file.
 */
const WIDGETS_PAGE = `<!doctype html><html lang="en"><head><title>Filters</title></head><body>
<form id="filters">
  <select id="state" name="state" multiple style="display:none"><option value="DL">Delhi</option><option value="KA">Karnataka</option><option value="MH">Maharashtra</option></select>
  <select id="rto" name="rto" multiple style="display:none"></select>
  <select id="fuel" name="fuel" multiple><option value="PETROL">Petrol</option><option value="DIESEL">Diesel</option><option value="CNG">CNG</option></select>
</form>
<p id="picked"></p>
<a id="csv" href="/widgets/rows.csv">CSV</a> <button id="xlsx" onclick="location.href='/widgets/book.xlsx'">Excel</button>
<script>
  var form = document.getElementById('filters')
  function show () {
    var data = new FormData(form)
    document.getElementById('picked').textContent = ['state', 'rto', 'fuel'].map(function (name) { return name + '=' + data.getAll(name).join(',') }).join(';')
  }
  document.getElementById('state').addEventListener('change', function (event) {
    var rto = document.getElementById('rto')
    rto.innerHTML = ''
    var chosen = [].filter.call(event.target.options, function (option) { return option.selected })
    if (chosen.length === 1) setTimeout(function () {
      ['1', '2', '3'].forEach(function (n) { var code = chosen[0].value + n; rto.add(new Option(code + ' - OFFICE ' + n, code)) })
    }, 400)
    show()
  })
  form.addEventListener('change', show)
</script></body></html>`

export function widgetsRoute (_incoming: IncomingMessage, outgoing: ServerResponse, url: URL): boolean {
  switch (url.pathname) {
    case '/widgets': {
      outgoing.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      outgoing.end(WIDGETS_PAGE)

      return true
    }
    case '/widgets/rows.csv': {
      outgoing.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="report-rows.csv"' })
      outgoing.end('maker,total\nTATA MOTORS,130\nHERO,39\n')

      return true
    }
    case '/widgets/book.xlsx': {
      outgoing.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="report.xlsx"' })
      outgoing.end(readFileSync(join(__dirname, '..', '..', 'office-reader', 'src', 'spreadsheet', 'fixtures', 'incentivi.xlsx')))

      return true
    }
    default: {
      return false
    }
  }
}
