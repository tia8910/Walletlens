package live.walletlens.twa;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

/**
 * Where the app opens.
 *
 * <h3>Why this exists</h3>
 *
 * Ten places built an Intent for the old {@code LauncherActivity} by name — every
 * widget's tap target, the notification tap, the biometric unlock's hand-back,
 * the crash screen's "reopen", the review prompt, the vault restore. Each was
 * correct in isolation and collectively they were a decision about what this
 * app IS, written down ten times and impossible to change in one place.
 *
 * <p>It became one place the moment the answer changed. The app used to open
 * a Trusted Web Activity, which is Chrome rendering the site; it now opens
 * {@link AppShellActivity}, which is the app rendering the site itself. A
 * notification that still pointed at the TWA would open Chrome — address bar
 * and all — from inside an app that had just stopped being a browser, and it
 * would do it only for whichever of the ten paths someone forgot.
 */
final class AppEntry {

    private AppEntry() {}

    /** The activity the app opens into. The one fact this class holds. */
    static final Class<?> ACTIVITY = AppShellActivity.class;

    /** Open the app at wherever it was. */
    @NonNull
    static Intent home(@NonNull Context context) {
        Intent i = new Intent(context, ACTIVITY);
        // NEW_TASK because most callers are not Activities — a widget's
        // PendingIntent, a notification's, a broadcast receiver's. CLEAR_TOP so
        // a second tap lands on the instance that is already running rather
        // than stacking a card in recents for every notification ever tapped.
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return i;
    }

    /**
     * Open the app at a specific page.
     *
     * <p>The URL is carried as the intent's data, which is what the shell
     * reads. A URL that is not ours is dropped rather than passed on: these
     * intents are built from payloads that arrived over the network, and the
     * shell is the one context in this app where a page can reach the bridge.
     * The check is repeated inside the shell — this one keeps a bad URL from
     * ever being written into a PendingIntent that outlives the check.
     */
    @NonNull
    static Intent deepLink(@NonNull Context context, @Nullable String url) {
        Intent i = home(context);
        if (url != null && !url.isEmpty() && isOurs(url)) i.setData(Uri.parse(url));
        return i;
    }

    /** Whether a URL belongs to the site this app renders. */
    static boolean isOurs(@Nullable String url) {
        if (url == null) return false;
        try {
            Uri u = Uri.parse(url);
            return "https".equals(u.getScheme()) && AppShellActivity.HOST.equals(u.getHost());
        } catch (Throwable e) {
            return false;
        }
    }
}
