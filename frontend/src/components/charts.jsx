/**
 * Small SVG charts. Every chart carries a text alternative (aria-label plus a
 * visually hidden table) so the data is available without the picture.
 */
import React from 'react'

const TONES = { threat: 'var(--threat)', watch: 'var(--watch)', safe: 'var(--safe)', info: 'var(--signal)', muted: 'var(--line-strong)' }

function SrTable({ caption, rows }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Donut({ segments, label, center }) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  const R = 42
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line)" strokeWidth="14" />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.value / total) * C
            const el = (
              <circle key={s.label} cx="60" cy="60" r={R} fill="none" stroke={TONES[s.tone]} strokeWidth="14"
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
            )
            offset += len
            return el
          })}
        <text x="60" y="58" textAnchor="middle" className="donut-num">{center ?? total}</text>
        <text x="60" y="74" textAnchor="middle" className="donut-cap">scans</text>
      </svg>
      <ul className="legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="legend-sw" style={{ background: TONES[s.tone] }} />
            {s.label}
            <strong>{s.value}</strong>
          </li>
        ))}
      </ul>
      <SrTable caption={label} rows={segments.map((s) => [s.label, s.value])} />
    </div>
  )
}

/** Horizontal bars: [{label, value, tone?, note?}] */
export function HBars({ data, label, format = (v) => v, max }) {
  const m = max ?? Math.max(...data.map((d) => Math.abs(d.value)), 1e-9)
  return (
    <div className="hbars" role="img" aria-label={label}>
      {data.map((d, i) => (
        <div className="hbar" key={d.label + i}>
          <span className="hbar-label" title={d.label}>{d.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(Math.abs(d.value) / m) * 100}%`, background: TONES[d.tone || 'info'] }} />
          </span>
          <span className="hbar-val">{format(d.value)}</span>
        </div>
      ))}
      <SrTable caption={label} rows={data.map((d) => [d.label, format(d.value)])} />
    </div>
  )
}

/** Vertical histogram of risk scores with the decision bands shaded. */
export function RiskHistogram({ scores, threshold = 0.6, band = 0.35 }) {
  const bins = Array(10).fill(0)
  scores.forEach((s) => (bins[Math.min(9, Math.floor(s * 10))] += 1))
  const max = Math.max(...bins, 1)
  const W = 300, H = 120, bw = W / 10
  const toneFor = (i) => ((i + 0.5) / 10 >= threshold ? 'threat' : (i + 0.5) / 10 >= band ? 'watch' : 'safe')
  return (
    <div className="hist">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Risk score distribution of ${scores.length} scans`}>
        {bins.map((c, i) => {
          const h = (c / max) * (H - 18)
          return (
            <g key={i}>
              <rect x={i * bw + 3} y={H - h} width={bw - 6} height={Math.max(h, c ? 2 : 0)} rx="2" fill={TONES[toneFor(i)]} opacity="0.85" />
              {c > 0 && <text x={i * bw + bw / 2} y={H - h - 4} textAnchor="middle" className="hist-n">{c}</text>}
            </g>
          )
        })}
        <line x1={threshold * W} x2={threshold * W} y1="0" y2={H} className="hist-thr" />
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line)" />
        {[0, 25, 50, 75, 100].map((t) => (
          <text key={t} x={(t / 100) * W} y={H + 14} textAnchor={t === 0 ? 'start' : t === 100 ? 'end' : 'middle'} className="hist-tick">{t}</text>
        ))}
      </svg>
      <SrTable caption="Scans per risk score range" rows={bins.map((c, i) => [`${i * 10}–${i * 10 + 9}`, c])} />
    </div>
  )
}

/** Stacked daily activity for the last `days` days. */
export function Activity({ items, days = 14 }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const cols = Array.from({ length: days }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (days - 1 - i))
    return { d, threat: 0, watch: 0, safe: 0 }
  })
  items.forEach((it) => {
    const d = new Date(it.scannedAt); d.setHours(0, 0, 0, 0)
    const idx = Math.round((d - cols[0].d) / 86400000)
    if (idx >= 0 && idx < days) {
      const t = it.verdict === 'LEGITIMATE' ? 'safe' : it.verdict === 'SUSPICIOUS' ? 'watch' : 'threat'
      cols[idx][t] += 1
    }
  })
  const max = Math.max(...cols.map((c) => c.threat + c.watch + c.safe), 1)
  const W = 300, H = 90, bw = W / days
  return (
    <div className="activity">
      <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={`Scans per day over the last ${days} days`}>
        {cols.map((c, i) => {
          let y = H
          return (
            <g key={i}>
              {['safe', 'watch', 'threat'].map((t) => {
                const h = (c[t] / max) * (H - 4)
                y -= h
                return h > 0 ? <rect key={t} x={i * bw + 2} y={y} width={bw - 4} height={h} fill={TONES[t]} opacity="0.85" /> : null
              })}
            </g>
          )
        })}
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line)" />
        <text x="0" y={H + 13} className="hist-tick">{cols[0].d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</text>
        <text x={W} y={H + 13} textAnchor="end" className="hist-tick">Today</text>
      </svg>
      <SrTable caption="Scans per day" rows={cols.map((c) => [c.d.toDateString(), `${c.threat} threat, ${c.watch} suspicious, ${c.safe} safe`])} />
    </div>
  )
}

export function ConfusionMatrix({ cm, labels = ['Legitimate', 'Phishing'] }) {
  const cells = [[cm.tn, cm.fp], [cm.fn, cm.tp]]
  const max = Math.max(cm.tn, cm.fp, cm.fn, cm.tp, 1)
  const names = [['True negative', 'False positive'], ['False negative', 'True positive']]
  return (
    <table className="cm">
      <caption className="sr-only">Confusion matrix on the held-out test split</caption>
      <thead>
        <tr><td /><th scope="col">Predicted {labels[0].toLowerCase()}</th><th scope="col">Predicted {labels[1].toLowerCase()}</th></tr>
      </thead>
      <tbody>
        {cells.map((row, i) => (
          <tr key={i}>
            <th scope="row">Actual {labels[i].toLowerCase()}</th>
            {row.map((v, j) => (
              <td key={j} className={i === j ? 'cm-ok' : 'cm-err'} style={{ '--a': 0.12 + (v / max) * 0.5 }}>
                <strong>{v.toLocaleString()}</strong>
                <span>{names[i][j]}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Grouped bars for metric comparisons (e.g. validation vs test). */
export function GroupedBars({ groups, series, min = 0.9, max = 1 }) {
  const W = 320, H = 130, gw = W / groups.length
  const bw = (gw - 16) / series.length
  const y = (v) => H - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (H - 10)
  return (
    <div className="grouped">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Comparison of ${series.map((s) => s.label).join(' and ')}`}>
        {[min, (min + max) / 2, max].map((t) => (
          <g key={t}>
            <line x1="0" x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 3" />
            <text x={W} y={y(t) - 2} textAnchor="end" className="hist-tick">{t.toFixed(2)}</text>
          </g>
        ))}
        {groups.map((g, gi) => (
          <g key={g.label}>
            {series.map((s, si) => (
              <rect key={s.key} x={gi * gw + 8 + si * bw} y={y(g[s.key])} width={bw - 3} height={H - y(g[s.key])} fill={s.color} rx="2">
                <title>{`${g.label} ${s.label}: ${g[s.key].toFixed(4)}`}</title>
              </rect>
            ))}
            <text x={gi * gw + gw / 2} y={H + 13} textAnchor="middle" className="hist-tick">{g.label}</text>
          </g>
        ))}
      </svg>
      <ul className="legend legend-row">
        {series.map((s) => (
          <li key={s.key}><span className="legend-sw" style={{ background: s.color }} />{s.label}</li>
        ))}
      </ul>
      <p className="axis-note">Axis starts at {min.toFixed(2)} to make differences visible.</p>
    </div>
  )
}
