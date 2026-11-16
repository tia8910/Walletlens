import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// recharts is ~117 KB gzipped. The Dashboard's Home view draws no chart, so a
// static import made every dashboard visit wait on it for nothing.
describe('Dashboard loads recharts lazily', () => {
  const src = readFileSync(join(__dirname, 'pages/Dashboard.jsx'), 'utf8')
  it('has no static recharts import', () => {
    expect(src).not.toMatch(/^import[^;]*from ['"]recharts['"]/m)
  })
  it('renders its charts through LazyRecharts', () => {
    expect(src).toMatch(/from '\.\.\/components\/LazyRecharts'/)
    expect((src.match(/<LazyRecharts /g) || []).length).toBeGreaterThanOrEqual(3)
  })
})
