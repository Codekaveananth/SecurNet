import React, { useEffect, useRef, useState } from 'react'

const PLACEHOLDER = {
  url: 'Paste a link, for example sbi-kyc-verify.tk/login',
  sms: 'Paste the full message, including any sender header such as VM-SBIINB'
}

export default function Scanner({ mode, onScan, busy, initial = '' }) {
  const [value, setValue] = useState(initial)
  const ref = useRef(null)
  useEffect(() => setValue(initial), [initial])
  useEffect(() => ref.current?.focus(), [mode])

  const submit = (e) => {
    e?.preventDefault()
    const trimmed = value.trim()
    if (trimmed && !busy) onScan(trimmed)
  }
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (mode === 'url' || e.metaKey || e.ctrlKey)) submit(e)
  }
  const id = `scan-${mode}`

  return (
    <form className="scanner" onSubmit={submit} role="search">
      <label htmlFor={id} className="scanner-label">
        {mode === 'url' ? 'Link to check' : 'Message to check'}
      </label>
      <div className="scanner-row">
        {mode === 'url' ? (
          <input id={id} ref={ref} className="field mono" type="text" inputMode="url" value={value}
            placeholder={PLACEHOLDER.url} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown}
            spellCheck="false" autoComplete="off" maxLength={2048} />
        ) : (
          <textarea id={id} ref={ref} className="field field-area" value={value} rows={4}
            placeholder={PLACEHOLDER.sms} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown}
            maxLength={4000} />
        )}
        <button className="btn btn-primary" type="submit" disabled={busy || !value.trim()}>
          {busy ? <><span className="spinner" aria-hidden="true" />Analysing</> : mode === 'url' ? 'Analyse link' : 'Analyse message'}
        </button>
      </div>
      <p className="scanner-hint">
        {mode === 'url'
          ? 'SecureNet reads the address only. It never opens or downloads the page.'
          : 'Links inside the message are extracted and checked by the URL model. Press Ctrl+Enter to analyse.'}
      </p>
    </form>
  )
}
