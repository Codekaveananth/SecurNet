import React, { useState } from 'react'
import EvidenceAxis from './EvidenceAxis.jsx'
import RiskGauge from './RiskGauge.jsx'
import { DemoTag, Panel, Tip, VerdictBadge } from './ui.jsx'
import { TONE, explain, headline, ms, recommendations, verdictLabel } from '../lib/present.js'
import { sendFeedback, isThreat } from '../lib/api.js'
import { updateScan } from '../lib/store.js'
import { notify } from '../lib/notify.js'
import { href } from '../lib/router.js'

export default function VerdictPanel({ result: r }) {
  const tone = TONE[r.verdict] || 'watch'
  return (
    <div className="result" aria-live="polite">
      <section className={`verdict verdict-${tone}`}>
        <div className="verdict-main">
          <div className="verdict-top">
            <VerdictBadge verdict={r.verdict} size="lg" />
            {r.demo && <DemoTag />}
            {r.cached && <span className="pill">Served from gateway cache</span>}
          </div>
          <h2 className="verdict-title">{headline(r)}</h2>
          <p className={`artefact ${r.kind === 'url' ? 'mono' : ''}`}>{r.artefact}</p>
          {r.canonical && r.canonical !== r.artefact && (
            <p className="canonical">
              <Tip text="Scheme, www, port, fragment and trailing slash are removed before features are computed, so the model reads the address itself rather than how a blocklist formatted it.">
                Analysed as
              </Tip>{' '}
              <code>{r.canonical}</code>
            </p>
          )}
        </div>
        <RiskGauge score={r.score} threshold={r.threshold ?? 0.5} band={r.suspiciousBand ?? 0.35} tone={tone} />
      </section>

      <dl className="readout">
        <Item label="Risk score" value={`${Math.round(r.score * 100)} / 100`}
          tip="The model's probability of the malicious class, times 100." />
        <Item label="Confidence" value={r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}
          tip={`Probability the model gives to the reported class (${verdictLabel(r.verdict).toLowerCase()}). Not calibrated, so treat it as relative rather than exact.`} />
        <Item label="Threshold" value={r.threshold != null ? Math.round(r.threshold * 100) : '—'}
          tip="Scores at or above this are reported as phishing or scam. The URL threshold was tuned on the validation split during training." />
        <Item label="Detection time" value={ms(r.latencyMs)}
          tip="Model inference plus explanation, measured inside the ML service." />
        {r.gatewayLatencyMs != null && <Item label="End to end" value={ms(r.gatewayLatencyMs)} tip="Measured by the gateway." />}
        <Item label="Model" value={<code>{r.modelVersion || '—'}</code>} />
      </dl>

      <div className="result-grid">
        <Panel title="What to do" className="panel-actions">
          <ul className="actions">
            {recommendations(r).map((a) => <li key={a}>{a}</li>)}
          </ul>
        </Panel>
        <Panel title="Why the model decided this">
          <p className="explain">{explain(r)}</p>
        </Panel>
      </div>

      <Panel title="Evidence" description="SHAP attributions from the model, in the order of their strength.">
        <EvidenceAxis result={r} />
      </Panel>

      {r.kind === 'url' ? <UrlDetails r={r} /> : <MessageDetails r={r} />}

      <Feedback r={r} />
    </div>
  )
}

function Item({ label, value, tip }) {
  return (
    <div>
      <dt>{tip ? <Tip text={tip}>{label}</Tip> : label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/* ---------------------------------------------------------------- URL --- */

function UrlDetails({ r }) {
  return (
    <>
      <div className="result-grid">
        <Panel title="Suspicious patterns" description="Model inputs restated as findings, plus one labelled heuristic.">
          <Indicators items={r.indicators} />
        </Panel>
        {r.anatomy && (
          <Panel title="URL anatomy">
            <Anatomy a={r.anatomy} />
          </Panel>
        )}
      </div>
      {r.features && <FeatureProfile r={r} />}
    </>
  )
}

export function Indicators({ items, compact }) {
  if (!items?.length) return <p className="muted">None of the tracked patterns are present.</p>
  return (
    <ul className={`indicators ${compact ? 'indicators-compact' : ''}`}>
      {items.map((i) => (
        <li key={i.id} className={`ind ind-${i.severity}`}>
          <span className="ind-sev">{i.severity}</span>
          <div>
            <p className="ind-label">{i.label}</p>
            {!compact && <p className="ind-detail">{i.detail}</p>}
            {!compact && (
              <p className="ind-src">
                {i.source === 'heuristic'
                  ? 'Heuristic check, shown for context only. Not used in the score.'
                  : i.shap != null
                    ? `Model feature ${i.feature}, contribution ${i.shap > 0 ? '+' : ''}${i.shap.toFixed(3)}${Math.abs(i.shap) < 0.01 ? ' (the model relies on correlated features instead)' : ''}`
                    : `Model feature ${i.feature}`}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Anatomy({ a }) {
  const rows = [
    ['Scheme', a.scheme || 'none given'],
    a.userinfo ? ['User info', a.userinfo] : null,
    ['Host', a.host + (a.is_ip ? ' (IP address)' : '')],
    !a.is_ip ? ['Registered domain', a.domain] : null,
    !a.is_ip ? ['Subdomains', a.subdomains.length ? a.subdomains.join(' . ') : 'none'] : null,
    !a.is_ip ? ['Top-level domain', a.tld ? '.' + a.tld : '—'] : null,
    ['Port', a.port ?? 'default'],
    ['Path', a.path || '/'],
    ['Query parameters', a.query_params.length ? a.query_params.join(', ') : 'none']
  ].filter(Boolean)
  return (
    <dl className="anatomy">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd className="mono">{String(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

function FeatureProfile({ r }) {
  const rows = Object.entries(r.features)
    .map(([k, v]) => ({ k, v, c: r.contributions?.[k] ?? 0 }))
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
  return (
    <details className="panel profile">
      <summary>
        <h2>All {rows.length} model features</h2>
        <span className="muted">The exact input vector and every feature's SHAP value</span>
      </summary>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th scope="col">Feature</th><th scope="col" className="num">Value</th><th scope="col" className="num">SHAP</th></tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.k}>
                <td className="mono">{x.k}</td>
                <td className="num mono">{Number.isInteger(x.v) ? x.v : x.v.toFixed(3)}</td>
                <td className={`num mono ${x.c > 0.0005 ? 't-threat' : x.c < -0.0005 ? 't-safe' : 'muted'}`}>
                  {x.c > 0 ? '+' : ''}{x.c.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

/* ------------------------------------------------------------ Message --- */

function MessageDetails({ r }) {
  const linkToken = r.evidence.find((e) => e.feature === 'urltoken')
  return (
    <div className="result-grid">
      <Panel title="Scam patterns" description="Topics found by keyword rules. They describe the message; the verdict comes from the model.">
        {r.scamPatterns?.length ? (
          <ul className="patterns">
            {r.scamPatterns.map((p) => (
              <li key={p.id}>
                <strong>{p.label}</strong>
                <span className="muted">{p.matched.join(', ')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No known scam topics matched.</p>
        )}
        {r.indiaSignals?.length > 0 && (
          <>
            <h3 className="sub">Indian financial terms</h3>
            <ul className="tags">{r.indiaSignals.map((s) => <li key={s}>{s}</li>)}</ul>
          </>
        )}
      </Panel>

      <Panel title="Links in this message">
        {!r.embeddedUrls?.length ? (
          <p className="muted">{r.containsUrl ? 'A link was detected but could not be analysed.' : 'This message contains no links.'}</p>
        ) : (
          <>
            <ul className="links">
              {r.embeddedUrls.map((u) => (
                <li key={u.artefact} className="link-card">
                  <div className="link-head">
                    <VerdictBadge verdict={u.verdict} size="sm" />
                    <span className="link-score">{Math.round(u.score * 100)}</span>
                  </div>
                  <p className="mono link-url">{u.artefact}</p>
                  <Indicators items={u.indicators.slice(0, 3)} compact />
                  <a className="link-more" href={href('/url', { u: u.artefact, auto: 1 })}>Open full URL analysis</a>
                </li>
              ))}
            </ul>
            <h3 className="sub">How the links affected this result</h3>
            <ul className="contrib">
              <li>
                Text model on its own: <VerdictBadge verdict={r.textVerdict || r.verdict} size="sm" /> at{' '}
                {Math.round((r.textScore ?? r.score) * 100)}/100. It sees each link only as a placeholder token.
              </li>
              <li>
                {linkToken
                  ? `Having a link at all contributed ${linkToken.contribution > 0 ? '+' : ''}${linkToken.contribution.toFixed(3)} log-odds to the text score.`
                  : 'The link placeholder was not among the strongest text features.'}
              </li>
              <li>
                {r.escalatedByUrl
                  ? 'A link was scored as phishing while the text looked legitimate, so the verdict was raised to suspicious. The score itself was not changed.'
                  : 'Rule: if any link scores as phishing while the text looks legitimate, the verdict is raised to suspicious. It did not apply here.'}
              </li>
            </ul>
          </>
        )}
      </Panel>
    </div>
  )
}

/* ----------------------------------------------------------- Feedback --- */

function Feedback({ r }) {
  const [state, setState] = useState(r.feedback ? 'done' : 'idle')
  const [note, setNote] = useState('')
  const flagged = isThreat(r.verdict)
  const send = async () => {
    setState('sending')
    try {
      await sendFeedback(r, flagged ? 0 : 1, note || undefined)
      setState('done')
      if (r.id) updateScan(r.id, { feedback: flagged ? 'false_positive' : 'false_negative' })
      notify('Correction saved. It will be used in the next retraining batch.', 'safe')
    } catch (e) {
      setState('idle')
      notify(e.message, 'threat')
    }
  }
  if (state === 'done') {
    return <p className="feedback feedback-done">Thanks — your correction for this scan was saved.</p>
  }
  return (
    <div className="feedback">
      <p>
        <strong>Is this verdict wrong?</strong>{' '}
        <span className="muted">Corrections are stored for the next training run; they do not change this result.</span>
      </p>
      <div className="feedback-row">
        <label className="sr-only" htmlFor="fb-note">Optional note</label>
        <input id="fb-note" className="field field-sm" maxLength={500} placeholder="Optional note"
          value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn" onClick={send} disabled={state === 'sending'}>
          {state === 'sending' ? 'Saving…' : flagged ? 'Report as safe' : 'Report as malicious'}
        </button>
      </div>
    </div>
  )
}
