/**
 * SecureNet background service worker (MV3).
 *
 * Flow: navigation -> prepare URL (privacy filters) -> cache -> SecureNet API
 *       -> verdict + SHAP evidence -> badge / banner / warning page
 *       -> popup, side panel and dashboard -> user feedback.
 *
 * Privacy guarantees enforced here:
 *   - Only the URL string leaves the browser. Never page content, form
 *     fields, cookies, keystrokes, passwords, OTPs or UPI PINs.
 *   - user:password@ in a URL is replaced before sending.
 *   - Fragments (#...) are dropped; query values can optionally be redacted.
 *   - Local, private-network and non-web addresses are never sent.
 * Failure policy: a timeout, network error, rate limit or invalid response is
 * reported as "analysis unavailable". It is NEVER reported as safe.
 */
import { DEFAULTS, SENSITIVITY, getSettings, validServerUrl } from '../lib/shared.js'
import { prepareUrl } from '../lib/privacy.js'

const REQUEST_TIMEOUT_MS = 4000
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 400
const RATE_PER_MIN = 40
const HISTORY_MAX = 200

/* ------------------------------------------------------------ settings */

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const current = await chrome.storage.local.get(null)
  await chrome.storage.local.set({ ...DEFAULTS, ...current })
  // The old version stored { enabled }; carry it over once.
  if (typeof current.enabled === 'boolean') {
    await chrome.storage.local.set({ protection: current.enabled })
    await chrome.storage.local.remove('enabled')
  }
  if (reason === 'install') chrome.runtime.openOptionsPage()
})

/* ---------------------------------------------------- URL preparation */

/* -------------------------------------------------------------- cache */

const memCache = new Map()
const inflight = new Map()

async function cacheGet(key) {
  const now = Date.now()
  const hit = memCache.get(key)
  if (hit && hit.expires > now) return hit.result
  const { cache = {} } = await chrome.storage.session.get('cache')
  const e = cache[key]
  if (e && e.expires > now) { memCache.set(key, e); return e.result }
  return null
}

async function cacheSet(key, result) {
  const entry = { result, expires: Date.now() + CACHE_TTL_MS }
  memCache.set(key, entry)
  const { cache = {} } = await chrome.storage.session.get('cache')
  cache[key] = entry
  const keys = Object.keys(cache)
  if (keys.length > CACHE_MAX) {
    keys.sort((a, b) => cache[a].expires - cache[b].expires).slice(0, keys.length - CACHE_MAX).forEach((k) => delete cache[k])
  }
  await chrome.storage.session.set({ cache })
}

async function cacheClear() {
  memCache.clear()
  await chrome.storage.session.remove('cache')
}

/* --------------------------------------------------------- rate limit */

const stamps = []
function overBudget() {
  const now = Date.now()
  while (stamps.length && now - stamps[0] > 60000) stamps.shift()
  if (stamps.length >= RATE_PER_MIN) return true
  stamps.push(now)
  return false
}

/* --------------------------------------------------------------- API */

async function timedFetch(url, opts, ms = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal, credentials: 'omit', cache: 'no-store' }) }
  finally { clearTimeout(t) }
}

function headers(settings) {
  const h = { 'Content-Type': 'application/json' }
  if (settings.apiKey) h['X-SecureNet-Key'] = settings.apiKey
  return h
}

function isValid(r) {
  return r && typeof r === 'object' && ['PHISHING', 'SUSPICIOUS', 'LEGITIMATE'].includes(r.verdict) &&
    typeof r.score === 'number' && r.score >= 0 && r.score <= 1 && Array.isArray(r.evidence ?? [])
}

function slim(raw, tier) {
  const x = { ...raw, ...(raw.analysis || {}) }
  return {
    verdict: x.verdict,
    score: x.score,
    threshold: x.threshold ?? null,
    confidence: x.confidence ?? null,
    canonical: x.canonical_url ?? null,
    modelVersion: x.model_version ?? null,
    latencyMs: x.latency_ms ?? null,
    scanId: x.scanId ?? null,
    tier,
    evidence: (x.evidence || []).slice(0, 8).map((e) => ({
      description: String(e.description).slice(0, 120), contribution: Number(e.contribution), value: e.value
    })),
    indicators: (x.indicators || []).slice(0, 6).map((i) => ({
      label: String(i.label).slice(0, 120), severity: i.severity, source: i.source
    }))
  }
}

async function callApi(url, settings) {
  const targets = []
  if (settings.gatewayUrl && validServerUrl(settings.gatewayUrl)) {
    targets.push({ base: settings.gatewayUrl.replace(/\/+$/, ''), body: { artefact: url }, tier: 'gateway' })
  }
  if (validServerUrl(settings.serverUrl)) {
    targets.push({ base: settings.serverUrl.replace(/\/+$/, ''), body: { url }, tier: 'ml' })
  }
  if (!targets.length) return { status: 'unavailable', reason: 'No valid SecureNet server is configured.' }

  let last = 'The SecureNet service could not be reached.'
  for (const t of targets) {
    try {
      const res = await timedFetch(`${t.base}/api/v1/scan/url`, {
        method: 'POST', headers: headers(settings), body: JSON.stringify(t.body)
      })
      if (res.status === 429) { last = 'The service is rate limiting requests.'; continue }
      if (res.status === 401) { last = 'The service rejected the API key.'; continue }
      if (!res.ok) { last = `The service returned an error (${res.status}).`; continue }
      const raw = await res.json()
      if (!isValid(raw)) { last = 'The service returned an invalid response.'; continue }
      return { status: 'ok', result: slim(raw, t.tier) }
    } catch (e) {
      last = e.name === 'AbortError' ? 'The service did not answer in time.' : 'The SecureNet service could not be reached.'
    }
  }
  return { status: 'unavailable', reason: last }
}

/** Scan with cache, de-duplication and rate limiting. */
async function analyse(rawUrl, { force = false } = {}) {
  const settings = await getSettings()
  const prep = prepareUrl(rawUrl, settings)
  if (prep.skip) return { status: 'skipped', reason: prep.skip, url: rawUrl }

  if (!force) {
    const hit = await cacheGet(prep.key)
    if (hit) return { status: 'ok', result: hit, url: rawUrl, cached: true }
  }
  if (inflight.has(prep.key)) return inflight.get(prep.key)
  if (overBudget()) return { status: 'unavailable', reason: 'Too many pages in a short time. Checks resume within a minute.', url: rawUrl }

  const p = (async () => {
    const out = await callApi(prep.send, settings)
    if (out.status === 'ok') {
      await cacheSet(prep.key, out.result)
      if (settings.localHistory) await addHistory(rawUrl, out.result)
    }
    return { ...out, url: rawUrl }
  })()
  inflight.set(prep.key, p)
  try { return await p } finally { inflight.delete(prep.key) }
}

/* ------------------------------------------------------------ history */

async function addHistory(url, r) {
  let display = url
  try { const u = new URL(url); u.username = ''; u.password = ''; u.hash = ''; u.search = ''; display = u.toString() } catch { /* keep */ }
  const { history = [] } = await chrome.storage.local.get('history')
  history.unshift({ url: display, verdict: r.verdict, score: r.score, at: new Date().toISOString() })
  await chrome.storage.local.set({ history: history.slice(0, HISTORY_MAX) })
}

/* --------------------------------------------------------- tab state */

async function setTabState(tabId, state) {
  await chrome.storage.session.set({ ['tab:' + tabId]: { ...state, at: Date.now() } })
}

async function getTabState(tabId) {
  const k = 'tab:' + tabId
  return (await chrome.storage.session.get(k))[k] || null
}

function paintBadge(tabId, state) {
  let text = '', color = '#5a6b7c', title = 'SecureNet'
  if (state.status === 'scanning') { text = '…'; title = 'SecureNet: checking this site' }
  else if (state.status === 'unavailable') { text = 'N/A'; title = 'SecureNet: analysis unavailable. This is not a safe verdict.' }
  else if (state.status === 'skipped') { title = state.reason === 'trusted' ? 'SecureNet: trusted site, not checked' : 'SecureNet: not checked' }
  else if (state.status === 'ok') {
    const v = state.result.verdict, s = Math.round(state.result.score * 100)
    if (v === 'PHISHING') { text = '!'; color = '#e5484d' }
    else if (v === 'SUSPICIOUS') { text = '?'; color = '#e8a93b' }
    else { text = 'OK'; color = '#2f9b74' }
    title = `SecureNet: ${v === 'LEGITIMATE' ? 'Safe' : v[0] + v.slice(1).toLowerCase()} (risk ${s})`
  }
  chrome.action.setBadgeText({ tabId, text }).catch(() => {})
  chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {})
  chrome.action.setTitle({ tabId, title }).catch(() => {})
}

/* ------------------------------------------------- navigation pipeline */

const WARNING_PAGE = chrome.runtime.getURL('warning/warning.html')
const lastNav = new Map()

async function isDismissed(url) {
  const { dismissed = [] } = await chrome.storage.session.get('dismissed')
  return dismissed.includes(url)
}

async function handleNavigation(tabId, url) {
  if (url.startsWith(WARNING_PAGE)) return
  const settings = await getSettings()
  if (!settings.protection) {
    await setTabState(tabId, { status: 'skipped', reason: 'off', url })
    paintBadge(tabId, { status: 'skipped' })
    return
  }
  const token = Symbol(url)
  lastNav.set(tabId, token)
  await setTabState(tabId, { status: 'scanning', url })
  paintBadge(tabId, { status: 'scanning' })

  const out = await analyse(url)
  if (lastNav.get(tabId) !== token) return // the user already navigated elsewhere
  await setTabState(tabId, out)
  paintBadge(tabId, out)
  if (out.status !== 'ok' || await isDismissed(url)) return

  const level = SENSITIVITY[settings.sensitivity] || SENSITIVITY.standard
  const v = out.result.verdict
  if (settings.notifications && level.notify.includes(v)) notifyThreat(url, out.result)
  if (level.block.includes(v)) {
    await chrome.storage.session.set({ ['warn:' + tabId]: { url, result: out.result } })
    chrome.tabs.update(tabId, { url: `${WARNING_PAGE}?tab=${tabId}` }).catch(() => {})
  } else if (level.banner.includes(v)) {
    sendBanner(tabId, url, out.result)
  }
}

function sendBanner(tabId, url, result, attempt = 0) {
  chrome.tabs.sendMessage(tabId, { type: 'SECURENET_BANNER', payload: { url, result } }).catch(() => {
    // The content script loads at document_idle; retry briefly.
    if (attempt < 6) setTimeout(() => sendBanner(tabId, url, result, attempt + 1), 700)
  })
}

function notifyThreat(url, r) {
  let host = url
  try { host = new URL(url).hostname } catch { /* keep */ }
  chrome.notifications.create('sn:' + encodeURIComponent(url), {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: r.verdict === 'PHISHING' ? 'Phishing site blocked' : 'Suspicious site',
    message: `${host} scored ${Math.round(r.score * 100)}/100. Do not enter passwords, OTPs or UPI PINs.`,
    priority: 2
  })
}

chrome.notifications.onClicked.addListener(async (id) => {
  if (!id.startsWith('sn:')) return
  const url = decodeURIComponent(id.slice(3))
  const s = await getSettings()
  const base = s.dashboardUrl.replace(/\/+$/, '')
  chrome.tabs.create({ url: `${base}/#/url?${new URLSearchParams({ u: url, auto: 1, src: 'extension' })}` })
  chrome.notifications.clear(id)
})

chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  if (d.frameId === 0) handleNavigation(d.tabId, d.url)
})
// Single-page apps change the URL without a full navigation.
chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
  if (d.frameId === 0) handleNavigation(d.tabId, d.url)
})
// Chrome clears a tab's badge whenever it navigates. Repaint from the stored
// state once the navigation commits (including the redirect to the warning
// page), so a finished scan never loses its indicator.
chrome.webNavigation.onCommitted.addListener(async (d) => {
  if (d.frameId !== 0) return
  const state = await getTabState(d.tabId)
  if (!state) return
  const sameUrl = state.url && state.url.split('#')[0] === d.url.split('#')[0]
  if (sameUrl || d.url.startsWith(WARNING_PAGE)) paintBadge(d.tabId, state)
})
chrome.tabs.onRemoved.addListener((tabId) => {
  lastNav.delete(tabId)
  chrome.storage.session.remove(['tab:' + tabId, 'warn:' + tabId])
})

/* ----------------------------------------------------------- feedback */

async function report(url, result, correctLabel) {
  const s = await getSettings()
  const predicted = result.verdict === 'LEGITIMATE' ? 0 : 1
  const body = {
    artefact: url.slice(0, 4000), artefact_type: 'url', predicted_label: predicted, correct_label: correctLabel,
    predicted_verdict: result.verdict, score: result.score, model_version: result.modelVersion, source: 'extension'
  }
  try {
    let res
    if (result.tier === 'gateway' && result.scanId != null && s.gatewayUrl) {
      res = await timedFetch(`${s.gatewayUrl.replace(/\/+$/, '')}/api/v1/feedback`, {
        method: 'POST', headers: headers(s), body: JSON.stringify({ scanId: result.scanId, correctLabel })
      })
    } else {
      res = await timedFetch(`${s.serverUrl.replace(/\/+$/, '')}/api/v1/feedback`, {
        method: 'POST', headers: headers(s), body: JSON.stringify(body)
      })
    }
    return res.ok ? { ok: true } : { ok: false, error: `The service returned ${res.status}.` }
  } catch {
    return { ok: false, error: 'The SecureNet service could not be reached.' }
  }
}

/* ----------------------------------------------------------- messages */

const isExtensionPage = (sender) => sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''))

async function dashboardOrigins() {
  const s = await getSettings()
  try { return [new URL(s.dashboardUrl).origin] } catch { return [] }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== 'string') return false
  const run = async () => {
    switch (msg.type) {
      case 'GET_TAB_STATE': {
        if (!isExtensionPage(sender)) return null
        const tab = msg.tabId != null
          ? await chrome.tabs.get(Number(msg.tabId)).catch(() => null)
          : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
        if (!tab) return { tab: null }
        return { tab: { id: tab.id, url: tab.url }, state: await getTabState(tab.id), settings: await getSettings() }
      }
      case 'RESCAN': {
        if (!isExtensionPage(sender)) return null
        const tab = msg.tabId != null
          ? await chrome.tabs.get(Number(msg.tabId)).catch(() => null)
          : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
        if (!tab?.url) return { status: 'skipped', reason: 'not-web' }
        await setTabState(tab.id, { status: 'scanning', url: tab.url })
        paintBadge(tab.id, { status: 'scanning' })
        const out = await analyse(tab.url, { force: true })
        await setTabState(tab.id, out)
        paintBadge(tab.id, out)
        return out
      }
      case 'GET_WARNING': {
        if (!isExtensionPage(sender)) return null
        const k = 'warn:' + Number(msg.tab)
        return (await chrome.storage.session.get(k))[k] || null
      }
      case 'PROCEED': {
        // From the warning page or the banner: the user chose to continue.
        const url = String(msg.url || '')
        const { dismissed = [] } = await chrome.storage.session.get('dismissed')
        if (url && !dismissed.includes(url)) dismissed.push(url)
        await chrome.storage.session.set({ dismissed: dismissed.slice(-200) })
        return { ok: true }
      }
      case 'REPORT': {
        if (!isExtensionPage(sender) && !sender.tab) return null
        return report(String(msg.url), msg.result, msg.correctLabel === 0 ? 0 : 1)
      }
      case 'TRUST_HOST': {
        if (!isExtensionPage(sender)) return null
        const s = await getSettings()
        const host = String(msg.host || '').toLowerCase()
        if (host && !s.trusted.includes(host)) await chrome.storage.local.set({ trusted: [...s.trusted, host] })
        return { ok: true }
      }
      case 'CLEAR_CACHE': {
        if (!isExtensionPage(sender)) return null
        await cacheClear()
        return { ok: true }
      }
      case 'DASHBOARD_STATE': {
        // Only answered for the bridge script running on the configured dashboard.
        const origin = sender.tab?.url ? new URL(sender.tab.url).origin : null
        if (!origin || !(await dashboardOrigins()).includes(origin)) return null
        const s = await getSettings()
        const out = {
          version: chrome.runtime.getManifest().version,
          backend: s.gatewayUrl ? 'gateway with ML fallback' : s.serverUrl,
          settings: { protection: s.protection, notifications: s.notifications, sensitivity: s.sensitivity, localHistory: s.localHistory }
        }
        if (s.localHistory) out.history = (await chrome.storage.local.get({ history: [] })).history.slice(0, 50)
        return out
      }
      default:
        return null
    }
  }
  run().then(reply, () => reply(null))
  return true
})

// Reset cached verdicts when the server changes, so old answers are not reused.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.serverUrl || changes.gatewayUrl || changes.redactQuery)) cacheClear()
})
