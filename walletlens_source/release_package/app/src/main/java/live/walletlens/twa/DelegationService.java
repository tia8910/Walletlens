package live.walletlens.twa;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationManagerCompat;

/**
 * Handles notification delegation from the TWA's web layer.
 *
 * <p>When a push arrives, Chrome's Custom Tab hands the notification to this
 * service so the OS attributes it to WalletLens rather than to Chrome.
 *
 * <h3>Why this overrides the posting step</h3>
 *
 * <p>On Android 8+ a notification's sound is a property of its CHANNEL, not of
 * the notification. The web layer's {@code silent: false} cannot produce a
 * sound the channel does not have, and {@code vibrate} is advisory in the same
 * way. So "make the price alerts audible" is not something sw.js can decide on
 * its own — it can only ask.
 *
 * <p>The base implementation posts onto a channel {@code androidx.browser}
 * invents from the name Chrome passes. WalletLens had three carefully-set
 * channels ({@link NotificationHelper}) and web notifications reached none of
 * them: those served only the native local notifications. The effect was that
 * every push landed on a generic channel nobody had chosen the behaviour for,
 * which is why a price alert marked urgent by the server arrived mute.
 *
 * <p>This routes each notification onto a WalletLens channel instead:
 *
 * <ul>
 *   <li>{@link NotificationHelper#CHANNEL_ALERTS_ID} — IMPORTANCE_HIGH, for
 *       the channels the user asked for by name: price targets, moves, round
 *       price levels, the test send.</li>
 *   <li>{@link NotificationHelper#CHANNEL_QUIET_ID} — IMPORTANCE_LOW, for the
 *       ones WalletLens raises on its own initiative: the brief, win-back
 *       nudges, feature tips.</li>
 * </ul>
 *
 * <p>It also puts both in the user's hands. Named channels appear in Android's
 * notification settings with their own sound picker, so anyone who wants a
 * different tone — or silence — can set one per kind, which was impossible
 * while the channel was an implementation detail of a library.
 */
public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {

    private static final String TAG = "WalletLensDelegate";

    /**
     * Tag prefixes the push service uses for the channels a user asked for.
     *
     * <p>Kept in step with LOUD_CHANNELS in client/public/sw.js and the tags
     * main.ts sends; notificationChannels.test.js fails if they drift apart.
     */
    private static final String[] LOUD_TAG_PREFIXES = { "price-", "level-", "move-", "zakat", "wl-test" };

    @Override
    public void onCreate() {
        super.onCreate();
        new NotificationHelper(this).createChannels();
        Log.d(TAG, "DelegationService ready – notifications use WalletLens channels");
    }

    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId,
            Notification notification, String channelName) {
        // Below O there are no channels; the notification carries its own sound
        // and the base implementation is already correct.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return super.onNotifyNotificationWithChannel(
                    platformTag, platformId, notification, channelName);
        }
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return false;

        // Cheap and idempotent: a channel that exists is left exactly as it is.
        // Called here as well as in onCreate because this service can be bound
        // by Chrome in a process where onCreate ran long ago.
        new NotificationHelper(this).createChannels();

        String channelId = isLoud(platformTag, notification)
                ? NotificationHelper.CHANNEL_ALERTS_ID
                : NotificationHelper.CHANNEL_QUIET_ID;

        Notification routed;
        try {
            routed = Notification.Builder.recoverBuilder(this, notification)
                    .setChannelId(channelId)
                    .build();
        } catch (Throwable t) {
            // recoverBuilder can refuse a notification it did not build. Losing
            // the sound is bad; losing the notification is worse, so fall back
            // to the library's own path rather than dropping it.
            Log.w(TAG, "could not re-channel notification; posting as delivered", t);
            return super.onNotifyNotificationWithChannel(
                    platformTag, platformId, notification, channelName);
        }

        NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(platformTag, platformId, routed);
        return true;
    }

    /**
     * Whether this notification is one the user asked for by name.
     *
     * <p>Two independent signals, because neither is guaranteed on its own.
     * Chrome composes {@code platformTag} from the web notification's tag, so
     * the prefix is the direct expression of what sw.js decided — but the exact
     * composition is Chrome's business and could change. The notification's own
     * sound/vibrate/defaults are what Chrome sets from the web {@code silent}
     * flag, and survive independently of the tag.
     *
     * <p>Either one is enough. Neither matching means quiet, which is the
     * behaviour that shipped before this class touched the channel at all — so
     * a signal that stops working costs the sound, never the notification.
     */
    static boolean isLoud(String platformTag, Notification notification) {
        String tag = platformTag == null ? "" : platformTag;
        for (String prefix : LOUD_TAG_PREFIXES) {
            if (tag.contains(prefix)) return true;
        }
        if (notification == null) return false;
        return notification.vibrate != null
                || notification.sound != null
                || notification.defaults != 0;
    }
}
