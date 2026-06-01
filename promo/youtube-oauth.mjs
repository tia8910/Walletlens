#!/usr/bin/env node
/**
 * One-time local helper: exchanges Google OAuth2 credentials for a YouTube refresh token.
 *
 * Run locally:
 *   YOUTUBE_OAUTH_CLIENT_ID=<id> YOUTUBE_OAUTH_CLIENT_SECRET=<secret> node promo/youtube-oauth.mjs
 *
 * Prerequisites in Google Cloud Console:
 *   1. Enable YouTube Data API v3  (APIs & Services → Library)
 *   2. Create OAuth 2.0 credentials  (APIs & Services → Credentials → Create → OAuth client ID)
 *   3. Choose "Desktop app" as the application type
 *   4. Add http://localhost:3000 as an Authorized redirect URI
 *   5. Download or copy the Client ID and Client Secret
 */
import https from 'https'
import http from 'http'

const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET
const PORT = 3000
const REDIRECT_URI = `http://localhost:${PORT}`
const SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    '\nUsage:\n' +
    '  YOUTUBE_OAUTH_CLIENT_ID=<id> YOUTUBE_OAUTH_CLIENT_SECRET=<secret> node promo/youtube-oauth.mjs\n'
  )
  process.exit(1)
}

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`

console.log('\n────────────────────────────────────────────────────')
console.log('  WalletLens – YouTube OAuth Setup')
console.log('────────────────────────────────────────────────────')
console.log('\nOpen this URL in your browser:\n')
console.log(authUrl)
console.log(`\nWaiting for the OAuth callback on http://localhost:${PORT}...\n`)

function post(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const buf = Buffer.from(body)
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': buf.length
      }
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith('/?')) {
    res.writeHead(200)
    res.end('Waiting for Google to redirect here...')
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    res.writeHead(200)
    res.end(`<h2>Error: ${error}</h2><p>Close this tab and check your terminal.</p>`)
    server.close()
    console.error(`\n❌ Google returned an error: ${error}`)
    process.exit(1)
  }

  if (!code) {
    res.writeHead(400)
    res.end('No authorization code received.')
    return
  }

  res.writeHead(200)
  res.end('<h2>✅ Authorization successful!</h2><p>You can close this tab. Check your terminal for the refresh token.</p>')
  server.close()

  const tokenBody = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code'
  }).toString()

  try {
    const raw = await post('https://oauth2.googleapis.com/token', tokenBody)
    const data = JSON.parse(raw)

    if (!data.refresh_token) {
      console.error('\n❌ No refresh_token in response:', raw)
      console.error('\nMake sure access_type=offline and prompt=consent are set, then try again.')
      process.exit(1)
    }

    console.log('\n────────────────────────────────────────────────────')
    console.log('  ✅ Success! Add these 3 GitHub repository secrets:')
    console.log('     Settings → Secrets and variables → Actions')
    console.log('────────────────────────────────────────────────────\n')
    console.log(`YOUTUBE_OAUTH_CLIENT_ID     = ${CLIENT_ID}`)
    console.log(`YOUTUBE_OAUTH_CLIENT_SECRET = ${CLIENT_SECRET}`)
    console.log(`YOUTUBE_OAUTH_REFRESH_TOKEN = ${data.refresh_token}`)
    console.log()
    process.exit(0)
  } catch (err) {
    console.error('\n❌ Token exchange failed:', err.message)
    process.exit(1)
  }
})

server.listen(PORT)
