import AxeBuilder from "@axe-core/playwright"
import { createClient, type Session } from "@supabase/supabase-js"
import {
  devices,
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test"

const E2E_MATCH_ID = "92000000-0000-0000-0000-000000000001"
const E2E_MANAGER_ID = "91000000-0000-0000-0000-000000000001"
const E2E_PLAYER_ID = "91000000-0000-0000-0000-000000000002"
const E2E_MAYBE_ID = "91000000-0000-0000-0000-000000000003"
const OFFICIAL_FORMATION_TEST_TITLE =
  "capsula formazione passa da bozza a pubblicata"
const ANONYMOUS_CAPSULE_TEST_TITLE =
  "capsula anonima mostra bozza e pubblicazione tramite policy reali"

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
  let session: Session | null = null
  for (let attempt = 0; attempt < 3 && !session; attempt += 1) {
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      session = data.session
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== "AuthRetryableFetchError" ||
        attempt === 2
      ) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  if (!session) throw new Error("E2E login failed")
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`
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

async function expectSemanticThemeContrast(page: Page) {
  await page.evaluate(() => {
    const pairs = [
      ["background", "var(--foreground)"],
      ["card", "var(--card-foreground)"],
      ["popover", "var(--popover-foreground)"],
      ["primary", "var(--primary-foreground)"],
      ["secondary", "var(--secondary-foreground)"],
      ["muted", "var(--muted-foreground)"],
      ["accent", "var(--accent-foreground)"],
      [
        "destructive",
        "var(--destructive-foreground, var(--primary-foreground))",
      ],
      ["sidebar", "var(--sidebar-foreground)"],
      ["sidebar-primary", "var(--sidebar-primary-foreground)"],
      ["sidebar-accent", "var(--sidebar-accent-foreground)"],
    ] as const
    const audit = document.createElement("section")
    audit.id = "semantic-color-audit"
    audit.style.cssText =
      "position:relative;z-index:9999;padding:20px;background:var(--background)"

    for (const [background, foreground] of pairs) {
      const sample = document.createElement("p")
      sample.dataset.pair = `${background}/${foreground}`
      sample.style.cssText = [
        `background:var(--${background})`,
        `color:${foreground}`,
        "font-size:16px",
        "font-weight:400",
        "padding:12px",
      ].join(";")
      sample.textContent = `Test leggibilità ${background}`
      audit.appendChild(sample)
    }

    document.body.appendChild(audit)
  })

  const result = await new AxeBuilder({ page })
    .include("#semantic-color-audit")
    .withRules(["color-contrast"])
    .analyze()

  expect(result.violations).toEqual([])
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

async function expectConsistentLucideIcons(page: Page) {
  const exceptions = await page.locator("svg.lucide:visible").evaluateAll(
    (icons) =>
      icons
        .map((icon) => ({
          fill: icon.getAttribute("fill"),
          name: icon.getAttribute("class"),
          strokeWidth: getComputedStyle(icon).strokeWidth,
        }))
        .filter(
          ({ fill, strokeWidth }) =>
            fill !== "none" || strokeWidth !== "2px",
        ),
  )

  expect(exceptions).toEqual([])
}

async function expectCircularIconOnlyAction(action: Locator) {
  await expect(action).toBeVisible()
  const box = await action.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(1)
  await expect(action.locator("svg").first()).toBeVisible()
  await expect
    .poll(() =>
      action.evaluate((element) => {
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
        )
        let node = walker.nextNode()
        while (node) {
          if (node.textContent?.trim()) {
            const parent = node.parentElement
            if (parent) {
              const range = document.createRange()
              range.selectNodeContents(node)
              const textRect = range.getBoundingClientRect()
              let left = textRect.left
              let right = textRect.right
              let top = textRect.top
              let bottom = textRect.bottom
              let ancestor: HTMLElement | null = parent
              let rendered = true

              while (ancestor && rendered) {
                const style = getComputedStyle(ancestor)
                const rect = ancestor.getBoundingClientRect()
                if (
                  style.display === "none" ||
                  style.visibility === "hidden"
                ) {
                  rendered = false
                  break
                }
                left = Math.max(left, rect.left)
                right = Math.min(right, rect.right)
                top = Math.max(top, rect.top)
                bottom = Math.min(bottom, rect.bottom)
                if (ancestor === element) break
                ancestor = ancestor.parentElement
              }

              if (rendered && right - left > 1 && bottom - top > 1) {
                return false
              }
            }
          }
          node = walker.nextNode()
        }
        return true
      }),
    )
    .toBe(true)
}

async function measureExactRenderedText(action: Locator, exactText: string) {
  return action.evaluate((element, expectedText) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let found = false
    let maxWidth = 0
    let maxHeight = 0
    let node = walker.nextNode()

    while (node) {
      if (node.textContent?.trim() === expectedText) {
        found = true
        const parent = node.parentElement
        if (parent) {
          const range = document.createRange()
          range.selectNodeContents(node)
          const textRect = range.getBoundingClientRect()
          let left = textRect.left
          let right = textRect.right
          let top = textRect.top
          let bottom = textRect.bottom
          let ancestor: HTMLElement | null = parent
          let visible = true

          while (ancestor) {
            const style = getComputedStyle(ancestor)
            const rect = ancestor.getBoundingClientRect()
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              Number.parseFloat(style.opacity) === 0
            ) {
              visible = false
              break
            }
            left = Math.max(left, rect.left)
            right = Math.min(right, rect.right)
            top = Math.max(top, rect.top)
            bottom = Math.min(bottom, rect.bottom)
            if (ancestor === element) break
            ancestor = ancestor.parentElement
          }

          if (visible) {
            const width = Math.max(0, right - left)
            const height = Math.max(0, bottom - top)
            if (width * height > maxWidth * maxHeight) {
              maxWidth = width
              maxHeight = height
            }
          }
        }
      }
      node = walker.nextNode()
    }

    return { found, height: maxHeight, width: maxWidth }
  }, exactText)
}

async function expectExactTextRendered(action: Locator, exactText: string) {
  await expect
    .poll(async () => {
      const measurement = await measureExactRenderedText(action, exactText)
      return (
        measurement.found &&
        measurement.width > 1 &&
        measurement.height > 1
      )
    })
    .toBe(true)
}

async function expectExactTextNotRendered(action: Locator, exactText: string) {
  await expect
    .poll(async () => {
      const measurement = await measureExactRenderedText(action, exactText)
      return (
        measurement.found &&
        (measurement.width <= 1 || measurement.height <= 1)
      )
    })
    .toBe(true)
}

async function expectCompleteSeasonPlayerLinks(
  page: Page,
  seasonSlug: string,
  occurrencesPerPlayer: number,
) {
  const playerIds = [E2E_MANAGER_ID, E2E_PLAYER_ID, E2E_MAYBE_ID]
  const expectedHrefs = playerIds
    .flatMap((profileId) =>
      Array.from(
        { length: occurrencesPerPlayer },
        () => `/giocatore/${profileId}?season=${seasonSlug}`,
      ),
    )
    .sort()
  const links = page.locator('a[href^="/giocatore/"]')

  await expect
    .poll(() =>
      links.evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute("href"))
          .filter((href): href is string => href !== null)
          .sort(),
      ),
    )
    .toEqual(expectedHrefs)
}

async function dismissPaymentReminder(page: Page) {
  const postpone = page.getByRole("button", { name: "Più tardi" })
  await postpone.waitFor({ state: "visible", timeout: 2_000 }).catch(() => {})
  if (await postpone.isVisible()) await postpone.click()
}

async function resetSeededOfficialFormation() {
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
}

async function seedPublishedOfficialFormation() {
  const serviceClient = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error } = await serviceClient.from("official_formations").insert({
    captain_profile_id: "91000000-0000-0000-0000-000000000001",
    event_id: E2E_MATCH_ID,
    formation_module: "4-4-2",
    published_by: "91000000-0000-0000-0000-000000000001",
    shirt_color: "BLU",
    snapshot: { source: "anonymous-capsule-e2e" },
    status: "PUBLISHED",
  })
  if (error) throw error
}

test.beforeEach(async ({ page }, testInfo) => {
  const needsUpcomingMatch = [
    "torneo stagionale",
    "builder formazione monta",
    "playground anonimo",
    ANONYMOUS_CAPSULE_TEST_TITLE,
    OFFICIAL_FORMATION_TEST_TITLE,
    "builder formazione privato",
  ].some((title) => testInfo.title.includes(title))
  await page.clock.setFixedTime(
    new Date(
      needsUpcomingMatch
        ? "2026-07-29T12:00:00+02:00"
        : "2026-07-31T12:00:00+02:00",
    ),
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  if (
    testInfo.project.name === "desktop" &&
    [OFFICIAL_FORMATION_TEST_TITLE, ANONYMOUS_CAPSULE_TEST_TITLE].includes(
      testInfo.title,
    )
  ) {
    await resetSeededOfficialFormation()
  }
})

test.afterEach(async ({}, testInfo) => {
  if (
    testInfo.project.name !== "desktop" ||
    ![OFFICIAL_FORMATION_TEST_TITLE, ANONYMOUS_CAPSULE_TEST_TITLE].includes(
      testInfo.title,
    )
  ) {
    return
  }
  await resetSeededOfficialFormation()
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
    "/evento/92000000-0000-0000-0000-000000000001",
    "/login",
  ]

  for (const route of routes) {
    await page.goto(route)
    await expectBottomNavClearance(page)
    await expectSharedPageViewport(page)
    await expectNoHorizontalOverflow(page)
    await expectConsistentLucideIcons(page)
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
  await expectNoHorizontalOverflow(page)
})

test("viewport condiviso per la gestione riservata mobile", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile")
  await authenticate(context, "manager@chigi.test", "Manager123!")
  await page.goto("/gestione")
  await expect(page.getByRole("heading", { name: "Gestione" })).toBeVisible()
  await expectBottomNavClearance(page)
  await expectSharedPageViewport(page)
  await expectNoHorizontalOverflow(page)
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
    "/evento/92000000-0000-0000-0000-000000000001",
    "/login",
  ]

  for (const route of routes) {
    await page.goto(route)
    await expectSharedPageViewport(page)
    await expectNoHorizontalOverflow(page)
    await expectConsistentLucideIcons(page)
  }
})

test("header mobile e temi mantengono titolo e contrasto AA", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile")
  await page.addInitScript(() => window.localStorage.setItem("theme", "light"))
  await page.goto("/login")

  await expect(
    page.getByText("Calcio Chigi", { exact: true }),
  ).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectConsistentLucideIcons(page)
  await expectNoSeriousA11yViolations(page)
  await expectSemanticThemeContrast(page)

  await page.getByRole("button", { name: "Cambia tema" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await expectNoHorizontalOverflow(page)
  await expectConsistentLucideIcons(page)
  await expectNoSeriousA11yViolations(page)
  await expectSemanticThemeContrast(page)
})

test("calendario pubblico desktop esteso", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop")
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "Calendario" })).toBeVisible()
  await expect(page.getByText("Vista mensile")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Prossimi impegni" })).toBeVisible()
  const calendar = page.locator('[data-calendar-layout="desktop"]')
  const match = calendar.getByRole("link", {
    name: /Partita contro PSICOLOGOL, 30 luglio 2026, 21:15/i,
  })
  await expect(match).toBeVisible()
  await expect(match).toHaveClass(/bg-blue-50/)
  await expect(match).toContainText("PSICOLOGOL")
  await expect(match).toContainText("21:15 · Vigor Perconti")
  await expect(match.locator("img")).toBeVisible()
  await expect(match.locator("img")).toHaveClass(/object-contain/)

  const today = calendar.locator('[data-calendar-date="2026-07-31"]')
  await expect(today.locator('[aria-current="date"]')).toBeVisible()
  await expect(
    calendar.locator('[data-calendar-date="2026-06-29"]'),
  ).toHaveClass(/bg-muted\/15/)

  const cell = match.locator("xpath=ancestor::*[@data-calendar-date][1]")
  const box = await cell.boundingBox()
  expect(box?.height).toBeCloseTo(112, 0)

  await expectNoHorizontalOverflow(page)
  await expectNoSeriousA11yViolations(page)

  await page.getByRole("button", { name: "Cambia tema" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await expect(match).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectNoSeriousA11yViolations(page)
})

test("calendario mensile compatto mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile")
  await page.goto("/")
  await expect(page.getByRole("tab", { name: "Prossimi" })).toBeVisible()
  await page.getByRole("button", { name: "Vista calendario" }).click()

  const calendar = page.locator('[data-calendar-layout="mobile"]')
  const match = calendar.getByRole("link", {
    name: /Partita contro PSICOLOGOL, 30 luglio 2026, 21:15/i,
  })
  await expect(match).toBeVisible()
  await expect(match).toHaveClass(/bg-blue-50/)
  await expect(match.locator("img")).toBeVisible()
  await expect(match.locator("img")).toHaveClass(/object-contain/)

  await expect(
    calendar.locator('[data-calendar-date="2026-07-31"]'),
  ).toHaveClass(/border-primary/)
  await expect(
    calendar.locator('[data-calendar-date="2026-06-29"]'),
  ).toHaveClass(/bg-muted\/20/)

  const cell = match.locator("xpath=ancestor::*[@data-calendar-date][1]")
  const box = await cell.boundingBox()
  expect(box?.height).toBeCloseTo(72, 0)

  await expectNoHorizontalOverflow(page)
  await expectNoSeriousA11yViolations(page)

  await page.getByRole("button", { name: "Cambia tema" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await expect(match).toBeVisible()
  await expectNoHorizontalOverflow(page)
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
  await expect(page.getByRole("heading", { name: "Forse", exact: true })).toBeVisible()
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

test("torneo stagionale resetta fase e mantiene il contratto comunicati", async ({
  page,
}, testInfo) => {
  await page.goto("/torneo")

  await expect(page.getByRole("combobox")).toHaveCount(2)
  await expect(page.getByRole("combobox", { name: "Torneo" })).toHaveText(
    "Campionato ASI Over35 2026/27",
  )
  await expect(page.getByRole("combobox", { name: "Fase" })).toHaveText(
    "Tutte le fasi",
  )
  await expect(
    page.getByText("Seleziona una fase per vedere la classifica"),
  ).toBeVisible()

  const filters = page.getByLabel("Filtri pagina")
  const tournamentBox = await filters
    .getByRole("combobox", { name: "Torneo" })
    .boundingBox()
  const phaseBox = await filters
    .getByRole("combobox", { name: "Fase" })
    .boundingBox()
  expect(tournamentBox).not.toBeNull()
  expect(phaseBox).not.toBeNull()
  if (testInfo.project.name === "desktop") {
    expect(Math.abs(tournamentBox!.y - phaseBox!.y)).toBeLessThanOrEqual(2)
  }

  await page.getByRole("combobox", { name: "Fase" }).click()
  await expect(page.getByRole("option")).toHaveCount(1)
  await page.keyboard.press("Escape")

  await page.getByRole("combobox", { name: "Torneo" }).click()
  await page
    .getByRole("option", { name: "Campionato ASI Over35 2025/26" })
    .click()
  await expect(page.getByRole("combobox", { name: "Fase" })).toHaveText(
    "Tutte le fasi",
  )
  await page.getByRole("combobox", { name: "Fase" }).click()
  await expect(page.getByRole("option", { name: "Fase 1" })).toBeVisible()
  await expect(
    page.getByRole("option", { name: "Fase 2 Professionisti" }),
  ).toBeVisible()
  await page.getByRole("option", { name: "Fase 1" }).click()
  await expect(page.getByRole("combobox", { name: "Fase" })).toHaveText(
    "Fase 1",
  )
  await page.getByRole("tab", { name: "Calendario" }).click()
  await expect(page.getByRole("button", { name: "Giornata 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await page.getByRole("button", { name: "Giornata 2" }).click()
  await expect(page.getByRole("button", { name: "Giornata 2" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  await page.getByRole("combobox", { name: "Torneo" }).click()
  await page
    .getByRole("option", { name: "Campionato ASI Over35 2026/27" })
    .click()
  await expect(page.getByRole("combobox", { name: "Fase" })).toHaveText(
    "Tutte le fasi",
  )
  await page.getByRole("combobox", { name: "Fase" }).click()
  await expect(page.getByRole("option")).toHaveCount(1)
  await page.keyboard.press("Escape")
  await page.getByRole("tab", { name: "Calendario" }).click()
  await expect(
    page.getByText("Nessuna giornata disponibile per questa fase."),
  ).toBeVisible()

  await page.getByRole("combobox", { name: "Torneo" }).click()
  await page
    .getByRole("option", { name: "Campionato ASI Over35 2025/26" })
    .click()
  await expect(page.getByRole("combobox", { name: "Fase" })).toHaveText(
    "Tutte le fasi",
  )
  await page.getByRole("combobox", { name: "Fase" }).click()
  await expect(page.getByRole("option", { name: "Fase 1" })).toBeVisible()
  await page.keyboard.press("Escape")
  await page.getByRole("tab", { name: "Calendario" }).click()
  await expect(page.getByRole("button", { name: "Giornata 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.getByRole("button", { name: "Giornata 2" })).toHaveAttribute(
    "aria-pressed",
    "false",
  )

  const communications = page.getByRole("button", { name: "Comunicati" })
  if (testInfo.project.name === "mobile") {
    await expectCircularIconOnlyAction(communications)
  } else {
    await expect(communications.locator("span")).toBeVisible()
    await expect(communications).toContainText("Comunicati")
  }
})

test("statistiche stagionali distinguono zero corrente e storico indisponibile", async ({
  page,
}) => {
  await page.goto("/statistiche")

  await expect(page.getByRole("combobox", { name: "Stagione" })).toHaveValue(
    "2026-2027",
  )
  for (const heading of [
    "Goal",
    "Assist",
    "MVP",
    "Ammonizioni",
    "Espulsioni",
  ]) {
    await expect(page.getByRole("heading", { level: 3, name: heading })).toBeVisible()
  }
  const goalRanking = page.locator(
    'section[aria-labelledby="ranking-goals"]',
  )
  await expect(
    goalRanking.getByRole("listitem").filter({ hasText: "Piero Player" }),
  ).toContainText("0")
  await expect(page.getByText("Accedi per vedere le presenze")).toBeVisible()
  await expect(page.locator('a[href^="/giocatore/"]')).toHaveCount(0)

  await page.getByRole("combobox", { name: "Stagione" }).selectOption(
    "2025-2026",
  )
  const assistRanking = page.locator(
    'section[aria-labelledby="ranking-assists"]',
  )
  await expect(
    assistRanking.getByRole("listitem").filter({ hasText: "Piero Player" }),
  ).toContainText("—")
  await expect(page.getByText("Dati non disponibili")).toBeVisible()
  await expect(page.locator('a[href^="/giocatore/"]')).toHaveCount(0)
  await expectNoSeriousA11yViolations(page)
})

test("statistiche associate propagano la stagione nei dettagli", async ({
  context,
  page,
}) => {
  await authenticate(context, "player@chigi.test", "Player123!")
  await page.goto("/statistiche")
  await dismissPaymentReminder(page)

  await expectCompleteSeasonPlayerLinks(page, "2026-2027", 6)

  await page.getByRole("combobox", { name: "Stagione" }).selectOption(
    "2025-2026",
  )
  await expectCompleteSeasonPlayerLinks(page, "2025-2026", 5)
  await expect(page.getByText("Dati non disponibili")).toBeVisible()
})

test("rosa e dettaglio anonimi non espongono profili", async ({
  page,
}) => {
  await page.goto("/squadra")
  await expect(page.locator('a[href^="/giocatore/"]')).toHaveCount(0)

  const detailRequests: string[] = []
  page.on("request", (request) => {
    if (
      request.url().includes("get_player_profile") ||
      request.url().includes("profile_private_details") ||
      request.url().includes("medical_certificates") ||
      request.url().includes("season_memberships")
    ) {
      detailRequests.push(request.url())
    }
  })
  await page.goto(`/giocatore/${E2E_PLAYER_ID}`)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText("+39 333 0000002")).toHaveCount(0)
  await expect(page.getByText(/NON ESPORRE/)).toHaveCount(0)
  expect(detailRequests).toEqual([])
})

test("utente non associato resta fuori dai dettagli giocatore", async ({
  context,
  page,
}) => {
  await authenticate(
    context,
    "unassociated@chigi.test",
    "Unassociated123!",
  )
  await page.goto("/squadra")
  await expect(page.locator('a[href^="/giocatore/"]')).toHaveCount(0)

  const sensitiveRequests: string[] = []
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname
    const privatePath = [
      "/rpc/get_player_profile",
      "/season_memberships",
      "/profile_private_details",
      "/payments",
      "/medical_certificates",
    ].some((fragment) => pathname.includes(fragment))
    const playerRoutePath = new URL(request.frame().url()).pathname
    const playerRouteEventPath =
      playerRoutePath === `/giocatore/${E2E_PLAYER_ID}` &&
      ["/events", "/event_checkins"].some((fragment) =>
        pathname.includes(fragment),
      )
    if (privatePath || playerRouteEventPath) {
      sensitiveRequests.push(pathname)
    }
  })
  await page.goto(`/giocatore/${E2E_PLAYER_ID}`)
  await expect(page).toHaveURL(/\/squadra$/)
  await expect(page.getByText("+39 333 0000002")).toHaveCount(0)
  await expect(page.getByText(/NON ESPORRE/)).toHaveCount(0)
  expect(sensitiveRequests).toEqual([])
})

test("compagno associato vede solo la proiezione sicura", async ({
  context,
  page,
}) => {
  await authenticate(context, "player@chigi.test", "Player123!")
  await page.goto("/squadra")
  await dismissPaymentReminder(page)

  const managerProfile = page.getByRole("link", {
    name: "Profilo di Mario Manager",
  })
  await expect(managerProfile).toBeVisible()
  await managerProfile.click()
  await expect(page).toHaveURL(new RegExp(`/giocatore/${E2E_MANAGER_ID}$`))
  await expect(
    page.getByRole("heading", { level: 1, name: "Mario Manager" }),
  ).toBeVisible()
  await expect(page.getByText("DIFENSORE", { exact: true })).toBeVisible()
  await expect(page.getByText("#4", { exact: true })).toBeVisible()
  for (const label of [
    "Goal: 0",
    "Assist: 0",
    "MVP: 0",
    "Ammonizioni: 0",
    "Espulsioni: 0",
  ]) {
    await expect(page.getByLabel(label)).toBeVisible()
  }
  await expect(page.getByText("+39 333 0000001")).toHaveCount(0)
  await expect(page.getByText("mario.operativo@chigi.test")).toHaveCount(0)
  await expect(page.getByText(/NON ESPORRE/)).toHaveCount(0)
  for (const privateHeading of [
    "Tesseramento",
    "Pagamenti",
    "Certificato medico",
    "Contatti operativi",
    "Presenze",
  ]) {
    await expect(
      page.getByRole("heading", { name: privateHeading }),
    ).toHaveCount(0)
  }
  await expect(page.getByText("mario.operativo@chigi.test")).toHaveCount(0)
  await expect(page.getByText("+39 333 0000001")).toHaveCount(0)
  await expect(page.getByText(/NON ESPORRE/)).toHaveCount(0)
})

test("proprietario vede tesseramento quote certificato e presenze", async ({
  context,
  page,
}) => {
  await authenticate(context, "player@chigi.test", "Player123!")
  await page.goto(`/giocatore/${E2E_PLAYER_ID}`)
  await dismissPaymentReminder(page)

  for (const privateHeading of [
    "Tesseramento",
    "Pagamenti",
    "Certificato medico",
    "Presenze",
  ]) {
    await expect(
      page.getByRole("heading", { name: privateHeading }),
    ).toBeVisible()
  }
  await expect(page.getByText("ASI-E2E-2025")).toBeVisible()
  await expect(page.getByText("Quota stagione")).toBeVisible()
  await expect(page.getByText("Centro Medico E2E")).toBeVisible()
  await expect(page.getByText("1/1 allenamenti")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Contatti operativi" }),
  ).toHaveCount(0)
  await expect(page.getByText(/NON ESPORRE/)).toHaveCount(0)
})

test("manager vede dati operativi del compagno ma mai note mediche", async ({
  context,
  page,
}) => {
  await authenticate(context, "manager@chigi.test", "Manager123!")
  await page.goto(`/giocatore/${E2E_PLAYER_ID}`)

  for (const privateHeading of [
    "Tesseramento",
    "Pagamenti",
    "Certificato medico",
    "Contatti operativi",
  ]) {
    await expect(
      page.getByRole("heading", { name: privateHeading }),
    ).toBeVisible()
  }
  await expect(page.getByText("+39 333 0000002")).toBeVisible()
  await expect(page.getByText("piero.operativo@chigi.test")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Presenze" }),
  ).toHaveCount(0)
  await expect(page.getByText(/NON ESPORRE/)).toHaveCount(0)
})

test("builder formazione monta tra titlebar e rosa, riceve focus e si chiude", async ({
  page,
}) => {
  await page.goto("/squadra")
  await expect
    .poll(() =>
      page.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    )
    .toBe(true)

  await page.getByRole("button", { name: "Crea la tua formazione" }).click()
  const builder = page.locator(
    'section[aria-label="Crea la tua formazione"]',
  )
  await expect(builder).toBeVisible()
  await expect(
    builder.getByRole("heading", { name: "Crea la tua formazione" }),
  ).toBeVisible()
  await expect
    .poll(() => builder.evaluate((element) => document.activeElement === element))
    .toBe(true)
  await expect(page.locator("[data-player-grid]")).toBeVisible()

  const order = await page.evaluate(() => {
    const titlebar = document.querySelector("h1")?.closest("header")
    const formation = document.querySelector(
      'section[aria-label="Crea la tua formazione"]',
    )
    const roster = document.querySelector("[data-player-grid]")
    if (!titlebar || !formation || !roster) return null
    return {
      titlebarBeforeFormation: Boolean(
        titlebar.compareDocumentPosition(formation) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      formationBeforeRoster: Boolean(
        formation.compareDocumentPosition(roster) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    }
  })
  expect(order).toEqual({
    titlebarBeforeFormation: true,
    formationBeforeRoster: true,
  })

  await builder.getByRole("button", { name: "Chiudi formazione" }).click()
  await expect(builder).toHaveCount(0)
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

  await expect(page.getByRole("heading", { name: "Gestione" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Aggiungi persona" })).toBeVisible()
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
  await page.getByRole("button", { name: "Aggiungi persona" }).click()
  await expect(page.getByRole("dialog")).toContainText("Aggiungi persona")
  await expectNoSeriousA11yViolations(page)
})

test("gerarchia titlebar e azioni manager restano responsive ed esclusive", async ({
  context,
  page,
}, testInfo) => {
  await authenticate(context, "manager@chigi.test", "Manager123!")
  await page.goto("/")

  const calendarHeading = page.getByRole("heading", {
    level: 1,
    name: "Calendario",
  })
  const calendarTitlebar = page.locator("header", { has: calendarHeading })
  const visibleAddAction = page.getByRole("button", {
    name: "Aggiungi evento",
  })
  await expect(visibleAddAction).toHaveCount(1)
  if (testInfo.project.name === "mobile") {
    await expect(
      calendarTitlebar.getByRole("button", { name: "Aggiungi evento" }),
    ).toHaveCount(1)
    await expectCircularIconOnlyAction(visibleAddAction)
    const management = page.getByRole("link", {
      name: "Gestione squadra",
      exact: true,
    })
    await expectCircularIconOnlyAction(management)
    await expectExactTextNotRendered(management, "Gestione squadra")
    await expect(management).toHaveClass(/border-violet-300/)
    await expect(management).toHaveClass(/text-violet-700/)
  } else {
    await expect(
      calendarTitlebar.getByRole("button", { name: "Aggiungi evento" }),
    ).toBeVisible()
    await expectExactTextRendered(visibleAddAction, "Aggiungi evento")
    await expect(visibleAddAction).not.toHaveCSS("position", "fixed")
    const management = page.getByRole("link", {
      name: "Gestione squadra",
      exact: true,
    })
    await expectExactTextRendered(management, "Gestione squadra")
    await expect(management).toHaveClass(/border-violet-300/)
    await expect(management).toHaveClass(/text-violet-700/)
  }

  for (const [route, title] of [
    ["/", "Calendario"],
    ["/squadra", "Squadra"],
    ["/torneo", "Torneo"],
    ["/statistiche", "Statistiche"],
    ["/profilo", "Profilo"],
    ["/gestione", "Gestione"],
  ] as const) {
    await page.goto(route)
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toHaveCount(1)
  }
})

test("manager salva goal assist MVP ammonizioni ed espulsioni ufficiali", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop")
  await authenticate(context, "manager@chigi.test", "Manager123!")
  await page.goto(`/evento/${E2E_MATCH_ID}`)

  await expect(
    page.getByRole("heading", { name: "Check-in ufficiale" }),
  ).toBeVisible()
  await page.getByLabel("Goal di Piero Player").fill("3")
  await page.getByLabel("Assist di Piero Player").fill("2")
  await page.getByLabel("Ammonizioni di Piero Player").fill("2")
  await page.getByLabel("Espulsioni di Piero Player").fill("1")
  await page.getByLabel("MVP").selectOption(E2E_PLAYER_ID)
  await page.getByRole("button", { name: "Salva statistiche" }).click()
  await expect(page.getByText("Check-in e statistiche salvati")).toBeVisible()

  const serviceClient = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data: stats, error: statsError } = await serviceClient
    .from("match_player_stats")
    .select("goals, assists, yellow_cards, red_cards")
    .eq("event_id", E2E_MATCH_ID)
    .eq("profile_id", E2E_PLAYER_ID)
    .single()
  expect(statsError).toBeNull()
  expect(stats).toEqual({
    goals: 3,
    assists: 2,
    yellow_cards: 2,
    red_cards: 1,
  })
  const { data: award, error: awardError } = await serviceClient
    .from("match_awards")
    .select("profile_id")
    .eq("event_id", E2E_MATCH_ID)
    .single()
  expect(awardError).toBeNull()
  expect(award).toEqual({ profile_id: E2E_PLAYER_ID })
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
  for (const actionName of [
    "Crea la tua formazione",
  ]) {
    const box = await page.getByRole("button", { name: actionName }).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
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

test(ANONYMOUS_CAPSULE_TEST_TITLE, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop")

  await page.goto("/squadra")
  await expect(page.getByTestId("next-match-capsule")).toHaveAttribute(
    "data-state",
    "draft",
  )

  await seedPublishedOfficialFormation()
  await page.reload()
  await expect(page.getByTestId("next-match-capsule")).toHaveAttribute(
    "data-state",
    "published",
  )
  await expect(
    page.getByRole("link", {
      name: "Formazione ufficiale contro PSICOLOGOL",
    }),
  ).toHaveAttribute("href", `/evento/${E2E_MATCH_ID}`)
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
  const {
    data: publishedFormation,
    error: publishedFormationError,
  } = await serviceClient
    .from("official_formations")
    .select("id")
    .eq("event_id", E2E_MATCH_ID)
    .single()
  expect(publishedFormationError).toBeNull()
  expect(publishedFormation).not.toBeNull()

  const { data: publishedPlayers, error: publishedPlayersError } =
    await serviceClient
      .from("official_formation_players")
      .select("position_key,is_starter")
      .eq("formation_id", publishedFormation!.id)
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

  await dismissPaymentReminder(page)
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
