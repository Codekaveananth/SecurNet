import React from 'react'
import { Tip } from './ui.jsx'

/**
 * Evidence waterfall.
 *
 * Each row is one SHAP attribution in log-odds space, drawn as a step from
 * the running total before it to the running total after it. The path starts
 * at the model's base value and, with the "all other features" step, ends
 * exactly at the model's output log-odds -- so the picture is the decision
 * itself, not a summary of it. The dashed lines mark the suspicious band and
 * the decision threshold, converted into log-odds.
 */
const logit = (p) => Math.log(p / (1 - p))
const sigmoid = (x) => 1 / (1 + Math.exp(-x))

export default function EvidenceAxis({ result }) {
  const { evidence = [], baseValue = 0, otherContribution, threshold = 0.5, suspiciousBand = 0.35 } = result
  if (!evidence.length) {
    return <p className="muted">No attribution crossed the reporting threshold for this input.</p>
  }

  const steps = []
  let cur = baseValue
  evidence.forEach((e) => {
    steps.push({ key: e.feature, label: e.description, feature: e.feature, value: e.value, from: cur, to: cur + e.contribution, c: e.contribution })
    cur += e.contribution
  })
  const reconciled = otherContribution != null
  if (reconciled && Math.abs(otherContribution) >= 0.0005) {
    steps.push({ key: '__other', label: 'All other features combined', other: true, from: cur, to: cur + otherContribution, c: otherContribution })
    cur += otherContribution
  }
  const final = result.logit ?? cur
  const thrL = logit(threshold)
  const susL = logit(suspiciousBand)

  const pts = [baseValue, final, thrL, susL, ...steps.flatMap((s) => [s.from, s.to])]
  let lo = Math.min(...pts), hi = Math.max(...pts)
  const pad = (hi - lo) * 0.08 || 1
  lo -= pad; hi += pad
  const x = (v) => ((v - lo) / (hi - lo)) * 100

  const ticks = [0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99].filter((p) => logit(p) > lo && logit(p) < hi)
  const Guides = () => (
    <>
      <span className="wf-guide wf-guide-band" style={{ left: `${x(susL)}%` }} />
      <span className="wf-guide wf-guide-thr" style={{ left: `${x(thrL)}%` }} />
    </>
  )

  return (
    <figure className="wf" aria-label="How each feature moved the score">
      <div className="wf-legend">
        <span><i className="wf-key wf-key-up" />Pushes toward {result.kind === 'url' ? 'phishing' : 'scam'}</span>
        <span><i className="wf-key wf-key-down" />Pulls toward safe</span>
        <span><i className="wf-key wf-key-thr" />Threshold {Math.round(threshold * 100)}</span>
        <span><i className="wf-key wf-key-band" />Suspicious from {Math.round(suspiciousBand * 100)}</span>
      </div>

      <ol className="wf-rows">
        <li className="wf-row wf-row-edge">
          <span className="wf-label">
            <Tip text="The model's average output before looking at this input (SHAP base value).">Starting point</Tip>
          </span>
          <span className="wf-track">
            <Guides />
            <span className="wf-dot" style={{ left: `${x(baseValue)}%` }} />
          </span>
          <span className="wf-num">{Math.round(sigmoid(baseValue) * 100)}</span>
        </li>

        {steps.map((s, i) => {
          const up = s.c > 0
          const left = Math.min(x(s.from), x(s.to))
          const width = Math.max(Math.abs(x(s.to) - x(s.from)), 0.6)
          return (
            <li className={`wf-row ${s.other ? 'wf-row-other' : ''}`} key={s.key + i}>
              <span className="wf-label">
                <span className="wf-desc">{s.label}</span>
                {!s.other && s.value !== undefined && <span className="wf-val">{s.feature !== s.label ? `${s.feature} = ${fmtVal(s.value)}` : ''}</span>}
              </span>
              <span className="wf-track">
                <Guides />
                <span className={`wf-bar ${up ? 'wf-up' : 'wf-down'}`} style={{ left: `${left}%`, width: `${width}%`, animationDelay: `${i * 40}ms` }} />
              </span>
              <span className={`wf-num ${up ? 't-threat' : 't-safe'}`}>{up ? '+' : '−'}{Math.abs(s.c).toFixed(3)}</span>
            </li>
          )
        })}

        <li className="wf-row wf-row-edge wf-row-final">
          <span className="wf-label"><strong>Final score</strong></span>
          <span className="wf-track">
            <Guides />
            <span className="wf-dot wf-dot-final" style={{ left: `${x(final)}%` }} />
          </span>
          <span className="wf-num"><strong>{Math.round(sigmoid(final) * 100)}</strong></span>
        </li>

        <li className="wf-row wf-axis" aria-hidden="true">
          <span className="wf-label" />
          <span className="wf-track">
            {ticks.map((p) => (
              <span key={p} className="wf-tick" style={{ left: `${x(logit(p))}%` }}>{Math.round(p * 100)}</span>
            ))}
          </span>
          <span className="wf-num" />
        </li>
      </ol>

      <figcaption className="wf-cap">
        Bars are signed SHAP values in log-odds; the axis shows the equivalent risk score.{' '}
        {reconciled
          ? `Starting point ${baseValue.toFixed(3)} plus all contributions equals the model output ${final.toFixed(3)}.`
          : 'Only the top contributions were returned for this scan, so the path may not reach the final score exactly.'}
      </figcaption>
    </figure>
  )
}

function fmtVal(v) {
  if (v === null || v === undefined) return ''
  if (Number.isInteger(v)) return String(v)
  return Number(v).toFixed(3)
}
