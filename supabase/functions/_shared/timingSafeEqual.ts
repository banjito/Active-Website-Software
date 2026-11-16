/**
 * Compares two secrets in constant time.
 *
 * A plain === stops at the first wrong character, so an attacker can time
 * responses to guess a secret one character at a time. This always checks
 * every byte. Length can still differ (returns false early), which is fine for
 * fixed-length values like HMAC signatures and API keys.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}
