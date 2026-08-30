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
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;

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

    /** onResume runs on every return to the app; the handoff must not. */
    private boolean handoffChecked;

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
        web.setBackgroundColor(Color.parseColor("#0b0f1a"));

        // The WebView sits inside a root that paints the bars' background, so
        // the inset strips are brand-coloured rather than transparent gaps.
        // See applyInsets for why any of this is needed.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BAR_COLOR);
        root.addView(web);
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
            if (web != null) web.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

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
                filePicker.launch(params.createIntent());
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
