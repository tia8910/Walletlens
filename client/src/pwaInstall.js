import { useEffect, useState } from 'react'
import { track } from './analytics'
import { isInstalledApp } from './nativeBridge'

// The browser's install offer (beforeinstallprompt), captured once at startup
// and shared. The top bar's install shortcut and the menu's "Install app" row
// both read it: on phones the top bar has no room for the shortcut (it cost
// the wordmark its ".live"), so the menu is where install lives there.
// Captured at import, not in a component, so an offer that fires before the
// app mounts is not missed. Chrome/Edge only; nothing on Firefox or iOS.

let deferred = null
let installed = false
const listeners = new Set()
const emit = () => listeners.forEach(fn => fn())

if (typeof window !== 'undefined') {
  try { installed = isInstalledApp() } catch {}
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit() })
  window.addEventListener('appinstalled', () => {
    installed = true; deferred = null; emit()
    track('pwa_installed', { source: 'app_installed_event' })
  })
}

/** Whether installing can be offered right now. */
export function canInstall() { return !!deferred && !installed }

/** Shows the browser's install dialog; `source` names the button for analytics. */
export async function promptInstall(source) {
  if (!deferred) return 'unavailable'
  const e = deferred
  e.prompt()
  const { outcome } = await e.userChoice
  track('pwa_install_outcome', { outcome, source })
  if (outcome === 'accepted') { installed = true; deferred = null; emit() }
  return outcome
}

/** Re-renders when the offer arrives or goes away. */
export function useCanInstall() {
  const [, bump] = useState(0)
  useEffect(() => {
    const fn = () => bump(n => n + 1)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])
  return canInstall()
}
