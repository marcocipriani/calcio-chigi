import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NotificationSettings } from "@/components/notifications/NotificationSettings"

const { session, upsert, preferences } = vi.hoisted(() => ({
  session: { user: { id: "user-1" }, isManager: false },
  upsert: vi.fn(),
  preferences: [] as { category: string; push_enabled: boolean }[],
}))

vi.mock("@/components/auth/AppSessionProvider", () => ({ useAppSession: () => session }))

vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: preferences, error: null }) }),
      upsert,
    }),
  },
}))

beforeEach(() => {
  session.isManager = false
  preferences.length = 0
  upsert.mockReset().mockResolvedValue({ error: null })
})

describe("NotificationSettings", () => {
  it("starts with every type on and mutes opponent goals on their own", async () => {
    preferences.push({ category: "MATCH_END", push_enabled: false })
    render(<NotificationSettings />)

    const against = screen.getByRole("switch", { name: "Goal degli avversari" })
    expect(against).toBeChecked()
    expect(screen.getByRole("switch", { name: "Goal del Chigi" })).toBeChecked()
    await waitFor(() => expect(screen.getByRole("switch", { name: "Fischio finale" })).not.toBeChecked())

    fireEvent.click(against)
    expect(against).not.toBeChecked()
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", category: "MATCH_GOAL_AGAINST", push_enabled: false }),
    )
  })

  it("shows the manager group only to managers", () => {
    const { unmount } = render(<NotificationSettings />)
    expect(screen.queryByRole("group", { name: "Manager" })).toBeNull()
    unmount()

    session.isManager = true
    render(<NotificationSettings />)
    expect(screen.getByRole("switch", { name: "Partita chiusa in automatico" })).toBeVisible()
  })
})
