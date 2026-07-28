import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:55321"
process.env.NEXT_PUBLIC_SUPABASE_KEY ??= "test-anon-key"

HTMLElement.prototype.scrollIntoView ??= () => {}

afterEach(cleanup)
