import React, { useMemo } from 'react'
import { HBars } from '../components/charts.jsx'
import { Empty, Panel, VerdictBadge } from '../components/ui.jsx'
import { useHistory } from '../lib/store.js'
import { href } from '../lib/router.js'
import { truncate } from '../lib/present.js'

const count = (arr) => {
  const m = new Map()
  arr.forEach((k) => m.set(k, (m.get(k) || 0) + 1))
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export default function ThreatIntel({ metrics, extension }) {
  const items = useHistory()
  const d = useMemo(() => {
    const flagged = items.filter((i) => i.verdict !== 'LEGITIMATE')
    const urls = items.filter((i) => i.kind === 'url')
    const msgs = items.filter((i) => i.kind === 'sms')
    const drivers = (list) => {
      const m = new Map()
      list.forEach((i) => i.evidence.filter((e) => e.contribution > 0).forEach((e) => {
        const cur = m.get(e.description) || { sum: 0, n: 0 }
        m.set(e.description, { sum: cur.sum + e.contribution, n: cur.n + 1 })
      }))
      return [...m.entries()].map(([label, v]) => ({ label, value: v.sum / v.n, note: v.n }))
        .sort((a, b) => b.value * b.note - a.value * a.note).slice(0, 8)
    }
    return {
      flagged,
      urlDrivers: drivers(flagged.filter((i) => i.kind === 'url')),
      msgDrivers: drivers(flagged.filter((i) => i.kind === 'sms')),
      indicators: count(urls.flatMap((i) => (i.indicators || []).map((x) => x.label))).slice(0, 8),
      patterns: count(msgs.flatMap((i) => (i.scamPatterns || []).map((p) => p.label))),
      tlds: count(flagged.filter((i) => i.kind === 'url' && i.anatomy?.tld).map((i) => '.' + i.anatomy.tld)).slice(0, 8),
      brands: count(items.flatMap((i) => [i, ...(i.embeddedUrls || [])]).flatMap((i) => (i.indicators || [])
        .filter((x) => x.source === 'heuristic').map((x) => x.id.replace('brand_', '')))).slice(0, 8),
      india: count(items.flatMap((i) => i.indiaSignals || [])).slice(0, 14),
      urlCount: urls.length,
      msgCount: msgs.length
    }
  }, [items])

  const gain = metrics.data?.url?.top_features_by_gain || []
  const ext = extension.data
  const extFlagged = (ext?.history || []).filter((h) => h.verdict !== 'LEGITIMATE')

  return (
    <div className="page">
      <header className="page-head">
        <h1>Threat intelligence</h1>
        <p className="lead">
          Patterns across the links and messages you have analysed in this browser. Nothing here is drawn from outside
          feeds; every number is computed from real scan results.
        </p>
      </header>

      {items.length === 0 ? (
        <Empty title="No scans to analyse yet" action={<a className="btn btn-primary" href={href('/demo')}>Run the demo examples</a>}>
          Threat patterns are built from your scan history.
        </Empty>
      ) : (
        <>
          <div className="grid-2">
            <Panel title="What drives link detections" description={`Mean SHAP contribution toward phishing across ${d.flagged.filter((i) => i.kind === 'url').length} flagged links. Longer bars push harder.`}>
              {d.urlDrivers.length ? <HBars data={d.urlDrivers.map((x) => ({ ...x, tone: 'threat' }))} label="Top link detection drivers" format={(v) => '+' + v.toFixed(2)} />
                : <p className="muted">No flagged links yet.</p>}
            </Panel>
            <Panel title="What drives message detections" description={`Mean SHAP contribution toward scam across ${d.flagged.filter((i) => i.kind === 'sms').length} flagged messages.`}>
              {d.msgDrivers.length ? <HBars data={d.msgDrivers.map((x) => ({ ...x, tone: 'threat' }))} label="Top message detection drivers" format={(v) => '+' + v.toFixed(2)} />
                : <p className="muted">No flagged messages yet.</p>}
            </Panel>
          </div>

          <div className="grid-3">
            <Panel title="Most common link patterns" description={`Across ${d.urlCount} links.`}>
              {d.indicators.length ? <HBars data={d.indicators.map(([label, value]) => ({ label, value, tone: 'watch' }))} label="Link pattern frequency" />
                : <p className="muted">No patterns found yet.</p>}
            </Panel>
            <Panel title="Scam topics" description={`Keyword-rule tags across ${d.msgCount} messages.`}>
              {d.patterns.length ? <HBars data={d.patterns.map(([label, value]) => ({ label, value, tone: 'watch' }))} label="Scam topic frequency" />
                : <p className="muted">No messages analysed yet.</p>}
            </Panel>
            <Panel title="Top-level domains of flagged links">
              {d.tlds.length ? <HBars data={d.tlds.map(([label, value]) => ({ label, value, tone: 'threat' }))} label="TLDs of flagged links" />
                : <p className="muted">No flagged links yet.</p>}
            </Panel>
          </div>

          <div className="grid-2">
            <Panel title="Brands that were imitated" description="From the brand heuristic: a bank or service name in a host that is not its official domain.">
              {d.brands.length ? <ul className="tags tags-count">{d.brands.map(([b, n]) => <li key={b}>{b}<strong>{n}</strong></li>)}</ul>
                : <p className="muted">No impersonation attempts seen.</p>}
            </Panel>
            <Panel title="Indian financial terms seen">
              {d.india.length ? <ul className="tags tags-count">{d.india.map(([b, n]) => <li key={b}>{b}<strong>{n}</strong></li>)}</ul>
                : <p className="muted">None yet.</p>}
            </Panel>
          </div>
        </>
      )}

      <div className="grid-2">
        <Panel title="Features the link model relies on most" description="Training-time importance (total gain) from the XGBoost model, read from the training artifacts.">
          {gain.length ? <HBars data={gain.slice(0, 10).map(([label, value]) => ({ label, value, tone: 'info' }))} label="Feature importance by gain" format={(v) => v.toFixed(0)} />
            : <p className="muted">{metrics.loading ? 'Loading…' : 'Available when the ML service is reachable.'}</p>}
        </Panel>
        <Panel title="Seen by the browser extension" description={ext ? 'Sites checked while you browsed. Shared only because local history is on in the extension.' : 'Install the extension and turn on local history to include sites you visit.'}>
          {!ext ? <p className="muted">Extension not detected.</p>
            : !ext.history ? <p className="muted">Local history is off in the extension settings.</p>
              : extFlagged.length === 0 ? <p className="muted">{ext.history.length} sites checked, none flagged.</p>
                : (
                  <ul className="recent">
                    {extFlagged.slice(0, 6).map((h) => (
                      <li key={h.url + h.at} className="recent-row">
                        <VerdictBadge verdict={h.verdict} size="sm" />
                        <span className="recent-text mono">{truncate(h.url, 70)}</span>
                        <span className="recent-score">{Math.round(h.score * 100)}</span>
                      </li>
                    ))}
                  </ul>
                )}
        </Panel>
      </div>
    </div>
  )
}
