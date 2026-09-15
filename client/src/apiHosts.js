// Every WalletLens-operated backend host, in one place.
//
// These were spread across twenty-odd files as string literals, which made the
// move off Deno Deploy a search-and-replace where missing one site fails at
// runtime, in production, for whichever feature was missed.
//
// Three places cannot import this file: the `connect-src` in index.html, the
// same directive in public/_headers, and the cache list in public/sw.js. A CSP
// that has not been updated blocks every request to the new host, and the app
// breaks in a way whose console output points at the browser rather than at
// the change that caused it. apiHosts.test.js fails when those three fall out
// of step with the constants here, so the cutover cannot half-happen.
//
// To move a service: change the host here, run the tests, and do what they
// tell you.

export const VOICE_HOST = 'walletlens-voice.tarek-abdelhameed.workers.dev'
export const PUSH_HOST = 'walletlens-push.tarek-abdelhameed.workers.dev'
export const NANSEN_HOST = 'walletlens-nansen.tarek-abdelhameed.workers.dev'

// The trailing slash on one and not the other is what the call sites already
// expected; both shapes are preserved so this change stays a pure refactor.
export const VOICE_API = `https://${VOICE_HOST}/`
export const PUSH_API = `https://${PUSH_HOST}`
export const NANSEN_API = `https://${NANSEN_HOST}`

/** The voice service's CORS proxy, used for prices, logos and RSS. */
export const voiceProxy = (url) => `${VOICE_API}proxy?url=${encodeURIComponent(url)}`
