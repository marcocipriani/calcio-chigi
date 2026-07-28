import AxeBuilder from "@axe-core/playwright"
import { createClient } from "@supabase/supabase-js"
import {
  devices,
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test"

const E2E_MATCH_ID = "92000000-0000-0000-0000-000000000001"
const OFFICIAL_FORMATION_TEST_TITLE =
  "capsula formazione passa da bozza a pubblicata"

async function authenticate(
  context: BrowserContext,
  email: string,
  password: string,
) {
  const url = process.env.E2E_SUPABASE_URL!
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY!
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw error ?? new Error("E2E login failed")
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`
  const encoded = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`
  const chunks = Array.from(
    { length: Math.ceil(encoded.length / 3180) },
    (_, index) => encoded.slice(index * 3180, (index + 1) * 3180),
  )
  await context.addCookies(
    chunks.map((value, index) => ({
      name: chunks.length === 1 ? storageKey : `${storageKey}.${index}`,
      value,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
      secure: false,
    })),
  )
}

async function expectNoSeriousA11yViolations(page: Page) {
  const result = await new AxeBuilder({ page }).analyze()
  expect(
    result.violations.filter(({ impact }) =>
      impact === "critical" || impact === "serious",
    ),
  ).toEqual([])
}

async function expectBottomNavClearance(page: Page) {
  const main = page.locator("#main-content")
  const navigation = page.getByRole("navigation")
  await expect(main).toBeVisible()
  await expect(navigation).toBeVisible()

  const metrics = await Promise.all([
    main.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).paddingBottom),
    ),
    navigation.evaluate((element) => element.getBoundingClientRect().height),
  ])

  expect(metrics[0]).toBeGreaterThanOrEqual(metrics[1])
}

async function expectSharedPageViewport(page: Page) {
  const containers = page.locator("[data-page-container]")
  await expect(containers).toHaveCount(1)
  const container = containers
  await expect(container).toBeVisible()
  const box = await container.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
})

test.afterEach(async ({}, testInfo) => {
  if (testInfo.title !== OFFICIAL_FORMATION_TEST_TITLE) return

  const serviceClient = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error } = await serviceClient
    .from("official_formations")
    .delete()
    .eq("event_id", E2E_MATCH_ID)
  if (error) throw error
})

test("viewport condiviso per tutte le pagine pubbliche mobile", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile")
  const routes = [
    "/",
    "/squadra",
    "/torneo",
    "/classifica",
    "/statistiche",
    "/giocatore/91000000-0000-0000-0000-000000000002",
    "/evento/92000000-0000-0000-0000-000000000001",
    "/login",
  ]

  for (const route of routes) {
    await page.goto(route)
    await expectBottomNavClearance(page)
    await expectSharedPageViewport(page)
  }
})

test("viewport condiviso per il profilo riservato mobile", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile")
  await authenticate(context, "player@chigi.test", "Player123!")
  await page.goto("/")
  await expect(page.getByRole("dialog")).toContainText("quota aperta")
  await page.getByRole("link", { name: "Vedi quote" }).click()
  await expect(page.getByRole("heading", { name: "Profilo" })).toBeVisible()
  await expectBottomNavClearance(page)
  await expectSharedPageViewport(page)
})

test("viewport condiviso per la gestione riservata mobile", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile")
  await authenticate(context, "manager@chigi.test", "Manager123!")
  await page.goto("/gestione")
  await expect(page.getByRole("heading", { name: "Gestione squadra" })).toBeVisible()
  await expectBottomNavClearance(page)
  await expectSharedPageViewport(page)
})

test("viewport condiviso per tutte le pagine pubbliche desktop", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop")
  const routes = [
    "/",
    "/squadra",
    "/torneo",
    "/classifica",
    "/statistiche",
    "/giocatore/91000000-0000-0000-0000-000000000002",
    "/evento/92000000-0000-0000-0000-000000000001",
    "/login",
  ]

  for (const route of routes) {
    await page.goto(route)
    await expectSharedPageViewport(page)
  }
})

test("calendario pubblico desktop esteso", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop")
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "Calendario" })).toBeVisible()
  await expect(page.getByText("Vista mensile")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Prossimi impegni" })).toBeVisible()
  await expect(page.locator("aside").getByText("PSICOLOGOL")).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("rosa pubblica mobile separa lo staff ed esclude i no", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile")
  await page.goto("/squadra")

  await expect(
    page.getByRole("heading", { level: 1, name: "Squadra" }),
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "Player" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Forse" })).toBeVisible()
  await expect(page.getByText("Sara Massaggiatrice")).toBeVisible()
  await expect(page.getByText("Nino Escluso")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Crea la tua formazione" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Pubblica formazione" }),
  ).toHaveCount(0)
  await expectNoSeriousA11yViolations(page)
})

test("griglia rosa responsive", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop")

  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto("/squadra")
  const grid = page.locator("[data-player-grid]")
  await expect(grid).toBeVisible()

  const columnCount = () =>
    grid.evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
    )

  await expect.poll(columnCount).toBe(2)
  await expectNoHorizontalOverflow(page)
  await page.setViewportSize({ width: 350, height: 800 })
  await expect.poll(columnCount).toBe(2)
  await page.setViewportSize({ width: 360, height: 800 })
  await expect.poll(columnCount).toBe(3)
  await expectNoHorizontalOverflow(page)
  await page.setViewportSize(devices["iPhone 13"].viewport)
  await expect.poll(columnCount).toBe(3)
  await page.setViewportSize({ width: 768, height: 1024 })
  await expect.poll(columnCount).toBe(4)
  await expectNoHorizontalOverflow(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect.poll(columnCount).toBe(6)
})

test("overflow orizzontale assente su squadra e torneo", async ({
  page,
}) => {
  for (const route of ["/squadra", "/torneo"]) {
    await test.step(route, async () => {
      await page.goto(route)
      await expectBottomNavClearance(page)
      await expectSharedPageViewport(page)
      await expectNoHorizontalOverflow(page)
    })
  }
})

test("selettore torneo", async ({ page }) => {
  await page.goto("/torneo")

  await expect(page.getByRole("combobox", { name: "Torneo" })).toHaveText(
    "Campionato ASI Over35 2025/2026",
  )
  await expect(
    page.locator("p", { hasText: "Campionato ASI Over35 2025/2026" }),
  ).toHaveCount(0)
})

test("statistiche torneo pubbliche e presenze protette", async ({ page }) => {
  await page.goto("/statistiche")

  await expect(page.getByText("Player Piero")).toBeVisible()
  await expect(page.getByText("Accedi per vedere le presenze")).toBeVisible()
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("profilo giocatore pubblico mostra statistiche e protegge le presenze", async ({
  page,
}) => {
  await page.goto("/giocatore/91000000-0000-0000-0000-000000000002")

  await expect(
    page.getByRole("heading", { name: "Piero Player" }),
  ).toBeVisible()
  await expect(page.getByText("Goal").locator("..")).toContainText("2")
  await expect(page.getByText("Assist").locator("..")).toContainText("1")
  await expect(page.getByText("MVP").locator("..")).toContainText("1")
  await expect(page.getByText("Accedi per vedere le presenze")).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("il giocatore vede quote e scheda privata", async ({ context, page }) => {
  await authenticate(context, "player@chigi.test", "Player123!")
  await page.goto("/")

  await expect(page.getByRole("dialog")).toContainText("quota aperta")
  await page.getByRole("link", { name: "Vedi quote" }).click()
  await expect(page).toHaveURL(/\/profilo$/)
  await expect(page.getByText("€ 80.00").first()).toBeVisible()
  await expect(
    page.getByText("Certificato agonistico", { exact: true }),
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("dashboard manager densa con azioni rapide", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop")
  await authenticate(context, "manager@chigi.test", "Manager123!")
  await page.goto("/gestione")

  await expect(page.getByRole("heading", { name: "Gestione squadra" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Persona" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Tesseramenti" })).toBeVisible()
  await expect(
    page.getByRole("table").getByText("Piero Player", { exact: true }),
  ).toBeVisible()
  await page.getByRole("checkbox", { name: "Seleziona Piero Player" }).check()
  await page.getByRole("button", { name: "Scadenza" }).click()
  await expect(page.getByRole("dialog")).toContainText(
    "Scadenza prossimo contatto",
  )
  await page.getByRole("button", { name: "Annulla" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await page
    .getByRole("button", { name: "Apri scheda di Piero Player" })
    .click()
  const personDialog = page.getByRole("dialog")
  await expect(personDialog.getByRole("heading", { name: "Documenti" })).toBeVisible()
  await expect(personDialog.getByRole("heading", { name: "Pagamenti" })).toBeVisible()
  await expect(personDialog.getByText(/80,00/)).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await page.getByRole("button", { name: "Chiudi" }).click()
  await page.getByRole("button", { name: "Persona" }).click()
  await expect(page.getByRole("dialog")).toContainText("Aggiungi persona")
  await expectNoSeriousA11yViolations(page)
})

test("il playground anonimo usa soltanto la rosa pubblica", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile")
  await context.grantPermissions(["clipboard-read"], {
    origin: "http://127.0.0.1:3100",
  })
  let avatarRequestCount = 0
  await page.route("https://avatar.invalid/**", async (route) => {
    avatarRequestCount += 1
    if (new URL(route.request().url()).search) {
      await route.abort("failed")
      return
    }
    await route.fulfill({
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==",
        "base64",
      ),
      headers: { "content-type": "image/png" },
      status: 200,
    })
  })
  await page.route("**/rest/v1/public_active_roster**", async (route) => {
    const response = await route.fetch()
    const roster = (await response.json()) as Array<Record<string, unknown>>
    await route.fulfill({
      response,
      json: roster.map((player) =>
        player.nome === "Piero"
          ? {
              ...player,
              avatar_url: "https://avatar.invalid/piero.png",
            }
          : player,
      ),
    })
  })
  const supabaseWrites: string[] = []
  page.on("request", (request) => {
    if (
      request.url().includes("/rest/v1/") &&
      ["DELETE", "PATCH", "POST", "PUT"].includes(request.method())
    ) {
      supabaseWrites.push(`${request.method()} ${request.url()}`)
    }
  })
  await page.goto("/squadra")
  await page.getByRole("button", { name: "Crea la tua formazione" }).click()
  const builder = page.locator('[data-formation-builder-mode="PLAYGROUND"]')
  await expect(
    page.getByRole("heading", { name: "Crea la tua formazione" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Esporta formazione" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Esporta formazione" }).click()
  await expect(page.getByRole("menuitem", { name: "Scarica PNG" })).toBeVisible()
  await expect(
    page.getByRole("menuitem", { name: "Copia messaggio" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Pubblica formazione ufficiale" }),
  ).toHaveCount(0)
  await expect(page.getByText("Scarica distinta")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Copia messaggio WhatsApp" }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Dettagli di Piero Player" }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: /^(Vice )?Capitano$/ }),
  ).toHaveCount(0)
  await expect(builder.getByText("Piero", { exact: true }).first()).toBeVisible()
  await expect(builder.getByText("Marco", { exact: true }).first()).toBeVisible()
  await expect(builder.getByText("Nino", { exact: true })).toHaveCount(0)
  await expect(builder.getByText("Sara", { exact: true })).toHaveCount(0)
  await expect(
    builder.getByRole("img", { name: "Piero Player" }).first(),
  ).toBeVisible()
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 800 })
    await expectNoHorizontalOverflow(page)
    await expect(
      page.getByRole("button", { name: "Esporta formazione" }),
    ).toBeVisible()
  }
  await page.setViewportSize({ width: 390, height: 844 })

  await page
    .getByRole("button", { name: "Seleziona giocatore per POR" })
    .click()
  await page.getByRole("dialog").getByText("Piero", { exact: true }).click()
  await page.getByRole("button", { name: "Esporta formazione" }).click()
  await page.getByRole("menuitem", { name: "Copia messaggio" }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("LA MIA FORMAZIONE")
  const downloadPng = page.getByRole("menuitem", { name: "Scarica PNG" })
  if (!(await downloadPng.isVisible())) {
    await page.getByRole("button", { name: "Esporta formazione" }).click()
  }
  const downloadPromise = page.waitForEvent("download")
  await downloadPng.click()
  await expect.poll(async () => (await downloadPromise).suggestedFilename()).toMatch(
    /^circolo-chigi-formazione-.+\.png$/,
  )
  expect(avatarRequestCount).toBeGreaterThan(1)
  expect(supabaseWrites).toEqual([])
})

test(OFFICIAL_FORMATION_TEST_TITLE, async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop")
  await authenticate(context, "manager@chigi.test", "Manager123!")
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3100",
  })
  let publishRequestCount = 0
  page.on("request", (request) => {
    if (request.url().includes("/rest/v1/rpc/publish_official_formation")) {
      publishRequestCount += 1
    }
  })
  await page.goto("/squadra")

  await expect(page.getByTestId("next-match-capsule")).toHaveAttribute(
    "data-state",
    "draft",
  )
  await page.getByRole("button", { name: "Pubblica formazione" }).click()
  await expect(
    page.getByRole("heading", { name: "Formazione ufficiale" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Pubblica formazione ufficiale" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Esporta formazione" }).click()
  await expect(page.getByText("Scarica distinta")).toBeVisible()
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 800 })
    await expectNoHorizontalOverflow(page)
    await expect(
      page.getByRole("button", { name: "Pubblica formazione ufficiale" }),
    ).toBeVisible()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole("button", { name: "Seleziona giocatore per POR" })
    .click()
  await page.getByRole("dialog").getByText("Marco", { exact: true }).click()
  await page
    .getByRole("button", { name: "Seleziona giocatore per P1" })
    .click()
  await page.getByRole("dialog").getByText("Piero", { exact: true }).click()
  await page
    .getByRole("button", { name: "Pubblica formazione ufficiale" })
    .click()
  await expect(
    page
      .getByLabel("Notifications alt+T")
      .getByText("Seleziona almeno un capitano o un vice capitano"),
  ).toBeVisible()
  expect(publishRequestCount).toBe(0)
  await page
    .getByRole("button", { name: "Dettagli di Piero Player" })
    .click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Capitano", exact: true })
    .click()
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Copia messaggio WhatsApp" }).click()
  const officialMessage = await page.evaluate(() => navigator.clipboard.readText())
  expect(officialMessage).toContain("🟢 TITOLARI:\nMarco Forse [PORTIERE]")
  expect(officialMessage).toContain("🪑 PANCHINA:\nPiero Player")
  await page
    .getByRole("button", { name: "Pubblica formazione ufficiale" })
    .click()
  await expect(
    page.getByText("Formazione ufficiale pubblicata e notificata"),
  ).toBeVisible()
  await expect(page.getByTestId("next-match-capsule")).toHaveAttribute(
    "data-state",
    "published",
  )
  await expect(page.getByTestId("next-match-capsule")).toContainText(
    "Pubblicata il",
  )
  await expect(
    page.getByRole("link", {
      name: "Formazione ufficiale contro PSICOLOGOL",
    }),
  ).toHaveAttribute("href", `/evento/${E2E_MATCH_ID}`)
  expect(publishRequestCount).toBe(1)

  const serviceClient = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data: publishedPlayers, error: publishedPlayersError } =
    await serviceClient
      .from("official_formation_players")
      .select("position_key,is_starter")
      .in("position_key", ["POR", "P1"])
  expect(publishedPlayersError).toBeNull()
  expect(
    [...(publishedPlayers ?? [])].sort((a, b) =>
      a.position_key.localeCompare(b.position_key),
    ),
  ).toEqual([
    { is_starter: false, position_key: "P1" },
    { is_starter: true, position_key: "POR" },
  ])
})

test("builder formazione privato e leggero", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop")
  await authenticate(context, "player@chigi.test", "Player123!")
  await page.goto("/squadra")

  await page.getByRole("button", { name: "Più tardi" }).click()
  await page.getByRole("button", { name: "Crea la tua formazione" }).click()
  await expect(
    page.getByRole("heading", { name: "Crea la tua formazione" }),
  ).toBeVisible()
  await expect(page.getByLabel("Maglia blu")).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.getByText("Piero", { exact: true }).first()).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})
