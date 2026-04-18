export default function PitchCard({ className = '' }) {
  return (
    <div className={`sidebar-pitch ${className}`} aria-label="Why WalletLens">
      <div className="pitch-badge">
        <span className="pitch-dot" />
        100% Free · No Account
      </div>
      <p className="pitch-headline">
        See <span className="pitch-em">every asset</span> in one lens.
      </p>
      <p className="pitch-body">
        Track crypto, stocks, fiat, gold &amp; silver — live prices, P&amp;L, AI insights. Your data stays on your device.
      </p>
      <ul className="pitch-points">
        <li>
          <span className="pitch-ico" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
          <span><strong>Live</strong> crypto, stocks &amp; FX</span>
        </li>
        <li>
          <span className="pitch-ico" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
          <span><strong>AI</strong> portfolio health &amp; risk</span>
        </li>
        <li>
          <span className="pitch-ico" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
          <span><strong>Multi-target</strong> sell plans</span>
        </li>
        <li>
          <span className="pitch-ico" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
          <span><strong>Private</strong> — local-first, no sign-up</span>
        </li>
      </ul>
      <div className="pitch-meter" aria-hidden="true">
        <span className="pitch-meter-dot" />
        <span className="pitch-meter-dot" />
        <span className="pitch-meter-dot" />
      </div>
    </div>
  );
}
