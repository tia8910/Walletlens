import { memo, useState, useEffect } from 'react'

const GitHubStarButton = memo(function GitHubStarButton() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem('gh_star_dismissed')) {
        setDismissed(true)
        return
      }
    } catch {}
    const timer = setTimeout(() => setVisible(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  if (dismissed || !visible) return null

  const dismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem('gh_star_dismissed', '1') } catch {}
  }

  return (
    <a
      href="https://github.com/tia8910/Walletlens"
      target="_blank"
      rel="noopener noreferrer"
      onClick={dismiss}
      style={{
        position: 'fixed',
        bottom: 80,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, #24292e 0%, #1a1e23 100%)',
        color: '#fff',
        textDecoration: 'none',
        fontSize: 14,
        fontWeight: 600,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        animation: 'gh-star-bounce 0.6s ease-out',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.05)'
        e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,0,0,0.5)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)'
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4)'
      }}
    >
      <svg width="20" height="20" viewBox="0 0 16 16" fill="#fbbf24">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      ⭐ Star on GitHub
    </a>
  )
})

export default GitHubStarButton
