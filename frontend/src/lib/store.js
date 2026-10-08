/**
 * Scan history, kept in this browser's localStorage.
 *
 * The dashboard has no login, so history is local by design and labelled as
 * such everywhere it is shown. Entries are the full normalised scan result,
 * which lets the investigation page re-render a past scan exactly as it was
 * returned (no re-scan, no reconstruction).
 */
import { useEffect, useState } from 'react'

const KEY = 'securenet.history.v1'
const MAX = 300
const listeners = new Set()

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

let cache = read()

function write(next) {
  cache = next.slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* storage full or disabled: keep the in-memory copy */
  }
  listeners.forEach((fn) => fn(cache))
}

function makeId() {
  return (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2)).slice(0, 12)
}

export function addScan(result, meta = {}) {
  const entry = { ...result, id: makeId(), demo: !!meta.demo, source: meta.source || 'dashboard' }
  write([entry, ...cache])
  return entry
}

export function getScan(id) {
  return cache.find((s) => s.id === id) || null
}

export function updateScan(id, patch) {
  write(cache.map((s) => (s.id === id ? { ...s, ...patch } : s)))
}

export function removeScan(id) {
  write(cache.filter((s) => s.id !== id))
}

export function clearHistory() {
  write([])
}

export function useHistory() {
  const [items, setItems] = useState(cache)
  useEffect(() => {
    listeners.add(setItems)
    const onStorage = (e) => {
      if (e.key === KEY) {
        cache = read()
        setItems(cache)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(setItems)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return items
}
