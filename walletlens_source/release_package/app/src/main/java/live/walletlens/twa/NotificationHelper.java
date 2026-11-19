package live.walletlens.twa;

import android.app.Notification;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
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

    // ── Alarms ────────────────────────────────────────────────────────────
    //
    // An alert the user asked to be an ALARM (Alerts → Signals & goals →
    // "Full-screen alarm"): a high-priority notification that pops up, rings
    // the WalletLens alarm sound and keeps ringing (FLAG_INSISTENT) until it
    // is snoozed, dismissed, opened, or 90 seconds pass.
    //
    // One channel per sound, because on Android 8+ the sound belongs to the
    // channel: rising for good news (a Buy signal, a price above, a goal
    // reached), falling for bad news, neutral for the rest, and a silent one
    // (vibration only) for people who turned the alarm sound off.
    //
    // Still CATEGORY_REMINDER, not CATEGORY_ALARM, and no full-screen intent:
    // Play reserves both for alarm clocks and calls (see showNotification).
    public static final String CHANNEL_ALARM_UP_ID      = "walletlens_alarm_up";
    public static final String CHANNEL_ALARM_DOWN_ID    = "walletlens_alarm_down";
    public static final String CHANNEL_ALARM_NEUTRAL_ID = "walletlens_alarm_neutral";
    public static final String CHANNEL_ALARM_SILENT_ID  = "walletlens_alarm_silent";
    public static final int ALARM_NOTIFICATION_ID = 1004;
    public static final long ALARM_TIMEOUT_MS = 90_000L;
    public static final long ALARM_SNOOZE_MS = 10 * 60_000L;
    private static final long[] ALARM_VIBRATION = {0, 400, 180, 400, 180, 900};

    /** The user's alarm settings, written by the web side through the bridge. */
    public static final String ALARM_PREFS = "walletlens_alarm";

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
        createAlarmChannel(CHANNEL_ALARM_UP_ID, "Alarms: rising", R.raw.wl_alarm_up);
        createAlarmChannel(CHANNEL_ALARM_DOWN_ID, "Alarms: falling", R.raw.wl_alarm_down);
        createAlarmChannel(CHANNEL_ALARM_NEUTRAL_ID, "Alarms", R.raw.wl_alarm_neutral);
        createAlarmChannel(CHANNEL_ALARM_SILENT_ID, "Alarms: vibrate only", 0);

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

    private void createAlarmChannel(@NonNull String id, @NonNull String name, int soundRes) {
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("WalletLens alerts you chose to ring as an alarm");
        channel.enableVibration(true);
        channel.setVibrationPattern(ALARM_VIBRATION);
        channel.setShowBadge(true);
        if (soundRes != 0) {
            Uri sound = Uri.parse("android.resource://" + context.getPackageName() + "/" + soundRes);
            // The alarm stream, so it is heard like an alarm; it rings only
            // for alerts the user set as alarms, and stops after 90 seconds.
            channel.setSound(sound, new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
        } else {
            channel.setSound(null, null);
        }
        notificationManager.createNotificationChannel(channel);
    }

    // ── Alarm settings ────────────────────────────────────────────────────

    public static boolean alarmEnabled(@NonNull Context c) {
        return c.getSharedPreferences(ALARM_PREFS, Context.MODE_PRIVATE).getBoolean("enabled", true);
    }

    public static boolean alarmSound(@NonNull Context c) {
        return c.getSharedPreferences(ALARM_PREFS, Context.MODE_PRIVATE).getBoolean("sound", true);
    }

    public static void saveAlarmPrefs(@NonNull Context c, boolean enabled, boolean sound) {
        SharedPreferences.Editor e = c.getSharedPreferences(ALARM_PREFS, Context.MODE_PRIVATE).edit();
        e.putBoolean("enabled", enabled).putBoolean("sound", sound).apply();
    }

    @NonNull
    private static String alarmChannelFor(@Nullable String tone, boolean sound) {
        if (!sound) return CHANNEL_ALARM_SILENT_ID;
        if ("up".equals(tone)) return CHANNEL_ALARM_UP_ID;
        if ("down".equals(tone)) return CHANNEL_ALARM_DOWN_ID;
        return CHANNEL_ALARM_NEUTRAL_ID;
    }

    // ── Alarm ─────────────────────────────────────────────────────────────

    /**
     * Ring an alert as an alarm: it pops up, rings until acted on (at most 90
     * seconds), and carries Snooze (10 minutes) and Dismiss.
     *
     * @param tone 'up', 'down' or anything else for neutral
     * @param tag  identifies this alarm, so Dismiss and Snooze act on it alone
     */
    public void showAlarm(@NonNull String title, @NonNull String body, @Nullable String tone,
                          @Nullable String targetUrl, @NonNull String tag) {
        Intent tap = createTapIntent(targetUrl, null);
        PendingIntent open = PendingIntent.getActivity(context, ("open:" + tag).hashCode(), tap,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(context, alarmChannelFor(tone, alarmSound(context)))
                .setSmallIcon(R.drawable.ic_notification_logo)
                .setColor("down".equals(tone) ? 0xFFDC2626 : "up".equals(tone) ? 0xFF16A34A : 0xFF071A0C)
                .setColorized(true)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(open)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setVibrate(ALARM_VIBRATION)
                .setTimeoutAfter(ALARM_TIMEOUT_MS)
                .addAction(0, "Snooze 10 min", alarmAction(AlarmActionReceiver.ACTION_SNOOZE, title, body, tone, targetUrl, tag))
                .addAction(0, "Dismiss", alarmAction(AlarmActionReceiver.ACTION_DISMISS, title, body, tone, targetUrl, tag))
                .build();
        // Keeps ringing until the user acts: that is what makes it an alarm.
        n.flags |= Notification.FLAG_INSISTENT;
        notificationManager.notify(tag, ALARM_NOTIFICATION_ID, n);
    }

    /** Take an alarm down (Dismiss, or dismissed in the app). */
    public void cancelAlarm(@NonNull String tag) {
        notificationManager.cancel(tag, ALARM_NOTIFICATION_ID);
    }

    /** Ring the same alarm again in ten minutes. */
    public void snoozeAlarm(@NonNull String title, @NonNull String body, @Nullable String tone,
                            @Nullable String targetUrl, @NonNull String tag) {
        cancelAlarm(tag);
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent again = alarmAction(AlarmActionReceiver.ACTION_REPOST, title, body, tone, targetUrl, tag);
        long at = System.currentTimeMillis() + ALARM_SNOOZE_MS;
        // Inexact on purpose: exact alarms need a permission Play reviews, and
        // a snooze a minute late is still a snooze.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, again);
        } else {
            am.set(AlarmManager.RTC_WAKEUP, at, again);
        }
    }

    private PendingIntent alarmAction(@NonNull String action, @NonNull String title, @NonNull String body,
                                      @Nullable String tone, @Nullable String targetUrl, @NonNull String tag) {
        Intent i = new Intent(context, AlarmActionReceiver.class)
                .setAction(action)
                .putExtra(AlarmActionReceiver.EXTRA_TITLE, title)
                .putExtra(AlarmActionReceiver.EXTRA_BODY, body)
                .putExtra(AlarmActionReceiver.EXTRA_TONE, tone)
                .putExtra(AlarmActionReceiver.EXTRA_URL, targetUrl)
                .putExtra(AlarmActionReceiver.EXTRA_TAG, tag);
        return PendingIntent.getBroadcast(context, (action + ":" + tag).hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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
        showNotification(title, body, targetUrl, dataPayload, null);
    }

    /**
     * Show a push notification, kept distinct from other notifications by tag.
     *
     * @param tag the server's own tag for this notification, or null.
     */
    public void showNotification(@NonNull String title,
                                  @NonNull String body,
                                  @Nullable String targetUrl,
                                  @Nullable String dataPayload,
                                  @Nullable String tag) {
        showNotification(CHANNEL_GENERAL_ID, 1001, title, body, targetUrl, dataPayload, tag);
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
        showAlertNotification(title, body, targetUrl, null);
    }

    /** As above, kept distinct from other alerts by tag. */
    public void showAlertNotification(@NonNull String title,
                                       @NonNull String body,
                                       @Nullable String targetUrl,
                                       @Nullable String tag) {
        showNotification(CHANNEL_ALERTS_ID, 1002, title, body, targetUrl, null, tag);
    }

    /**
     * Show a daily digest notification on the digest channel.
     */
    public void showDailyDigest(@NonNull String summaryBody) {
        showNotification(CHANNEL_DIGEST_ID, 1003, "📊 Daily Market Summary", summaryBody, "https://walletlens.live/market-index", null, null);
    }

    /**
     * Internal method to build and post a notification.
     */
    private void showNotification(@NonNull String channelId,
                                   int notificationId,
                                   @NonNull String title,
                                   @NonNull String body,
                                   @Nullable String targetUrl,
                                   @Nullable String dataPayload,
                                   @Nullable String tag) {

        // Build the PendingIntent that opens the TWA when the notification is tapped.
        Intent tapIntent = createTapIntent(targetUrl, dataPayload);
        // The request code must vary WITH THE TAG, not just the channel.
        //
        // FLAG_UPDATE_CURRENT rewrites the extras of any existing PendingIntent
        // that matches on request code. Two notifications sharing one code
        // therefore share one intent: the newer arrival silently repoints the
        // older notification at its own URL, so tapping yesterday's BTC alert
        // opens today's news story. Every deep link this app worked out is
        // undone by that, and only for the notification already on screen —
        // which is the one hardest to notice going wrong.
        int requestCode = tag != null && !tag.isEmpty()
                ? tag.hashCode()
                : notificationId;
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                requestCode,
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

        // Posted UNDER THE SERVER'S TAG, which is the whole reason the server
        // sets one.
        //
        // notify(id) alone replaces any notification with that id, and every
        // push came through here with a per-channel constant: 1001 for
        // everything, 1002 for price alerts. So the second alert of the day
        // erased the first, the third erased the second, and a portfolio of
        // five assets moving together produced ONE notification. Silently, and
        // indistinguishably from never having been sent.
        //
        // notify(tag, id) keeps notifications with different tags apart while
        // still letting the same tag replace itself — which is exactly the web
        // semantics sw.js already had, and which the tags were named for:
        // price-7, news-a3f, move-btc. Android was throwing them away.
        notificationManager.notify(tag, notificationId, notification);

        Log.d(TAG, "Notification shown: " + title + " | tag: " + tag + " | tap URL: " + targetUrl);
    }

    // ── Intent handling ───────────────────────────────────────────────────

    /**
     * Build an intent that opens the app at {@code targetUrl}.
     * If {@code targetUrl} is null, the default launch URL will be used.
     */
    private Intent createTapIntent(@Nullable String targetUrl, @Nullable String dataPayload) {
        // AppEntry. This used to have to say "not LauncherActivity", because
        // a notification that opened the TWA opened Chrome — address bar and
        // all — from an app that is no longer a browser. That activity does
        // not exist any more; AppEntry is simply where the app's entry point
        // is decided, in one place.
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
     * Used by the entry activity to check if it was opened from a notification.
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
