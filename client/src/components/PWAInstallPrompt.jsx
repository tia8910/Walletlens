import { useState, useEffect } from 'react'
import { track } from '../analytics'

const DISMISSED_KEY = 'wl_pwa_dismissed'

export default function PWAInstallPrompt() {
  const [prompt, setPrompt] = useState(null)
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
    if (ios) {
      setTimeout(() => { setIsIOS(true); setShow(true) }, 3000)
      return
    }

    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
      setTimeout(() => setShow(true), 3000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
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

  if (!show) return null

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
          {isIOS
            ? 'Tap Share → "Add to Home Screen" for instant access'
            : 'Install for faster access, offline use & a native feel'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
        {!isIOS && (
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
