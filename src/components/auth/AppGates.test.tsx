import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const navigation = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
}))

const notifications = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(notifications.toast, {
    error: vi.fn(),
    success: vi.fn(),
  }),
}))

import { AppGates } from "@/components/auth/AppGates"
import { AppSessionProvider } from "@/components/auth/AppSessionProvider"

function fakeClient(context: Record<string, unknown>) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "get_app_context") {
      return { data: context, error: null }
    }
    return { data: {}, error: null }
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: "profile-1", nome: "Marco", cognome: "Rossi" },
            { id: "profile-2", nome: "Luca", cognome: "Verdi" },
          ],
          error: null,
        }),
      }),
    }),
    rpc,
  }
}

function jerseyClient({
  preference,
  confirmedAt,
}: {
  preference: { membership_id: string } | null
  confirmedAt: string | null
}) {
  const client = fakeClient({
    profile: {
      id: "profile-1",
      nome: "Marco",
      cognome: "Rossi",
      is_manager: false,
    },
    associationStatus: "ACTIVE",
    membership: { id: "membership-1", status: "YES", category: "PLAYER" },
    targetSeason: {
      id: "season-1",
      slug: "2026-2027",
      name: "Stagione 2026–2027",
      starts_on: "2026-08-01",
      ends_on: "2027-07-31",
    },
    unreadNotifications: 0,
  })
  client.from.mockImplementation(((table: string) => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data:
            table === "jersey_preferences"
              ? preference
              : { confirmed_at: confirmedAt },
          error: null,
        }),
      }),
    }),
  })) as never)
  return client
}

describe("AppGates", () => {
  it("requires confirmation before requesting a profile association", async () => {
    const client = fakeClient({
      profile: null,
      associationStatus: "NONE",
      membership: null,
      unreadNotifications: 0,
    })

    render(
      <AppSessionProvider client={client as never}>
        <AppGates client={client as never} />
      </AppSessionProvider>,
    )

    fireEvent.click(await screen.findByRole("button", { name: /Marco Rossi/i }))
    fireEvent.click(screen.getByRole("button", { name: /Continua/i }))

    expect(screen.getByRole("dialog")).toHaveTextContent(
      /Stai associando il tuo account a Marco Rossi/i,
    )

    fireEvent.click(
      screen.getByRole("button", { name: /Conferma richiesta/i }),
    )

    await waitFor(() => {
      expect(client.rpc).toHaveBeenCalledWith("request_profile_association", {
        p_profile_id: "profile-1",
      })
    })
  })

  it("lets an unmatched account postpone the association or sign out", async () => {
    sessionStorage.clear()
    const client = fakeClient({
      profile: null,
      associationStatus: "NONE",
      membership: null,
      unreadNotifications: 0,
    })

    render(
      <AppSessionProvider client={client as never}>
        <AppGates client={client as never} />
      </AppSessionProvider>,
    )

    await screen.findByRole("button", { name: /Marco Rossi/i })
    expect(screen.getByRole("button", { name: "Esci" })).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Non ora" }))

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
    expect(sessionStorage.getItem("association-prompt-postponed")).toBe("1")
    sessionStorage.clear()
  })

  it("keeps the profile list scrollable between a pinned header and footer", async () => {
    const client = fakeClient({
      profile: null,
      associationStatus: "NONE",
      membership: null,
      unreadNotifications: 0,
    })

    render(
      <AppSessionProvider client={client as never}>
        <AppGates client={client as never} />
      </AppSessionProvider>,
    )

    await screen.findByRole("button", { name: /Marco Rossi/i })
    const content = screen.getByRole("dialog")
    const list = content.querySelector<HTMLElement>(
      '[aria-label="Profili disponibili"]',
    )
    const footer = content.querySelector<HTMLElement>(
      '[data-slot="dialog-footer"]',
    )
    if (!list || !footer) throw new Error("Dialog senza lista o footer")

    // Con `grid` le tracce si dimensionano sul contenuto e ignorano il tetto di
    // altezza: con una rosa lunga la lista sforava e il footer usciva fuori.
    expect(content).toHaveClass("flex", "flex-col", "overflow-hidden")
    expect(content.querySelector('[data-slot="dialog-header"]')).toHaveClass(
      "shrink-0",
    )
    expect(list).toHaveClass("min-h-0", "flex-auto", "overflow-y-auto")
    expect(list).not.toHaveClass("min-h-36")
    expect(footer).toHaveClass("shrink-0")
    expect(list.contains(footer)).toBe(false)
  })

  it("locks archived members out of the team features", async () => {
    const client = fakeClient({
      profile: {
        id: "profile-1",
        nome: "Marco",
        cognome: "Rossi",
        is_manager: false,
      },
      associationStatus: "ACTIVE",
      membership: { id: "membership-1", status: "NO" },
      unreadNotifications: 0,
    })
    const signOut = client.auth.signOut

    render(
      <AppSessionProvider client={client as never}>
        <AppGates client={client as never} />
      </AppSessionProvider>,
    )

    expect(
      await screen.findByRole("heading", { name: /Posto in rosa archiviato/i }),
    ).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "Esci" }))
    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })

  it("lets archived members continue on the public side for the session", async () => {
    sessionStorage.clear()
    const client = fakeClient({
      profile: {
        id: "profile-1",
        nome: "Marco",
        cognome: "Rossi",
        is_manager: false,
      },
      associationStatus: "ACTIVE",
      membership: { id: "membership-1", status: "NO" },
      unreadNotifications: 0,
    })

    render(
      <AppSessionProvider client={client as never}>
        <AppGates client={client as never} />
      </AppSessionProvider>,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Continua sulla parte pubblica",
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
    expect(sessionStorage.getItem("archived-notice-seen")).toBe("1")
    sessionStorage.clear()
  })

  it("keeps the jersey reminder until confirmation, collapsible into a shirt button", async () => {
    window.localStorage.clear()
    const client = jerseyClient({ preference: null, confirmedAt: null })

    const { unmount } = render(
      <AppSessionProvider client={client as never}>
        <AppGates client={client as never} />
      </AppSessionProvider>,
    )

    const prompt = await screen.findByRole("region", {
      name: "Scegli il tuo numero di maglia",
    })
    expect(within(prompt).getByRole("link", { name: "Scegli" })).toHaveAttribute(
      "href",
      "/maglie",
    )
    fireEvent.click(within(prompt).getByRole("button", { name: "Comprimi" }))
    expect(
      screen.getByRole("button", { name: "Numero di maglia: da scegliere" }),
    ).toBeVisible()
    unmount()

    // Riaprendo l'app resta compresso, ma non sparisce.
    render(
      <AppSessionProvider client={client as never}>
        <AppGates client={client as never} />
      </AppSessionProvider>,
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Numero di maglia: da scegliere",
      }),
    )
    expect(
      screen.getByRole("region", { name: "Scegli il tuo numero di maglia" }),
    ).toBeVisible()
  })

  it("starts collapsed for players who already chose and hides once confirmed", async () => {
    window.localStorage.clear()
    const open = jerseyClient({
      preference: { membership_id: "membership-1" },
      confirmedAt: null,
    })
    const { unmount } = render(
      <AppSessionProvider client={open as never}>
        <AppGates client={open as never} />
      </AppSessionProvider>,
    )
    expect(
      await screen.findByRole("button", {
        name: "Numero di maglia: scelta aperta",
      }),
    ).toBeVisible()
    unmount()

    const closed = jerseyClient({
      preference: { membership_id: "membership-1" },
      confirmedAt: "2026-09-21T10:00:00Z",
    })
    render(
      <AppSessionProvider client={closed as never}>
        <AppGates client={closed as never} />
      </AppSessionProvider>,
    )
    await waitFor(() => expect(closed.from).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole("button", { name: /Numero di maglia/ })).toBeNull()
  })
})
