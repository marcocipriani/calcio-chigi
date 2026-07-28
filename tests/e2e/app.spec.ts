import AxeBuilder from "@axe-core/playwright"
import { createClient } from "@supabase/supabase-js"
import { expect, test, type BrowserContext, type Page } from "@playwright/test"

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
  const container = page.locator("[data-page-container]").first()
  await expect(container).toBeVisible()
  const box = await container.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
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

  await expect(page.getByRole("heading", { name: "Player" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Forse" })).toBeVisible()
  await expect(page.getByText("Sara Massaggiatrice")).toBeVisible()
  await expect(page.getByText("Nino Escluso")).toHaveCount(0)
  await expect(page.getByText(/accedi con un profilo approvato/i)).toBeVisible()
  await expectNoSeriousA11yViolations(page)
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

test("builder formazione privato e leggero", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop")
  await authenticate(context, "player@chigi.test", "Player123!")
  await page.goto("/squadra")

  await page.getByRole("button", { name: "Più tardi" }).click()
  await page.getByRole("button", { name: "Crea formazione" }).click()
  await expect(
    page.getByRole("heading", { name: "Crea formazione" }),
  ).toBeVisible()
  await expect(page.getByLabel("Maglia blu")).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.getByText("Piero", { exact: true }).first()).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})
