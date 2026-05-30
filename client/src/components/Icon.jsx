import { memo } from 'react'

// Premium line icons — 24x24 viewBox, 1.75px stroke, currentColor, rounded caps/joins.
// Feather/Lucide style. Use `size` for px dimensions, `className` for color.
const PATHS = {
  // Trend & price movement
  'trend-up':       'M3 17l5-5 4 4 9-9',
  'trend-down':     'M3 7l5 5 4-4 9 9',
  'bar-chart':      'M3 18V13M7 18V8M11 18V4M15 18V10M19 18V6',
  'arrow-up':       'M12 19V5M5 12l7-7 7 7',
  'arrow-down':     'M12 5v14M5 12l7 7 7-7',
  'arrow-ne':       'M7 17L17 7M7 7h10v10',
  // Asset classes
  'building':       'M3 21h18M5 21V9l7-6 7 6v12M9 21v-6h6v6',
  'bank':           'M3 21h18M4 10h16M4 21V10M20 21V10M2 10l10-8 10 8M7 21v-5h4v5M13 21v-5h4v5',
  // Finance
  'target':         'M22 12A10 10 0 012 12m20 0A10 10 0 002 12M17 12A5 5 0 017 12m10 0A5 5 0 007 12M12 10v4M10 12h4',
  'lock':           'M7 11V7a5 5 0 0110 0v4M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z',
  'unlock':         'M7 11V7a5 5 0 0110 0M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z',
  'bell':           'M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 003.4 0',
  'lightbulb':      'M9 21h6M12 3a6 6 0 016 6c0 2.8-1.5 5.3-3 6.5H9C7.5 14.3 6 11.8 6 9a6 6 0 016-6z',
  'gauge':          'M5 19.5A9 9 0 0119 19.5M12 12L9 9M12 12m-2 0a2 2 0 104 0 2 2 0 00-4 0',
  'scale':          'M16 20h4M4 20h4M6 20v-4M18 20v-4M12 4v4M3 12c0-2.5 1.8-4.5 4-5l5 5 5-5c2.2.5 4 2.5 4 5',
  // Signals / flows
  'pulse':          'M2 12h4l3-8 4 16 3-8h6',
  'flow':           'M5 7l14 0M5 12l14 0M5 17l14 0M17 4l4 3-4 3M17 9l4 3-4 3M17 14l4 3-4 3',
  'exchange':       'M17 4h4v4M21 4L9 16M7 20H3v-4M3 20l12-12',
  'antenna':        'M4.9 4.9l3.5 3.5M19.1 19.1l-3.5-3.5M4.9 19.1l3.5-3.5M19.1 4.9l-3.5 3.5M12 12m-3 0a3 3 0 106 0 3 3 0 00-6 0M12 6V2M12 22v-4',
  // Sentiment (abstract geometric — no emoji faces)
  'smile':          'M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01M12 2a10 10 0 100 20A10 10 0 0012 2z',
  'meh':            'M8 15h8M9 9h.01M15 9h.01M12 2a10 10 0 100 20A10 10 0 0012 2z',
  'frown':          'M8 17s1.5-2 4-2 4 2 4 2M9 9h.01M15 9h.01M12 2a10 10 0 100 20A10 10 0 0012 2z',
  // UI
  'sun':            'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  'moon':           'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
  'sliders':        'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  'search':         'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  'globe':          'M12 2a10 10 0 100 20A10 10 0 0012 2zM2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20',
  'map':            'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16',
  'grid':           'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  'thermometer':    'M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26A4.5 4.5 0 1014 14.76z',
  'droplet':        'M12 2c-3.6 5-6 8.3-6 11a6 6 0 0012 0c0-2.7-2.4-6-6-11z',
  'mic':            'M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zM8 17a6 6 0 0012 0M12 23v-4',
  'camera':         'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z',
  'folder':         'M3 7a2 2 0 012-2h3.9l2 2H19a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  'calendar':       'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  'trash':          'M4 6h16M9 6V4h6v2M10 11v6M14 11v6M5 6l1 14a2 2 0 002 2h8a2 2 0 002-2l1-14',
  'share':          'M4 12v8a1 1 0 001 1h14a1 1 0 001-1v-8M16 6l-4-4-4 4M12 2v13',
  'clipboard':      'M9 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2h-2M9 2a1 1 0 001 1h4a1 1 0 001-1M9 2a1 1 0 000-2h6a1 1 0 000 2',
  'graduation':     'M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 2.5 2.7 4 6 4s6-1.5 6-4v-5',
  'award':          'M12 8a5 5 0 100 10 5 5 0 000-10M8 15.7V22l4-2 4 2v-6.3M12 2v2',
  'news':           'M4 22h16a2 2 0 002-2V7l-5-5H4a2 2 0 00-2 2v16a2 2 0 002 2zM14 2v5h5M8 12h8M8 16h5',
  'notes':          'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h6',
  'diamond':        'M12 2L22 12 12 22 2 12 12 2z',
  'banknote':       'M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5M6 9.5h.01M18 14.5h.01',
  'zap':            'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  'warning':        'M10.3 4.5L2 19h20L13.7 4.5a2 2 0 00-3.4 0zM12 9v5M12 17v.5',
  'volume-chart':   'M18 3v18M14 8v13M10 13v8M6 16v5M2 19v2',
  'phone':          'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.1-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1.1.4 2.1.7 3.1a2 2 0 01-.4 2.1L8 10.2a16 16 0 006 6l1.3-1.3a2 2 0 012-.4c1 .3 2 .5 3.1.7a2 2 0 011.7 2z',
}

function Icon({ name, size = 16, className = '', style }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

export default memo(Icon)
