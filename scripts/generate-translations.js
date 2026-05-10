#!/usr/bin/env node
/**
 * AI-powered translation generator for i18n.js
 * Usage: ANTHROPIC_API_KEY=sk-... node scripts/generate-translations.js [lang]
 * Default target language: Arabic (ar)
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const I18N_PATH = join(__dir, '../client/src/i18n.js')

const TARGET_LANG = process.argv[2] || 'ar'

const LANG_NAMES = {
  ar: 'Arabic (Modern Standard Arabic)',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  zh: 'Chinese (Simplified)',
}
const langName = LANG_NAMES[TARGET_LANG] || TARGET_LANG

const client = new Anthropic()

// Extract string key-value pairs from the `en: { ... }` block via regex
function extractEnStrings(source) {
  const enBlock = source.match(/\ben:\s*\{([\s\S]*?)\n  \}/)?.[1] || ''
  const strings = {}

  for (const match of enBlock.matchAll(/^\s{4}(\w+):\s*'((?:[^'\\]|\\.)*)'/gm)) {
    strings[match[1]] = match[2]
  }
  for (const match of enBlock.matchAll(/^\s{4}(\w+):\s*"((?:[^"\\]|\\.)*)"/gm)) {
    strings[match[1]] = match[2]
  }
  // Template literal strings
  for (const match of enBlock.matchAll(/^\s{4}(\w+):\s*`((?:[^`\\]|\\.)*)`/gm)) {
    strings[match[1]] = match[2]
  }

  return strings
}

// Extract function value keys from en block
function extractEnFuncKeys(source) {
  const enBlock = source.match(/\ben:\s*\{([\s\S]*?)\n  \}/)?.[1] || ''
  const keys = []
  for (const match of enBlock.matchAll(/^\s{4}(\w+):\s*\(.*?\)\s*=>/gm)) {
    keys.push(match[1])
  }
  return keys
}

async function translateStrings(strings) {
  const entries = Object.entries(strings)
  const payload = entries.map(([k, v]) => `${k}: ${v}`).join('\n')

  console.log(`Translating ${entries.length} strings to ${langName}...`)

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    messages: [{
      role: 'user',
      content: `You are a professional translator specializing in fintech and investment apps.

Translate the following English UI strings to ${langName}.

Rules:
- Keep the key names exactly as-is (left of the colon)
- Translate only the value (right of the colon)
- Preserve any emoji characters (✦ etc.) at the start of values
- Keep proper nouns like "WalletLens", "GitHub", "API", "walletlens.cc" untranslated
- Keep abbreviations like "P&L", "AI" untranslated
- Keep \\n in strings that contain newlines (do not translate \\n)
- Return ONLY a valid JSON object with translated key-value pairs, no markdown fences

Strings to translate:
${payload}

Return format (pure JSON only):
{
  "key1": "translated value 1",
  "key2": "translated value 2"
}`
    }]
  })

  const text = response.content.find(b => b.type === 'text')?.text || ''
  const json = text.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim()

  try {
    return JSON.parse(json)
  } catch (e) {
    console.error('Failed to parse response as JSON:\n', text)
    throw e
  }
}

// Arabic-specific plural function overrides
const FUNC_OVERRIDES = {
  ar: {
    walletCount: `(n) => \`\${n} \${n === 1 ? 'محفظة' : 'محافظ'}\``,
    tradesLabel: `(n) => \`\${n} \${n === 1 ? 'صفقة' : 'صفقات'}\``,
  }
}

function buildLangBlock(translated, funcKeys, targetLang) {
  const overrides = FUNC_OVERRIDES[targetLang] || {}
  const lines = []

  // String values
  for (const [k, v] of Object.entries(translated)) {
    // Escape backticks and template expressions for JS template literal
    const safe = v
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
    lines.push(`    ${k}: \`${safe}\``)
  }

  // Function values
  for (const k of funcKeys) {
    if (overrides[k]) {
      lines.push(`    ${k}: ${overrides[k]}`)
    }
  }

  return `  ${targetLang}: {\n${lines.join(',\n')},\n  }`
}

async function main() {
  const source = readFileSync(I18N_PATH, 'utf8')

  const strings = extractEnStrings(source)
  const funcKeys = extractEnFuncKeys(source)

  console.log(`Found ${Object.keys(strings).length} string keys, ${funcKeys.length} function keys`)

  const translated = await translateStrings(strings)
  const newBlock = buildLangBlock(translated, funcKeys, TARGET_LANG)

  // Replace or insert the target language block
  const blockRegex = new RegExp(`  ${TARGET_LANG}:\\s*\\{[\\s\\S]*?\\n  \\}`, 'm')

  let newSource
  if (blockRegex.test(source)) {
    newSource = source.replace(blockRegex, newBlock)
  } else {
    // Append before the closing } of the translations export
    newSource = source.replace(/(\n\})(\s*)$/, `\n${newBlock},\n}$2`)
  }

  writeFileSync(I18N_PATH, newSource)
  console.log(`✓ i18n.js updated — ${Object.keys(translated).length} strings translated to ${TARGET_LANG}`)
}

main().catch(err => { console.error(err.message); process.exit(1) })
