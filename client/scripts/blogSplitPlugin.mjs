// Blog articles, one chunk each.
//
// src/data/blogPosts.js holds every article body inline — 60 of them, ~330 KB
// (~113 KB gzip). The Blog page and the Academy imported it whole, so a reader
// arriving from search on one article downloaded and parsed all sixty to show
// one, and the Academy pulled every body in just to list titles.
//
// blogPosts.js stays the single source (the prerender, sitemap, RSS and the
// post generators all read it as is). This plugin reads it at build time and
// serves two kinds of virtual module from it:
//
//   virtual:blog-index        every post's metadata (no body), the related-post
//                             picks precomputed with the real relatedPosts(),
//                             and loadPostContent(slug) — a dynamic import of…
//   virtual:blog-body/<slug>  one article's body, as its own small chunk.
//
// The index is a few KB; an article page loads that plus the one body it shows.
import { resolve, dirname } from 'path'
import { pathToFileURL } from 'url'
import { mkdirSync, writeFileSync } from 'fs'

const INDEX_ID = 'virtual:blog-index'
const BODY_PREFIX = 'virtual:blog-body/'
const RESOLVED = '\0'

// slug -> built chunk path, for the prerender to modulepreload each article's
// body from its own page. Kept outside dist: it is build plumbing, not a page.
export const BODY_MAP_PATH = 'node_modules/.blog-split/bodies.json'

export default function blogSplitPlugin(root) {
  const source = resolve(root, 'src/data/blogPosts.js')
  const recaps = resolve(root, 'src/data/dailyRecaps.js')

  // A fresh import per build (or per dev edit), so an edited article is never
  // served stale. The query string defeats Node's module cache.
  let cached = null
  const load = () => (cached ||= import(`${pathToFileURL(source).href}?t=${Date.now()}`))

  return {
    name: 'blog-split',
    buildStart() { cached = null },
    watchChange(id) { if (id === source || id === recaps) cached = null },
    generateBundle(_, bundle) {
      const map = {}
      for (const chunk of Object.values(bundle)) {
        const fid = chunk.type === 'chunk' && chunk.facadeModuleId
        if (fid && fid.startsWith(RESOLVED + BODY_PREFIX)) map[fid.slice(RESOLVED.length + BODY_PREFIX.length)] = '/' + chunk.fileName
      }
      const out = resolve(root, BODY_MAP_PATH)
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, JSON.stringify(map, null, 2) + '\n')
    },
    resolveId(id) {
      if (id === INDEX_ID || id.startsWith(BODY_PREFIX)) return RESOLVED + id
    },
    async load(id) {
      if (!id.startsWith(RESOLVED)) return
      const bare = id.slice(RESOLVED.length)
      if (bare !== INDEX_ID && !bare.startsWith(BODY_PREFIX)) return
      this.addWatchFile(source)
      this.addWatchFile(recaps)
      const { POSTS, relatedPosts } = await load()

      if (bare.startsWith(BODY_PREFIX)) {
        const slug = bare.slice(BODY_PREFIX.length)
        const post = POSTS.find(p => p.slug === slug)
        if (!post) this.error(`blog-split: no post with slug "${slug}"`)
        return `export default ${JSON.stringify(post.content)}`
      }

      const meta = POSTS.map(({ content, ...rest }) => rest)
      const related = Object.fromEntries(POSTS.map(p => [p.slug, relatedPosts(p.slug, 3).map(r => r.slug)]))
      const loaders = POSTS
        .map(p => `  ${JSON.stringify(p.slug)}: () => import(${JSON.stringify(BODY_PREFIX + p.slug)}),`)
        .join('\n')
      return [
        `export const POSTS = ${JSON.stringify(meta)}`,
        `const BY_SLUG = new Map(POSTS.map(p => [p.slug, p]))`,
        `const RELATED = ${JSON.stringify(related)}`,
        `const BODIES = {\n${loaders}\n}`,
        // Same contract as blogPosts.relatedPosts: an unknown slug gets the first n.
        `export function relatedPosts(slug, n = 3) {`,
        `  const picks = RELATED[slug]`,
        `  return picks ? picks.slice(0, n).map(s => BY_SLUG.get(s)) : POSTS.slice(0, n)`,
        `}`,
        `export function loadPostContent(slug) {`,
        `  const load = BODIES[slug]`,
        `  return load ? load().then(m => m.default) : Promise.resolve(null)`,
        `}`,
      ].join('\n')
    },
  }
}
