/** In-app notifications: transient toasts plus a session notification list. */
import { useEffect, useState } from 'react'

let items = []
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn(items))

export function notify(message, tone = 'info', opts = {}) {
  const n = { id: Math.random().toString(36).slice(2), message, tone, at: new Date().toISOString(),
    toast: opts.toast !== false, read: false, link: opts.link || null }
  items = [n, ...items].slice(0, 40)
  emit()
  if (n.toast) setTimeout(() => { items = items.map((i) => (i.id === n.id ? { ...i, toast: false } : i)); emit() }, opts.ms || 5000)
  return n.id
}

export function dismissToast(id) {
  items = items.map((i) => (i.id === id ? { ...i, toast: false } : i))
  emit()
}

export function markAllRead() {
  items = items.map((i) => ({ ...i, read: true }))
  emit()
}

export function useNotifications() {
  const [state, set] = useState(items)
  useEffect(() => {
    listeners.add(set)
    return () => listeners.delete(set)
  }, [])
  return state
}
