// Blog articles ship one chunk each (scripts/blogSplitPlugin.mjs). The pages
// get metadata from virtual:blog-index; a body arrives only when it is read.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import blogSplitPlugin from '../scripts/blogSplitPlugin.mjs'
import { POSTS, relatedPosts } from './data/blogPosts.js'

const root = resolve(__dirname, '..')
const ctx = { addWatchFile() {}, error(m) { throw new Error(m) } }
async function loadVirtual(id) {
  const plugin = blogSplitPlugin(root)
  return plugin.load.call(ctx, plugin.resolveId(id))
}
// Evaluate the generated index with its dynamic imports stubbed out.
async function evalIndex() {
  const code = (await loadVirtual('virtual:blog-index'))
    .replace(/export const /g, 'const ')
    .replace(/export function /g, 'function ')
    .replace(/import\(("[^"]+")\)/g, '__imp($1)')
  // eslint-disable-next-line no-new-func
  return new Function('__imp', `${code}\nreturn { POSTS, relatedPosts, loadPostContent }`)(
    async id => ({ default: await loadVirtual(id).then(src => JSON.parse(src.replace(/^export default /, ''))) }),
  )
}

describe('blog split', () => {
  it('the index carries every post, without a single body', async () => {
    const idx = await evalIndex()
    expect(idx.POSTS.map(p => p.slug)).toEqual(POSTS.map(p => p.slug))
    for (const p of idx.POSTS) {
      expect(p.content).toBeUndefined()
      expect(p.title).toBeTruthy()
      expect(p.summary).toBeTruthy()
    }
  })

  it('related picks match blogPosts.relatedPosts', async () => {
    const idx = await evalIndex()
    for (const p of POSTS.slice(0, 10)) {
      expect(idx.relatedPosts(p.slug, 3).map(r => r.slug)).toEqual(relatedPosts(p.slug, 3).map(r => r.slug))
    }
    expect(idx.relatedPosts('no-such-post', 3).map(r => r.slug)).toEqual(POSTS.slice(0, 3).map(r => r.slug))
  })

  it('loads one body by slug, and null for an unknown one', async () => {
    const idx = await evalIndex()
    const p = POSTS[POSTS.length - 1]
    expect(await idx.loadPostContent(p.slug)).toBe(p.content)
    expect(await idx.loadPostContent('no-such-post')).toBeNull()
  })

  it('no page imports the whole of blogPosts.js again', () => {
    for (const f of ['pages/Blog.jsx', 'pages/Academy.jsx']) {
      const src = readFileSync(resolve(__dirname, f), 'utf8')
      expect(src).not.toMatch(/from ['"][./]+data\/blogPosts/)
    }
  })
})
