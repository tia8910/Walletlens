import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { useLanguage } from '../LanguageContext'
import { useTheme, THEMES } from '../ThemeContext'
import { useZakatOn } from '../zakatSwitch'
import { homePath } from '../v2Preview'
import { track } from '../analytics'
import { useCanInstall, promptInstall } from '../pwaInstall'
import { SUPPORT_URL } from '../components/CoffeeButton'
import { EXTENSION_PAGE } from '../components/InstallExtension'
import { isMsStore } from '../msStore'

// "More": every feature in the app on one screen, so the shorter bottom bar of
// the new look never hides one. The destinations are the menu's, one for one;
// zakat appears only while it is switched on, exactly as in the menu. They are
// arranged by what you want to do, each goal a card of its tools, with a search
// that finds any tool or page by name.

/** Lower-case, accent-free text for matching a search in any language. */
export const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
/** The goals whose tools match `q`, each with only its matching tools. */
export const searchGoals = (goals, q) => {
  const k = fold(q).trim()
  if (!k) return goals
  return goals.map(g => fold(g.q).includes(k) ? g : { ...g, items: g.items.filter(it => fold(it.label).includes(k)) })
    .filter(g => g.items.length)
}
export default function More() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { theme, setTheme, mode, setMode } = useTheme()
  const zakatOn = useZakatOn()
  const canInstall = useCanInstall()
  const home = homePath(true)
  const [q, setQ] = useState('')

  const go = (path, state) => { track('more_nav', { to: path, tab: state?.tab }); navigate(path, state ? { state } : undefined) }
  const goals = [
    { id: 'track', hue: '#10b981', icon: 'wallet', q: t('moreQTrack'), sub: t('moreSTrack'), items: [
      { icon: 'home', label: t('dashboard'), on: () => go(home, { tab: 'overview' }) },
      { icon: 'bar-chart', label: t('nlInsights'), on: () => go(home, { tab: 'overview', insights: true }) },
      { icon: 'eye', label: t('watchlist'), on: () => go(home, { tab: 'watchlist' }) },
      { icon: 'wallet', label: t('wallets'), on: () => go(home, { tab: 'wallets' }) },
      { icon: 'exchange', label: t('trades'), on: () => go('/transactions') },
      { icon: 'bar-chart', label: t('stats'), on: () => { track('quick_stats_open', { source: 'more' }); window.dispatchEvent(new Event('wl:open-stats')) } },
    ] },
    { id: 'plan', hue: '#8b5cf6', icon: 'grow', q: t('moreQPlan'), sub: t('moreSPlan'), items: [
      { icon: 'grow', label: t('navGoals'), on: () => { try { localStorage.setItem('wl_vision_visited', '1') } catch {} go('/vision') } },
      { icon: 'sprout', label: t('nlGrow'), on: () => go('/grow') },
      { icon: 'target', label: t('priceTargets'), on: () => go(home, { tab: 'targets' }) },
    ] },
    { id: 'markets', hue: '#3b82f6', icon: 'trend-up', q: t('moreQMarkets'), sub: t('moreSMarkets'), items: [
      { icon: 'trend-up', label: t('analysis'), on: () => go('/technicals') },
      { icon: 'zap', label: t('alpha'), on: () => go('/alpha') },
      { icon: 'calendar', label: t('calendar'), on: () => go('/calendar') },
      { icon: 'analyze', label: t('navAnalyze'), on: () => go('/coach') },
      { icon: 'brain', label: t('portfolioAnalysisNav'), on: () => go('/coach', { section: 'analysis', tool: 'ai' }) },
    ] },
    { id: 'protect', hue: '#f59e0b', icon: 'shield', q: t('moreQProtect'), sub: t('moreSProtect'), items: [
      { icon: 'bell', label: t('priceAlerts'), on: () => go(home, { tab: 'alerts' }) },
      { icon: 'warning', label: t('riskScanner'), on: () => go('/coach', { section: 'analysis', tool: 'risk' }) },
      { icon: 'shield', label: t('portfolioGuardian'), on: () => go('/guardian') },
      ...(zakatOn ? [{ icon: 'crescent', label: t('zkTitle'), on: () => go(home, { tab: 'zakat' }) }] : []),
    ] },
    { id: 'learn', hue: '#ec4899', icon: 'graduation', q: t('moreQLearn'), sub: t('moreSLearn'), items: [
      { icon: 'graduation', label: t('academy'), on: () => go('/academy') },
      { icon: 'info', label: t('howItWorks'), on: () => { track('help_guide_open', { source: 'more' }); window.dispatchEvent(new Event('wl:open-help')) } },
    ] },
    // What the menu and the top bar held beyond pages (install, the support
    // link) sits with the data tools, so hiding them in the new look loses nothing.
    { id: 'data', hue: '#64748b', icon: 'download', q: t('moreQData'), sub: t('moreSData'), items: [
      { icon: 'download', label: t('backupRestore'), on: () => go(home, { tab: 'manage' }) },
      { icon: 'upload', label: t('importExport'), on: () => go(home, { tab: 'data' }) },
      { icon: 'grid', label: t('tools'), on: () => go(home, { tab: 'tools' }) },
      ...(canInstall ? [{ icon: 'download', label: t('installApp'), on: () => { track('pwa_menu_install_click', { source: 'more' }); promptInstall('more') } }] : []),
      { icon: 'gift', label: t('coffeeSupport'), on: () => { track('coffee_support_click', { source: 'more' }); window.open(SUPPORT_URL, '_blank', 'noopener') } },
    ] },
  ]
  const links = [
    { icon: 'info', label: t('about'), to: '/about' },
    { icon: 'monitor', label: 'YouTube', to: '/youtube' },
    { icon: 'message', label: t('faq'), to: '/faq' },
    { icon: 'news', label: t('blog'), to: '/blog' },
    // A static page, not an app route: a full page load, and never in the
    // Microsoft Store edition, which may not promote another store.
    ...(isMsStore() ? [] : [{ icon: 'globe', label: t('chromeExtension'), to: EXTENSION_PAGE, page: true }]),
    { icon: 'shield', label: t('privacy'), to: '/privacy' },
    { icon: 'clipboard', label: t('terms') || 'Terms', to: '/terms' },
  ]
  const openLink = (l) => l.page ? (track('more_nav', { to: l.to }), window.location.assign(l.to)) : go(l.to)
  const searching = q.trim() !== ''
  const shown = searchGoals(goals, q)
  const shownLinks = searching ? links.filter(l => fold(l.label).includes(fold(q).trim())) : links
  const settingsHit = searching && [t('settingsNav'), t('setAppearance'), t('nlTheme'), t('setMode')].some(x => fold(x).includes(fold(q).trim()))
  // Enter opens the first match, so a word and Enter is all it takes.
  const first = shown[0]?.items[0]?.on || (shownLinks[0] && (() => openLink(shownLinks[0]))) || (settingsHit && (() => go('/settings')))

  return (
    <div className="nl-more">
      <header className="nl-more-h">
        <Logo size={34} />
        <div><small>{t('nlMoreSub')}</small><h1>{t('nlMore')}</h1></div>
      </header>
      <label className="nl-more-find">
        <Icon name="search" size={18} />
        <input type="search" value={q} placeholder={t('moreFind')} aria-label={t('moreFind')} enterKeyHint="go"
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && first) { track('more_search_go', { len: q.length }); first() } }} />
        {searching && <button type="button" className="nl-more-find-x" aria-label="Clear" onClick={() => setQ('')}><Icon name="x" size={16} /></button>}
      </label>
      {!searching && <h2 className="nl-more-ask">{t('moreAsk')}</h2>}
      {shown.map(g => (
        <section key={g.id} className="nl-more-goal" style={{ '--j': g.hue }}>
          <div className="nl-more-goal-h">
            <span><Icon name={g.icon} size={20} /></span>
            <div><b>{g.q}</b><small>{g.sub}</small></div>
          </div>
          <div className="nl-more-pills">
            {g.items.map(it => (
              <button key={it.label} type="button" className="nl-more-pill" onClick={it.on}>
                <Icon name={it.icon} size={15} />{it.label}
              </button>
            ))}
          </div>
        </section>
      ))}
      {searching && !shown.length && !shownLinks.length && !settingsHit && <p className="nl-more-none">{t('moreNone')}</p>}
      {(!searching || settingsHit) && <section className="nl-more-g">
        <h2>{t('setAppearance')}</h2>
        <div className="nl-more-row">
          <span>{t('nlTheme')}</span>
          <div className="nl-more-themes">
            {THEMES.map(th => (
              <button key={th.id} type="button" aria-label={th.name} title={th.name} aria-pressed={theme === th.id}
                className={theme === th.id ? 'on' : ''} style={{ '--c': th.swatch }} onClick={() => setTheme(th.id)}>
                {/* Each theme's own mark: the bars, the coins, the emerald's sparkle. */}
                {th.logo ? <img src={th.logo} alt="" /> : <Icon name={th.icon} size={15} />}
              </button>
            ))}
          </div>
        </div>
        <div className="nl-more-row">
          <span>{t('setMode')}</span>
          <div className="nl-more-mode" role="group" aria-label={t('setMode')}>
            {[{ id: 'light', labelKey: 'modeLight', icon: 'sun' }, { id: 'dark', labelKey: 'modeDark', icon: 'moon' }].map(m => (
              <button key={m.id} type="button" aria-pressed={mode === m.id} className={mode === m.id ? 'on' : ''}
                onClick={() => { setMode(m.id); track('mode_changed', { mode: m.id, source: 'more' }) }}>
                <Icon name={m.icon} size={14} />{t(m.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="nl-more-row" onClick={() => go('/settings')}>
          <span>{t('settingsNav')}</span><b aria-hidden="true">›</b>
        </button>
      </section>}
      {/* What used to be the footer under every screen. */}
      {shownLinks.length > 0 && <section className="nl-more-g">
        <h2>{t('nlAboutGroup')}</h2>
        {shownLinks.map(l => (
          <button key={l.to} type="button" className="nl-more-row" onClick={() => openLink(l)}>
            <span className="nl-more-link"><Icon name={l.icon} size={16} />{l.label}</span><b aria-hidden="true">›</b>
          </button>
        ))}
        <p className="nl-more-copy">WalletLens © {new Date().getFullYear()}{typeof __WL_BUILD__ === 'string' ? ` · ${__WL_BUILD__}` : ''}</p>
      </section>}
    </div>
  )
}
