import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import { afterEach } from "vitest"

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:55321"
process.env.NEXT_PUBLIC_SUPABASE_KEY ??= "test-anon-key"

HTMLElement.prototype.scrollIntoView ??= () => {}

// Radix Switch misura il thumb con ResizeObserver, assente in jsdom.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Node ≥ 25 espone un localStorage globale (undefined senza
// --localstorage-file) che copre quello di jsdom.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window
if (jsdomWindow && !globalThis.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: jsdomWindow.localStorage,
  })
}

// findBy*/waitFor: 1s di default non basta con la suite intera in parallelo.
configure({ asyncUtilTimeout: 5_000 })

afterEach(cleanup)
