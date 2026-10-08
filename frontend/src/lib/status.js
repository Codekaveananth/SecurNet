import { useEffect, useRef, useState } from 'react'
import { fetchMetrics, resolveBackend } from './api.js'
import { notify } from './notify.js'

/** Polls the backend every `ms` and reports tier, model state and latency. */
export function useBackendStatus(ms = 15000) {
  const [s, setS] = useState({ loading: true, tier: null, ml: null, latencyMs: null, checkedAt: null })
  const prev = useRef(null)
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const b = await resolveBackend(true)
      if (!alive) return
      if (prev.current && prev.current !== b.tier) {
        if (b.tier === 'offline') notify('Lost connection to the analysis service. Scans are paused.', 'threat')
        else if (prev.current === 'offline') notify('Analysis service is back online.', 'safe')
      }
      prev.current = b.tier
      setS({ loading: false, tier: b.tier, ml: b.ml, latencyMs: b.latencyMs, checkedAt: new Date() })
    }
    tick()
    const id = setInterval(tick, ms)
    return () => { alive = false; clearInterval(id) }
  }, [ms])
  return s
}

let metricsCache = null
export function useMetrics(tier) {
  const [m, setM] = useState({ loading: true, data: metricsCache, error: null })
  useEffect(() => {
    if (!tier || tier === 'offline') {
      setM({ loading: false, data: metricsCache, error: tier === 'offline' ? 'offline' : null })
      return
    }
    fetchMetrics()
      .then((d) => { metricsCache = d; setM({ loading: false, data: d, error: null }) })
      .catch((e) => setM({ loading: false, data: metricsCache, error: e.message }))
  }, [tier])
  return m
}
