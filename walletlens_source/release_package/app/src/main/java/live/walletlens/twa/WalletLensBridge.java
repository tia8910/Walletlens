package live.walletlens.twa;

import android.app.Activity;
import android.webkit.JavascriptInterface;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.lang.ref.WeakReference;

/**
 * The direct channel between the web app and the app it runs inside.
 *
 * <h3>Why this can exist now</h3>
 *
 * Under the Trusted Web Activity there was no such channel. A TWA renders the
 * site in Chrome, and Chrome does not expose a JavaScript bridge to the app
 * hosting it — that is the point of it being a real browser. So every native
 * capability was reached by navigating to a {@code walletlens://} URL and
 * having an exported Activity catch it, which is a one-way, unacknowledged,
 * fire-and-forget channel with three standing costs:
 *
 * <ul>
 *   <li>Nothing can be returned. WidgetSyncActivity cannot report that it
 *       wrote; DataVaultActivity has to RELAUNCH the whole app to hand back a
 *       file it already had in memory.</li>
 *   <li>Chrome requires a user activation for an external protocol launch, so
 *       nothing could happen except during a tap. A background mirror, a
 *       periodic sync, a scheduled anything: all impossible.</li>
 *   <li>A top-frame navigation to {@code intent://} takes the Custom Tab off
 *       its own origin and ends the session — the app simply vanishes. Half of
 *       nativeBridge.js is scar tissue from that.</li>
 * </ul>
 *
 * <p>Inside a WebView the app owns the renderer, so a method call is a method
 * call. Everything above collapses into functions with return values.
 *
 * <h3>The trust boundary</h3>
 *
 * {@code @JavascriptInterface} exposes these methods to whatever JavaScript is
 * running in the WebView, so what may be reached from here is exactly what any
 * page loaded in it may do. The WebView is restricted to this app's own origin
 * (see AppShellActivity), and that restriction is the whole security model —
 * every method here assumes the caller is our own page.
 *
 * <p>Nothing here reaches the network, and nothing returns data belonging to
 * another app. The most sensitive thing exposed is the user's own portfolio,
 * to the page that already owns it.
 */
public class WalletLensBridge {

    /** The name JavaScript sees. Web side checks for window.AndroidBridge. */
    public static final String NAME = "AndroidBridge";

    /**
     * Weak, deliberately. The bridge is handed to a WebView which the Activity
     * owns, and a strong reference the other way is the classic WebView leak:
     * the Activity cannot be collected on rotation or finish because a
     * JavaScript object is still holding it.
     */
    private final WeakReference<Activity> host;

    WalletLensBridge(@NonNull Activity host) {
        this.host = new WeakReference<>(host);
    }

    @Nullable
    private Activity activity() {
        Activity a = host.get();
        return (a != null && !a.isFinishing() && !a.isDestroyed()) ? a : null;
    }

    // ── Identity ─────────────────────────────────────────────────────────

    /**
     * Whether the page is running inside the app, and which generation.
     *
     * <p>The web side has had to guess at this for its whole life —
     * isAndroidTWA() sniffs document.referrer and the user-agent, and one
     * wrong guess silently disabled the biometric onboarding, App Lock, the
     * widgets and the rating card at once, because all four are features that
     * are SUPPOSED to be absent off Android and so nothing errored.
     *
     * <p>The mere presence of this object answers it exactly. Version is
     * returned so the web can tell the WebView shell from the TWA and from a
     * plain browser without any sniffing at all.
     */
    @JavascriptInterface
    public String shellVersion() {
        return "webview-1";
    }

    // ── Storage ──────────────────────────────────────────────────────────

    /**
     * The portfolio copy held in the app's own files directory.
     *
     * <p>This is the migration off Chrome. A WebView cannot read what Chrome
     * stored for the same origin — different process, different sandbox — so
     * an app updating from the TWA build would otherwise start empty and
     * every user would lose everything. What it CAN read is the vault the TWA
     * build has been writing since 6.1, which lives in this package's own
     * directory and survives the switch untouched.
     *
     * @return a WL3 backup code, or an empty string when there is none
     */
    @JavascriptInterface
    public String readVault() {
        Activity a = activity();
        if (a == null) return "";
        String v = DataVaultActivity.read(a);
        return v != null ? v : "";
    }

    /**
     * Replace the stored copy.
     *
     * <p>Returns a boolean, which the intent version could not: the web app
     * can now show "saved" only when it actually was. And it needs no user
     * gesture, so the mirror can finally run when the data changes rather
     * than when the user happens to touch the screen.
     */
    @JavascriptInterface
    public boolean writeVault(String payload) {
        Activity a = activity();
        if (a == null) return false;
        return DataVaultActivity.write(a, payload);
    }

    // ── Notifications ────────────────────────────────────────────────────

    /**
     * The device's FCM registration token, or empty if it has none yet.
     *
     * <p>This is the address that replaces the Web Push endpoint. A WebView has
     * no service worker, so the subscription the server has addressed since the
     * Deno service does not exist here — but everything the server decides
     * ABOVE the transport, which is every channel and every gate in
     * workers/push/jobs.js, is untouched by the swap.
     */
    @JavascriptInterface
    public String pushToken() {
        Activity a = activity();
        if (a == null) return "";
        return WalletLensMessagingService.token(a);
    }

    /**
     * Whether the server already knows the token we are holding.
     *
     * <p>FCM rotates tokens on its own schedule — a restore to a new device, a
     * data clear, a token it decides is stale — and a rotated one is the FCM
     * equivalent of an expired Web Push endpoint: the server goes on sending to
     * an address nobody is at, and nothing fails loudly enough to notice. The
     * flag is cleared when a new token arrives, so the web app can tell a
     * device that needs re-registering from one that does not and avoid
     * re-POSTing the same address on every launch.
     */
    @JavascriptInterface
    public boolean pushTokenSynced() {
        Activity a = activity();
        return a != null && WalletLensMessagingService.tokenSynced(a);
    }

    /** Called once the web app has registered the token with the push worker. */
    @JavascriptInterface
    public void markPushTokenSynced() {
        Activity a = activity();
        if (a == null) return;
        WalletLensMessagingService.markTokenSynced(a);
    }

    /**
     * Ask FCM for a token if we have not got one.
     *
     * <p>onNewToken only fires when a token is created or rotated, so a device
     * that already had one before this code existed would never hear about it.
     */
    @JavascriptInterface
    public void ensurePushToken() {
        Activity a = activity();
        if (a == null) return;
        WalletLensMessagingService.ensureToken(a);
    }

    // ── Widgets and review ───────────────────────────────────────────────
    //
    // Still absent. Both are real moves off the intent plumbing and arrive with
    // the phase that does them; a method here calling a helper that does not
    // exist yet buys nothing except a file that will not compile.

    // ── App lock ─────────────────────────────────────────────────────────

    /** Whether the user has turned the app's own lock on. */
    @JavascriptInterface
    public boolean appLockEnabled() {
        Activity a = activity();
        return a != null && BiometricActivity.isEnabled(a);
    }

    /**
     * Turn the app lock on or off.
     *
     * <p>Under the TWA this was a walletlens:// intent, and answering it
     * relaunched the app — which threw first-run users back to onboarding
     * slide 1, because the toggle lives on slide 3 and completion is only
     * recorded on slide 4. A method call has no such failure mode.
     */
    @JavascriptInterface
    public void setAppLock(boolean enabled) {
        Activity a = activity();
        if (a == null) return;
        BiometricActivity.setEnabled(a, enabled);
    }
}
