package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Receives notifications over FCM and shows them.
 *
 * <h3>Why the transport changed</h3>
 *
 * Every notification this app sends is DECIDED on the server — the channels,
 * thresholds, cooldowns and day gates all live in workers/push/jobs.js — and
 * was DELIVERED by Web Push to a service worker running in Chrome. That worked
 * because the app was a Trusted Web Activity, which is to say it was Chrome.
 *
 * <p>A WebView has no service worker push. The subscription the server has
 * addressed since the Deno service simply does not exist there, so the
 * delivery half has to become FCM. Nothing above it moves: the server still
 * decides exactly what it decided before, and this class is only the last hop.
 *
 * <h3>Data messages, not notification messages</h3>
 *
 * The server sends a {@code data} payload rather than FCM's {@code
 * notification} block, and that is deliberate. A notification message is drawn
 * by the system, which means it ignores the channels this app has already
 * defined, ignores the deep link the payload carries, and — the part that
 * matters most — is NOT delivered to this class at all when the app is in the
 * background. Everything about how a WalletLens notification looks and where
 * tapping it lands is decided here, in code, for every app state.
 */
public class WalletLensMessagingService extends FirebaseMessagingService {

    private static final String TAG = "WalletLensFCM";

    private static final String PREFS = "walletlens_fcm";
    private static final String KEY_TOKEN = "fcm_token";
    /** Whether the server has been told about the token currently held. */
    private static final String KEY_TOKEN_SYNCED = "fcm_token_synced";

    // ── Receiving ────────────────────────────────────────────────────────

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (data == null || data.isEmpty()) {
            Log.w(TAG, "push with no data payload; nothing to show");
            return;
        }

        String title = data.get("title");
        String body = data.get("body");
        if (title == null || title.isEmpty()) {
            // A notification with no title is a blank row on the lock screen.
            // Dropping it is better than showing one.
            Log.w(TAG, "push with no title; dropped");
            return;
        }

        String url = data.get("url");
        if (url == null || url.isEmpty()) url = "https://walletlens.live/dashboard";

        // Only our own origin. The payload arrives from the network, and a
        // notification is a tappable thing on the user's lock screen: without
        // this, anyone who could forge a push could put a link to a page of
        // their choosing there, wearing this app's icon and name.
        if (!url.startsWith("https://walletlens.live/")) {
            Log.w(TAG, "push url is not ours; falling back to the dashboard");
            url = "https://walletlens.live/dashboard";
        }

        String channel = data.get("channel");
        try {
            NotificationHelper helper = new NotificationHelper(this);
            helper.createChannels();
            if (isPriceChannel(channel)) {
                // The loud channel, for the things that are about a number and
                // stale within the hour.
                helper.showAlertNotification(title, body != null ? body : "", url);
            } else {
                // The fourth argument is the tap intent's extra data payload,
                // which a data-only push does not carry: the deep link is the url.
                helper.showNotification(title, body != null ? body : "", url, null);
            }
        } catch (Throwable e) {
            Log.w(TAG, "could not show push: " + e);
        }
    }

    /**
     * Channels that are about a price, and are worth waking a dozing phone.
     *
     * <p>The names are the server's, from buildPayload's `channel` field. A
     * channel this does not recognise gets the quieter treatment, which is the
     * right way round: a new channel added on the server should arrive politely
     * rather than buzzing until someone notices.
     */
    private static boolean isPriceChannel(@Nullable String channel) {
        if (channel == null) return false;
        switch (channel) {
            case "target":
            case "move":
            case "level":
            case "zakat":
            // The welcome notification, whose entire job is to demonstrate that
            // notifications work. sw.js has always treated it as loud; this
            // list did not, so on Android the one notification sent to prove
            // the feature arrived silently — which proves the opposite.
            case "test":
                return true;
            default:
                return false;
        }
    }

    // ── The address ──────────────────────────────────────────────────────

    /**
     * A new registration token.
     *
     * <p>FCM issues these and rotates them on its own schedule — an app
     * restore to a new device, a data clear, a token it decides is stale — and
     * a rotated token is the FCM equivalent of an expired Web Push endpoint:
     * the server keeps sending to an address nobody is at, and nothing fails
     * loudly enough to notice.
     *
     * <p>So the token is stored with a "has the server been told" flag beside
     * it, cleared here. The web layer re-reads it on the next launch and
     * re-registers. It cannot be sent from this class: registering means
     * telling the push worker which assets this device watches and which
     * channels it wants, and all of that lives in the web app.
     */
    @Override
    public void onNewToken(@NonNull String token) {
        Log.d(TAG, "FCM token issued");
        storeToken(this, token);
    }

    static void storeToken(@NonNull Context context, @Nullable String token) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String previous = p.getString(KEY_TOKEN, null);
        SharedPreferences.Editor e = p.edit().putString(KEY_TOKEN, token);
        // Only a CHANGED token needs re-registering. Clearing the flag on every
        // call would have the web app re-POST the same address on every launch.
        if (previous == null || !previous.equals(token)) e.putBoolean(KEY_TOKEN_SYNCED, false);
        e.apply();
    }

    /** The current token, or empty when FCM has not issued one yet. */
    @NonNull
    static String token(@NonNull Context context) {
        String t = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_TOKEN, null);
        return t != null ? t : "";
    }

    /** Whether the push worker already knows the token we hold. */
    static boolean tokenSynced(@NonNull Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_TOKEN_SYNCED, false);
    }

    /** Called by the web layer once it has registered the token with the server. */
    static void markTokenSynced(@NonNull Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_TOKEN_SYNCED, true).apply();
    }

    /**
     * Ask FCM for the token, if we do not already have one.
     *
     * <p>onNewToken only fires when a token is CREATED or ROTATED, so an app
     * that was installed before this class existed — or one whose token was
     * issued while the shell was not yet the launcher — would never hear about
     * the token it already has. This is the pull that covers that.
     *
     * <p>Failure is quiet on purpose: no Play Services, no network, a Firebase
     * config that did not initialise. None of those should cost the user
     * anything except notifications, and none is worth a dialog.
     */
    static void ensureToken(@NonNull Context context) {
        try {
            FirebaseMessaging.getInstance().getToken()
                    .addOnCompleteListener(task -> {
                        if (!task.isSuccessful()) {
                            Log.w(TAG, "no FCM token: " + task.getException());
                            return;
                        }
                        storeToken(context, task.getResult());
                    });
        } catch (Throwable e) {
            Log.w(TAG, "FCM unavailable: " + e);
        }
    }
}
