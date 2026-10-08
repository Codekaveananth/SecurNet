/**
 * Presentation helpers: verdict wording, guidance and the plain-language
 * summary of the model's attributions.
 *
 * The API's verdict strings are PHISHING / SCAM / SUSPICIOUS / LEGITIMATE.
 * The interface shows LEGITIMATE as "Safe" (the brief's wording); the raw
 * value is kept on the result and shown in the technical details.
 */

export const TONE = { PHISHING: 'threat', SCAM: 'threat', SUSPICIOUS: 'watch', LEGITIMATE: 'safe' }

export function verdictLabel(verdict) {
  return { PHISHING: 'Phishing', SCAM: 'Scam', SUSPICIOUS: 'Suspicious', LEGITIMATE: 'Safe' }[verdict] || verdict
}

export function headline(r) {
  if (r.kind === 'url') {
    return {
      PHISHING: 'This link is very likely phishing',
      SUSPICIOUS: 'This link has warning signs',
      LEGITIMATE: 'No strong phishing signals in this link'
    }[r.verdict]
  }
  return {
    SCAM: 'This message is very likely a scam',
    SUSPICIOUS: 'This message has warning signs',
    LEGITIMATE: 'No strong scam signals in this message'
  }[r.verdict]
}

/** Recommended actions. Guidance text, not model output. */
export function recommendations(r) {
  const tags = new Set((r.scamPatterns || []).map((p) => p.id))
  const out = []
  if (r.verdict === 'PHISHING' || r.verdict === 'SCAM') {
    out.push(r.kind === 'url'
      ? 'Do not open this link or enter any password, OTP, card number or UPI PIN on it.'
      : 'Do not reply, call any number in it, or open its links.')
  } else if (r.verdict === 'SUSPICIOUS') {
    out.push('Do not act on it yet. Open your bank or wallet app directly, or call a number you already trust.')
  } else {
    const high = (r.indicators || []).filter((i) => i.severity === 'high')
    if (high.length) {
      out.push(`The model scored this as safe, but one check disagrees: ${high[0].label.toLowerCase()}. Verify the address before entering anything.`)
    } else {
      out.push('No action needed, but stay alert if you were not expecting this.')
    }
  }
  if (tags.has('upi_collect')) out.push('You never need to enter a UPI PIN to receive money. Decline unknown collect requests.')
  if (tags.has('otp')) out.push('Never share an OTP with anyone, including people who claim to be bank staff.')
  if (tags.has('kyc')) out.push('Banks do not ask for KYC updates through SMS links. Visit a branch or use the official app.')
  if (tags.has('fake_job')) out.push('Genuine employers do not charge fees or pay you to like videos. Do not pay a "registration" amount.')
  if (r.verdict === 'PHISHING' || r.verdict === 'SCAM') {
    out.push('Report it at cybercrime.gov.in or call the 1930 helpline if you have lost money.')
  }
  return out
}

const fmt = (c) => (c > 0 ? '+' : '') + c.toFixed(2)

/**
 * One-paragraph explanation built only from the attributions the model
 * returned. Nothing here is invented: if there is no evidence, it says so.
 */
export function explain(r) {
  const ev = r.evidence || []
  if (!ev.length) return 'No single feature contributed strongly enough to report for this input.'
  const up = ev.filter((e) => e.contribution > 0).slice(0, 3)
  const down = ev.filter((e) => e.contribution < 0).slice(0, 2)
  const pct = Math.round(r.score * 100)
  const thr = Math.round((r.threshold ?? 0.5) * 100)
  let s = `The model scored this ${pct}/100 against a decision threshold of ${thr}. `
  if (up.length) {
    s += `The strongest signals toward ${r.kind === 'url' ? 'phishing' : 'scam'} were ` +
      up.map((e) => `${e.description.toLowerCase()} (${fmt(e.contribution)})`).join(', ') + '. '
  }
  if (down.length) {
    s += 'Pulling the other way: ' +
      down.map((e) => `${e.description.toLowerCase()} (${fmt(e.contribution)})`).join(', ') + '. '
  }
  const shown = ev.reduce((a, e) => a + Math.abs(e.contribution), 0)
  if (r.otherContribution != null && Math.abs(r.otherContribution) > shown) {
    s += `Most of the decision (${fmt(r.otherContribution)}) comes from many smaller features that are not listed individually` +
      (r.kind === 'sms' ? ', mainly character patterns in the text. ' : '. ')
  }
  if (r.verdict === 'SUSPICIOUS' && r.escalatedByUrl) {
    s += 'The text alone looked legitimate, but a link inside it was scored as phishing, so the verdict was raised to suspicious.'
  } else if (r.verdict === 'SUSPICIOUS') {
    s += 'The evidence conflicts, so the score sits in the uncertain band below the threshold.'
  }
  return s.trim()
}

export const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}`)
export const ms = (v) => (v == null ? '—' : v < 10 ? `${v.toFixed(2)} ms` : `${v.toFixed(1)} ms`)

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}

export function truncate(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
