import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import { academyVideos, watchUrl, YT_CHANNEL, YT_SUBSCRIBE } from '../data/academyVideos'

// The WalletLens channel as a page of its own, for the landing site and the
// app alike. Videos open on YouTube; the Academy is where they play in place.
const COPY = {
  en: {
    title: 'WalletLens on YouTube',
    intro: 'Short stories and tutorials about money habits, risk and getting the most out of WalletLens.',
    subscribe: 'Subscribe on YouTube', channel: 'Open the channel',
    latest: 'Latest videos', academy: 'Watch with lessons in the Academy', none: 'New videos land here as soon as they go live.',
  },
  ar: {
    title: 'WalletLens على يوتيوب',
    intro: 'قصص قصيرة وشروحات عن عادات المال والمخاطر وكيف تستفيد من WalletLens.',
    subscribe: 'اشترك على يوتيوب', channel: 'افتح القناة',
    latest: 'أحدث الفيديوهات', academy: 'شاهد مع الدروس في الأكاديمية', none: 'ستظهر الفيديوهات الجديدة هنا فور نشرها.',
  },
}

export default function YouTube() {
  const { lang } = useLanguage()
  const c = COPY[lang] || COPY.en
  const videos = academyVideos(lang)

  return (
    <div className="doc-page" dir={lang === 'ar' ? 'rtl' : undefined}>
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>
      <article className="doc-article">
        <h1>{c.title}</h1>
        <p>{c.intro}</p>
        <p style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <a href={YT_SUBSCRIBE} target="_blank" rel="noopener noreferrer"
            onClick={() => track('youtube_page_subscribe')}>▶ {c.subscribe}</a>
          <a href={YT_CHANNEL} target="_blank" rel="noopener noreferrer"
            onClick={() => track('youtube_page_channel')}>{c.channel}</a>
        </p>

        <h2>{c.latest}</h2>
        {videos.length === 0 ? <p>{c.none}</p> : (
          <ul>
            {videos.map(v => (
              <li key={v.key}>
                <a href={watchUrl(v.id)} target="_blank" rel="noopener noreferrer"
                  onClick={() => track('youtube_page_video', { video: v.key })}>
                  {v.emoji} {v.name}
                </a>
              </li>
            ))}
          </ul>
        )}
        <p><Link to="/academy">{c.academy}</Link></p>
      </article>
    </div>
  )
}
