import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  AppSessionProvider,
  ProtectedFeature,
  useAppSession,
} from "@/components/auth/AppSessionProvider"

function Probe() {
  const session = useAppSession()
  return (
    <div>
      <span data-testid="loading">{String(session.loading)}</span>
      <span data-testid="status">{session.associationStatus}</span>
      <span data-testid="manager">{String(session.isManager)}</span>
    </div>
  )
}

function fakeClient({
  user = null,
  context = null,
}: {
  user?: { id: string } | null
  context?: unknown
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: context, error: null }),
  }
}

function wrapper(client: ReturnType<typeof fakeClient>, children: ReactNode) {
  return (
    <AppSessionProvider client={client as never}>
      {children}
    </AppSessionProvider>
  )
}

describe("AppSessionProvider", () => {
  it("resolves anonymous users without an RPC", async () => {
    const client = fakeClient({})
    render(wrapper(client, <Probe />))

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false")
    })
    expect(screen.getByTestId("status")).toHaveTextContent("NONE")
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it("exposes an approved manager context", async () => {
    const client = fakeClient({
      user: { id: "user-1" },
      context: {
        profile: {
          id: "profile-1",
          nome: "Marco",
          cognome: "Manager",
          is_manager: true,
        },
        associationStatus: "ACTIVE",
        membership: { id: "membership-1", status: "YES" },
        unreadNotifications: 3,
      },
    })
    render(wrapper(client, <Probe />))

    await waitFor(() => {
      expect(screen.getByTestId("manager")).toHaveTextContent("true")
    })
    expect(screen.getByTestId("status")).toHaveTextContent("ACTIVE")
  })
})

describe("ProtectedFeature", () => {
  it("shows a login CTA to anonymous users", async () => {
    render(
      wrapper(
        fakeClient({}),
        <ProtectedFeature fallback={<span>Accedi per continuare</span>}>
          <span>Area privata</span>
        </ProtectedFeature>,
      ),
    )

    expect(await screen.findByText("Accedi per continuare")).toBeVisible()
    expect(screen.queryByText("Area privata")).not.toBeInTheDocument()
  })
})
