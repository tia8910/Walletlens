package live.walletlens.twa;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.ComponentActivity;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

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
 * sandbox — so on its own this would empty every installed device. It does not,
 * because the TWA build has been mirroring the portfolio into this app's own
 * files directory since 6.1, and that file is right where this can reach it.
 * The web app asks for it through the bridge on first run. The vault was built
 * as a safety net; it turns out to be the bridge across this change, which is
 * why 6.1 has to be widely installed before this ships.
 */
public class AppShellActivity extends ComponentActivity {

    private static final String TAG = "WalletLensShell";

    /** The origin the shell will render. Anything else goes to a real browser. */
    private static final String ORIGIN = "https://walletlens.live";

    private static final String START_URL = ORIGIN + "/dashboard";

    private WebView web;

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
        setContentView(web);

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

        if (savedInstanceState != null) {
            // Rotation and process death. Restoring beats reloading: a reload
            // would throw away the user's scroll position and any half-filled
            // form, which on this app can be a trade someone was mid-way
            // through entering.
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START_URL);
        }
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
            if (url != null && ORIGIN.equals(url.getScheme() + "://" + url.getHost())) {
                return false;   // ours: render it here
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (Throwable e) {
                Log.w(TAG, "no handler for outbound link: " + url);
            }
            return true;
        }
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
