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
      is_u35: true,
      status: "YES",
    },
    {
      id: "confirmed-2",
      nome: "Marco",
      cognome: "Secondo",
      avatar_url: null,
      category: "PLAYER",
      role: "ATTACCANTE",
      staff_function: null,
      jersey_number: 9,
      is_u35: false,
      status: "YES",
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
      is_u35: false,
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
  it("lists every rostered player in one squad section", async () => {
    render(<PublicTeam canViewProfiles />)

    expect(await screen.findByRole("heading", { name: "Squadra" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Staff" })).toBeVisible()
    expect(
      screen.queryByRole("heading", { name: "In forse" }),
    ).not.toBeInTheDocument()

    const confirmed = screen.getByRole("region", { name: "Squadra" })
    expect(within(confirmed).getByText("Confermato")).toBeVisible()
    expect(within(confirmed).getByText("Secondo")).toBeVisible()
    expect(within(confirmed).getByText("U35")).toBeVisible()
  })
})
