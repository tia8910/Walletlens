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
 * Schedules the PeriodicUpdateWorker for push notifications.
 *
 * Uses WorkManager with relaxed constraints so the worker runs even
 * without network. Falls back to local notifications if FCM isn't configured.
 */
public final class NotificationScheduler {

    private static final String TAG = "WalletLensScheduler";
    private static final String PERIODIC_WORK = "walletlens_price_check";
    private static final String IMMEDIATE_WORK = "walletlens_immediate_check";
    private static final long INTERVAL_MINUTES = 30;

    public static void schedule(@NonNull Context context) {
        schedulePeriodic(context);
    }

    /** Run the worker immediately (on first install or permission grant). */
    public static void scheduleImmediate(@NonNull Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(
                PeriodicUpdateWorker.class)
                .setInitialDelay(5, TimeUnit.SECONDS)
                .addTag(IMMEDIATE_WORK)
                .build();

        WorkManager.getInstance(context).enqueueUniqueWork(
                IMMEDIATE_WORK,
                ExistingWorkPolicy.REPLACE,
                request);

        Log.d(TAG, "Immediate work scheduled in 5 seconds");
    }

    private static void schedulePeriodic(@NonNull Context context) {
        // No network constraint — worker handles errors gracefully
        // and shows local notifications as fallback
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
                .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                PeriodicUpdateWorker.class,
                INTERVAL_MINUTES,
                TimeUnit.MINUTES)
                .setConstraints(constraints)
                .setInitialDelay(30, TimeUnit.SECONDS)
                .addTag(PERIODIC_WORK)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK,
                ExistingPeriodicWorkPolicy.KEEP,
                request);

        Log.d(TAG, "Periodic work every " + INTERVAL_MINUTES + " min");
    }

    public static void cancel(@NonNull Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK);
        WorkManager.getInstance(context).cancelUniqueWork(IMMEDIATE_WORK);
    }
}
