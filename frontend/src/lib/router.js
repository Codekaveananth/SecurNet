/** Minimal hash router: "#/path?key=value". No dependency needed. */
import { useEffect, useState } from 'react'

function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?')
  return { path: path || '/', params: Object.fromEntries(new URLSearchParams(query)) }
}

export function useRoute() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function navigate(path, params) {
  const q = params ? '?' + new URLSearchParams(params).toString() : ''
  window.location.hash = path + q
}

export function href(path, params) {
  const q = params ? '?' + new URLSearchParams(params).toString() : ''
  return '#' + path + q
}
