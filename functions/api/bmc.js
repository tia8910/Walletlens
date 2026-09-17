/**
 * Serverless function — /api/bmc
 *
 * The Buy Me a Coffee widget script, fetched at the edge and served from
 * walletlens.live.
 *
 * WHY
 * Identical to /api/icon, for the same device. /diag on the live site reports
 * cdnjs.buymeacoffee.com failing in 14ms while every walletlens.live check
 * takes 507ms. Fourteen milliseconds is not a network round trip — there is no
 * DNS lookup and no TLS handshake in it. The request is refused before it
 * leaves the machine, which is the signature of a filtering resolver, and a
 * resolver filters for every device on the network rather than one phone.
 *
 * Both copies of the CSP name cdnjs.buymeacoffee.com explicitly, so this is
 * not a policy refusal; the host simply cannot be reached. The site cannot fix
 * that by asking more politely, so the last hop happens here instead, from
 * Cloudflare's edge, exactly as the coin icons, the datasets, Drive, push and
 * the voice worker already do.
 *
 * WHAT THIS DOES NOT FIX
 * Only the script. If the same resolver also blocks www.buymeacoffee.com, the
 * button will draw and its payment form will not open. That is worth knowing
 * before reading a rendered button as proof that donations work — but a widget
 * that never appears cannot be tested at all, and this at least moves the
 * failure somewhere visible.
 *
 * Not an open proxy: one hardcoded URL, no caller-supplied target.
 */

const UPSTREAM = 'https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js'

export async function onRequestGet() {
  try {
    const res = await fetch(UPSTREAM, {
      headers: { Accept: 'application/javascript, text/javascript, */*' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return new Response(`/* upstream ${res.status} */`, {
        status: 502,
        headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' },
      })
    }
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        // The widget is versioned in its own path, so it does not change under
        // us. Cached hard so this is not a per-load round trip for everyone.
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    // A comment, not an error page: the browser is loading this as a script,
    // and an HTML body here would be a syntax error in the console instead of
    // a silent no-op.
    return new Response('/* buy me a coffee widget unavailable */', {
      status: 502,
      headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' },
    })
  }
}
