import React, { useState } from 'react'
import { Activity, Donut, RiskHistogram } from '../components/charts.jsx'
import { DemoTag, Empty, Panel, Stat, VerdictBadge } from '../components/ui.jsx'
import { useHistory } from '../lib/store.js'
import { href, navigate } from '../lib/router.js'
import { ms, timeAgo, truncate } from '../lib/present.js'

export default function Overview({ status, metrics, extension }) {
  const items = useHistory()
  const [quick, setQuick] = useState('')
  const threats = items.filter((i) => i.verdict === 'PHISHING' || i.verdict === 'SCAM').length
  const suspicious = items.filter((i) => i.verdict === 'SUSPICIOUS').length
  const safe = items.filter((i) => i.verdict === 'LEGITIMATE').length
  const lat = items.map((i) => i.latencyMs).filter((v) => typeof v === 'number')
  const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null
  const url = metrics.data?.url?.test
  const sms = metrics.data?.sms?.test

  const quickScan = (e) => {
    e.preventDefault()
    const v = quick.trim()
    if (!v) return
    const isUrl = !/\s/.test(v) && /\./.test(v)
    navigate(isUrl ? '/url' : '/message', isUrl ? { u: v, auto: 1 } : { m: v, auto: 1 })
  }

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Overview</h1>
          <p className="lead">Live system state, and the scans run from this browser.</p>
        </div>
        <form className="quick" onSubmit={quickScan} role="search">
          <label htmlFor="quick" className="sr-only">Quick check: paste a link or a message</label>
          <input id="quick" className="field" placeholder="Paste a link or message to check" value={quick}
            onChange={(e) => setQuick(e.target.value)} autoComplete="off" />
          <button className="btn btn-primary" type="submit" disabled={!quick.trim()}>Check</button>
        </form>
      </header>

      <section className="status-grid" aria-label="System status">
        <StatusCard name="ML service" ok={status.tier === 'ml' || (status.tier === 'gateway' && status.ml?.status === 'ok')}
          loading={status.loading}
          detail={status.ml ? `Version ${status.ml.version}. URL model ${status.ml.url_model_loaded ? 'loaded' : 'missing'}, message model ${status.ml.sms_model_loaded ? 'loaded' : 'missing'}.` : 'Not reachable on port 8000'} />
        <StatusCard name="Gateway" ok={status.tier === 'gateway'} optional loading={status.loading}
          detail={status.tier === 'gateway' ? 'Persisting scans and feedback' : 'Not running; the dashboard talks to the ML service directly'} />
        <StatusCard name="Response time" ok={status.latencyMs != null} loading={status.loading}
          detail={status.latencyMs != null ? `${Math.round(status.latencyMs)} ms health check from this browser` : 'No measurement'} />
        <StatusCard name="Browser extension" ok={!!extension.data} optional loading={!extension.checked}
          detail={extension.data ? `Real-time protection ${extension.data.settings?.protection ? 'on' : 'off'}` : 'Not detected in this browser'} />
      </section>

      {items.length === 0 ? (
        <Empty title="No scans yet"
          action={<span className="row-gap"><a className="btn btn-primary" href={href('/url')}>Analyse a link</a><a className="btn" href={href('/demo')}>Run the demo examples</a></span>}>
          Charts and detections appear here as you analyse links and messages.
        </Empty>
      ) : (
        <>
          <dl className="kpis">
            <Stat label="Scans" value={items.length} hint="Stored in this browser's local storage." />
            <Stat label="Phishing and scams" value={threats} tone="threat" />
            <Stat label="Suspicious" value={suspicious} tone="watch" />
            <Stat label="Safe" value={safe} tone="safe" />
            <Stat label="Mean detection time" value={ms(avg)} hint="Model inference plus SHAP explanation, as measured by the ML service." />
          </dl>

          <div className="grid-3">
            <Panel title="Verdicts">
              <Donut label="Verdict distribution" segments={[
                { label: 'Phishing / scam', value: threats, tone: 'threat' },
                { label: 'Suspicious', value: suspicious, tone: 'watch' },
                { label: 'Safe', value: safe, tone: 'safe' }
              ]} />
            </Panel>
            <Panel title="Risk scores" description="The red line is the URL decision threshold.">
              <RiskHistogram scores={items.map((i) => i.score)} threshold={status.ml?.url_threshold ?? 0.6} />
            </Panel>
            <Panel title="Activity" description="Scans per day, last 14 days.">
              <Activity items={items} />
            </Panel>
          </div>

          <Panel title="Recent detections" action={<a className="link" href={href('/history')}>All scans</a>}>
            <ul className="recent">
              {items.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <a href={href('/scan/' + i.id)} className="recent-row">
                    <VerdictBadge verdict={i.verdict} size="sm" />
                    <span className={`recent-text ${i.kind === 'url' ? 'mono' : ''}`}>{truncate(i.artefact, 90)}</span>
                    {i.demo && <DemoTag />}
                    <span className="recent-score">{Math.round(i.score * 100)}</span>
                    <span className="recent-time">{timeAgo(i.scannedAt)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      <Panel title="Model snapshot" action={<a className="link" href={href('/model')}>Model performance</a>}
        description={metrics.data?.provenance?.dataset === 'synthetic' ? 'Held-out test results, measured on the synthetic training corpus.' : 'Held-out test results.'}>
        {url ? (
          <dl className="kpis kpis-tight">
            <Stat label="URL accuracy" value={url.accuracy.toFixed(3)} />
            <Stat label="URL ROC-AUC" value={url.roc_auc.toFixed(3)} />
            <Stat label="URL false positive rate" value={url.false_positive_rate.toFixed(3)} />
            <Stat label="Message accuracy" value={sms?.accuracy?.toFixed(3) ?? '—'} />
            <Stat label="Message F1" value={sms?.f1?.toFixed(3) ?? '—'} />
          </dl>
        ) : (
          <p className="muted">{metrics.loading ? 'Loading metrics…' : 'Metrics appear when the ML service is reachable.'}</p>
        )}
      </Panel>
    </div>
  )
}

function StatusCard({ name, ok, detail, optional, loading }) {
  const state = loading ? 'checking' : ok ? 'ok' : optional ? 'off' : 'down'
  const label = { checking: 'Checking', ok: 'Online', off: 'Not running', down: 'Offline' }[state]
  return (
    <div className={`status status-${state}`}>
      <p className="status-name">
        <span className="status-dot" aria-hidden="true" />
        {name}
      </p>
      <p className="status-state">{label}</p>
      <p className="status-detail">{detail}</p>
    </div>
  )
}
