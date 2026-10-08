import React from 'react'

/**
 * Semicircular risk gauge with the three decision bands drawn to scale:
 * safe below the suspicious band, suspicious up to the model threshold,
 * phishing/scam above it.
 */
export default function RiskGauge({ score, threshold = 0.6, band = 0.35, tone }) {
  const R = 52, cx = 64, cy = 64
  const pt = (p) => {
    const a = Math.PI * (1 - p)
    return [cx + R * Math.cos(a), cy - R * Math.sin(a)]
  }
  const arc = (a, b) => {
    const [x1, y1] = pt(a), [x2, y2] = pt(b)
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`
  }
  const [nx, ny] = pt(score)
  const value = Math.round(score * 100)
  return (
    <div className={`gauge gauge-${tone}`}>
      <svg viewBox="0 0 128 76" role="img" aria-label={`Risk score ${value} out of 100`}>
        <path d={arc(0, band)} className="g-safe" />
        <path d={arc(band, threshold)} className="g-watch" />
        <path d={arc(threshold, 1)} className="g-threat" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} className="g-needle" />
        <circle cx={cx} cy={cy} r="4" className="g-hub" />
      </svg>
      <div className="gauge-read">
        <span className="gauge-value">{value}</span>
        <span className="gauge-unit">risk score</span>
      </div>
    </div>
  )
}
