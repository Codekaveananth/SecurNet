/** Rendering helpers shared by the popup and the warning page. */
import { escapeHtml } from './shared.js'

export function evidenceHtml(evidence, n = 5) {
  const ev = (evidence || []).slice(0, n)
  if (!ev.length) return '<p class="muted">No single feature stood out.</p>'
  const max = Math.max(...ev.map((e) => Math.abs(e.contribution)), 1e-6)
  return `<ul class="ev">${ev.map((e) => {
    const up = e.contribution > 0
    return `<li><span>${escapeHtml(e.description)}</span><span class="num ${up ? 'up' : 'down'}">${up ? '+' : '−'}${Math.abs(e.contribution).toFixed(2)}</span>
      <span class="bar"><i class="${up ? 'up-bg' : 'down-bg'}" style="width:${(Math.abs(e.contribution) / max) * 100}%"></i></span></li>`
  }).join('')}</ul>`
}

export function indicatorsHtml(inds, n = 4) {
  const list = (inds || []).slice(0, n)
  if (!list.length) return ''
  return `<ul class="inds">${list.map((i) => `<li class="${escapeHtml(i.severity)}">${escapeHtml(i.label)}${
    i.source === 'heuristic' ? '<small>Heuristic check, not used in the score</small>' : ''}</li>`).join('')}</ul>`
}
