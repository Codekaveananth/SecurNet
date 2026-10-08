import { useCallback, useState } from 'react'
import { scanSms, scanUrl } from './api.js'
import { addScan } from './store.js'
import { notify } from './notify.js'
import { href } from './router.js'
import { verdictLabel } from './present.js'

/** Runs a scan, records it in history and raises a notification on threats. */
export function useScan(kind) {
  const [state, setState] = useState({ status: 'idle', result: null, error: null, input: '' })

  const run = useCallback(async (input, meta = {}) => {
    setState({ status: 'loading', result: null, error: null, input })
    try {
      const r = kind === 'url' ? await scanUrl(input) : await scanSms(input)
      const entry = addScan(r, meta)
      setState({ status: 'done', result: entry, error: null, input })
      if (r.verdict !== 'LEGITIMATE') {
        notify(`${verdictLabel(r.verdict)} ${kind === 'url' ? 'link' : 'message'} detected (risk ${Math.round(r.score * 100)})`,
          r.verdict === 'SUSPICIOUS' ? 'watch' : 'threat', { link: href('/scan/' + entry.id) })
      }
      return entry
    } catch (e) {
      setState({ status: 'error', result: null, error: e.message, input })
      return null
    }
  }, [kind])

  return [state, run]
}
