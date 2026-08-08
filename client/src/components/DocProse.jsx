// Renders the mini-syntax used by the legal documents in ../legal/.
//
// Three markers only — **bold**, `code`, [text](href) — chosen because they
// survive translation intact. Embedded JSX would not: a translator (human or
// otherwise) reorders a sentence and the tags end up around the wrong words,
// and a dropped closing tag becomes a rendering bug rather than a typo.
//
// Deliberately not a Markdown library. The vocabulary is fixed and small, the
// input is our own content rather than anything a user supplies, and pulling a
// parser in for three markers would cost more bundle than the whole feature.

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g

/** Split one string into React nodes, resolving the three inline markers. */
export function inline(text) {
  if (typeof text !== 'string') return text
  const parts = text.split(TOKEN).filter(Boolean)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i}>{part.slice(1, -1)}</code>
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (link) {
      const [, label, href] = link
      const external = /^https?:/i.test(href)
      return (
        <a key={i} href={href}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {label}
        </a>
      )
    }
    return part
  })
}

/**
 * A legal document: heading, optional lead paragraph, then numbered sections
 * of paragraphs and bullet lists.
 *
 * @param {object} doc      one language's entry from ../legal/*
 * @param {string} [notice] shown under the date in non-English locales — the
 *                          statement that the English text is authoritative
 */
export default function DocProse({ doc, notice }) {
  if (!doc) return null
  return (
    <>
      <h1>{doc.title}</h1>
      <p className="doc-meta">{doc.updated}</p>
      {notice && <p className="doc-meta" style={{ fontStyle: 'italic' }}>{notice}</p>}
      {doc.intro && <p>{inline(doc.intro)}</p>}

      {doc.sections.map((s) => (
        <section key={s.h}>
          <h2>{s.h}</h2>
          {(s.p || []).map((para, i) => <p key={i}>{inline(para)}</p>)}
          {s.ul && (
            <ul>
              {s.ul.map((li, i) => <li key={i}>{inline(li)}</li>)}
            </ul>
          )}
          {(s.after || []).map((para, i) => <p key={`a${i}`}>{inline(para)}</p>)}
        </section>
      ))}
    </>
  )
}
