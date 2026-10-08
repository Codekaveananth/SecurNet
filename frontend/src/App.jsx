import React, { useEffect, useRef, useState } from 'react'
import Overview from './pages/Overview.jsx'
import Analyzer from './pages/Analyzer.jsx'
import History from './pages/History.jsx'
import Investigation from './pages/Investigation.jsx'
import ThreatIntel from './pages/ThreatIntel.jsx'
import Model from './pages/Model.jsx'
import Demo from './pages/Demo.jsx'
import Extension from './pages/Extension.jsx'
import { Empty } from './components/ui.jsx'
import { href, useRoute } from './lib/router.js'
import { useBackendStatus, useMetrics } from './lib/status.js'
import { useExtension } from './lib/extension.js'
import { dismissToast, markAllRead, useNotifications } from './lib/notify.js'
import { timeAgo } from './lib/present.js'

const NAV = [
  { group: 'Monitor', items: [['/', 'Overview', 'grid']] },
  { group: 'Analyse', items: [['/url', 'URL analyzer', 'link'], ['/message', 'Message analyzer', 'msg']] },
  { group: 'Investigate', items: [['/history', 'Scan history', 'list'], ['/intel', 'Threat intelligence', 'radar']] },
  { group: 'System', items: [['/model', 'Model performance', 'chart'], ['/extension', 'Browser extension', 'plug'], ['/demo', 'Demo mode', 'play']] }
]

const ICONS = {
  grid: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z',
  link: 'M8 12l4-4M7 9l-2 2a3 3 0 0 0 4 4l2-2M13 11l2-2a3 3 0 0 0-4-4L9 7',
  msg: 'M3 4h14v9H8l-4 3v-3H3z',
  list: 'M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01',
  radar: 'M10 3a7 7 0 1 0 7 7M10 6a4 4 0 1 0 4 4M10 10l5-5',
  chart: 'M3 17h14M5 14V9M9 14V5M13 14v-3M17 14V7',
  plug: 'M7 3v4M13 3v4M5 7h10v3a5 5 0 0 1-10 0zM10 15v3',
  play: 'M6 4l10 6-10 6z'
}

function Icon({ name }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="nav-icon">
      <path d={ICONS[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const TITLES = { '/': 'Overview', '/url': 'URL analyzer', '/message': 'Message analyzer', '/history': 'Scan history',
  '/intel': 'Threat intelligence', '/model': 'Model performance', '/demo': 'Demo mode', '/extension': 'Browser extension' }

export default function App() {
  const { path, params } = useRoute()
  const status = useBackendStatus()
  const metrics = useMetrics(status.tier)
  const extension = useExtension()
  const [menu, setMenu] = useState(false)
  const main = useRef(null)

  useEffect(() => {
    setMenu(false)
    const t = path.startsWith('/scan/') ? 'Investigation' : TITLES[path] || 'Not found'
    document.title = `${t} | SecureNet`
    window.scrollTo(0, 0)
    if (document.activeElement && document.activeElement !== document.body) main.current?.focus({ preventScroll: true })
  }, [path])

  let page
  if (path === '/') page = <Overview status={status} metrics={metrics} extension={extension} />
  else if (path === '/url') page = <Analyzer key="url" kind="url" params={params} />
  else if (path === '/message') page = <Analyzer key="sms" kind="sms" params={params} />
  else if (path === '/history') page = <History />
  else if (path.startsWith('/scan/')) page = <Investigation id={decodeURIComponent(path.slice(6))} />
  else if (path === '/intel') page = <ThreatIntel metrics={metrics} extension={extension} />
  else if (path === '/model') page = <Model metrics={metrics} status={status} />
  else if (path === '/demo') page = <Demo />
  else if (path === '/extension') page = <Extension extension={extension} />
  else page = <div className="page"><Empty title="Page not found" action={<a className="btn" href={href('/')}>Go to overview</a>} /></div>

  const active = (p) => (p === '/' ? path === '/' : path === p || (p === '/history' && path.startsWith('/scan/')))

  return (
    <div className={`app ${menu ? 'menu-open' : ''}`}>
      <a className="skip" href="#main">Skip to content</a>
      <aside className="rail" aria-label="Main navigation">
        <a className="brand" href={href('/')}>
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <path d="M16 2 4 7v8c0 7.5 5 13.5 12 15 7-1.5 12-7.5 12-15V7L16 2z" fill="var(--panel-2)" stroke="var(--signal)" strokeWidth="1.6" />
            <path d="M10 17h4l2-5 2 9 2-4h2" fill="none" stroke="var(--signal)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>SecureNet</span>
        </a>
        <nav>
          {NAV.map((g) => (
            <div key={g.group} className="nav-group">
              <p className="nav-label">{g.group}</p>
              <ul>
                {g.items.map(([p, label, icon]) => (
                  <li key={p}>
                    <a href={href(p)} className={`nav-link ${active(p) ? 'is-active' : ''}`} aria-current={active(p) ? 'page' : undefined}>
                      <Icon name={icon} />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="rail-foot">
          Final year project, Dept. of CSE, Sathyabama Institute of Science and Technology
        </p>
      </aside>
      <button type="button" className="scrim" aria-label="Close menu" onClick={() => setMenu(false)} tabIndex={menu ? 0 : -1} />

      <div className="frame">
        <header className="topbar">
          <button type="button" className="menu-btn" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          <StatusStrip status={status} extension={extension} />
          <Bell />
        </header>

        {status.tier === 'offline' && (
          <div className="banner" role="alert">
            <strong>Analysis unavailable.</strong> The ML service is not reachable. Start it from <code>ml-service</code> with{' '}
            <code>uvicorn app.main:app --port 8000</code>. Scans will resume automatically.
          </div>
        )}

        <main id="main" ref={main} tabIndex={-1}>{page}</main>
      </div>
      <Toasts />
    </div>
  )
}

function StatusStrip({ status, extension }) {
  const svc = status.loading ? 'checking' : status.tier === 'offline' ? 'down' : 'ok'
  return (
    <ul className="strip" aria-label="System status">
      <li className={`strip-item strip-${svc}`}>
        <span className="status-dot" aria-hidden="true" />
        <span>{svc === 'checking' ? 'Checking service' : svc === 'down' ? 'Service offline' : 'Detection online'}</span>
        {status.latencyMs != null && <span className="strip-meta">{Math.round(status.latencyMs)} ms</span>}
      </li>
      <li className={`strip-item strip-${status.tier === 'gateway' ? 'ok' : 'off'} hide-sm`}>
        <span className="status-dot" aria-hidden="true" />
        <span>{status.tier === 'gateway' ? 'Gateway' : 'Direct to ML service'}</span>
      </li>
      <li className={`strip-item strip-${extension.data ? 'ok' : 'off'} hide-sm`}>
        <span className="status-dot" aria-hidden="true" />
        <span>{extension.data ? 'Extension connected' : 'Extension not detected'}</span>
      </li>
    </ul>
  )
}

function Bell() {
  const items = useNotifications()
  const [open, setOpen] = useState(false)
  const unread = items.filter((i) => !i.read).length
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="bell" ref={ref}>
      <button type="button" className="bell-btn" aria-label={`Notifications, ${unread} unread`} aria-expanded={open}
        onClick={() => { setOpen(!open); if (!open) markAllRead() }}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 2h-13zM8 17.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          {items.length === 0 ? <p className="muted pad">No notifications in this session.</p> : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className={`note note-${n.tone}`}>
                  {n.link ? <a href={n.link} onClick={() => setOpen(false)}>{n.message}</a> : <span>{n.message}</span>}
                  <time>{timeAgo(n.at)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Toasts() {
  const items = useNotifications().filter((n) => n.toast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.slice(0, 3).map((n) => (
        <div key={n.id} className={`toast toast-${n.tone}`}>
          {n.link ? <a href={n.link}>{n.message}</a> : <span>{n.message}</span>}
          <button type="button" aria-label="Dismiss" onClick={() => dismissToast(n.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
