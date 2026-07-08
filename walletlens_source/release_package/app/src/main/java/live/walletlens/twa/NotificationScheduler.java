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
 * <p>Uses Android WorkManager. All workers are privacy-first:
 * no user data ever leaves the device.
 *
 * <h3>Schedules:</h3>
 * <ul>
 *   <li><b>Smart periodic worker</b> – runs every 6 hours, picks a
 *       notification type via smart rotation (market updates, Fear & Greed,
 *       daily reminders, weekly recaps, feature tips, re-engagement).</li>
 *   <li><b>Initial one-shot</b> – fires 15 min after install so the user
 *       gets their first notification quickly.</li>
 * </ul>
 */
public final class NotificationScheduler {

    private static final String TAG = "WalletLensScheduler";

    private static final String PERIODIC_WORK_NAME = "walletlens_smart_notify";
    private static final String ONE_SHOT_WORK_NAME = "walletlens_initial_check";

    /** How often the smart worker runs (hours). Lower = more responsive. */
    private static final long INTERVAL_HOURS = 6;

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
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true)
                .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                PeriodicUpdateWorker.class,
                INTERVAL_HOURS,
                TimeUnit.HOURS)
                .setConstraints(constraints)
                .setInitialDelay(1, TimeUnit.HOURS)
                .addTag(PERIODIC_WORK_NAME)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request);

        Log.d(TAG, "Smart notifications scheduled every " + INTERVAL_HOURS + " hours");
    }

    // ── One-time initial notification ──────────────────────────────────

    private static void scheduleInitialCheck(@NonNull Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(
                PeriodicUpdateWorker.class)
                .setInitialDelay(15, TimeUnit.MINUTES)
                .addTag(ONE_SHOT_WORK_NAME)
                .build();

        WorkManager.getInstance(context).enqueueUniqueWork(
                ONE_SHOT_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request);

        Log.d(TAG, "Initial notification scheduled in 15 minutes");
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
