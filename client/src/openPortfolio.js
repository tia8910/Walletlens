// After a restore, the dashboard opens on Overview, at the top.
//
// A plain location.href = '/dashboard' reopened whichever tab was used last in
// this session (wl_active_tab), which after a Drive restore was the backup tab,
// so the restored portfolio was not what the person saw. The saved tab is set
// to Overview, the URL names it, and the page starts at the top.
export const PORTFOLIO_URL = '/dashboard?tab=overview'

export function openPortfolio() {
  try { sessionStorage.setItem('wl_active_tab', 'overview') } catch { /* private mode */ }
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual' } catch { /* old engine */ }
  try { window.scrollTo(0, 0) } catch { /* no window */ }
  window.location.href = PORTFOLIO_URL
}
