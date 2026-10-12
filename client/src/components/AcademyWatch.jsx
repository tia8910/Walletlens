import { useEffect, useState } from 'react'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import { academyVideos, embedUrl, isLesson, YT_SUBSCRIBE } from '../data/academyVideos'

// The Academy's Watch tab: the lesson shorts, the long originals and the
// feature tutorials, played from the WalletLens YouTube channel. A lesson
// ends with one question from the existing bank; a right answer the first
// time earns Investor IQ, like the daily challenge.

export const VIDEO_QUIZ_IQ = 25

const COPY = {
  en: { tab: 'Watch', channel: 'WalletLens on YouTube', channelSub: 'New lessons every week. Short, funny and to the point.', subscribe: 'Subscribe', original: 'WalletLens Original', lessons: 'Lessons', howto: 'How it works', comingTitle: 'Lessons are on the way', comingSub: 'The first episodes land here soon. Watch them on our channel meanwhile.', watched: 'Watched', quiz: 'Quick question', correct: 'Correct!', wrong: 'Not quite.', next: 'Next lesson', close: 'Close', source: 'Plays from YouTube', advice: 'For learning only, not financial advice.', short: 'Short', film: 'Film', hack: 'Hack' },
  ar: { tab: 'شاهد', channel: 'WalletLens على يوتيوب', channelSub: 'دروس جديدة كل أسبوع. قصيرة وممتعة ومباشرة.', subscribe: 'اشترك', original: 'إنتاج WalletLens', lessons: 'الدروس', howto: 'طريقة الاستخدام', comingTitle: 'الدروس في الطريق', comingSub: 'ستصل الحلقات الأولى هنا قريبا. شاهدها على قناتنا حتى ذلك الحين.', watched: 'تمت المشاهدة', quiz: 'سؤال سريع', correct: 'إجابة صحيحة!', wrong: 'ليست هذه.', next: 'الدرس التالي', close: 'إغلاق', source: 'يعمل من يوتيوب', advice: 'للتعلم فقط، وليس نصيحة مالية.', short: 'قصير', film: 'فيلم', hack: 'حيلة' },
  fr: { tab: 'Vidéos', channel: 'WalletLens sur YouTube', channelSub: 'De nouvelles leçons chaque semaine. Courtes, drôles et utiles.', subscribe: 'S’abonner', original: 'Une création WalletLens', lessons: 'Leçons', howto: 'Mode d’emploi', comingTitle: 'Les leçons arrivent', comingSub: 'Les premiers épisodes arrivent bientôt ici. En attendant, regardez les sur notre chaîne.', watched: 'Vu', quiz: 'Petite question', correct: 'Bonne réponse !', wrong: 'Pas tout à fait.', next: 'Leçon suivante', close: 'Fermer', source: 'Lu depuis YouTube', advice: 'Pour apprendre, pas un conseil financier.', short: 'Short', film: 'Film', hack: 'Astuce' },
  es: { tab: 'Vídeos', channel: 'WalletLens en YouTube', channelSub: 'Lecciones nuevas cada semana. Cortas, divertidas y al grano.', subscribe: 'Suscribirse', original: 'Original de WalletLens', lessons: 'Lecciones', howto: 'Cómo funciona', comingTitle: 'Las lecciones están en camino', comingSub: 'Los primeros episodios llegan pronto. Mientras tanto, míralos en nuestro canal.', watched: 'Visto', quiz: 'Pregunta rápida', correct: '¡Correcto!', wrong: 'No del todo.', next: 'Siguiente lección', close: 'Cerrar', source: 'Se reproduce desde YouTube', advice: 'Solo para aprender, no es asesoría financiera.', short: 'Short', film: 'Película', hack: 'Truco' },
  de: { tab: 'Videos', channel: 'WalletLens auf YouTube', channelSub: 'Jede Woche neue Lektionen. Kurz, witzig und auf den Punkt.', subscribe: 'Abonnieren', original: 'WalletLens Original', lessons: 'Lektionen', howto: 'So funktioniert es', comingTitle: 'Die Lektionen sind unterwegs', comingSub: 'Die ersten Folgen kommen bald hierher. Bis dahin findest du sie auf unserem Kanal.', watched: 'Gesehen', quiz: 'Kurze Frage', correct: 'Richtig!', wrong: 'Nicht ganz.', next: 'Nächste Lektion', close: 'Schließen', source: 'Wird von YouTube abgespielt', advice: 'Nur zum Lernen, keine Finanzberatung.', short: 'Short', film: 'Film', hack: 'Trick' },
  it: { tab: 'Video', channel: 'WalletLens su YouTube', channelSub: 'Nuove lezioni ogni settimana. Brevi, divertenti e dritte al punto.', subscribe: 'Iscriviti', original: 'Un originale WalletLens', lessons: 'Lezioni', howto: 'Come funziona', comingTitle: 'Le lezioni stanno arrivando', comingSub: 'I primi episodi arrivano presto qui. Nel frattempo guardali sul nostro canale.', watched: 'Visto', quiz: 'Domanda veloce', correct: 'Esatto!', wrong: 'Non proprio.', next: 'Lezione successiva', close: 'Chiudi', source: 'Riprodotto da YouTube', advice: 'Solo per imparare, non è una consulenza finanziaria.', short: 'Short', film: 'Film', hack: 'Trucco' },
}
export const WATCH_COPY = COPY

const YT_ICON = <svg width="20" height="14" viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" rx="5" fill="#ff0033"/><path d="M11 5.5v9l8-4.5z" fill="#fff"/></svg>

function Player({ video, c, answered, onAnswer, onNext, onClose }) {
  const [pick, setPick] = useState(null)
  useEffect(() => { setPick(null) }, [video.key])
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  const q = video.question
  return (
    <div className="aw-player" role="dialog" aria-modal="true" aria-label={video.name} onClick={onClose}>
      <div className={`aw-player-card ${video.wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
        <button type="button" className="aw-close" onClick={onClose} aria-label={c.close} title={c.close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div className="aw-frame">
          <iframe src={embedUrl(video.id)} title={video.name} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
        <div className="aw-after">
          <div className="aw-name">{video.emoji} {video.name}</div>
          {video.lesson && <div className="aw-lesson"><b>{video.lesson.title}</b><p>{video.lesson.body}</p></div>}
          {q && (
            <div className="aw-quiz">
              <div className="aw-quiz-h">{c.quiz}{!answered && <span className="aw-iq">+{VIDEO_QUIZ_IQ} IQ</span>}</div>
              <div className="aw-quiz-q">{q.q}</div>
              <div className="aw-opts">
                {q.opts.map((o, i) => {
                  const state = pick == null ? '' : i === q.a ? 'right' : i === pick ? 'wrong' : 'dim'
                  return (
                    <button key={i} type="button" className={`aw-opt ${state}`} disabled={pick != null}
                      onClick={() => { setPick(i); onAnswer(video, i === q.a) }}>{o}</button>
                  )
                })}
              </div>
              {pick != null && <p className={`aw-verdict ${pick === q.a ? 'right' : 'wrong'}`}><b>{pick === q.a ? c.correct : c.wrong}</b> {q.exp}</p>}
            </div>
          )}
          <div className="aw-foot">
            <small>{c.source} · {c.advice}</small>
            {onNext && <button type="button" className="aw-next" onClick={onNext}>{c.next} ›</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AcademyWatch({ store, onWatch, onQuiz, openKey = null, onOpened }) {
  const { lang } = useLanguage()
  const c = COPY[lang] || COPY.en
  const all = academyVideos(lang)
  const originals = all.filter(v => v.kind === 'original')
  const lessons = all.filter(v => v.kind === 'story' || v.kind === 'hack')
  const howtos = all.filter(v => v.kind === 'howto')
  const [playing, setPlaying] = useState(null)
  const watched = store.watched || {}
  const quizzed = store.vquiz || {}

  // A hack card's play button sends its video here to open.
  useEffect(() => {
    if (!openKey) return
    const v = all.find(x => x.key === openKey)
    if (v) play(v, 'hack_card')
    onOpened?.()
  }, [openKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.classList.toggle('wl-aw-open', !!playing)
    return () => document.documentElement.classList.remove('wl-aw-open')
  }, [playing])

  const play = (v, source) => {
    setPlaying(v)
    onWatch(v)
    track('academy_video_play', { video: v.key, kind: v.kind, source })
  }
  const queue = [...originals, ...lessons].filter(isLesson)
  const nextOf = (v) => {
    const rest = queue.filter(x => x.key !== v.key)
    return rest.find(x => !watched[x.key]) || null
  }

  const channel = (
    <a className="aw-channel" href={YT_SUBSCRIBE} target="_blank" rel="noopener noreferrer" onClick={() => track('academy_channel_click', { lang })}>
      <span className="aw-channel-ic">{YT_ICON}</span>
      <span className="aw-channel-txt"><b>{c.channel}</b><small>{c.channelSub}</small></span>
      <span className="aw-channel-sub">{c.subscribe}</span>
    </a>
  )

  if (!all.length) {
    return (
      <div className="aw">
        <div className="glass-card aw-empty"><div className="aw-empty-ic">🎬</div><b>{c.comingTitle}</b><p>{c.comingSub}</p></div>
        {channel}
      </div>
    )
  }

  const tile = (v) => (
    <button key={v.key} type="button" className={`aw-tile k-${v.kind}`} onClick={() => play(v, 'grid')}>
      <span className="aw-tile-emoji" aria-hidden="true">{v.emoji}</span>
      <span className="aw-tile-play" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></span>
      <span className="aw-tile-kind">{v.kind === 'hack' ? c.hack : c.short}</span>
      <span className="aw-tile-txt"><b dir="auto">{v.name}</b>{v.lesson && <small>{v.lesson.title}</small>}</span>
      {watched[v.key]
        ? <span className="aw-tile-done">✓ {c.watched}</span>
        : v.question && !quizzed[v.key] && <span className="aw-tile-iq">+{VIDEO_QUIZ_IQ} IQ</span>}
    </button>
  )

  return (
    <div className="aw">
      {originals.map(v => (
        <button key={v.key} type="button" className="aw-original" onClick={() => play(v, 'original')}>
          <span className="aw-original-tag">{c.original}</span>
          <span className="aw-original-name">{v.emoji} {v.name}</span>
          {v.lesson && <span className="aw-original-sub">{v.lesson.title}</span>}
          <span className="aw-original-play"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg> {c.film}</span>
        </button>
      ))}
      {lessons.length > 0 && <><h3 className="aw-h">{c.lessons}</h3><div className="aw-grid">{lessons.map(tile)}</div></>}
      {howtos.length > 0 && (
        <>
          <h3 className="aw-h">{c.howto}</h3>
          <div className="aw-rail">
            {howtos.map(v => (
              <button key={v.key} type="button" className="aw-how" onClick={() => play(v, 'howto')}>
                <span aria-hidden="true">{v.emoji}</span><b dir="auto">{v.name}</b>
              </button>
            ))}
          </div>
        </>
      )}
      {channel}
      {playing && (
        <Player
          video={playing}
          c={c}
          answered={!!quizzed[playing.key]}
          onAnswer={(v, ok) => { onQuiz(v, ok); track('academy_video_quiz', { video: v.key, correct: ok }) }}
          onNext={nextOf(playing) ? () => play(nextOf(playing), 'next') : null}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  )
}
