/** URL privacy filter. Pure function so it can be unit-tested outside Chrome. */

const PRIVATE_V4 = [/^10\./, /^127\./, /^192\.168\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./]

/**
 * Returns { send, key } for a scannable URL, or { skip: reason }.
 * `send` is what goes to the API; `key` identifies it for caching.
 */
export function prepareUrl(raw, settings) {
  let u
  try { u = new URL(raw) } catch { return { skip: 'not-web' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { skip: 'not-web' }
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '[::1]' ||
      PRIVATE_V4.some((r) => r.test(host)) || /^\[(fc|fd|fe80)/i.test(host)) {
    return { skip: 'private' }
  }
  if ((settings.trusted || []).some((t) => host === t || host.endsWith('.' + t))) return { skip: 'trusted', host }
  // Never send credentials embedded in the URL. The '@' is kept because its
  // presence is itself a phishing signal the model uses.
  if (u.username || u.password) { u.username = 'redacted'; u.password = '' }
  u.hash = ''
  if (settings.redactQuery && u.search) {
    const p = new URLSearchParams(u.search)
    const out = new URLSearchParams()
    for (const [k] of p) out.append(k, 'x')
    u.search = out.toString()
  }
  const send = u.toString()
  return { send, key: send, host }
}

