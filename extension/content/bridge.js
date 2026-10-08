/**
 * Dashboard bridge. Injected only on the SecureNet dashboard origin.
 *
 * Answers one question from the dashboard page, "what is the extension's
 * state?", by relaying it to the service worker, which re-checks that the
 * request really comes from the configured dashboard origin. Nothing on any
 * other site can reach this.
 */
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin) return
  const d = e.data
  if (!d || d.source !== 'securenet-dashboard' || d.type !== 'GET_STATE' || typeof d.nonce !== 'string') return
  chrome.runtime.sendMessage({ type: 'DASHBOARD_STATE' }).then((payload) => {
    if (payload) window.postMessage({ source: 'securenet-extension', type: 'STATE', nonce: d.nonce, payload }, location.origin)
  }).catch(() => {})
})
