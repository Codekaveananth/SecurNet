import React, { useId } from 'react'
import { TONE, verdictLabel } from '../lib/present.js'

export function Panel({ title, action, children, className = '', id, description }) {
  return (
    <section className={`panel ${className}`} aria-labelledby={title ? id || undefined : undefined}>
      {(title || action) && (
        <header className="panel-head">
          <div>
            {title && <h2 id={id}>{title}</h2>}
            {description && <p className="panel-desc">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function VerdictBadge({ verdict, size = 'md' }) {
  const tone = TONE[verdict] || 'watch'
  return (
    <span className={`badge badge-${tone} badge-${size}`}>
      <span className="badge-dot" aria-hidden="true" />
      {verdictLabel(verdict)}
    </span>
  )
}

export function Tip({ text, children }) {
  const id = useId()
  return (
    <span className="tip">
      {children}
      <button type="button" className="tip-btn" aria-describedby={id} aria-label="More information">
        ?
      </button>
      <span role="tooltip" id={id} className="tip-body">
        {text}
      </span>
    </span>
  )
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
        <path d="M24 4 8 10v12c0 10 7 18 16 22 9-4 16-12 16-22V10L24 4z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M17 24h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p className="empty-title">{title}</p>
      {children && <p className="empty-body">{children}</p>}
      {action}
    </div>
  )
}

export function Skeleton({ lines = 3 }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <span key={i} style={{ width: `${90 - i * 14}%` }} />
      ))}
    </div>
  )
}

export function ErrorNote({ children, onRetry }) {
  return (
    <div className="error-note" role="alert">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="M10 2 1 18h18L10 2z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <div>{children}</div>
      {onRetry && (
        <button type="button" className="btn btn-quiet" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function DemoTag() {
  return <span className="demo-tag" title="Fabricated test input from demo mode">Test input</span>
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat ${tone ? 'stat-' + tone : ''}`}>
      <dt>{hint ? <Tip text={hint}>{label}</Tip> : label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
