import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ session: vi.fn(), directory: vi.fn(), single: vi.fn(), eq: vi.fn() }))
vi.mock("@/components/auth/AppSessionProvider", () => ({ useAppSession: mocks.session }))
vi.mock("@/lib/api", () => ({ fetchSeasonPlayerDirectory: mocks.directory }))
vi.mock("@/lib/supabaseBrowser", () => ({ supabaseBrowser: { from: () => ({ select: () => ({ eq: mocks.eq }) }) } }))
vi.mock("@/components/stats/CronoChigioSection", () => ({ CronoChigioSection: ({ fullPage }: { fullPage: boolean }) => <p>{fullPage ? "Test completo" : "Anteprima"}</p> }))
import Page from "./page"
beforeEach(() => {
  vi.clearAllMocks()
  mocks.eq.mockReturnValue({ single: mocks.single })
  mocks.single.mockResolvedValue({ data: { id: "season-2026" }, error: null })
  mocks.directory.mockResolvedValue([])
})
it("does not load private content for visitors or unassociated users", () => {
  mocks.session.mockReturnValue({ isAssociated: false, loading: false })
  render(<Page />)
  expect(screen.getByText(/riservato ai membri attivi/)).toBeInTheDocument()
  expect(screen.queryByText("Test completo")).not.toBeInTheDocument()
  expect(mocks.directory).not.toHaveBeenCalled()
})
it("opens full results with the roster of the test season for associated users", async () => {
  mocks.session.mockReturnValue({ isAssociated: true, loading: false })
  render(<Page />)
  expect(await screen.findByText("Test completo")).toBeInTheDocument()
  expect(mocks.eq).toHaveBeenCalledWith("slug", "2026-2027")
  await waitFor(() => expect(mocks.directory).toHaveBeenCalledWith(expect.anything(), "season-2026"))
})
