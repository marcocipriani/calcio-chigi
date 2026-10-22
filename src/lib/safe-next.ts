// Solo percorsi interni: blocca open redirect via //host, /\host o URL assolute.
// Niente spazi: il parser URL scarta tab e a capo, "/\t/evil.com" diventerebbe "//evil.com".
export function safeNext(value: string | null | undefined) {
  return value && /^\/(?![/\\])/.test(value) && !/\s/.test(value) ? value : "/"
}
