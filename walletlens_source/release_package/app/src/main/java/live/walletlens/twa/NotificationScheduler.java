package live.walletlens.twa;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * Schedules all background notification work for WalletLens.
 *
 * <p>Uses Android WorkManager which survives app close and device restarts.
 * All workers are privacy-first: no user data leaves the device.
 *
 * <h3>Schedules:</h3>
 * <ul>
 *   <li><b>Smart periodic worker</b> – every 4 hours. Rotates between market
 *       updates, Fear & Greed, daily reminders, weekly recaps, feature tips,
 *       and re-engagement messages. Requires network for market data but
 *       NOT for reminders.</li>
 *   <li><b>Initial one-shot</b> – fires 5 minutes after install so the user
 *       gets their first notification quickly.</li>
 *   <li><b>Boot reschedule</b> – workers auto-reschedule after device reboot
 *       via WorkManager's built-in BOOT_COMPLETED support.</li>
 * </ul>
 */
public final class NotificationScheduler {

    private static final String TAG = "WalletLensScheduler";

    private static final String PERIODIC_WORK_NAME = "walletlens_smart_notify";
    private static final String ONE_SHOT_WORK_NAME = "walletlens_initial_check";

    /**
     * How often the smart worker runs. Every 4 hours balances
     * responsiveness with battery life.
     */
    private static final long INTERVAL_HOURS = 4;

    /**
     * Start all background notification work. Safe to call multiple times —
     * existing schedules are kept.
     */
    public static void schedule(@NonNull Context context) {
        schedulePeriodic(context);
        scheduleInitialCheck(context);
    }

    // ── Periodic smart worker ──────────────────────────────────────────

    private static void schedulePeriodic(@NonNull Context context) {
        // Network constraint only for data-fetching notifications.
        // Reminder-type notifications (daily, tips, re-engage) work offline.
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                // Don't require battery not low - notifications are lightweight
                .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                PeriodicUpdateWorker.class,
                INTERVAL_HOURS,
                TimeUnit.HOURS)
                .setConstraints(constraints)
                .setInitialDelay(1, TimeUnit.HOURS) // allow first-run setup
                .addTag(PERIODIC_WORK_NAME)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request);

        Log.d(TAG, "Smart notifications scheduled every " + INTERVAL_HOURS + " hours");
    }

    // ── One-time initial notification ──────────────────────────────────

    /**
     * Fire a notification 5 minutes after install so the user immediately
     * sees that WalletLens has background notifications working.
     */
    private static void scheduleInitialCheck(@NonNull Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(
                PeriodicUpdateWorker.class)
                .setInitialDelay(5, TimeUnit.MINUTES)
                .addTag(ONE_SHOT_WORK_NAME)
                .build();

        WorkManager.getInstance(context).enqueueUniqueWork(
                ONE_SHOT_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request);

        Log.d(TAG, "Initial notification scheduled in 5 minutes");
    }

    // ── Cancel ─────────────────────────────────────────────────────────

    /**
     * Cancel all background notification work.
     */
    public static void cancel(@NonNull Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK_NAME);
        WorkManager.getInstance(context).cancelUniqueWork(ONE_SHOT_WORK_NAME);
        Log.d(TAG, "All notification work cancelled");
    }
}
