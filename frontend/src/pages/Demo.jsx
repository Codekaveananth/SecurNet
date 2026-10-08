import React, { useState } from 'react'
import { DemoTag, ErrorNote, Panel, VerdictBadge } from '../components/ui.jsx'
import { DEMO } from '../lib/demo.js'
import { scanSms, scanUrl } from '../lib/api.js'
import { addScan } from '../lib/store.js'
import { href } from '../lib/router.js'
import { notify } from '../lib/notify.js'

export default function Demo() {
  const [results, setResults] = useState({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const total = DEMO.reduce((a, g) => a + g.items.length, 0)
  const done = Object.keys(results).length

  const runAll = async () => {
    setRunning(true)
    setError(null)
    setResults({})
    for (const g of DEMO) {
      for (const text of g.items) {
        try {
          const r = g.kind === 'url' ? await scanUrl(text) : await scanSms(text)
          const entry = addScan(r, { demo: true })
          setResults((p) => ({ ...p, [text]: entry }))
        } catch (e) {
          setError(e.message)
          setRunning(false)
          return
        }
      }
    }
    setRunning(false)
    notify(`Demo complete: ${total} test inputs analysed by the live models.`, 'info')
  }

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Demo mode</h1>
          <p className="lead">
            Clearly marked test inputs for a walkthrough. The inputs are made up; the verdicts are not. Each one is sent to
            the live models, and the real result is shown, including any the model gets wrong.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={runAll} disabled={running}>
          {running ? <><span className="spinner" aria-hidden="true" />Analysing {done} of {total}</> : `Analyse all ${total} examples`}
        </button>
      </header>

      {error && <ErrorNote onRetry={runAll}><strong>Demo stopped.</strong> {error}</ErrorNote>}

      <div className="grid-2">
        {DEMO.map((g) => (
          <Panel key={g.id} title={g.title} description={`Written to be ${g.intended}. Compare with what the model says.`}>
            <ul className="demo-list">
              {g.items.map((text) => {
                const r = results[text]
                const link = g.kind === 'url' ? href('/url', { u: text, auto: 1, demo: 1 }) : href('/message', { m: text, auto: 1, demo: 1 })
                return (
                  <li key={text} className="demo-item">
                    <div className="demo-text">
                      <DemoTag />
                      <p className={g.kind === 'url' ? 'mono' : ''}>{text}</p>
                    </div>
                    <div className="demo-side">
                      {r ? (
                        <a href={href('/scan/' + r.id)} className="demo-result" aria-label={`Open investigation, risk ${Math.round(r.score * 100)}`}>
                          <VerdictBadge verdict={r.verdict} size="sm" />
                          <span className="mono">{Math.round(r.score * 100)}</span>
                        </a>
                      ) : (
                        <a className="btn btn-quiet btn-sm" href={link}>Analyse</a>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  )
}
