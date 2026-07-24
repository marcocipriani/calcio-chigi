import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

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

  it("offers yes, maybe and no for the pending season confirmation", async () => {
    const client = fakeClient({
      profile: {
        id: "profile-1",
        nome: "Marco",
        cognome: "Rossi",
        is_manager: false,
      },
      associationStatus: "ACTIVE",
      membership: {
        id: "membership-1",
        status: "PENDING",
        last_confirmation_requested_at: null,
      },
      unreadNotifications: 0,
    })

    render(
      <AppSessionProvider client={client as never}>
        <AppGates client={client as never} seasonSlug="2026-2027" />
      </AppSessionProvider>,
    )

    expect(await screen.findByRole("button", { name: "Sì" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Forse" })).toBeVisible()
    expect(screen.getByRole("button", { name: "No" })).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "Forse" }))

    await waitFor(() => {
      expect(client.rpc).toHaveBeenCalledWith(
        "respond_to_season_confirmation",
        {
          p_season_slug: "2026-2027",
          p_response: "MAYBE",
        },
      )
    })
  })
})
