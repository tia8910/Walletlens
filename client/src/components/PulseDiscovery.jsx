import { useEffect, useState } from 'react'
import { useLanguage } from '../LanguageContext'
import Icon from '../components/Icon'
import { track } from '../analytics'
import {
  pendingDiscovery, noteDiscoveryShown, dismissDiscovery,
  setPulseSettings, armPulseAudio,
} from '../marketPulseRuntime'

/**
 * Offers Market Pulse using something that actually happened.
 *
 * Market Pulse ships off, which leaves the usual problem: a feature nobody
 * finds. The usual answer is a badge on a settings row, which nobody reads.
 *
 * This is the honest alternative. While sound is off the runtime records the
 * best event the user missed, and this names it — "BTC moved 9.2% today" — so
 * the offer is evidence rather than a claim. It appears at most twice, ever,
 * and never again once dismissed: if someone has ignored it twice they have
 * answered, whether or not they tapped anything.
 */
export default function PulseDiscovery() {
  const { t } = useLanguage()
  const [event, setEvent] = useState(null)

  useEffect(() => {
    const pending = pendingDiscovery()
    if (!pending) return
    setEvent(pending)
    noteDiscoveryShown()
    track('pulse_discovery_shown', { type: pending.type })
  }, [])

  if (!event) return null

  const pct = Math.abs(Number(event.changePct) || 0).toFixed(1)
  const headline = event.type === 'rocket' && event.symbol
    ? t('pulseHeardIt')(event.symbol, pct)
    : t('pulseOffer')

  return (
    <div className="glass-card" style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.85rem',
      padding: '0.9rem 1rem', marginBottom: '1rem',
    }}>
      <Icon name="bell" size={18} style={{ flex: 'none', marginTop: '0.15rem', opacity: 0.75 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: '0.15rem' }}>{headline}</div>
        <div style={{ fontSize: '0.88rem', opacity: 0.75, marginBottom: '0.7rem' }}>{t('pulseOffer')}</div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button
            className="settings-chip active"
            onClick={() => {
              setPulseSettings({ enabled: true })
              // The tap that turns it on is a user gesture, which is exactly
              // what the AudioContext needs. Arming here means the very next
              // event can play instead of waiting for another interaction.
              armPulseAudio()
              track('pulse_discovery_accept', { type: event.type })
              setEvent(null)
            }}>
            {t('pulseTurnOn')}
          </button>
          <button
            className="settings-chip"
            onClick={() => {
              dismissDiscovery()
              track('pulse_discovery_dismiss', { type: event.type })
              setEvent(null)
            }}>
            {t('pulseNoThanks')}
          </button>
        </div>
      </div>
    </div>
  )
}
