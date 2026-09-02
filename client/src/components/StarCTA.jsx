import { memo } from 'react'

const StarCTA = memo(function StarCTA() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a1e23 0%, #24292e 50%, #1a1e23 100%)',
      borderRadius: 16,
      padding: '24px 20px',
      margin: '20px 16px',
      textAlign: 'center',
      border: '1px solid rgba(251,191,36,0.3)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: 'linear-gradient(90deg, transparent, #fbbf24, transparent)',
      }} />
      <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
      <div style={{
        fontSize: 18,
        fontWeight: 700,
        color: '#fbbf24',
        marginBottom: 8,
      }}>
        Help Others Discover WalletLens
      </div>
      <div style={{
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 16,
        lineHeight: 1.5,
      }}>
        A GitHub star helps other privacy-conscious investors find this free, open-source tool.
      </div>
      <a
        href="https://github.com/tia8910/Walletlens"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 24px',
          borderRadius: 10,
          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
          color: '#1a1e23',
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: 15,
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.05)'
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(251,191,36,0.4)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="#1a1e23">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        Star on GitHub
      </a>
    </div>
  )
})

export default StarCTA
