import { useState } from 'react'
import { youtubeId } from '../data/academyVideos'

// The video's own thumbnail from YouTube's image server, over the painted
// scene that stands in for it while it loads or if it cannot. The large one
// first; a video without one falls back to the medium (16:9, no black bars).
// Images only: the player itself still loads nothing until play.
const SIZES = ['maxresdefault', 'mqdefault']

export const thumbUrl = (id, size = SIZES[0]) => `https://i.ytimg.com/vi/${id}/${size}.jpg`

export default function VideoThumb({ video }) {
  const id = video?.id || youtubeId(video?.youtube)
  const [step, setStep] = useState(0)
  if (!id || step >= SIZES.length) return null
  return (
    <img className="aw-thumb" src={thumbUrl(id, SIZES[step])} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onLoad={e => { if (e.currentTarget.naturalWidth <= 120) setStep(s => s + 1) }}
      onError={() => setStep(s => s + 1)} />
  )
}
