/**
 * Bridge to the SecureNet browser extension.
 *
 * The extension injects a small content script on the dashboard origin only.
 * The page asks for state with window.postMessage; the content script answers
 * with the extension's settings and (only if the user enabled local history in
 * the extension) its recent verdicts. Nothing is sent if the extension is not
 * installed: the request simply times out and the dashboard says so.
 */
import { useEffect, useState } from 'react'

export function requestExtensionState(timeoutMs = 900) {
  return new Promise((resolve) => {
    const nonce = Math.random().toString(36).slice(2)
    const done = (v) => {
      window.removeEventListener('message', on)
      clearTimeout(t)
      resolve(v)
    }
    const on = (e) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      const d = e.data
      if (d && d.source === 'securenet-extension' && d.type === 'STATE' && d.nonce === nonce) {
        done(d.payload)
      }
    }
    const t = setTimeout(() => done(null), timeoutMs)
    window.addEventListener('message', on)
    window.postMessage({ source: 'securenet-dashboard', type: 'GET_STATE', nonce }, window.location.origin)
  })
}

export function useExtension(pollMs = 20000) {
  const [state, setState] = useState({ checked: false, data: null })
  useEffect(() => {
    let alive = true
    const run = () =>
      requestExtensionState().then((data) => alive && setState({ checked: true, data }))
    run()
    const id = setInterval(run, pollMs)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [pollMs])
  return state
}
