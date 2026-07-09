package live.walletlens.twa;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

/**
 * Schedules background notifications using {@link AlarmManager#setAlarmClock}.
 *
 * <p>This is the most reliable way to deliver notifications when the app is
 * closed on modern Android. Unlike WorkManager (which can be deferred by
 * hours), {@code setAlarmClock()} shows a small clock icon in the status bar
 * and the system almost never defers it.
 *
 * <p>Notifications fire every 30 minutes, cycling through:
 * <ul>
 *   <li>📊 Live price updates (BTC, ETH, SOL, XRP, ADA + gold)</li>
 *   <li>💡 Feature tips (32+ app features)</li>
 *   <li>💪 Investment hacks (20 wealth-building strategies)</li>
 *   <li>🔔 Portfolio reminders</li>
 * </ul>
 *
 * <p>Privacy-first: all data is fetched from public free APIs (CoinGecko,
 * metals.live). No user data is sent anywhere.
 */
public final class NotificationScheduler {

    private static final String TAG = "WalletLensScheduler";

    /** Interval between alarms — 30 minutes */
    private static final long INTERVAL_MS = 30 * 60 * 1000L;

    /** Preference tracking whether the alarm has been initialised */
    private static final String PREFS_NAME = "walletlens_alarm";
    private static final String KEY_ALARM_SET = "alarm_set";
    private static final String KEY_FIRST_WELCOME = "first_welcome_shown";

    /** Intent action for our alarm */
    private static final String ACTION_ALARM =
            "live.walletlens.twa.action.NOTIFICATION_ALARM";

    /**
     * Schedule the first alarm immediately, then every 30 minutes.
     * Safe to call multiple times — only the first call schedules.
     */
    public static void schedule(@NonNull Context context) {
        scheduleNextAlarm(context);
    }

    /**
     * Schedule the next alarm to fire after INTERVAL_MS.
     * Uses {@link AlarmManager#setAlarmClock} for maximum reliability.
     */
    public static void scheduleNextAlarm(@NonNull Context context) {
        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager not available");
            return;
        }

        long triggerAtMs = System.currentTimeMillis() + INTERVAL_MS;

        PendingIntent pi = buildAlarmIntent(context);
        if (pi == null) return;

        // setAlarmClock is the most reliable alarm method — shows a clock
        // icon in the status bar and is almost never deferred by the system.
        AlarmManager.AlarmClockInfo alarmClock =
                new AlarmManager.AlarmClockInfo(triggerAtMs, null);
        alarmManager.setAlarmClock(alarmClock, pi);

        Log.d(TAG, "Next alarm scheduled in " + (INTERVAL_MS / 60_000) + " min");
    }

    /**
     * Schedule an alarm to fire immediately (for first-use welcome).
     */
    public static void scheduleImmediate(@NonNull Context context) {
        // Use setAlarmClock (always available, no special permission needed)
        // with a trigger 5 seconds from now for the first notification.
        long triggerAtMs = System.currentTimeMillis() + 5_000;

        PendingIntent pi = buildAlarmIntent(context);
        if (pi == null) return;

        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        AlarmManager.AlarmClockInfo alarmClock =
                new AlarmManager.AlarmClockInfo(triggerAtMs, null);
        alarmManager.setAlarmClock(alarmClock, pi);

        Log.d(TAG, "Immediate alarm scheduled in 5 seconds");
    }

    /** Show the welcome notification immediately on first install. */
    public static void showWelcomeNotification(@NonNull Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (prefs.getBoolean(KEY_FIRST_WELCOME, false)) return;
        prefs.edit().putBoolean(KEY_FIRST_WELCOME, true).apply();

        NotificationHelper helper = new NotificationHelper(context);
        helper.createChannels();

        // Show the welcome notification directly from the app context
        // This doesn't need the alarm receiver — fires immediately.
        helper.showAlertNotification(
            "\uD83D\uDD0D WalletLens Active",
            "Smart notifications are ON! You'll get price updates, feature tips, and investment insights every 30 min.",
            "https://walletlens.live/dashboard"
        );

        Log.d(TAG, "Welcome notification shown");
    }

    /**
     * Cancel all pending alarms.
     */
    public static void cancel(@NonNull Context context) {
        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager == null) return;

        PendingIntent pi = buildAlarmIntent(context);
        if (pi != null) {
            alarmManager.cancel(pi);
            pi.cancel();
        }

        Log.d(TAG, "All alarms cancelled");
    }

    /**
     * Build the PendingIntent for our alarm receiver.
     */
    private static PendingIntent buildAlarmIntent(@NonNull Context context) {
        Intent intent = new Intent(context, NotificationAlarmReceiver.class);
        intent.setAction(ACTION_ALARM);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        return PendingIntent.getBroadcast(context, 0, intent, flags);
    }
}
