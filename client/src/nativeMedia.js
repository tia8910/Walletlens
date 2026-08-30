// Hardware the page wants, and the app has to be asked for first.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// A WebView grants the page nothing on its own. Under the TWA that never came
// up: the page ran in Chrome, so Chrome held the microphone and the camera and
// raised its own prompts. Rendering the site in the app's own WebView means the
// page can only reach hardware THIS app is allowed to touch.
//
// getUserMedia is handled natively — the WebView raises onPermissionRequest and
// AppShellActivity answers it, asking Android when it needs to.
//
// SpeechRecognition is not. Chromium's WebView checks the app's own
// RECORD_AUDIO and fails the recognition with `not-allowed` WITHOUT consulting
// the app at all, so no prompt ever appears and the page reports a denied
// microphone on a device that was never asked. That is the bug this closes:
// the page asks first, through the bridge, and only then starts listening.

/** The bridge, when this page runs inside the app's own WebView. */
function shell() {
  try {
    const b = typeof window !== 'undefined' ? window.AndroidBridge : null
    return b && typeof b.requestMic === 'function' ? b : null
  } catch { return null }
}

/** Whether the app currently holds the microphone permission. */
export function micAllowed() {
  const b = shell()
  if (!b) return true          // a browser decides this itself, at getUserMedia
  try { return !!b.micAllowed() } catch { return false }
}

/**
 * Make sure the app may record before the page tries to.
 *
 * Resolves true outside the shell, where the browser runs its own prompt at the
 * moment of capture and this must not get in the way.
 *
 * The wait is for a system dialog, not a promise: the answer lands in the app's
 * permission state, so this polls briefly and gives up rather than hanging a
 * microphone button for ever. A user who takes longer is not stuck — the
 * permission is granted, and the next tap starts listening straight away.
 *
 * @returns {Promise<boolean>}
 */
export async function ensureMicPermission() {
  const b = shell()
  if (!b) return true
  if (micAllowed()) return true

  try { b.requestMic() } catch { return false }

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline && !micAllowed()) {
    await new Promise(r => setTimeout(r, 250))
  }
  return micAllowed()
}
