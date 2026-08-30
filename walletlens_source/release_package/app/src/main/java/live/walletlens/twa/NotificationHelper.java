package live.walletlens.twa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Helper for native local notifications (channels, deep-link intents).
 *
 * Creates notification channels (required for Android 8+), builds and displays
 * notifications, and handles tap actions to open the TWA at the relevant URL.
 */
public final class NotificationHelper {

    private static final String TAG = "WalletLensNotify";

    // ── Notification channels ─────────────────────────────────────────────

    /** General notifications (account updates, market alerts, etc.). */
    public static final String CHANNEL_GENERAL_ID    = "walletlens_general";
    public static final String CHANNEL_GENERAL_NAME  = "General Notifications";

    /** Price alerts and portfolio notifications. */
    public static final String CHANNEL_ALERTS_ID     = "walletlens_alerts";
    public static final String CHANNEL_ALERTS_NAME   = "Price Alerts";

    /** Daily digest summary notification. */
    public static final String CHANNEL_DIGEST_ID     = "walletlens_digest";
    public static final String CHANNEL_DIGEST_NAME   = "Daily Digest";

    /**
     * Everything WalletLens sends on its own initiative: the morning brief, a
     * come-back nudge, a one-off feature tip.
     *
     * <p>IMPORTANCE_LOW, so it posts without a sound. The web layer already
     * marks these {@code silent: true}, but on Android 8+ that is not what
     * decides it — the CHANNEL decides it, and a silent notification on a
     * sounding channel still sounds. This is the channel that makes the web
     * layer's intent true on the device.
     */
    public static final String CHANNEL_QUIET_ID      = "walletlens_quiet";
    public static final String CHANNEL_QUIET_NAME    = "Updates";

    // ── Intent extras ─────────────────────────────────────────────────────

    /** Extra on the notification intent: the deep-link URL to open. */
    public static final String EXTRA_TARGET_URL = "notification_target_url";

    private final Context context;
    private final NotificationManager notificationManager;

    public NotificationHelper(@NonNull Context context) {
        this.context = context.getApplicationContext();
        this.notificationManager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    // ── Channel creation ──────────────────────────────────────────────────

    /** Create all notification channels. Call once from {@code Application.onCreate()}. */
    public void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return; // Channels are only needed on Android 8+
        }

        createChannel(CHANNEL_GENERAL_ID, CHANNEL_GENERAL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT);
        createChannel(CHANNEL_ALERTS_ID, CHANNEL_ALERTS_NAME,
                NotificationManager.IMPORTANCE_HIGH);
        createChannel(CHANNEL_DIGEST_ID, CHANNEL_DIGEST_NAME,
                NotificationManager.IMPORTANCE_DEFAULT);
        createChannel(CHANNEL_QUIET_ID, CHANNEL_QUIET_NAME,
                NotificationManager.IMPORTANCE_LOW);

        Log.d(TAG, "Notification channels created");
    }

    private void createChannel(@NonNull String id, @NonNull String name, int importance) {
        NotificationChannel channel = new NotificationChannel(id, name, importance);
        channel.setDescription("Notifications from " + name);
        // A channel's settings are frozen the moment it is created: later calls
        // with the same id change nothing. So the importance passed here is the
        // one that ships, and the only way to alter it afterwards is the user's
        // own Settings — which is exactly where it should live. Vibration off
        // for the quiet channel, or IMPORTANCE_LOW would still buzz.
        channel.enableVibration(importance >= NotificationManager.IMPORTANCE_DEFAULT);
        notificationManager.createNotificationChannel(channel);
    }

    // ── Display notifications ─────────────────────────────────────────────

    /**
     * Show a push notification.
     *
     * @param title       Notification title (displayed bold).
     * @param body        Notification body text.
     * @param targetUrl   URL to open when the notification is tapped (may be null for default).
     * @param dataPayload Optional JSON or string data for the notification intent.
     */
    public void showNotification(@NonNull String title,
                                  @NonNull String body,
                                  @Nullable String targetUrl,
                                  @Nullable String dataPayload) {
        showNotification(CHANNEL_GENERAL_ID, 1001, title, body, targetUrl, dataPayload);
    }

    /**
     * Show a notification on the alerts channel (higher importance).
     *
     * @param title       Notification title.
     * @param body        Notification body text.
     * @param targetUrl   URL to open when tapped (may be null for default).
     */
    public void showAlertNotification(@NonNull String title,
                                       @NonNull String body,
                                       @Nullable String targetUrl) {
        showNotification(CHANNEL_ALERTS_ID, 1002, title, body, targetUrl, null);
    }

    /**
     * Show a daily digest notification on the digest channel.
     */
    public void showDailyDigest(@NonNull String summaryBody) {
        showNotification(CHANNEL_DIGEST_ID, 1003, "📊 Daily Market Summary", summaryBody, "https://walletlens.live/market-index", null);
    }

    /**
     * Internal method to build and post a notification.
     */
    private void showNotification(@NonNull String channelId,
                                   int notificationId,
                                   @NonNull String title,
                                   @NonNull String body,
                                   @Nullable String targetUrl,
                                   @Nullable String dataPayload) {

        // Build the PendingIntent that opens the TWA when the notification is tapped.
        Intent tapIntent = createTapIntent(targetUrl, dataPayload);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                notificationId,
                tapIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // The WalletLens mark, referenced directly rather than looked up by
        // name. getIdentifier() is a runtime string lookup: it survives no
        // rename, R8 cannot see it (which is why keep.xml had to name the
        // drawable by hand), and when it misses it returns 0 and the app
        // silently posts every notification under a generic system info icon.
        // R.drawable is the same answer, checked by the compiler.
        int smallIcon = R.drawable.ic_notification_logo;

        int accentColor = 0xFF071A0C; // WalletLens brand dark green

        Notification notification = new NotificationCompat.Builder(context, channelId)
                .setSmallIcon(smallIcon)
                .setColor(accentColor)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                // CATEGORY_ALARM is reserved for alarm clocks and timers: it lets a
                // notification punch through Do Not Disturb and sort above genuinely
                // urgent things. A price alert or a feature tip is neither, and
                // mislabelling every notification as an alarm is exactly the kind of
                // thing Play's notification-quality checks flag. Price alerts are
                // reminders; everything else is promotional/social.
                .setCategory(channelId.equals(CHANNEL_ALERTS_ID)
                        ? NotificationCompat.CATEGORY_REMINDER
                        : NotificationCompat.CATEGORY_PROMO)
                .setPriority(channelId.equals(CHANNEL_ALERTS_ID)
                        ? NotificationCompat.PRIORITY_HIGH
                        : NotificationCompat.PRIORITY_DEFAULT)
                .build();

        notificationManager.notify(notificationId, notification);

        Log.d(TAG, "Notification shown: " + title + " | tap URL: " + targetUrl);
    }

    // ── Intent handling ───────────────────────────────────────────────────

    /**
     * Build an intent that opens the TWA LauncherActivity at {@code targetUrl}.
     * If {@code targetUrl} is null, the default launch URL will be used.
     */
    private Intent createTapIntent(@Nullable String targetUrl, @Nullable String dataPayload) {
        // AppEntry, not LauncherActivity. A notification that opened the TWA
        // would open Chrome — address bar and all — from an app that is no
        // longer a browser, and the tap is the one moment a user is most
        // certain they are in the app.
        //
        // deepLink also drops a URL that is not ours. This one arrives in a
        // push payload, over the network, and ends up inside a PendingIntent
        // that outlives the check: an unchecked one would let anyone who could
        // forge a push put a link of their choosing on the lock screen wearing
        // this app's icon.
        Intent intent = AppEntry.deepLink(context, targetUrl);

        if (targetUrl != null && !targetUrl.isEmpty()) {
            intent.putExtra(EXTRA_TARGET_URL, targetUrl);
        }

        if (dataPayload != null) {
            intent.putExtra("notification_data", dataPayload);
        }

        return intent;
    }

    /**
     * Extract the target URL from the intent that launched the activity.
     * Used in LauncherActivity to check if it was opened from a notification.
     */
    @Nullable
    public static String getTargetUrlFromIntent(@NonNull Intent intent) {
        if (intent.hasExtra(EXTRA_TARGET_URL)) {
            return intent.getStringExtra(EXTRA_TARGET_URL);
        }
        if (intent.getData() != null) {
            return intent.getData().toString();
        }
        return null;
    }
}
