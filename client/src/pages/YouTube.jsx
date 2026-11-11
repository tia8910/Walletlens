import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import { academyVideos, watchUrl, videoUrl, YT_CHANNEL, YT_SUBSCRIBE } from '../data/academyVideos'

// The WalletLens channel as a page of its own, for the landing site and the
// app alike. Each video plays in the Academy's player, with its lesson; a
// small link beside it opens it on YouTube instead.
const COPY = {
  en: {
    title: 'Free investing video lessons',
    intro: 'Short videos from the WalletLens Academy on investing mindset, risk, and buying and selling. Each one teaches a single habit. Free, no account, and they play right here or on YouTube.',
    subscribe: 'Subscribe on YouTube', channel: 'Open the channel',
    latest: 'Latest videos', academy: 'Watch with lessons in the Academy', none: 'New videos land here as soon as they go live.',
    onYt: 'YouTube',
  },
  ar: {
    title: 'دروس فيديو مجانية عن الاستثمار',
    intro: 'فيديوهات قصيرة من أكاديمية WalletLens عن عقلية الاستثمار والمخاطر والشراء والبيع. كل فيديو يعلّم عادة واحدة. مجانية وبدون حساب، وتُشاهد هنا أو على يوتيوب.',
    subscribe: 'اشترك على يوتيوب', channel: 'افتح القناة',
    latest: 'أحدث الفيديوهات', academy: 'شاهد مع الدروس في الأكاديمية', none: 'ستظهر الفيديوهات الجديدة هنا فور نشرها.',
    onYt: 'يوتيوب',
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
                <Link to={videoUrl(v.key)} dir="auto" onClick={() => track('youtube_page_video', { video: v.key, where: 'app' })}>
                  {v.name}
                </Link>
                {' · '}
                <a href={watchUrl(v.id)} target="_blank" rel="noopener noreferrer" aria-label={`${v.name}, ${c.onYt}`}
                  onClick={() => track('youtube_page_video', { video: v.key, where: 'youtube' })}>
                  {c.onYt}
                </a>
                {v.lesson && <><br /><small><strong>{v.lesson.title}.</strong> {v.lesson.body}</small></>}
              </li>
            ))}
          </ul>
        )}
        <p><Link to="/academy">{c.academy}</Link></p>
      </article>
    </div>
  )
}
