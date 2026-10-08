import { dashboardLink, escapeHtml, getSettings, recommendation } from '../lib/shared.js'
import { evidenceHtml, indicatorsHtml } from '../lib/render.js'

const tab = new URLSearchParams(location.search).get('tab')
const main = document.getElementById('main')

const data = await chrome.runtime.sendMessage({ type: 'GET_WARNING', tab })
const settings = await getSettings()

if (!data) {
  main.innerHTML = `<h1>Nothing to show</h1><p class="lede">This warning has expired. Use your browser's back button.</p>`
} else {
  render(data)
}
main.removeAttribute('aria-busy')

function render({ url, result: r }) {
  const phishing = r.verdict === 'PHISHING'
  let host = url
  try { host = new URL(url).hostname } catch { /* keep */ }
  document.body.className = r.verdict
  document.title = `SecureNet: ${phishing ? 'phishing site blocked' : 'suspicious site'}`
  main.innerHTML = `
    <div class="head">
      <svg class="shield" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 2 4 7v8c0 7.5 5 13.5 12 15 7-1.5 12-7.5 12-15V7L16 2z" fill="${phishing ? '#3a1519' : '#3a2a10'}" stroke="${phishing ? '#e5484d' : '#e8a93b'}" stroke-width="1.6"/>
        <path d="M16 10v8M16 21.5v.5" stroke="${phishing ? '#e5484d' : '#e8a93b'}" stroke-width="2.4" stroke-linecap="round"/>
      </svg>
      <div>
        <h1 tabindex="-1" id="title">${phishing ? 'This site is very likely a phishing page' : 'This site looks suspicious'}</h1>
        <p class="lede">SecureNet stopped this page. ${phishing
          ? 'It may try to steal your login, card or UPI details.'
          : 'Some of its signals match known scam sites.'}</p>
      </div>
    </div>

    <section class="site ${r.verdict}" aria-label="Site details">
      <div class="row">
        <span class="badge v-${r.verdict}">${phishing ? 'Phishing' : 'Suspicious'}</span>
        <span class="score">${Math.round(r.score * 100)}<small> / 100 risk</small></span>
      </div>
      <p class="mono">${escapeHtml(url)}</p>
      <p class="muted">Model ${escapeHtml(r.modelVersion || 'unknown')}${r.threshold != null ? `, threshold ${Math.round(r.threshold * 100)}` : ''}${r.latencyMs != null ? `, checked in ${Number(r.latencyMs).toFixed(1)} ms` : ''}.</p>
    </section>

    <div class="grid">
      <section class="card advice" aria-labelledby="adv">
        <h2 id="adv">What to do</h2>
        <ul>
          <li>${escapeHtml(recommendation(r.verdict))}</li>
          <li>If a message sent you here, do not reply to it or call any number in it.</li>
          <li>Lost money? Report at cybercrime.gov.in or call 1930.</li>
        </ul>
      </section>
      <section class="card" aria-labelledby="why">
        <h2 id="why">Why SecureNet flagged it</h2>
        ${evidenceHtml(r.evidence.filter((e) => e.contribution > 0), 5)}
        ${indicatorsHtml(r.indicators, 3)}
      </section>
    </div>

    <div class="actions">
      <button class="btn btn-primary" id="back">Go back to safety</button>
      <a class="btn" id="full" target="_blank" rel="noopener">View full analysis</a>
      <span class="spacer"></span>
      <button class="btn btn-quiet" id="report">This site is safe</button>
      <button class="btn btn-danger-quiet" id="proceed">Continue anyway</button>
    </div>
    <p class="status" id="status" role="status" aria-live="polite"></p>

    <div class="confirm" id="confirm" role="alertdialog" aria-labelledby="cft">
      <p id="cft"><strong>Open ${escapeHtml(host)} anyway?</strong> Only continue if you are certain this is the real site. SecureNet will not warn you again about this address in this browser session.</p>
      <div class="actions">
        <button class="btn" id="cancel">Cancel</button>
        <button class="btn btn-danger-quiet" id="go">Yes, open the site</button>
      </div>
    </div>

    <p class="foot">SecureNet read only the address of this page. It did not open the page or read anything on it. A verdict is a model's judgement, not a guarantee.</p>
  `
  document.getElementById('title').focus()
  const full = document.getElementById('full')
  full.href = dashboardLink(settings, '/url', { u: url, auto: 1, src: 'extension' })

  document.getElementById('back').onclick = () => {
    // The blocked page replaced the tab entry; go back to where the user came from.
    if (history.length > 1) history.go(-1)
    else location.replace('about:blank')
  }
  const status = document.getElementById('status')
  document.getElementById('report').onclick = async (e) => {
    e.target.disabled = true
    status.textContent = 'Sending your report…'
    const res = await chrome.runtime.sendMessage({ type: 'REPORT', url, result: r, correctLabel: 0 })
    status.textContent = res?.ok
      ? 'Thanks. Your report was saved for the next training run. The warning stays, because the model has not changed.'
      : `The report was not sent: ${res?.error || 'unknown error'}`
    if (!res?.ok) e.target.disabled = false
  }
  const confirm = document.getElementById('confirm')
  document.getElementById('proceed').onclick = () => { confirm.classList.add('on'); document.getElementById('cancel').focus() }
  document.getElementById('cancel').onclick = () => { confirm.classList.remove('on'); document.getElementById('proceed').focus() }
  document.getElementById('go').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'PROCEED', url })
    location.replace(url)
  }
}
