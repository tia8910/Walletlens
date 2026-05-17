import { useState, useEffect } from 'react'
import { track } from '../analytics'

const DISMISSED_KEY = 'wl_pwa_dismissed'

function detectPlatform() {
  const ua = navigator.userAgent
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
  const isIOS = /iphone|ipad|ipod/i.test(ua) && !window.MSStream
  const isSafariDesktop = /^((?!chrome|android).)*safari/i.test(ua) && !isIOS
  const isFirefox = /firefox/i.test(ua)
  const isChromium = /chrome|chromium|edg/i.test(ua) && !/firefox/i.test(ua)
  const isMobile = /android|iphone|ipad|ipod/i.test(ua)
  return { isStandalone, isIOS, isSafariDesktop, isFirefox, isChromium, isMobile }
}

export default function PWAInstallPrompt() {
  const [prompt, setPrompt] = useState(null)   // beforeinstallprompt event
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState(null)

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return
    const p = detectPlatform()
    setPlatform(p)
    if (p.isStandalone) return

    if (p.isIOS) {
      setTimeout(() => setShow(true), 3000)
      return
    }

    if (p.isChromium) {
      const handler = (e) => {
        e.preventDefault()
        setPrompt(e)
        setTimeout(() => setShow(true), 3000)
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }

    // Firefox, Safari desktop, other browsers — show generic bookmark prompt
    setTimeout(() => setShow(true), 4000)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
    track('pwa_prompt_dismissed')
  }

  async function install() {
    if (!prompt) return
    track('pwa_install_clicked')
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    track('pwa_install_outcome', { outcome })
    setShow(false)
    localStorage.setItem(DISMISSED_KEY, '1')
  }

  if (!show || !platform) return null

  const { isIOS, isSafariDesktop, isFirefox, isChromium, isMobile } = platform

  let instruction = 'Install for faster access, offline use & a native feel'
  if (isIOS) instruction = 'Tap the Share button → "Add to Home Screen"'
  else if (isSafariDesktop) instruction = 'Click Safari menu → "Add to Dock" or bookmark with ⌘D'
  else if (isFirefox) instruction = isMobile ? 'Tap ⋮ menu → "Add to Home Screen"' : 'Bookmark with Ctrl+D for quick access'

  return (
    <div style={{
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 2rem)', maxWidth: '420px',
      background: 'linear-gradient(135deg, #0d2018 0%, #071410 100%)',
      border: '1px solid rgba(52,211,153,0.3)',
      borderRadius: '16px', padding: '1rem 1.1rem',
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(52,211,153,0.1)',
      zIndex: 9999,
      animation: 'slideUpFade 0.35s ease',
    }}>
      <div style={{ fontSize: '2rem', flexShrink: 0 }}>📲</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white', marginBottom: '0.2rem' }}>
          Add WalletLens to Home Screen
        </div>
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
          {instruction}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
        {isChromium && prompt && (
          <button onClick={install} style={{
            background: '#34d399', color: '#000', border: 'none',
            borderRadius: '8px', padding: '0.35rem 0.75rem',
            fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
          }}>Install</button>
        )}
        <button onClick={dismiss} style={{
          background: 'transparent', color: 'rgba(255,255,255,0.4)', border: 'none',
          fontSize: '0.75rem', cursor: 'pointer', padding: '0.2rem',
        }}>Not now</button>
      </div>
    </div>
  )
}
