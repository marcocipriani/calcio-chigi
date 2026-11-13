import { beforeEach, expect, it, vi } from "vitest"
import rows from "@/test/fixtures/crono-chigio.json"
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), single: vi.fn(), from: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from }) }))
import { GET } from "./route"

beforeEach(() => {
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ single: mocks.single }) }) })
  mocks.single.mockResolvedValue({ data: { results: rows }, error: null })
  mocks.getUser.mockResolvedValue({ data: { user: { id: "member" } }, error: null })
  mocks.rpc.mockResolvedValue({ data: { associationStatus: "ACTIVE", membership: { status: "YES" } }, error: null })
})
it("does not disclose results to visitors", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
  const response = await GET()
  expect(response.status).toBe(401)
  expect(await response.text()).not.toContain("Atleta I")
})
it.each([
  { associationStatus: "REQUESTED" },
  { associationStatus: "ACTIVE", membership: { status: "NO" } },
])("denies unapproved and archived members", async (data) => {
  mocks.rpc.mockResolvedValue({ data, error: null })
  expect((await GET()).status).toBe(403)
})
it("fails closed when membership cannot be checked", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "Unavailable" } })
  expect((await GET()).status).toBe(503)
})
it("serves uncached results to associated members", async () => {
  const response = await GET()
  expect(response.status).toBe(200)
  expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  expect(await response.json()).toHaveLength(14)
})

it("does not expose backend details when results are unavailable", async () => {
  mocks.single.mockResolvedValue({ data: null, error: { message: "private backend detail" } })
  const response = await GET()
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain("private backend detail")
})
