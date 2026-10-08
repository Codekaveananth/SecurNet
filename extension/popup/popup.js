import { VERDICT_TEXT, dashboardLink, escapeHtml, getSettings, recommendation } from '../lib/shared.js'
import { evidenceHtml, indicatorsHtml } from '../lib/render.js'

const qs = new URLSearchParams(location.search)
const isPanel = qs.has('panel')
const fixedTab = qs.get('tab') // explicit tab id (used by tests); otherwise the active tab
if (isPanel) document.body.classList.add('panel')
const view = document.getElementById('view')
const send = (msg) => chrome.runtime.sendMessage(msg)

const SKIP_TEXT = {
  'not-web': 'This is not a web page, so there is nothing to check.',
  private: 'This is a local or private-network address. SecureNet never sends those anywhere.',
  trusted: 'You marked this site as trusted, so it is not checked. Remove it in Settings to check it again.',
  off: 'Real-time protection is off. Turn it on, or check this page once with the button below.'
}

let current = null
let polls = 0
let windowId = null
chrome.windows.getCurrent().then((w) => { windowId = w.id })

async function load() {
  const data = await send({ type: 'GET_TAB_STATE', tabId: fixedTab ?? undefined })
  const settings = await getSettings()
  document.getElementById('protection').checked = settings.protection
  current = { ...data, settings }
  render()
}

function render() {
  const { tab, state, settings } = current
  if (!tab?.url) { view.innerHTML = `<p class="muted">No active page.</p>`; return }
  let host = tab.url
  try { host = new URL(tab.url).hostname || tab.url } catch { /* keep */ }
  const head = `<div class="site"><span class="host">${escapeHtml(host)}</span><span class="url mono">${escapeHtml(tab.url)}</span></div>`

  if (!state) {
    view.innerHTML = head + `<div class="notice"><p>This page has not been checked yet. It was probably opened before SecureNet started.</p>
      <div class="row"><button class="btn btn-primary" id="rescan">Check this page</button></div></div>`
    bindRescan()
    return
  }
  if (state.status === 'scanning') {
    view.innerHTML = head + `<p class="status"><span class="spin" aria-hidden="true"></span>Checking this site…</p>`
    if (polls++ < 20) setTimeout(load, 500)
    return
  }
  if (state.status === 'skipped') {
    view.innerHTML = head + `<div class="notice"><p>${escapeHtml(SKIP_TEXT[state.reason] || 'This page was not checked.')}</p>
      ${state.reason === 'off' ? '<div class="row"><button class="btn" id="rescan">Check this page</button></div>' : ''}</div>`
    bindRescan()
    return
  }
  if (state.status === 'unavailable') {
    view.innerHTML = head + `<div class="notice bad" role="alert">
      <span class="badge v-UNAVAILABLE">Analysis unavailable</span>
      <p>${escapeHtml(state.reason || 'The SecureNet service could not be reached.')}</p>
      <p class="muted">This is not a safe verdict. The site has not been checked.</p>
      <div class="row"><button class="btn btn-primary" id="rescan">Try again</button></div></div>`
    bindRescan()
    return
  }

  const r = state.result
  const score = Math.round(r.score * 100)
  // The model's verdict is shown as-is. If a high-severity finding disagrees
  // with a safe verdict, say so, and do not offer to trust the site.
  const high = (r.indicators || []).filter((i) => i.severity === 'high')
  const caution = r.verdict === 'LEGITIMATE' && high.length
    ? `${high[0].label}. The model still scored it as safe; check the address carefully.` : ''
  view.innerHTML = head + `
    <div class="verdict ${r.verdict}">
      <div><span class="badge v-${r.verdict}">${VERDICT_TEXT[r.verdict]}</span>
        <p class="meta" style="margin-top:6px">${r.confidence != null ? `Confidence ${Math.round(r.confidence * 100)}%. ` : ''}${state.cached ? 'Cached result.' : ''}</p></div>
      <div class="risk"><b>${score}</b><small>risk score</small></div>
    </div>
    <div class="meter" role="img" aria-label="Risk ${score} on a scale where 35 starts suspicious and ${Math.round((r.threshold ?? 0.6) * 100)} is the phishing threshold"><i style="left:${score}%"></i></div>
    <p class="rec">${escapeHtml(recommendation(r.verdict))}${caution ? `<br><strong>But note:</strong> ${escapeHtml(caution)}` : ''}</p>
    <section><h2>Strongest evidence</h2>${evidenceHtml(r.evidence, 5)}</section>
    ${r.indicators?.length ? `<section><h2>Patterns found</h2>${indicatorsHtml(r.indicators, 3)}</section>` : ''}
    <div class="row">
      <button class="btn" id="rescan">Scan again</button>
      <a class="btn btn-primary" id="full" target="_blank" rel="noopener">Full analysis</a>
    </div>
    <div class="row">
      <button class="btn btn-quiet" id="report">${r.verdict === 'LEGITIMATE' ? 'Report as dangerous' : 'Report as safe'}</button>
      ${r.verdict === 'LEGITIMATE' && !high.length ? '<button class="btn btn-quiet" id="trust">Trust this site</button>' : ''}
    </div>
    <p class="status" id="status" role="status"></p>
    <p class="meta">Model ${escapeHtml(r.modelVersion || '')}${r.latencyMs != null ? `, ${Number(r.latencyMs).toFixed(1)} ms` : ''}. Only the address was sent.</p>`

  document.getElementById('full').href = dashboardLink(settings, '/url', { u: tab.url, auto: 1, src: 'extension' })
  bindRescan()
  document.getElementById('report').onclick = async (e) => {
    e.target.disabled = true
    const status = document.getElementById('status')
    status.textContent = 'Sending…'
    const res = await send({ type: 'REPORT', url: tab.url, result: r, correctLabel: r.verdict === 'LEGITIMATE' ? 1 : 0 })
    status.textContent = res?.ok ? 'Report saved for the next training run.' : `Not sent: ${res?.error || 'unknown error'}`
    if (!res?.ok) e.target.disabled = false
  }
  const trust = document.getElementById('trust')
  if (trust) trust.onclick = async () => { await send({ type: 'TRUST_HOST', host }); document.getElementById('status').textContent = `${host} is now trusted. Manage trusted sites in Settings.` }
}

function bindRescan() {
  const b = document.getElementById('rescan')
  if (!b) return
  b.onclick = async () => {
    b.disabled = true
    b.innerHTML = '<span class="spin" aria-hidden="true"></span>Checking'
    await send({ type: 'RESCAN', tabId: fixedTab ?? undefined })
    load()
  }
}

document.getElementById('protection').onchange = async (e) => {
  await chrome.storage.local.set({ protection: e.target.checked })
}
document.getElementById('dashboard').onclick = async (e) => {
  e.preventDefault()
  const s = await getSettings()
  chrome.tabs.create({ url: dashboardLink(s, '/') })
}
document.getElementById('settings').onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage() }
const panelLink = document.getElementById('panel')
if (!isPanel && chrome.sidePanel) {
  panelLink.hidden = false
  panelLink.onclick = (e) => {
    e.preventDefault()
    // Must run synchronously inside the click: sidePanel.open needs a user gesture.
    chrome.sidePanel.open({ windowId }).then(() => window.close()).catch(() => {})
  }
}
// The side panel stays open across navigations: follow the active tab.
if (isPanel) {
  chrome.tabs.onActivated.addListener(load)
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'session' && Object.keys(c).some((k) => k.startsWith('tab:'))) load() })
}
load()
