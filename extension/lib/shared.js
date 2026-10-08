/**
 * Code shared by the service worker and the extension pages.
 * Plain ES module, no build step.
 */

export const DEFAULTS = {
  protection: true,          // real-time checks on navigation
  notifications: true,       // system notification on high-risk sites
  sensitivity: 'standard',   // relaxed | standard | strict (changes warnings, never verdicts)
  localHistory: false,       // keep a list of checked sites on this device
  redactQuery: false,        // replace query values before sending (less accurate)
  serverUrl: 'http://localhost:8000',
  gatewayUrl: '',
  apiKey: '',
  dashboardUrl: 'http://localhost:5173',
  trusted: []                // hosts the user chose to always trust
}

export async function getSettings() {
  const s = await chrome.storage.local.get(DEFAULTS)
  return { ...DEFAULTS, ...s }
}

/** What each sensitivity level does. The model's verdict is never altered. */
export const SENSITIVITY = {
  relaxed: { label: 'Relaxed', block: ['PHISHING'], banner: [], notify: ['PHISHING'],
    help: 'Warning page for phishing only. Suspicious sites just change the toolbar icon.' },
  standard: { label: 'Standard', block: ['PHISHING'], banner: ['SUSPICIOUS'], notify: ['PHISHING'],
    help: 'Warning page for phishing, and a banner on suspicious sites.' },
  strict: { label: 'Strict', block: ['PHISHING', 'SUSPICIOUS'], banner: [], notify: ['PHISHING', 'SUSPICIOUS'],
    help: 'Warning page for phishing and suspicious sites.' }
}

export const VERDICT_TEXT = { PHISHING: 'Phishing', SUSPICIOUS: 'Suspicious', LEGITIMATE: 'Safe' }

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** Valid server URL: https anywhere, or plain http only to this machine. */
export function validServerUrl(u) {
  try {
    const x = new URL(u)
    if (x.protocol === 'https:') return true
    return x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname)
  } catch {
    return false
  }
}

export function dashboardLink(settings, path, params) {
  const base = settings.dashboardUrl.replace(/\/+$/, '')
  const q = params ? '?' + new URLSearchParams(params).toString() : ''
  return `${base}/#${path}${q}`
}

export function recommendation(verdict) {
  if (verdict === 'PHISHING') return 'Do not enter passwords, OTPs, card numbers or UPI PINs here. Leave the site.'
  if (verdict === 'SUSPICIOUS') return 'Be careful. If this should be your bank, open its official app instead of this link.'
  return 'No strong phishing signals. Still check the address before entering anything sensitive.'
}
