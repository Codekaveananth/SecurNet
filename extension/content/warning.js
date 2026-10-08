/**
 * SecureNet in-page banner (used for "suspicious" at standard sensitivity).
 *
 * This script never reads the page: no DOM queries on page content, no form
 * fields, no keystrokes, no cookies. It only renders a banner whose data comes
 * from the extension's own service worker, inside a closed shadow root so the
 * page cannot read or restyle it.
 */
;(() => {
  const HOST_ID = '__securenet_banner_host__'
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  function render({ url, result }) {
    const strip = (s) => String(s).split('#')[0]
    if (strip(url) !== strip(location.href)) return // stale message for an earlier page
    document.getElementById(HOST_ID)?.remove()
    const reasons = (result.evidence || []).filter((e) => e.contribution > 0).slice(0, 3).map((e) => e.description)
    const host = document.createElement('div')
    host.id = HOST_ID
    const root = host.attachShadow({ mode: 'closed' })
    root.innerHTML = `
      <style>
        .bar { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
          width: min(720px, calc(100vw - 24px)); font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif;
          background: #152131; color: #e3eaf2; border: 1px solid #e8a93b; border-left: 5px solid #e8a93b;
          border-radius: 10px; box-shadow: 0 16px 40px rgba(0,0,0,.45); padding: 14px 16px; display: grid; gap: 8px; }
        .top { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
        h2 { margin: 0; font-size: 15px; }
        .score { font: 700 18px ui-monospace, Consolas, monospace; color: #e8a93b; white-space: nowrap; }
        p, ul { margin: 0; color: #8ca0b8; font-size: 13px; }
        ul { padding-left: 18px; }
        .btns { display: flex; gap: 8px; flex-wrap: wrap; }
        button { font: 500 13px system-ui, sans-serif; padding: 6px 12px; border-radius: 7px; cursor: pointer;
          border: 1px solid #3d5270; background: #1c2b3e; color: #e3eaf2; }
        button.primary { background: #5aa9e6; border-color: #5aa9e6; color: #0b2236; font-weight: 600; }
        button:focus-visible { outline: 2px solid #5aa9e6; outline-offset: 2px; }
      </style>
      <div class="bar" role="alert">
        <div class="top"><h2>SecureNet: this site looks suspicious</h2><span class="score">${Math.round(result.score * 100)}/100</span></div>
        <p>Do not enter passwords, OTPs or UPI PINs unless you are sure this is the real site. If it should be your bank, use the bank's own app.</p>
        ${reasons.length ? `<ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
        <div class="btns">
          <button class="primary" data-act="back">Leave this site</button>
          <button data-act="dismiss">Dismiss</button>
        </div>
      </div>`
    root.querySelector('[data-act="back"]').addEventListener('click', () => {
      host.remove()
      if (history.length > 1) history.back()
    })
    root.querySelector('[data-act="dismiss"]').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'PROCEED', url }).catch(() => {})
      host.remove()
    })
    document.documentElement.appendChild(host)
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'SECURENET_BANNER' && msg.payload?.result) {
      try { render(msg.payload) } catch (e) { /* never break the page */ }
    }
  })
})()
