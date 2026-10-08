import React, { useMemo, useState } from 'react'
import { DemoTag, Empty, Panel, VerdictBadge } from '../components/ui.jsx'
import { clearHistory, useHistory } from '../lib/store.js'
import { href } from '../lib/router.js'
import { truncate } from '../lib/present.js'

const FILTERS = [
  ['all', 'All'], ['threat', 'Phishing and scams'], ['SUSPICIOUS', 'Suspicious'], ['LEGITIMATE', 'Safe'],
  ['url', 'Links'], ['sms', 'Messages'], ['demo', 'Demo inputs']
]

export default function History() {
  const items = useHistory()
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('time')
  const [confirm, setConfirm] = useState(false)

  const rows = useMemo(() => {
    let r = items.filter((i) => {
      if (filter === 'threat') return i.verdict === 'PHISHING' || i.verdict === 'SCAM'
      if (filter === 'SUSPICIOUS' || filter === 'LEGITIMATE') return i.verdict === filter
      if (filter === 'url' || filter === 'sms') return i.kind === filter
      if (filter === 'demo') return i.demo
      return true
    })
    if (q.trim()) r = r.filter((i) => i.artefact.toLowerCase().includes(q.trim().toLowerCase()))
    if (sort === 'risk') r = [...r].sort((a, b) => b.score - a.score)
    return r
  }, [items, filter, q, sort])

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = ['scanned_at,type,verdict,score,model_version,demo,artefact']
      .concat(rows.map((i) => [i.scannedAt, i.kind, i.verdict, i.score, i.modelVersion, i.demo, i.artefact].map(esc).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'securenet-history.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Scan history</h1>
        <p className="lead">Every scan run from this dashboard, stored only in this browser. Open one to see the full investigation.</p>
      </header>

      {items.length === 0 ? (
        <Empty title="Your scan history is empty" action={<a className="btn btn-primary" href={href('/url')}>Analyse a link</a>}>
          Results are saved here automatically after each scan.
        </Empty>
      ) : (
        <Panel>
          <div className="toolbar">
            <div className="chips" role="group" aria-label="Filter scans">
              {FILTERS.map(([k, l]) => (
                <button key={k} type="button" className={`chip ${filter === k ? 'chip-on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            <div className="toolbar-right">
              <label className="sr-only" htmlFor="hq">Search scans</label>
              <input id="hq" className="field field-sm" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
              <label className="sr-only" htmlFor="hs">Sort by</label>
              <select id="hs" className="field field-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="time">Newest first</option>
                <option value="risk">Highest risk first</option>
              </select>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="muted pad">No scans match these filters.</p>
          ) : (
            <div className="table-wrap">
              <table className="data history">
                <thead>
                  <tr>
                    <th scope="col">Verdict</th><th scope="col">Input</th><th scope="col">Type</th>
                    <th scope="col" className="num">Risk</th><th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id}>
                      <td><VerdictBadge verdict={i.verdict} size="sm" /></td>
                      <td className="cell-main">
                        <a href={href('/scan/' + i.id)} className={i.kind === 'url' ? 'mono' : ''}>{truncate(i.artefact, 110)}</a>
                        {i.demo && <DemoTag />}
                        {i.feedback && <span className="pill">Correction sent</span>}
                      </td>
                      <td>{i.kind === 'url' ? 'Link' : 'Message'}</td>
                      <td className="num mono">{Math.round(i.score * 100)}</td>
                      <td className="nowrap">{new Date(i.scannedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <footer className="toolbar toolbar-foot">
            <span className="muted">{rows.length} of {items.length} scans</span>
            <span className="row-gap">
              <button type="button" className="btn btn-quiet" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
              {confirm ? (
                <>
                  <button type="button" className="btn btn-danger" onClick={() => { clearHistory(); setConfirm(false) }}>Delete all scans</button>
                  <button type="button" className="btn btn-quiet" onClick={() => setConfirm(false)}>Cancel</button>
                </>
              ) : (
                <button type="button" className="btn btn-quiet" onClick={() => setConfirm(true)}>Clear history</button>
              )}
            </span>
          </footer>
        </Panel>
      )}
    </div>
  )
}
