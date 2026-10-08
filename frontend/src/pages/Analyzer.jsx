import React, { useEffect, useRef } from 'react'
import Scanner from '../components/Scanner.jsx'
import VerdictPanel from '../components/VerdictPanel.jsx'
import { Empty, ErrorNote, Skeleton } from '../components/ui.jsx'
import { useScan } from '../lib/useScan.js'
import { href } from '../lib/router.js'

const COPY = {
  url: {
    title: 'URL analyzer',
    lead: 'Check a link before you open it. You get a verdict, the risk score, and the exact features that drove it.',
    empty: 'Paste a link above to analyse it.',
    emptyBody: 'Try a demo example if you do not have a suspicious link at hand.'
  },
  sms: {
    title: 'Message analyzer',
    lead: 'Check an SMS or WhatsApp message for UPI, KYC, banking, OTP, job and payment scams. Any link inside is checked too.',
    empty: 'Paste a message above to analyse it.',
    emptyBody: 'Demo mode has clearly marked UPI, KYC and fake-job examples.'
  }
}

export default function Analyzer({ kind, params }) {
  const [state, run] = useScan(kind)
  const c = COPY[kind]
  const ranFor = useRef(null)
  const initial = kind === 'url' ? params.u || '' : params.m || ''

  // Deep links from the extension and demo mode: #/url?u=...&auto=1
  useEffect(() => {
    if (params.auto && initial && ranFor.current !== initial) {
      ranFor.current = initial
      run(initial, { demo: params.demo === '1', source: params.src || 'dashboard' })
    }
  }, [initial, params.auto, params.demo, params.src, run])

  return (
    <div className="page">
      <header className="page-head">
        <h1>{c.title}</h1>
        <p className="lead">{c.lead}</p>
      </header>

      <Scanner mode={kind} busy={state.status === 'loading'} initial={initial}
        onScan={(v) => run(v, { demo: false })} />

      {state.status === 'loading' && (
        <div className="panel" aria-live="polite">
          <p className="muted">Running the model and computing the explanation…</p>
          <Skeleton lines={5} />
        </div>
      )}
      {state.status === 'error' && (
        <ErrorNote onRetry={() => run(state.input)}>
          <strong>Analysis unavailable.</strong> {state.error} No verdict was produced, so do not treat this as safe.
        </ErrorNote>
      )}
      {state.status === 'done' && state.result && <VerdictPanel result={state.result} />}
      {state.status === 'idle' && (
        <Empty title={c.empty} action={<a className="btn" href={href('/demo')}>Open demo examples</a>}>
          {c.emptyBody}
        </Empty>
      )}
    </div>
  )
}
