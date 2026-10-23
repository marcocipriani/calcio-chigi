import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useOnResume } from "@/lib/useOnResume"

describe("useOnResume", () => {
  it("reloads when the page becomes visible or goes back online", () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() => useOnResume(callback))

    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("online"))
    expect(callback).toHaveBeenCalledTimes(2)

    unmount()
    window.dispatchEvent(new Event("online"))
    expect(callback).toHaveBeenCalledTimes(2)
  })
})
