/**
 * API client.
 *
 * SecureNet can run with or without the Spring Boot gateway. The client
 * probes the gateway first and falls back to the Python ML service. Both
 * tiers return the same scan envelope (the gateway passes the ML service's
 * extra analysis through in `analysis`), so the UI does not need to know which
 * one answered.
 *
 * A failed or timed-out request is always an error. It is never rendered as a
 * "safe" result.
 */

// The gateway is optional. It is only probed when configured, so a missing
// gateway does not produce a failed request (and a console error) every poll.
const GATEWAY = import.meta.env.VITE_GATEWAY_URL || ''
const ML = import.meta.env.VITE_ML_URL || 'http://localhost:8000'
const API_KEY = import.meta.env.VITE_API_KEY || ''
const SCAN_TIMEOUT_MS = 12000
const RESOLVE_TTL_MS = 15000

let resolved = null
let resolvedAt = 0

async function timedFetch(url, opts = {}, ms = SCAN_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const headers = { ...(opts.headers || {}) }
  if (API_KEY) headers['X-SecureNet-Key'] = API_KEY
  try {
    return await fetch(url, { ...opts, headers, signal: controller.signal })
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The analysis service did not answer in time.')
    throw new Error('The analysis service is unreachable.')
  } finally {
    clearTimeout(timer)
  }
}

async function ping(url) {
  const t0 = performance.now()
  try {
    const res = await timedFetch(url, {}, 1500)
    if (!res.ok) return null
    const body = await res.json().catch(() => ({}))
    return { body, ms: performance.now() - t0 }
  } catch {
    return null
  }
}

export async function resolveBackend(force = false) {
  if (resolved && !force && Date.now() - resolvedAt < RESOLVE_TTL_MS) return resolved
  const gw = GATEWAY ? await ping(GATEWAY + '/api/v1/health') : null
  if (gw) {
    resolved = { base: GATEWAY, tier: 'gateway', ml: gw.body.mlService ?? null, latencyMs: gw.ms }
  } else {
    const ml = await ping(ML + '/health')
    resolved = ml
      ? { base: ML, tier: 'ml', ml: ml.body, latencyMs: ml.ms }
      : { base: ML, tier: 'offline', ml: null, latencyMs: null }
  }
  resolvedAt = Date.now()
  return resolved
}

/** Normalises the two response shapes into one object. */
export function normalise(raw, input, kind) {
  const x = { ...raw, ...(raw.analysis || {}) }
  const embedded = (x.embedded_urls || []).map((u) => normalise(u, u.url, 'url'))
  return {
    scanId: x.scanId ?? null,
    artefact: x.artefact ?? x.url ?? x.message ?? input,
    kind,
    canonical: x.canonical_url ?? x.canonicalUrl ?? null,
    verdict: x.verdict,
    riskBand: x.risk_band ?? x.riskBand,
    score: x.score,
    threshold: x.threshold,
    suspiciousBand: x.suspicious_band ?? 0.35,
    baseValue: x.base_value ?? x.baseValue ?? 0,
    logit: x.logit ?? null,
    otherContribution: x.other_contribution ?? null,
    confidence: x.confidence ?? null,
    evidence: x.evidence ?? [],
    features: x.features ?? null,
    contributions: x.contributions ?? null,
    anatomy: x.anatomy ?? null,
    indicators: x.indicators ?? [],
    indiaSignals: x.india_signals ?? x.indiaSignals ?? [],
    containsUrl: x.contains_url ?? x.containsUrl ?? false,
    embeddedUrlVerdict: x.embedded_url_verdict ?? x.embeddedUrlVerdict ?? null,
    embeddedUrls: embedded,
    textVerdict: x.text_verdict ?? null,
    textScore: x.text_score ?? null,
    escalatedByUrl: x.escalated_by_url ?? false,
    scamPatterns: x.scam_patterns ?? [],
    latencyMs: x.latency_ms ?? x.latencyMs ?? null,
    gatewayLatencyMs: x.gateway_latency_ms ?? x.gatewayLatencyMs ?? null,
    modelVersion: x.model_version ?? x.modelVersion ?? null,
    cached: x.cached ?? false,
    scannedAt: x.scannedAt ?? new Date().toISOString()
  }
}

function isValidScan(r) {
  return r && typeof r.verdict === 'string' && typeof r.score === 'number' && r.score >= 0 && r.score <= 1
}

async function post(path, body) {
  const backend = await resolveBackend()
  if (backend.tier === 'offline') {
    throw new Error('No analysis service is reachable. Start the ML service on port 8000.')
  }
  const res = await timedFetch(backend.base + '/api/v1' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (res.status === 429) {
    const wait = res.headers.get('Retry-After')
    throw new Error(`Too many scans in a short time. Try again in ${wait || 'a few'} seconds.`)
  }
  if (!res.ok) {
    resolved = null // rediscover on the next call
    let detail = ''
    try {
      const j = await res.json()
      detail = typeof j.detail === 'string' ? j.detail : ''
    } catch {
      /* not JSON */
    }
    throw new Error(`Analysis failed (${res.status}). ${detail}`.trim())
  }
  return { data: await res.json(), tier: backend.tier }
}

export async function scanUrl(url) {
  const backend = await resolveBackend()
  const body = backend.tier === 'gateway' ? { artefact: url } : { url }
  const { data, tier } = await post('/scan/url', body)
  if (!isValidScan(data)) throw new Error('The service returned an invalid result.')
  return { ...normalise(data, url, 'url'), tier }
}

export async function scanSms(message) {
  const backend = await resolveBackend()
  const body = backend.tier === 'gateway' ? { artefact: message } : { message }
  const { data, tier } = await post('/scan/sms', body)
  if (!isValidScan(data)) throw new Error('The service returned an invalid result.')
  return { ...normalise(data, message, 'sms'), tier }
}

export async function fetchMetrics() {
  const backend = await resolveBackend()
  if (backend.tier === 'offline') throw new Error('No analysis service is reachable.')
  const path = backend.tier === 'gateway' ? '/api/v1/model/metrics' : '/metrics'
  const res = await timedFetch(backend.base + path, {}, 6000)
  if (!res.ok) throw new Error('Model metrics are unavailable.')
  return res.json()
}

/**
 * Records a correction. With the gateway and a persisted scan id it goes to
 * the gateway's feedback table; otherwise to the ML service's feedback log.
 */
export async function sendFeedback(result, correctLabel, note, source = 'dashboard') {
  const backend = await resolveBackend()
  if (backend.tier === 'offline') throw new Error('No analysis service is reachable.')
  const predicted = isThreat(result.verdict) ? 1 : 0
  let res
  if (backend.tier === 'gateway' && result.scanId != null) {
    res = await timedFetch(backend.base + '/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanId: result.scanId, correctLabel, note })
    })
  } else {
    res = await timedFetch(ML + '/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artefact: result.artefact.slice(0, 4000),
        artefact_type: result.kind,
        predicted_label: predicted,
        correct_label: correctLabel,
        predicted_verdict: result.verdict,
        score: result.score,
        model_version: result.modelVersion,
        source,
        note: note?.slice(0, 500)
      })
    })
  }
  if (!res.ok) throw new Error(`The correction was not saved (${res.status}).`)
  return res.json()
}

export async function fetchFeedbackSummary() {
  const res = await timedFetch(ML + '/api/v1/feedback/summary', {}, 4000)
  if (!res.ok) throw new Error('Feedback summary unavailable')
  return res.json()
}

export function isThreat(verdict) {
  return verdict === 'PHISHING' || verdict === 'SCAM' || verdict === 'SUSPICIOUS'
}
