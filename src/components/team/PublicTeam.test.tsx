import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const database = vi.hoisted(() => {
  const roster = [
    {
      id: "confirmed-1",
      nome: "Luca",
      cognome: "Confermato",
      avatar_url: null,
      category: "PLAYER",
      role: "DIFENSORE",
      staff_function: null,
      jersey_number: 4,
      status: "YES",
    },
    {
      id: "maybe-1",
      nome: "Marco",
      cognome: "Incerto",
      avatar_url: null,
      category: "PLAYER",
      role: "ATTACCANTE",
      staff_function: null,
      jersey_number: 9,
      status: "MAYBE",
    },
    {
      id: "staff-1",
      nome: "Sara",
      cognome: "Staff",
      avatar_url: null,
      category: "STAFF",
      role: null,
      staff_function: "Allenatrice",
      jersey_number: null,
      status: "YES",
    },
  ]

  return {
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        order: vi.fn(() =>
          Promise.resolve({ data: table === "public_active_roster" ? roster : [] }),
        ),
        then(onFulfilled: (value: { data: unknown[] }) => unknown) {
          return Promise.resolve({
            data: table === "public_active_roster" ? roster : [],
          }).then(onFulfilled)
        },
      }
      return query
    }),
  }
})

vi.mock("@/lib/supabaseBrowser", () => ({ supabaseBrowser: database }))

import { PublicTeam } from "@/components/team/PublicTeam"

describe("PublicTeam", () => {
  it("separates maybe players from confirmed players without profile actions", async () => {
    render(<PublicTeam canViewProfiles />)

    expect(await screen.findByRole("heading", { name: "Squadra" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "In forse" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Staff" })).toBeVisible()

    const confirmed = screen.getByRole("region", { name: "Squadra" })
    const maybe = screen.getByRole("region", { name: "In forse" })
    expect(within(confirmed).getByText("Confermato")).toBeVisible()
    expect(within(maybe).getByText("Incerto")).toBeVisible()
    expect(
      within(maybe).queryByRole("link", { name: /profilo di/i }),
    ).not.toBeInTheDocument()
  })
})
