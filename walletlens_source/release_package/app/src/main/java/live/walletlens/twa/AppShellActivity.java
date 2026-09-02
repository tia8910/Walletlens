package live.walletlens.twa;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.MimeTypeMap;

import java.util.ArrayList;
import java.util.List;
import android.widget.FrameLayout;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/**
 * The app rendering the site itself, instead of asking Chrome to.
 *
 * <h3>What this changes, and why it is the whole point</h3>
 *
 * As a Trusted Web Activity the app IS Chrome: the page runs in a Custom Tab
 * and every byte it stores lands in Chrome's sandbox for the walletlens.live
 * origin. Three consequences that users read as the app losing their data or
 * behaving unlike an app:
 *
 * <ul>
 *   <li>Chrome's "Clear browsing data" deletes the entire portfolio.</li>
 *   <li>This app's own Settings → Clear storage does nothing, because the
 *       portfolio was never in this app.</li>
 *   <li>Android's app backup never included any of it, since it only ever
 *       sees this package's own directory.</li>
 * </ul>
 *
 * <p>A WebView is owned by this process, so its DOM storage lives at
 * {@code /data/data/live.walletlens.twa/app_webview/}. All three of the above
 * invert: Chrome cannot touch it, Clear storage clears it, and app backup
 * covers it. That is the migration.
 *
 * <h3>What it costs, stated plainly</h3>
 *
 * A WebView has no service worker push, so the Web Push subscription the
 * server has addressed since the Deno service does not exist here and the
 * transport has to become FCM. Google also refuses OAuth in WebViews, so Drive
 * sign-in needs the system browser or an account-picker flow. Neither is
 * solved by this class; both are named here because a reader arriving at this
 * file deserves to know they are the bill.
 *
 * <h3>Existing users</h3>
 *
 * A WebView cannot read what Chrome stored — different process, different
 * sandbox — so on its own this would empty every installed device on the day
 * it shipped.
 *
 * <p>The vault is what carries them across: the app's own copy of the
 * portfolio, in the app's own files directory, which this can read and the web
 * app asks for through the bridge on first run.
 *
 * <p>But the vault only started being written in 6.2, and nobody is obliged to
 * install 6.2 before 6.3 — Play updates whatever is installed to whatever is
 * newest. An install coming straight from 6.1 reaches this class with an EMPTY
 * vault and a full portfolio sitting in Chrome, unreachable.
 *
 * <p>So the handoff below exists, and it is not a nicety: it is the only path
 * that data has. See {@link #maybeStartHandoff}.
 */
public class AppShellActivity extends ComponentActivity {

    private static final String TAG = "WalletLensShell";

    /** The one host this shell will render. Anything else goes to a browser. */
    static final String HOST = "walletlens.live";

    /** The origin the shell will render. Anything else goes to a real browser. */
    private static final String ORIGIN = "https://" + HOST;

    private static final String START_URL = ORIGIN + "/dashboard";

    /**
     * The page that mirrors Chrome's copy into the vault. Read by the web app,
     * which shows a single button rather than acting on a query parameter by
     * itself — the intent that writes the vault needs a user gesture, and a
     * migration that moves someone's portfolio should be something they saw.
     */
    private static final String HANDOFF_URL = ORIGIN + "/dashboard?wlhandoff=1";

    /**
     * What shows behind the status and navigation bars.
     *
     * The same colour the TWA used for its status bar (colorPrimary), so the
     * app looks the way it did before it started rendering itself.
     */
    private static final int BAR_COLOR = 0xFF071A0C;

    private static final String PREFS = "walletlens_shell";
    /** How many times the handoff has been offered. */
    private static final String KEY_HANDOFF_TRIES = "handoff_tries";
    /** Offered at most this many times, then never again. */
    private static final int HANDOFF_MAX_TRIES = 3;

    private WebView web;

    /**
     * The view that carries the inset padding.
     *
     * The padding goes on the ROOT, not on the WebView. A ViewGroup's padding
     * shrinks the area its children get, which is plain layout and cannot be
     * argued with; a WebView's padding is applied by the WebView to its own
     * content, and whether that survives a page with fixed-position elements
     * is a question about Chromium's internals. Two attempts at the second
     * mechanism changed nothing on a real device, so this uses the first.
     *
     * <p>The root also paints the brand colour, so the inset strips look like
     * the TWA's STATUS_BAR_COLOR rather than a transparent gap.
     */
    private ViewGroup shellRoot;

    /** onResume runs on every return to the app; the handoff must not. */
    private boolean handoffChecked;

    /**
     * How long the CURRENT session must have been on screen before the card
     * may appear.
     *
     * <p>This is only the "don't steal the launch" guard: a card drawn over a
     * cold start lands on a screen the user has not read yet, from an app they
     * were trying to open. It is deliberately short, because the real
     * eligibility test is {@link ReviewGate#MIN_FOREGROUND_MS} — lifetime
     * attention across launches — and holding BOTH thresholds at a minute
     * meant the daily twenty-second price-checkers, the most engaged users
     * this app has, could never be asked at all.
     *
     * <p>Nothing here screens on sentiment, which Play forbids; both numbers
     * are clocks, not opinions.
     */
    private static final long REVIEW_SETTLE_MS = 20_000L;

    /** Foreground milliseconds accumulated so far this launch. */
    private long foregroundMs;

    /** When the current foreground stretch began, or 0 while paused. */
    private long resumedAt;

    /** At most one rating ask per launch, however many times we resume. */
    private boolean reviewAsked;

    private Handler reviewTimer;

    /**
     * The page's pending <input type="file">, waiting on the system picker.
     *
     * A WebView does NOT open a file picker on its own. Tapping a file input
     * calls onShowFileChooser and, if the app does not answer it, absolutely
     * nothing happens — no picker, no error, no console message. That took out
     * screenshot import, CSV import and restoring from a backup file, which in
     * this app is most of the ways data gets in.
     */
    private ValueCallback<Uri[]> pendingFiles;

    /**
     * The page's pending getUserMedia, waiting on an Android permission.
     *
     * A WebView grants the page NOTHING on its own. When the page asks for the
     * microphone or camera the WebView calls onPermissionRequest, and an app
     * that does not answer it leaves the request denied — silently, with no
     * system prompt and no error the page can distinguish from a refusal.
     * Under the TWA this never came up: the page was in Chrome, and Chrome
     * held the permissions and raised its own dialogs.
     */
    private PermissionRequest pendingMedia;

    /** Which WebView resources the pending request would grant. */
    private String[] pendingMediaResources;

    /**
     * Registered as a field for the same reason the file picker is: after
     * STARTED it throws.
     */
    private final ActivityResultLauncher<String[]> mediaPermissions =
            registerForActivityResult(
                    new ActivityResultContracts.RequestMultiplePermissions(),
                    result -> {
                        boolean granted = !result.isEmpty();
                        for (Boolean ok : result.values()) {
                            if (ok == null || !ok) granted = false;
                        }
                        settleMedia(granted);
                    });

    /**
     * Registered as a field, deliberately.
     *
     * registerForActivityResult has to be called before the activity is
     * STARTED, and it throws if it is not. A field initialiser runs during
     * construction, which is always early enough; calling it from the tap that
     * needs it would crash the app.
     */
    private final ActivityResultLauncher<Intent> filePicker =
            registerForActivityResult(
                    new ActivityResultContracts.StartActivityForResult(),
                    result -> deliverFiles(result.getResultCode(), result.getData()));

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Painted before the page loads. A white flash on a dark app is the
        // most visible difference between a shell that feels native and one
        // that feels like a browser someone hid the chrome on.
        web.setBackgroundColor(Color.parseColor("#0d2015"));

        // The WebView sits inside a root that paints the bars' background, so
        // the inset strips are brand-coloured rather than transparent gaps.
        // See applyInsets for why any of this is needed.
        // Opt IN to edge-to-edge, explicitly, on every Android version.
        //
        // Counter-intuitive for a fix whose symptom was content UNDER the
        // status bar, and it is the point: an app targeting SDK 35+ is
        // edge-to-edge on Android 15 whether it asks or not, and is NOT on 14
        // and below. Two layouts, one of which the padding below corrects and
        // one of which it cannot, because the insets come back zero there.
        //
        // Asking for it everywhere collapses that into one case: the window
        // always spans the screen, the insets are always real, and the padding
        // is always what positions the page. One behaviour to reason about
        // instead of a version check.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BAR_COLOR);
        root.addView(web);
        shellRoot = root;
        setContentView(root);
        applyInsets(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);

        // The line this class exists for. Without it localStorage silently does
        // nothing in a WebView — writes appear to succeed and the store is
        // empty on the next load, which would look exactly like the data loss
        // this change is meant to end.
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);

        // The site is a PWA and ships its own service worker and cache
        // strategy; letting the WebView keep a second, dumber HTTP cache on top
        // of that is how a user ends up staring at a build from last week.
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        // Mixed content stays blocked. The site is HTTPS-only and this is a
        // default worth being explicit about, because the permissive setting is
        // the one every WebView tutorial reaches for.
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // The user agent keeps the site's own marker, so the web app can tell
        // this shell from a plain browser even before the bridge is reachable —
        // and, more usefully, so a server log can tell them apart at all.
        s.setUserAgentString(s.getUserAgentString() + " WalletLensApp/1");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);

        web.addJavascriptInterface(new WalletLensBridge(this), WalletLensBridge.NAME);
        web.setWebViewClient(new ShellClient());
        web.setWebChromeClient(new ShellChrome());
        // Check for updates on fresh launch, not just on resume.
        PlayUpdate.check(this);
        // Eagerly request the FCM token so the web layer can register
        // without waiting for the lazy ensurePushToken() call.  onNewToken
        // only fires on creation or rotation — a device that already had a
        // token before this code shipped would never hear about it otherwise.
        WalletLensMessagingService.ensureToken(this);

        if (savedInstanceState != null) {
            // Rotation and process death. Restoring beats reloading: a reload
            // would throw away the user's scroll position and any half-filled
            // form, which on this app can be a trade someone was mid-way
            // through entering.
            web.restoreState(savedInstanceState);
        } else {
            // A notification tap, a widget tap or a walletlens.live link opened
            // anywhere on the device arrives as the intent's data. Falling back
            // to the dashboard rather than trusting it blindly: ourUrl() is the
            // same origin check the WebViewClient enforces, applied before the
            // first load rather than only to navigations after it.
            web.loadUrl(ourUrl(getIntent()));
        }

        if (savedInstanceState == null) {
            // A cold start, not a rotation. ReviewGate counts launches and
            // stamps the install date off this call and nothing else; without
            // it the whole native rating gate reads zero for ever, which is
            // precisely how it spent months looking wired and doing nothing.
            ReviewGate.noteLaunch(this);
        }
    }

    /**
     * Keep the page out from under the status and navigation bars.
     *
     * <h3>Why this is not optional</h3>
     *
     * An app targeting SDK 35 or above is edge-to-edge and cannot opt out —
     * Android 15 removed the flag that used to turn it off. So the activity's
     * window covers the whole screen, status bar and gesture bar included, and
     * a WebView added to it renders underneath both. The top of the page is
     * simply behind the clock: the header, the search field and the settings
     * button are all drawn there and all unreachable.
     *
     * <p>The TWA never had this because it was not this app's window. Chrome
     * hosted the page and androidbrowserhelper told it what colour to paint the
     * bars, so the insets were somebody else's problem. Rendering the site
     * ourselves means inheriting that problem along with the storage.
     *
     * <p>Padding rather than fitsSystemWindows: the deprecated attribute
     * consumes insets in a way that stops working the moment a parent also
     * handles them, and it gives no control over what the strip looks like.
     * Padding the WebView leaves the root's brand colour showing behind the
     * bars, which is what the TWA's STATUS_BAR_COLOR did.
     *
     * <p>displayCutout is included with the system bars. A punch-hole or notch
     * in landscape sits beside the status bar, not within it, and a page padded
     * only for systemBars() still loses a strip of itself to the camera.
     */
    private void applyInsets(@NonNull View root) {
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        // Ask for a dispatch rather than assuming one is coming.
        //
        // setOnApplyWindowInsetsListener does NOT trigger one. If the window
        // has already dispatched its insets by the time this runs, the listener
        // sits there having never been called, the padding stays zero, and the
        // page renders under the status bar exactly as if none of this existed
        // — which is the shape of the bug that survived the first fix.
        ViewCompat.requestApplyInsets(root);

        // Light icons, because the strip behind them is the brand's dark green.
        // Left alone, the system picks from the old window background and draws
        // dark-on-dark — a status bar whose clock cannot be read.
        try {
            new WindowInsetsControllerCompat(getWindow(), root)
                    .setAppearanceLightStatusBars(false);
        } catch (Throwable e) {
            Log.w(TAG, "could not set status bar appearance: " + e);
        }
    }

    /** The URL an intent is asking for, if it is ours, else the dashboard. */
    private static String ourUrl(@Nullable Intent intent) {
        Uri url = intent != null ? intent.getData() : null;
        if (url != null && AppEntry.isOurs(url.toString())) return url.toString();
        return START_URL;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!handoffChecked) {
            handoffChecked = true;
            maybeStartHandoff();
        }
        // Whether a newer version is on Play. Day-gated inside, and silent on
        // an install that did not come from Play, so this is safe on every
        // resume — see PlayUpdate.
        PlayUpdate.check(this);

        resumedAt = SystemClock.elapsedRealtime();
        scheduleReviewCheck();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (resumedAt != 0) {
            long stretch = SystemClock.elapsedRealtime() - resumedAt;
            foregroundMs += stretch;
            // Into the lifetime total too: the gate's eligibility is attention
            // across launches, and a stretch that is not flushed here is a
            // stretch the next session cannot count.
            ReviewGate.noteForeground(this, stretch);
            resumedAt = 0;
        }
        // The card must never be started from the background: Android 10+
        // blocks a background activity launch outright, and on the versions
        // that would allow it, drawing a rating card over whatever the user
        // switched to is worse than not asking at all.
        if (reviewTimer != null) reviewTimer.removeCallbacksAndMessages(null);
    }

    // ── The rating card ─────────────────────────────────────────────────────

    /**
     * Arm the rating check for whatever is left of the dwell.
     *
     * <p>WHY THIS IS HERE AND NOT AT LAUNCH. {@link ReviewGate} was written for
     * the Trusted Web Activity, where the page ran in Chrome and this app had
     * no foreground activity of its own once it was up — so the only window
     * native code got was the instant before launch, and ReviewActivity grew a
     * whole hand-off path to give the launch back afterwards. None of that was
     * ever wired, and it no longer needs to be: this shell IS a foreground
     * activity for as long as the user is in the app, so the card can be shown
     * at a sensible moment instead of over a cold start.
     */
    private void scheduleReviewCheck() {
        if (reviewAsked) return;
        // Fire at whichever comes later: the settle guard for THIS session, or
        // the moment the lifetime total crosses the gate's threshold. Both are
        // measured in foreground time, so from a resume they both count down
        // in real time and one postDelayed covers the pair.
        long settleRemaining = REVIEW_SETTLE_MS - foregroundMs;
        long totalRemaining = ReviewGate.MIN_FOREGROUND_MS
                - (ReviewGate.foregroundTotal(this) + foregroundMs);
        long remaining = Math.max(0, Math.max(settleRemaining, totalRemaining));
        if (reviewTimer == null) reviewTimer = new Handler(getMainLooper());
        reviewTimer.removeCallbacksAndMessages(null);
        reviewTimer.postDelayed(this::maybeAskForReview, remaining);
    }

    /**
     * Show Play's rating card, if this launch has earned one.
     *
     * <p>{@link ReviewGate#markAsked} runs BEFORE the activity starts, on
     * purpose: a flow that crashes or is killed must not come back on the next
     * launch and every launch after it. When Play declines silently
     * ReviewActivity hands the ask back through rollbackAsk, so the ordering
     * costs nothing in the case it is there to guard.
     */
    private void maybeAskForReview() {
        if (reviewAsked || isFinishing() || isDestroyed()) return;

        // Flush the running stretch into the lifetime total before consulting
        // the gate, so shouldAsk() judges one authoritative number rather than
        // a stored total that is always one session behind. The stretch
        // restarts from now, which onPause's arithmetic then continues.
        if (resumedAt != 0) {
            long now = SystemClock.elapsedRealtime();
            long stretch = now - resumedAt;
            foregroundMs += stretch;
            ReviewGate.noteForeground(this, stretch);
            resumedAt = now;
        }

        if (!ReviewGate.shouldAsk(this)) return;

        reviewAsked = true;
        ReviewGate.markAsked(this);
        try {
            // No EXTRA_CONTINUE_TO_APP: the app is already open behind this
            // translucent activity, and asking it to reopen the launcher on the
            // way out would cold-start a second copy over the user's dashboard.
            Intent card = new Intent(this, ReviewActivity.class);
            card.putExtra(ReviewActivity.EXTRA_FROM_GATE, true);
            startActivity(card);
        } catch (Throwable t) {
            Log.w(TAG, "could not start the rating card: " + t);
            ReviewGate.rollbackAsk(this);
        }
    }

    // ── The handoff ─────────────────────────────────────────────────────────

    /**
     * Fetch the portfolio out of Chrome, once, on an install that has one.
     *
     * <p>THE PROBLEM. Until this version the app was a Trusted Web Activity, so
     * the portfolio lives in Chrome's storage for walletlens.live. This shell
     * cannot read a byte of it. The vault would carry it across, but the vault
     * has only been written since 6.2 and an install updating straight from 6.1
     * has an empty one. For those users the data is not lost — it is sitting in
     * Chrome, perfectly intact, on the other side of a sandbox boundary.
     *
     * <p>THE WAY ACROSS. Chrome can still be asked to open the page, and the
     * page running in Chrome still has that storage. So the app opens it once,
     * in a Custom Tab, on a URL the web app recognises. The page offers one
     * button; the button writes the whole portfolio into the vault through the
     * intent the TWA build already used; and the page then returns to
     * {@code walletlens://shell}, where {@link #onNewIntent} reloads and the
     * web app's seedFromVault() finds a full vault waiting.
     *
     * <p>EXTRA_REFERRER is load-bearing. The page decides whether it is allowed
     * to fire a native intent by looking for an {@code android-app://} referrer
     * from this package, which is the check that cannot be spoofed by a web
     * page. A Custom Tab launched without it looks like an ordinary browser tab
     * to the page, and the button would do nothing at all.
     *
     * <p>WHO SEES IT. Only an install that was UPDATED, never a fresh one:
     * a first install has nothing in Chrome to fetch, and sending a new user
     * out to a browser before they have seen the app would be the worst
     * possible first screen. Offered at most three times, counted before the
     * launch rather than after, so a user who dismisses it is asked again on a
     * later launch and nobody is asked for ever.
     */
    private void maybeStartHandoff() {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        int tries = p.getInt(KEY_HANDOFF_TRIES, 0);
        if (tries >= HANDOFF_MAX_TRIES) return;

        if (!isUpdatedInstall()) {
            // Nothing in Chrome to go and get. Close the door so a later update
            // of THIS install never offers it either.
            p.edit().putInt(KEY_HANDOFF_TRIES, HANDOFF_MAX_TRIES).apply();
            return;
        }

        String vault = DataVaultActivity.read(this);
        if (vault != null && !vault.isEmpty()) {
            // Already carried across — either by 6.2's mirroring or by an
            // earlier run of this.
            p.edit().putInt(KEY_HANDOFF_TRIES, HANDOFF_MAX_TRIES).apply();
            return;
        }

        // Counted BEFORE the launch. If the Custom Tab throws, or the user
        // dismisses it, or Chrome is not installed, the count still moved and
        // this cannot become a loop that reopens a browser on every launch.
        p.edit().putInt(KEY_HANDOFF_TRIES, tries + 1).apply();

        try {
            CustomTabsIntent tab = new CustomTabsIntent.Builder().setShowTitle(false).build();
            tab.intent.putExtra(Intent.EXTRA_REFERRER,
                    Uri.parse("android-app://" + getPackageName()));
            tab.launchUrl(this, Uri.parse(HANDOFF_URL));
        } catch (Throwable e) {
            // No browser at all is survivable: the app still works, it just
            // starts empty, and the user can restore from their own backup.
            Log.w(TAG, "could not open the handoff page: " + e);
        }
    }

    /**
     * Whether this install arrived as an update rather than a first install.
     *
     * <p>Play sets both timestamps on a first install and moves only the second
     * on an update, so they are equal exactly once in an install's life. A few
     * seconds of slack because the two are written by different steps of the
     * install and are not guaranteed to be the same millisecond.
     */
    private boolean isUpdatedInstall() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.lastUpdateTime - info.firstInstallTime > 10_000L;
        } catch (Throwable e) {
            // Unknown. Treated as an update, because offering the handoff to
            // someone who does not need it costs one dismissible screen, and
            // withholding it from someone who does costs their portfolio.
            return true;
        }
    }

    /**
     * A URL arriving from outside — the Google sign-in coming back.
     *
     * <p>The Drive flow leaves the app for a Custom Tab, because Google
     * refuses OAuth inside a WebView, and Google finishes it by redirecting to
     * https://walletlens.live/drive-callback with the token in the FRAGMENT.
     * That deep link comes back here, and loading it into the WebView is what
     * completes the sign-in: the page's own completeRedirectSignIn() reads the
     * fragment, checks the state parameter and stores the token, exactly as it
     * does in a browser. No native code touches the token.
     *
     * <p>Loading it into the SAME WebView is load-bearing. The state parameter
     * that makes this flow safe lives in sessionStorage, so a fresh WebView —
     * or a reload — would come back to a token it could not verify and the
     * sign-in would fail with a state mismatch. singleTask plus onNewIntent is
     * what keeps one WebView alive across the trip out to the browser.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);

        Uri url = intent != null ? intent.getData() : null;
        if (url == null || web == null) return;

        // The handoff coming back. The page in Chrome has written the vault and
        // sent us here; reloading is what makes the web app run seedFromVault()
        // again, this time against a vault that has something in it.
        if ("walletlens".equals(url.getScheme())) {
            if ("shell".equals(url.getHost())) web.loadUrl(START_URL);
            return;
        }

        if (!ORIGIN.equals(url.getScheme() + "://" + url.getHost())) {
            Log.w(TAG, "ignoring an inbound URL that is not ours");
            return;
        }
        web.loadUrl(url.toString());
    }

    /**
     * Keep our own origin inside the shell, and send everything else out.
     *
     * <p>This is the security boundary the JavaScript bridge depends on.
     * {@code @JavascriptInterface} exposes the bridge to whatever page the
     * WebView is showing, so if an outside link could load here, that page
     * would be able to read the user's portfolio out of the vault. Everything
     * that is not our origin leaves for a real browser, where it has no bridge
     * and no access.
     */
    private class ShellClient extends WebViewClient {
        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            // Last chance to notice the insets never arrived. By now the page
            // is on screen, so if the padding is still zero it is not going to
            // be set by anything else.
            ensureTopInset();
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (url == null) return false;
            if (ORIGIN.equals(url.getScheme() + "://" + url.getHost())) {
                return false;   // ours: render it here
            }

            // Anything that is not the web goes straight to Android.
            //
            // THIS IS WHY APP LOCK STOPPED WORKING. The page reaches native
            // code by navigating to walletlens://, and every one of those was
            // being handed to a Custom Tab below — a Custom Tab is a BROWSER,
            // and a browser cannot open a walletlens:// scheme. So enabling
            // the fingerprint lock in onboarding fired an intent that went to
            // Chrome and died there, and the same was true of the review
            // prompt, the export and the vault save. Nothing errored: the page
            // fires these and never expects an answer.
            String scheme = url.getScheme();
            if (!"http".equals(scheme) && !"https".equals(scheme)) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Throwable e) {
                    Log.w(TAG, "nothing handles " + scheme + "://: " + e);
                }
                return true;
            }

            // A Custom Tab rather than a browser intent, for http(s) only. Two
            // reasons, and the
            // second is the one that matters: it keeps the user inside the app
            // visually, and Google's sign-in — which is the outbound
            // navigation that actually matters here — is ACCEPTED in a Custom
            // Tab and refused in a WebView. Handing it to a separate browser
            // app instead would complete the OAuth flow somewhere this app can
            // never hear the answer from.
            try {
                new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(
                        AppShellActivity.this, url);
            } catch (Throwable e) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Throwable e2) {
                    Log.w(TAG, "no handler for outbound link: " + url);
                }
            }
            return true;
        }
    }

    /**
     * Everything the page asks the browser UI for: file inputs, and the
     * microphone and camera.
     */
    private class ShellChrome extends WebChromeClient {

        /**
         * The page wants hardware. Ask Android first, then answer the page.
         *
         * <p>Answering is not optional. An unanswered request is a denied one,
         * and the page cannot tell that apart from a user saying no — which is
         * exactly what voice import reported ("Microphone permission denied")
         * on a device where no prompt had ever appeared.
         */
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            List<String> android = new ArrayList<>();
            List<String> resources = new ArrayList<>();
            for (String r : request.getResources()) {
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
                    android.add(Manifest.permission.RECORD_AUDIO);
                    resources.add(r);
                } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) {
                    android.add(Manifest.permission.CAMERA);
                    resources.add(r);
                }
            }

            // Anything else — MIDI, protected media — is refused rather than
            // passed through. The page only ever asks for the two above, and a
            // request for something else did not come from our own code.
            if (resources.isEmpty()) {
                request.deny();
                return;
            }

            List<String> missing = new ArrayList<>();
            for (String p : android) {
                if (ContextCompat.checkSelfPermission(AppShellActivity.this, p)
                        != PackageManager.PERMISSION_GRANTED) {
                    missing.add(p);
                }
            }

            if (missing.isEmpty()) {
                request.grant(resources.toArray(new String[0]));
                return;
            }

            // One at a time. A second request while a dialog is up would lose
            // the first, and the page behind it would wait for ever.
            if (pendingMedia != null) pendingMedia.deny();
            pendingMedia = request;
            pendingMediaResources = resources.toArray(new String[0]);

            try {
                mediaPermissions.launch(missing.toArray(new String[0]));
            } catch (Throwable e) {
                Log.w(TAG, "could not ask for " + missing + ": " + e);
                settleMedia(false);
            }
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            // The page gave up — a navigation, or the element went away.
            if (pendingMedia == request) {
                pendingMedia = null;
                pendingMediaResources = null;
            }
        }

        @Override
        public boolean onShowFileChooser(WebView view,
                                         ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            // A second tap while a picker is already open. The old callback
            // must be answered or the page's input stays disabled for ever.
            if (pendingFiles != null) pendingFiles.onReceiveValue(null);
            pendingFiles = callback;

            try {
                filePicker.launch(buildFileIntent(params));
                return true;
            } catch (Throwable e) {
                Log.w(TAG, "no file picker available: " + e);
                pendingFiles = null;
                // false hands the input back to the WebView, which does nothing
                // with it — but it leaves the control usable rather than stuck
                // waiting on a callback that will never be answered.
                return false;
            }
        }
    }

    /**
     * Ask for the microphone directly, for an API that never asks us.
     *
     * <p>onPermissionRequest covers getUserMedia. It does NOT cover
     * SpeechRecognition: Chromium's WebView checks the app's own RECORD_AUDIO
     * and fails the recognition with "not-allowed" without ever consulting the
     * app — which is precisely what voice import hit, reporting a denied
     * microphone on a device that had never been asked. So the page asks for
     * this one through the bridge before it starts listening.
     */
    void requestMic() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            mediaPermissions.launch(new String[]{ Manifest.permission.RECORD_AUDIO });
        } catch (Throwable e) {
            Log.w(TAG, "could not ask for the microphone: " + e);
        }
    }

    /** Whether the app may record audio at all. */
    boolean micAllowed() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Pad the top from the system's own dimension when the insets never came.
     *
     * <h3>Why a fallback exists at all</h3>
     *
     * The listener above is the correct mechanism and it has now failed to fix
     * this twice on a real device, for reasons this code cannot see from here:
     * a dispatch that never happens, an OEM window that reports zero, a
     * WebView that resets its own padding. Each is plausible and none is
     * diagnosable without the phone in hand.
     *
     * <p>So this asks the platform how tall the status bar is and uses that.
     * It is cruder — the value ignores cutouts and does not change with
     * rotation — but it is a number every Android device has had for fifteen
     * years, and a page an inch too low beats a page with its header
     * underneath the clock.
     *
     * <p>TOP ONLY. navigation_bar_height reports a full bar even on a device
     * using gesture navigation, where the real inset is a thin handle, so
     * applying it would carve dead space out of the bottom of every screen.
     * The listener handles the bottom correctly when it runs, and when it does
     * not, nothing there is being cropped.
     *
     * <p>Does nothing once the listener has set a padding — that path is
     * better in every way, and this only exists for when it did not happen.
     */
    private void ensureTopInset() {
        if (shellRoot == null || shellRoot.getPaddingTop() > 0) return;
        int top = systemDimen("status_bar_height");
        if (top <= 0) return;
        Log.w(TAG, "window insets never arrived; padding " + top + "px from resources");
        shellRoot.setPadding(shellRoot.getPaddingLeft(), top,
                shellRoot.getPaddingRight(), shellRoot.getPaddingBottom());
    }

    /** A framework dimension by name, or 0 when this platform has no such thing. */
    private int systemDimen(@NonNull String name) {
        try {
            int id = getResources().getIdentifier(name, "dimen", "android");
            return id > 0 ? getResources().getDimensionPixelSize(id) : 0;
        } catch (Throwable e) {
            return 0;
        }
    }

    /**
     * The intent to open for a file input.
     *
     * <p>NOT params.createIntent(), which this used and which fails two ways.
     *
     * <p>It returns ACTION_GET_CONTENT, and some pickers answer that with a
     * {@code file://} URI. A WebView cannot read one: setAllowFileAccess
     * defaults to FALSE from API 30, so the page receives a File it cannot
     * read and the import fails with nothing to point at.
     * ACTION_OPEN_DOCUMENT always returns a readable {@code content://} URI,
     * which is the whole reason the Storage Access Framework exists.
     *
     * <p>And it cannot map an {@code accept} written as file EXTENSIONS. This
     * app's spreadsheet input asks for ".xlsx,.xls,.csv", so the chooser opened
     * on a type no app claims and listed nothing. Extensions are resolved to
     * MIME types here, and anything unresolvable widens to the catch-all rather
     * than narrowing to a type that matches nothing.
     */
    @NonNull
    private Intent buildFileIntent(@NonNull WebChromeClient.FileChooserParams params) {
        List<String> mimes = new ArrayList<>();
        boolean unknown = false;

        String[] accepts = params.getAcceptTypes();
        for (String accept : accepts != null ? accepts : new String[0]) {
            if (accept == null) continue;
            String a = accept.trim();
            if (a.isEmpty()) continue;
            if (a.startsWith(".")) {
                String mime = MimeTypeMap.getSingleton()
                        .getMimeTypeFromExtension(a.substring(1).toLowerCase());
                if (mime != null) mimes.add(mime);
                else unknown = true;      // e.g. .xls on an older map
            } else if (a.contains("/")) {
                mimes.add(a);
            } else {
                unknown = true;
            }
        }

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // A single type as setType, several as EXTRA_MIME_TYPES with the
        // catch-all — that is the pairing SAF expects, and setting only the
        // extra without a type shows nothing on some devices.
        if (unknown || mimes.isEmpty()) {
            intent.setType("*/*");
        } else if (mimes.size() == 1) {
            intent.setType(mimes.get(0));
        } else {
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
        }

        if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        return intent;
    }

    /**
     * Answer the page now that Android has answered us.
     *
     * <p>Answered on every path, refusal included: a WebView left holding an
     * unanswered PermissionRequest never resolves the page's promise, so the
     * microphone button would spin for ever rather than reporting a refusal.
     */
    private void settleMedia(boolean granted) {
        PermissionRequest req = pendingMedia;
        String[] resources = pendingMediaResources;
        pendingMedia = null;
        pendingMediaResources = null;
        if (req == null) return;
        try {
            if (granted && resources != null) req.grant(resources);
            else req.deny();
        } catch (Throwable e) {
            Log.w(TAG, "could not answer the page's permission request: " + e);
        }
    }

    /**
     * Hand the picked files back to the page.
     *
     * The callback must be answered on EVERY path, cancellation included.
     * A WebView that never hears back leaves the file input permanently inert:
     * the user taps it again and nothing happens, for the rest of the session.
     */
    private void deliverFiles(int resultCode, @Nullable Intent data) {
        ValueCallback<Uri[]> cb = pendingFiles;
        pendingFiles = null;
        if (cb == null) return;
        cb.onReceiveValue(
                resultCode == RESULT_OK
                        ? WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                        : null);
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        // Back means "back a page" while there is one, which is what a browser
        // does and what the TWA did. Only when the history is exhausted does it
        // mean "leave the app".
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (reviewTimer != null) reviewTimer.removeCallbacksAndMessages(null);
        // A WebView outliving its Activity is the classic leak in this file's
        // shape. Detach it from the view tree before destroying, or the
        // destroy itself can throw on some OEM builds.
        if (web != null) {
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
