/**
 * /api/geo — the visitor's country, from Cloudflare's view of the
 * connection: { country: 'EG' }. Used to open the stock picker on the
 * user's own market. Nothing is stored.
 */
export async function onRequestGet({ request }) {
  return new Response(JSON.stringify({ country: request.cf?.country || '' }), {
    // Readable from the app wherever it is served, not only on this origin.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=86400', 'Access-Control-Allow-Origin': '*' },
  })
}
