package live.walletlens.twa;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

import androidx.browser.customtabs.CustomTabsIntent;

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

    private static final String TAG = "WalletLensBridge";

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

    // ── Push registration ─────────────────────────────────────────────────

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
    // ── Files out ────────────────────────────────────────────────────────
    //
    // WHY THE PAGE CANNOT DO THIS ITSELF
    //
    // In a browser the app saves a file by making a blob URL and clicking an
    // <a download>, and shares one with navigator.share. A WebView implements
    // NEITHER. The anchor click is inert — no download, no error — and
    // navigator.share is undefined. So the backup export, the QR image, the
    // portfolio PNG and every share button became silent no-ops the moment the
    // app stopped being Chrome, on the one platform where "export your data"
    // is the promise this app makes about privacy.
    //
    // The page hands the bytes over as base64 instead. Not elegant, and it
    // costs a third in size, but it is the only representation that survives
    // the JavascriptInterface boundary, which passes strings and nothing else.

    /** Anything above this is refused rather than risking an OOM on the hop. */
    private static final int MAX_FILE_BYTES = 12 * 1024 * 1024;

    /**
     * Save a file to the device's Downloads folder.
     *
     * <p>MediaStore on Android 10 and up, because scoped storage makes writing
     * to the public Downloads directory by path fail there — which is exactly
     * what DataExportActivity still does, and why exporting has been quietly
     * failing on every modern phone.
     *
     * @return true if it was written
     */
    @JavascriptInterface
    public boolean saveFile(String name, String mimeType, String base64) {
        Activity a = activity();
        if (a == null) return false;

        byte[] bytes = decode(base64);
        if (bytes == null) return false;

        String safe = safeName(name);
        String mime = (mimeType == null || mimeType.isEmpty()) ? "application/octet-stream" : mimeType;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri item = a.getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (item == null) return false;
                try (OutputStream out = a.getContentResolver().openOutputStream(item)) {
                    if (out == null) return false;
                    out.write(bytes);
                }
                v.clear();
                v.put(MediaStore.Downloads.IS_PENDING, 0);
                a.getContentResolver().update(item, v, null, null);
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists() && !dir.mkdirs()) return false;
                try (FileOutputStream out = new FileOutputStream(new File(dir, safe))) {
                    out.write(bytes);
                }
            }
        } catch (Throwable e) {
            Log.w(TAG, "could not save " + safe + ": " + e);
            return false;
        }

        // The page cannot show a system-level confirmation and a file that
        // lands silently in Downloads reads as nothing having happened.
        try { a.runOnUiThread(() -> Toast.makeText(a, "Saved to Downloads: " + safe, Toast.LENGTH_LONG).show()); }
        catch (Throwable ignored) { }
        return true;
    }

    /**
     * Hand a file to the Android share sheet.
     *
     * <p>Written to the app's cache and shared through the FileProvider the
     * manifest already declares: a file:// URI would throw FileUriExposedException
     * on anything since Android 7, and granting read permission on a content://
     * URI is the only way another app can open it.
     */
    @JavascriptInterface
    public boolean shareFile(String name, String mimeType, String base64, String text) {
        Activity a = activity();
        if (a == null) return false;

        byte[] bytes = decode(base64);
        if (bytes == null) return false;

        try {
            File dir = new File(a.getCacheDir(), "share");
            if (!dir.exists() && !dir.mkdirs()) return false;
            File f = new File(dir, safeName(name));
            try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }

            Uri uri = FileProvider.getUriForFile(a, a.getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType((mimeType == null || mimeType.isEmpty()) ? "*/*" : mimeType);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            a.startActivity(Intent.createChooser(send, null));
            return true;
        } catch (Throwable e) {
            Log.w(TAG, "could not share " + name + ": " + e);
            return false;
        }
    }

    /** Share plain text, with no file. */
    @JavascriptInterface
    public boolean shareText(String text, String title) {
        Activity a = activity();
        if (a == null || text == null || text.isEmpty()) return false;
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text);
            if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
            a.startActivity(Intent.createChooser(send, null));
            return true;
        } catch (Throwable e) {
            Log.w(TAG, "could not share text: " + e);
            return false;
        }
    }

    @Nullable
    private static byte[] decode(String base64) {
        if (base64 == null || base64.isEmpty()) return null;
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > MAX_FILE_BYTES) return null;
            return bytes;
        } catch (Throwable e) {
            return null;
        }
    }

    /**
     * A filename that cannot escape the directory it is meant for.
     *
     * The name comes from the page. A separator in it would make the write
     * land somewhere else entirely, and "../" repeated enough times reaches
     * anywhere this process can write.
     */
    @NonNull
    private static String safeName(@Nullable String name) {
        String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        while (n.startsWith(".")) n = n.substring(1);
        if (n.isEmpty()) n = "walletlens-export";
        return n.length() > 100 ? n.substring(n.length() - 100) : n;
    }

    /**
     * Raise the fingerprint prompt to UNLOCK the app.
     *
     * <p>The old path delivered its result by relaunching the app with
     * ?biometric_auth=success on the URL — an intent needing a live user
     * activation, a top-frame navigation, and a cold start that had to carry
     * the parameter through. Any one of those failing leaves the user staring
     * at a lock screen that will not open, which is the worst failure this app
     * has: the portfolio is right there and unreachable.
     *
     * <p>Nothing is delivered now. The activity writes its unlock timestamp
     * where isSessionValid already reads it, and the page polls
     * {@link #appUnlocked()}.
     */
    @JavascriptInterface
    public void promptAppUnlock() {
        Activity a = activity();
        if (a == null) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("walletlens://biometric-auth?action=unlock&noredirect=1"));
            i.setClass(a, BiometricActivity.class);
            a.startActivity(i);
        } catch (Throwable e) {
            Log.w(TAG, "could not raise the unlock prompt: " + e);
        }
    }

    /** Whether the app is inside a valid unlocked session. */
    @JavascriptInterface
    public boolean appUnlocked() {
        Activity a = activity();
        return a != null && BiometricActivity.isSessionValid(a);
    }

    /**
     * Ask Play to show its in-app review card.
     *
     * <p>Directly, for the same reason promptAppLock is: the intent path went
     * out through a hidden iframe and needed a live user activation, and both
     * of those fail without saying so. The review prompt is the worst place
     * for a silent failure — nothing about it is visible even when it works,
     * because Play declines to show the card more often than not, so a
     * dropped intent and a spent quota look identical from here.
     *
     * @param source        which rule earned the ask, for logcat
     * @param fallbackStore open the store listing if Play shows nothing —
     *                      true only when the user went looking for it
     */
    /**
     * What Play did the last time it was asked, and who installed this build.
     *
     * <p>The in-app review card is invisible when it works and invisible when
     * it fails — Play returns success either way and never says whether it drew
     * anything. So "it still doesn't appear" has been unanswerable from the
     * outside for three rounds. This is the answer: the raw outcome string, and
     * the installing package, which decides whether a card was ever possible.
     */
    @JavascriptInterface
    public String reviewStatus() {
        Activity a = activity();
        if (a == null) return "{}";
        try {
            return "{\"installer\":\"" + ReviewGate.installer(a)
                    + "\",\"outcome\":\"" + ReviewGate.lastOutcome(a)
                    + "\",\"at\":" + ReviewGate.lastOutcomeAt(a) + "}";
        } catch (Throwable e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void requestReview(String source, boolean fallbackStore) {
        Activity a = activity();
        if (a == null) return;
        try {
            String url = "walletlens://review?source="
                    + Uri.encode(source == null || source.isEmpty() ? "unknown" : source)
                    + (fallbackStore ? "&fallback=store" : "");
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.setClass(a, ReviewActivity.class);
            a.startActivity(i);
        } catch (Throwable e) {
            Log.w(TAG, "could not ask for a review: " + e);
        }
    }

    /**
     * Raise the fingerprint prompt to turn App Lock on.
     *
     * <p>Directly, not through walletlens://. The intent path has three ways to
     * fail silently and it was hitting at least one of them: fireNativeIntent
     * refuses without a live user activation, the navigation moves the top
     * frame, and the URL has to survive the shell's scheme routing. None of
     * that is needed here — this is a method call — and all three were
     * invisible when they failed, which is how "Enable" came to sit on
     * "Setting up…" waiting for a prompt that was never asked for.
     *
     * <p>The activity writes the preference itself once the prompt is passed,
     * so a refused or cancelled prompt leaves the lock off. Callers poll
     * appLockEnabled().
     */
    @JavascriptInterface
    public void promptAppLock() {
        Activity a = activity();
        if (a == null) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("walletlens://biometric-auth?action=enable"));
            i.setClass(a, BiometricActivity.class);
            a.startActivity(i);
        } catch (Throwable e) {
            Log.w(TAG, "could not raise the App Lock prompt: " + e);
        }
    }

    // ── Microphone ───────────────────────────────────────────────────────

    /** Whether the app may record audio. */
    @JavascriptInterface
    public boolean micAllowed() {
        Activity a = activity();
        return a instanceof AppShellActivity && ((AppShellActivity) a).micAllowed();
    }

    /**
     * Ask for the microphone, for the page's speech recognition.
     *
     * <p>getUserMedia raises onPermissionRequest and the shell answers it.
     * SpeechRecognition does not: Chromium's WebView checks this app's own
     * RECORD_AUDIO and fails with "not-allowed" without consulting the app, so
     * the page has to ask for it before it starts listening. Fire-and-forget —
     * the answer lands in the app's permission state, not in a return value.
     */
    @JavascriptInterface
    public void requestMic() {
        Activity a = activity();
        if (a instanceof AppShellActivity) ((AppShellActivity) a).requestMic();
    }

    // ── Notifications ────────────────────────────────────────────────────

    /**
     * Post a notification the page raised itself.
     *
     * <p>These are the in-app alerts — a watchlist target crossed while the app
     * is open, a Smart Alert firing — as distinct from push, which is what
     * reaches a closed phone. The page used to raise them through the service
     * worker registration, and the shell has no service worker and no
     * Notification API at all, so every one of them became a silent no-op the
     * moment the app stopped being Chrome.
     *
     * <p>The quiet channel: an alert about a screen the user is already looking
     * at does not need to buzz.
     */
    @JavascriptInterface
    public void showLocalNotification(String title, String body, String url) {
        Activity a = activity();
        if (a == null) return;
        if (title == null || title.isEmpty()) return;
        try {
            NotificationHelper helper = new NotificationHelper(a);
            helper.createChannels();
            helper.showNotification(
                    title,
                    body != null ? body : "",
                    AppEntry.isOurs(url) ? url : null,
                    null);
        } catch (Throwable e) {
            Log.w(TAG, "could not show a local notification: " + e);
        }
    }

    /**
     * Whether Android will let this app post a notification.
     *
     * <p>Not the same question as the web {@code Notification.permission},
     * which is what the app used to ask. Under the TWA the page ran in Chrome,
     * so a Web Push subscription and a browser permission were exactly the
     * right things to want. In this shell there is no service worker and no Web
     * Push; notifications arrive over FCM and are posted by this app, so the
     * only permission that decides anything is Android's own.
     *
     * <p>Below Android 13 there is no runtime permission at all and the answer
     * is yes.
     */
    @JavascriptInterface
    public boolean notificationsAllowed() {
        Activity a = activity();
        if (a == null) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Whether the system will still show a notification permission dialog.
     *
     * <p>THE PROBLEM THIS SOLVES. On Android 13 and up the system stops showing
     * the dialog after the user has refused twice: requestPermissions returns
     * immediately, having displayed nothing. The web layer could not tell that
     * apart from a dialog the user had not answered yet, so it fired the
     * request, waited thirty seconds for an answer that was never coming, and
     * then counted a failed ask — spending one of the three the primer allows
     * and putting a week's cooldown on the next. From the user's side: tapping
     * Enable did nothing, and the app then stopped asking.
     *
     * <p>shouldShowRequestPermissionRationale cannot answer this alone. It is
     * false in two OPPOSITE situations — never asked, and asked twice and
     * refused — which is why the gate records that it asked.
     *
     * @return "granted", "can-ask", or "blocked"
     */
    @JavascriptInterface
    public String notificationAskState() {
        Activity a = activity();
        if (a == null) return "blocked";
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "granted";
        if (ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return "granted";
        }
        // Never asked: the first dialog always appears.
        if (!NotificationPermissionActivity.hasAsked(a)) return "can-ask";
        // Refused once: Android shows it again, with a rationale expected.
        if (a.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
            return "can-ask";
        }
        return "blocked";
    }

    /**
     * Open this app's notification settings.
     *
     * <p>The only route left once the system has stopped showing the dialog.
     * Offering it beats a button that silently does nothing, which is what the
     * user was getting.
     */
    @JavascriptInterface
    public boolean openNotificationSettings() {
        Activity a = activity();
        if (a == null) return false;
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, a.getPackageName());
            a.startActivity(i);
            return true;
        } catch (Throwable e) {
            // Not every OEM ships that screen. The app's own details page is
            // always there and is one tap from the same toggle.
            try {
                a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", a.getPackageName(), null)));
                return true;
            } catch (Throwable e2) {
                Log.w(TAG, "could not open notification settings: " + e2);
                return false;
            }
        }
    }

    /**
     * Ask for notification permission, once, at the moment the user asks for
     * notifications.
     *
     * <p>THE BUG THIS ENDS. The app asked twice. The web layer called
     * {@code Notification.requestPermission()} and Chrome showed its dialog;
     * then the native gate asked for POST_NOTIFICATIONS and Android showed
     * another. Two dialogs, different wording, for one decision — and in the
     * shell the first of them grants something unusable, because a WebView
     * cannot receive Web Push however the user answers it.
     *
     * <p>So the web layer stops asking and calls this instead. One dialog, the
     * system one, for the permission that actually governs whether a
     * notification appears.
     *
     * <p>Routed through NotificationPermissionActivity rather than requested
     * here: {@code registerForActivityResult} has to be registered before the
     * host activity is STARTED, and the shell's host is long since resumed by
     * the time a user touches a toggle. That gate activity exists for precisely
     * this and already handles the case where the permission is already held.
     */
    @JavascriptInterface
    public void requestNotificationPermission() {
        Activity a = activity();
        if (a == null) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("walletlens://notification-permission"));
            i.setClass(a, NotificationPermissionActivity.class);
            a.startActivity(i);
        } catch (Throwable e) {
            Log.w(TAG, "could not ask for notification permission: " + e);
        }
    }

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

    // ── Signing in to Google ─────────────────────────────────────────────

    /**
     * Open a URL in a real browser tab, outside the WebView.
     *
     * <p>This exists for one reason: Google refuses OAuth inside an embedded
     * WebView. Navigating to accounts.google.com from here does not fail
     * subtly — it returns a page reading {@code disallowed_useragent},
     * deliberately, to stop an app being able to watch its users type a Google
     * password into a view that app controls. That is a rule worth having, and
     * the answer is not to fight it.
     *
     * <p>A Custom Tab is the answer. It IS the user's browser — same process,
     * same cookie jar, same password manager, and this app cannot see inside
     * it — so Google accepts it, while the user stays visually inside the app
     * instead of being thrown out to a separate task.
     *
     * <p>Falls back to a plain browser intent when no Custom Tabs provider is
     * installed. Uglier, still correct.
     */
    @JavascriptInterface
    public boolean openExternal(String url) {
        Activity a = activity();
        if (a == null) return false;

        // https only. This method is reachable from any JavaScript running in
        // the WebView, and "open anything, anywhere" is a wider door than it
        // needs to be — an intent:// or file:// here would be a way out of the
        // sandbox rather than a way to a login page.
        if (url == null || !url.startsWith("https://")) return false;

        final Uri uri;
        try {
            uri = Uri.parse(url);
        } catch (Throwable e) {
            return false;
        }

        a.runOnUiThread(() -> {
            try {
                new CustomTabsIntent.Builder()
                        .setShowTitle(true)
                        .build()
                        .launchUrl(a, uri);
            } catch (Throwable e) {
                Log.w(TAG, "no custom tabs provider; falling back to a browser: " + e);
                try {
                    a.startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Throwable e2) {
                    Log.w(TAG, "no browser at all: " + e2);
                }
            }
        });
        return true;
    }

    // ── Widgets ──────────────────────────────────────────────────────────

    /**
     * Repaint the home-screen widgets from a portfolio summary.
     *
     * <p>The same payload WidgetSyncActivity has always taken, on a channel
     * that can actually carry it. Through the intent this returned nothing, so
     * the web app could never tell a written widget from a dropped one; and it
     * needed a user gesture, so the five-minute background sync was skipped
     * whenever nobody happened to be touching the screen — which is most of
     * the time a widget is looked at.
     *
     * @param json the summary; see WidgetSyncActivity for the shape
     * @return whether the widgets were repainted
     */
    @JavascriptInterface
    public boolean syncWidgets(String json) {
        Activity a = activity();
        if (a == null || json == null || json.isEmpty()) return false;
        try {
            WidgetSyncActivity.applyPayload(a, json);
            return true;
        } catch (Throwable e) {
            Log.w(TAG, "widget sync failed: " + e);
            return false;
        }
    }
}
