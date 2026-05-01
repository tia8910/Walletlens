// Centralised empty / error state for pages and lists.
// Use one of the variants instead of one-off inline messages so the look
// stays consistent and screen readers see a `role=status` block.
export default function EmptyState({
  icon = '📭',
  title,
  message,
  action,
  variant = 'info', // 'info' | 'warn' | 'error'
}) {
  const tone =
    variant === 'error' ? { color: '#ef4444', bg: 'rgba(239,68,68,0.08)' } :
    variant === 'warn'  ? { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' } :
                          { color: 'var(--text2)', bg: 'var(--bg3)' }
  return (
    <div
      className="empty-state"
      role={variant === 'error' ? 'alert' : 'status'}
      style={{ background: tone.bg }}
    >
      <div className="empty-state-icon" aria-hidden="true">{icon}</div>
      {title && <h4 className="empty-state-title" style={{ color: tone.color }}>{title}</h4>}
      {message && <p className="empty-state-msg">{message}</p>}
      {action}
    </div>
  )
}
