import React from 'react'
import { Panel, VerdictBadge } from '../components/ui.jsx'
import { truncate } from '../lib/present.js'

const SENS = { relaxed: 'Relaxed', standard: 'Standard', strict: 'Strict' }

export default function Extension({ extension }) {
  const ext = extension.data
  return (
    <div className="page">
      <header className="page-head">
        <h1>Browser extension</h1>
        <p className="lead">
          The SecureNet extension checks each site as you navigate to it, shows its verdict in the toolbar, and stops you
          with a warning page before a high-risk site loads.
        </p>
      </header>

      <div className="grid-2">
        <Panel title="Status in this browser">
          {!extension.checked ? <p className="muted">Checking…</p> : ext ? (
            <dl className="kv">
              <div><dt>Installed</dt><dd>Yes, version {ext.version}</dd></div>
              <div><dt>Real-time protection</dt><dd>{ext.settings?.protection ? 'On' : 'Off'}</dd></div>
              <div><dt>Sensitivity</dt><dd>{SENS[ext.settings?.sensitivity] || ext.settings?.sensitivity}</dd></div>
              <div><dt>Notifications</dt><dd>{ext.settings?.notifications ? 'On' : 'Off'}</dd></div>
              <div><dt>Local history</dt><dd>{ext.settings?.localHistory ? 'On' : 'Off'}</dd></div>
              <div><dt>Analysis service</dt><dd>{ext.backend || 'unknown'}</dd></div>
            </dl>
          ) : (
            <>
              <p>The extension was not detected. To install it in Chrome or Edge:</p>
              <ol className="steps">
                <li>Open <code>chrome://extensions</code> and turn on Developer mode.</li>
                <li>Choose Load unpacked and select the <code>extension</code> folder of this project.</li>
                <li>Pin SecureNet to the toolbar, then reload this page.</li>
              </ol>
            </>
          )}
        </Panel>

        <Panel title="What the extension sends">
          <ul className="actions">
            <li>Only the address of the page you navigate to, sent to your own SecureNet service.</li>
            <li>Never page content, form fields, passwords, OTPs, UPI PINs, card details, cookies or keystrokes.</li>
            <li>Passwords embedded in a URL (user:password@host) are removed before sending.</li>
            <li>Local and private-network addresses are never sent.</li>
            <li>If the service cannot be reached, the extension says analysis is unavailable. It never reports that as safe.</li>
          </ul>
        </Panel>
      </div>

      {ext?.history?.length > 0 && (
        <Panel title="Recently checked by the extension" description="Shared with this page because local history is on in the extension.">
          <ul className="recent">
            {ext.history.slice(0, 12).map((h) => (
              <li key={h.url + h.at} className="recent-row">
                <VerdictBadge verdict={h.verdict} size="sm" />
                <span className="recent-text mono">{truncate(h.url, 90)}</span>
                <span className="recent-score">{Math.round(h.score * 100)}</span>
                <span className="recent-time">{new Date(h.at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
