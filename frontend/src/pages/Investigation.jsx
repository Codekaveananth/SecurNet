import React from 'react'
import VerdictPanel from '../components/VerdictPanel.jsx'
import { Empty } from '../components/ui.jsx'
import { getScan, removeScan, useHistory } from '../lib/store.js'
import { href, navigate } from '../lib/router.js'

export default function Investigation({ id }) {
  useHistory() // re-render when the entry changes (e.g. feedback sent)
  const r = getScan(id)
  if (!r) {
    return (
      <div className="page">
        <Empty title="This scan is not in your history" action={<a className="btn" href={href('/history')}>Back to history</a>}>
          It may have been deleted, or it was run in a different browser.
        </Empty>
      </div>
    )
  }
  const rescan = r.kind === 'url' ? href('/url', { u: r.artefact, auto: 1 }) : href('/message', { m: r.artefact, auto: 1 })
  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <a className="link back" href={href('/history')}>Scan history</a>
          <h1>Investigation</h1>
          <p className="lead">
            {r.kind === 'url' ? 'Link' : 'Message'} scanned {new Date(r.scannedAt).toLocaleString()}
            {r.source === 'extension' ? ', opened from the browser extension' : ''}. This is the stored result exactly as the model returned it.
          </p>
        </div>
        <span className="row-gap">
          <a className="btn" href={rescan}>Scan again</a>
          <button type="button" className="btn btn-quiet" onClick={() => { removeScan(r.id); navigate('/history') }}>Delete</button>
        </span>
      </header>
      <VerdictPanel result={r} />
    </div>
  )
}
