// Solo percorsi interni: blocca open redirect via //host, /\host o URL assolute.
export function safeNext(value: string | null | undefined) {
  return value && /^\/(?![/\\])/.test(value) ? value : "/"
}
