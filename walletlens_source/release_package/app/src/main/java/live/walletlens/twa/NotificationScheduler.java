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
 * Schedules the periodic background work for local notifications.
 *
 * <p>Uses Android WorkManager to run {@link PeriodicUpdateWorker} periodically.
 * The worker only runs when the device has network access and is idle enough,
 * respecting Doze mode and battery optimization.
 */
public final class NotificationScheduler {

    private static final String TAG = "WalletLensScheduler";
    private static final String PERIODIC_WORK_NAME = "walletlens_periodic_updates";
    private static final String ONE_SHOT_WORK_NAME  = "walletlens_initial_check";

    /**
     * How often to check for price updates and feature announcements.
     * Every 8 hours is a good balance for market updates without draining battery.
     */
    private static final long INTERVAL_HOURS = 8;

    /**
     * Start the periodic background work and an initial one-time check.
     * Safe to call multiple times.
     */
    public static void schedule(@NonNull Context context) {
        schedulePeriodic(context);
        scheduleInitialCheck(context);
    }

    // ── Periodic work ────────────────────────────────────────────────────

    private static void schedulePeriodic(@NonNull Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)   // need internet
                .setRequiresBatteryNotLow(true)                  // don't drain low battery
                .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                PeriodicUpdateWorker.class,
                INTERVAL_HOURS,
                TimeUnit.HOURS)
                .setConstraints(constraints)
                .setInitialDelay(1, TimeUnit.HOURS) // first run after 1 hour to let user settle
                .addTag(PERIODIC_WORK_NAME)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,  // don't duplicate if already scheduled
                request);

        Log.d(TAG, "Periodic updates scheduled every " + INTERVAL_HOURS + " hours");
    }

    // ── One-time initial check ───────────────────────────────────────────

    /**
     * Enqueue a one-shot work that runs ~15 minutes after first install.
     * This gives the user a quick price snapshot so they don't have to wait
     * the full 8-hour cycle.
     */
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

        Log.d(TAG, "Initial one-shot check scheduled in 15 minutes");
    }

    // ── Cancel ──────────────────────────────────────────────────────────

    /**
     * Cancel all background work (periodic + one-shot).
     */
    public static void cancel(@NonNull Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK_NAME);
        WorkManager.getInstance(context).cancelUniqueWork(ONE_SHOT_WORK_NAME);
        Log.d(TAG, "All background work cancelled");
    }
}
