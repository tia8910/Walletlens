import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { useLanguage } from '../LanguageContext'
import { useTheme, THEMES } from '../ThemeContext'
import { useZakatOn } from '../zakatSwitch'
import { homePath } from '../v2Preview'
import { track } from '../analytics'

// "More": every feature in the app on one screen, so the shorter bottom bar of
// the new look never hides one. The destinations are the menu's, one for one;
// zakat appears only while it is switched on, exactly as in the menu.
export default function More() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { theme, setTheme } = useTheme()
  const zakatOn = useZakatOn()
  const home = homePath(true)

  const go = (path, state) => { track('more_nav', { to: path, tab: state?.tab }); navigate(path, state ? { state } : undefined) }
  const groups = [
    { label: t('v2GroupPortfolio'), items: [
      { icon: 'home', label: t('dashboard'), on: () => go(home, { tab: 'overview' }) },
      { icon: 'eye', label: t('watchlist'), on: () => go(home, { tab: 'watchlist' }) },
      { icon: 'wallet', label: t('wallets'), on: () => go(home, { tab: 'wallets' }) },
      { icon: 'exchange', label: t('trades'), on: () => go('/transactions') },
      { icon: 'map', label: t('navGoals'), on: () => { try { localStorage.setItem('wl_vision_visited', '1') } catch {} go('/vision') } },
      { icon: 'sprout', label: t('nlGrow'), on: () => go('/grow') },
    ] },
    { label: t('v2GroupMarkets'), items: [
      { icon: 'trend-up', label: t('analysis'), on: () => go('/technicals') },
      { icon: 'zap', label: t('alpha'), on: () => go('/alpha') },
      { icon: 'calendar', label: t('calendar'), on: () => go('/calendar') },
      { icon: 'globe', label: t('nlMarketIndex'), on: () => go('/market-index') },
      { icon: 'gauge', label: t('nlFearGreed'), on: () => go('/fear-and-greed-index') },
    ] },
    { label: t('v2GroupAi'), items: [
      { icon: 'sparkles', label: t('coach'), on: () => go('/coach') },
      { icon: 'brain', label: t('portfolioAnalysisNav'), on: () => go('/coach', { section: 'analysis', tool: 'ai' }) },
      { icon: 'graduation', label: t('academy'), on: () => go('/academy') },
    ] },
    { label: t('v2GroupProtection'), items: [
      { icon: 'bell', label: t('priceAlerts'), on: () => go(home, { tab: 'alerts' }) },
      { icon: 'target', label: t('priceTargets'), on: () => go(home, { tab: 'targets' }) },
      { icon: 'warning', label: t('riskScanner'), on: () => go('/coach', { section: 'analysis', tool: 'risk' }) },
      { icon: 'shield', label: t('portfolioGuardian'), on: () => go('/guardian') },
      ...(zakatOn ? [{ icon: 'crescent', label: t('zkTitle'), on: () => go(home, { tab: 'zakat' }) }] : []),
    ] },
    { label: t('v2GroupData'), items: [
      { icon: 'download', label: t('backupRestore'), on: () => go(home, { tab: 'manage' }) },
      { icon: 'upload', label: t('importExport'), on: () => go(home, { tab: 'data' }) },
      { icon: 'scale', label: t('rebalancePlanner'), on: () => go('/rebalancing-calculator') },
      { icon: 'grid', label: t('tools'), on: () => go(home, { tab: 'tools' }) },
    ] },
  ]

  return (
    <div className="nl-more">
      <header className="nl-more-h">
        <Logo size={34} />
        <div><small>{t('nlMoreSub')}</small><h1>{t('nlMore')}</h1></div>
      </header>
      {groups.map(g => (
        <section key={g.label} className="nl-more-g">
          <h2>{g.label}</h2>
          <div className="nl-more-grid">
            {g.items.map(it => (
              <button key={it.label} type="button" className="nl-more-tile" onClick={it.on}>
                <span><Icon name={it.icon} size={19} /></span>
                <b>{it.label}</b>
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="nl-more-g">
        <h2>{t('setAppearance')}</h2>
        <div className="nl-more-row">
          <span>{t('nlTheme')}</span>
          <div className="nl-more-themes">
            {THEMES.map(th => (
              <button key={th.id} type="button" aria-label={th.name} aria-pressed={theme === th.id}
                className={theme === th.id ? 'on' : ''} style={{ '--c': th.swatch }} onClick={() => setTheme(th.id)} />
            ))}
          </div>
        </div>
        <button type="button" className="nl-more-row" onClick={() => go('/settings')}>
          <span>{t('settingsNav')}</span><b aria-hidden="true">›</b>
        </button>
      </section>
    </div>
  )
}
