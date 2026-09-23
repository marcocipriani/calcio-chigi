import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:55321"
process.env.NEXT_PUBLIC_SUPABASE_KEY ??= "test-anon-key"

HTMLElement.prototype.scrollIntoView ??= () => {}

// Node ≥ 25 espone un localStorage globale (undefined senza
// --localstorage-file) che copre quello di jsdom.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window
if (jsdomWindow && !globalThis.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: jsdomWindow.localStorage,
  })
}

afterEach(cleanup)
