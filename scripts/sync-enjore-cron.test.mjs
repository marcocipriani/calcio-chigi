// Esegue gli script del cron (.github/workflows/sync-enjore.yml) con --apply, come in Actions,
// contro un server finto che fa da Enjore e da Supabase: nessuna chiamata alla produzione.
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import http from "node:http"
import { tmpdir } from "node:os"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)
const calendarHtml = readFileSync(new URL("./fixtures/enjore/calendar-2026-27.html", import.meta.url), "utf8")
const comunicatiHtml = `
  <div class="docs-list-el"><label>Comunicato n. 3 del 21/10/2026</label>
  <a href="https://cdn.enjore.com/docs/c3.pdf">Scarica</a></div>`

// Partita 8209834 già in DB ma senza risultato: il sync deve aggiornarla, non duplicarla.
const existingEvent = {
  id: "existing-1", tipo: "PARTITA", data_ora: "2026-10-22T20:00:00+00:00", luogo: "ATLETICO 2000",
  avversario: "CIRC. PAL. MADAMA", note: null, gol_nostri: null, gol_avversario: null, giocata: false,
  gol_casa: null, gol_ospite: null, giornata: 1, squadra_casa: "CIRC. PAL. MADAMA",
  squadra_ospite: "CIRC. CHIGI", tipo_campo: "a11", fase: "FASE_1",
}

let server
let base
let writes = []

before(async () => {
  server = http.createServer(async (req, res) => {
    let body = ""
    for await (const chunk of req) body += chunk
    const path = new URL(req.url, "http://x").pathname
    if (path === "/calendar") return res.end(calendarHtml)
    if (path === "/comunicati") return res.end(comunicatiHtml)
    res.setHeader("content-type", "application/json")
    if (path === "/rest/v1/seasons") return res.end('{"id":"season-1"}')
    if (req.method === "GET" && path === "/rest/v1/events") return res.end(JSON.stringify([existingEvent]))
    writes.push({ method: req.method, path, query: new URL(req.url, "http://x").search, body: JSON.parse(body) })
    res.statusCode = 201
    res.end()
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => server.close())

function runScript(name, url) {
  writes = []
  return run(process.execPath, [fileURLToPath(new URL(`./${name}`, import.meta.url)), "--apply", `--url=${url}`], {
    // cwd fuori dal repo: niente .env.local, quindi niente chiavi vere.
    cwd: tmpdir(),
    env: { PATH: process.env.PATH, SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: "test" },
  })
}

test("sync-enjore-calendar --apply updates the known match and inserts the others", async () => {
  const { stdout } = await runScript("sync-enjore-calendar.mjs", `${base}/calendar`)
  assert.match(stdout, /Sync completata: 1 aggiornate, 2 inserite/)

  const patch = writes.find((w) => w.method === "PATCH")
  assert.equal(patch.query, "?id=eq.existing-1")
  assert.deepEqual(patch.body, { gol_nostri: 1, gol_avversario: 1, giocata: true, gol_casa: 1, gol_ospite: 1 })
  assert.equal(writes.filter((w) => w.method === "POST").length, 2)
})

test("sync-enjore-comunicati --apply upserts parsed comunicati on the season", async () => {
  const { stdout } = await runScript("sync-enjore-comunicati.mjs", `${base}/comunicati`)
  assert.match(stdout, /1 comunicati upsertati/)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].path, "/rest/v1/comunicati")
  assert.match(writes[0].query, /on_conflict=enjore_url/)
  assert.deepEqual(writes[0].body, [
    { enjore_url: "https://cdn.enjore.com/docs/c3.pdf", titolo: "Comunicato n. 3", data: "2026-10-21", season_id: "season-1" },
  ])
})
