import { describe, expect, it } from "vitest"

import {
  detectPushPlatform,
  urlBase64ToUint8Array,
} from "@/lib/push"

describe("urlBase64ToUint8Array", () => {
  it("decodes an unpadded VAPID public key", () => {
    expect(Array.from(urlBase64ToUint8Array("AQIDBA"))).toEqual([1, 2, 3, 4])
  })
})

describe("detectPushPlatform", () => {
  it("recognizes an installed iOS PWA", () => {
    expect(
      detectPushPlatform({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        standalone: true,
      }),
    ).toBe("ios-pwa")
  })

  it("keeps Android separate from desktop web", () => {
    expect(
      detectPushPlatform({
        userAgent: "Mozilla/5.0 (Linux; Android 15)",
        standalone: false,
      }),
    ).toBe("android")
  })
})
