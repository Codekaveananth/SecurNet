import { SENSITIVITY, escapeHtml, getSettings, validServerUrl } from '../lib/shared.js'

const $ = (id) => document.getElementById(id)
const s = await getSettings()

for (const k of ['protection', 'notifications', 'redactQuery', 'localHistory']) {
  $(k).checked = !!s[k]
  $(k).onchange = (e) => chrome.storage.local.set({ [k]: e.target.checked })
}

$('sensitivity').innerHTML = Object.entries(SENSITIVITY).map(([k, v]) => `
  <label class="opt"><input type="radio" name="sens" value="${k}" ${s.sensitivity === k ? 'checked' : ''} />
  <span><strong>${v.label}</strong><small>${v.help}</small></span></label>`).join('')
document.querySelectorAll('input[name="sens"]').forEach((r) => {
  r.onchange = () => chrome.storage.local.set({ sensitivity: r.value })
})

$('clearHistory').onclick = async () => {
  await chrome.storage.local.set({ history: [] })
  $('histStatus').textContent = 'Local history cleared.'
}
$('clearCache').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' })
  $('histStatus').textContent = 'Cached verdicts cleared.'
}

/* trusted sites */
async function drawTrusted() {
  const { trusted = [] } = await chrome.storage.local.get('trusted')
  $('trusted').innerHTML = trusted.length
    ? trusted.map((h) => `<li>${escapeHtml(h)}<button type="button" data-h="${escapeHtml(h)}" aria-label="Remove ${escapeHtml(h)}">×</button></li>`).join('')
    : '<li class="muted" style="border:0;background:none;padding:0">No trusted sites.</li>'
  $('trusted').querySelectorAll('button').forEach((b) => {
    b.onclick = async () => {
      const { trusted: t = [] } = await chrome.storage.local.get('trusted')
      await chrome.storage.local.set({ trusted: t.filter((x) => x !== b.dataset.h) })
      drawTrusted()
    }
  })
}
$('trustForm').onsubmit = async (e) => {
  e.preventDefault()
  let h = $('trustInput').value.trim().toLowerCase()
  try { if (h.includes('/')) h = new URL(h.includes('://') ? h : 'https://' + h).hostname } catch { return }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return
  const { trusted = [] } = await chrome.storage.local.get('trusted')
  if (!trusted.includes(h)) await chrome.storage.local.set({ trusted: [...trusted, h] })
  $('trustInput').value = ''
  drawTrusted()
}
drawTrusted()

/* connection */
for (const k of ['serverUrl', 'gatewayUrl', 'apiKey', 'dashboardUrl']) $(k).value = s[k] || ''
const status = (msg, cls = '') => { $('connStatus').textContent = msg; $('connStatus').className = 'status ' + cls }

async function ensurePermission(url) {
  if (!url) return true
  const origin = new URL(url).origin + '/*'
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true
  return chrome.permissions.request({ origins: [origin] })
}

$('saveConn').onclick = async () => {
  const serverUrl = $('serverUrl').value.trim()
  const gatewayUrl = $('gatewayUrl').value.trim()
  const dashboardUrl = $('dashboardUrl').value.trim()
  if (!validServerUrl(serverUrl)) return status('Server must be https, or http on localhost.', 'bad')
  if (gatewayUrl && !validServerUrl(gatewayUrl)) return status('Gateway must be https, or http on localhost.', 'bad')
  try { new URL(dashboardUrl) } catch { return status('Dashboard address is not a valid URL.', 'bad') }
  if (!(await ensurePermission(serverUrl)) || !(await ensurePermission(gatewayUrl))) return status('Permission to reach that server was not granted.', 'bad')
  await chrome.storage.local.set({ serverUrl, gatewayUrl, dashboardUrl, apiKey: $('apiKey').value })
  status('Saved.', 'ok')
}

$('test').onclick = async () => {
  status('Testing…')
  const base = $('serverUrl').value.trim().replace(/\/+$/, '')
  if (!validServerUrl(base)) return status('Server must be https, or http on localhost.', 'bad')
  try {
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 3000)
    const r = await fetch(base + '/health', { signal: ctrl.signal, credentials: 'omit' })
    const j = await r.json()
    status(j.status === 'ok' ? `Connected to ${j.service} ${j.version}. Both models loaded.` : `Reachable, but status is ${j.status}.`, j.status === 'ok' ? 'ok' : 'bad')
  } catch {
    status('Could not reach the server. Is the ML service running?', 'bad')
  }
}
