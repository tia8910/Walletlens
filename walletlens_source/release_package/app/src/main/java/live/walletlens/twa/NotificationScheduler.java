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
 * Schedules background price checks for WalletLens.
 *
 * <p>Checks every 30 minutes but only fires a notification if BTC or ETH
 * moved more than 1% since the last check. Otherwise completely silent.
 *
 * <p>WorkManager survives app close and device reboot. On Android 12+,
 * the system may batch these checks to save battery, but prices will
 * still be checked frequently enough for timely alerts.
 */
public final class NotificationScheduler {

    private static final String TAG = "WalletLensScheduler";
    private static final String PERIODIC_WORK = "walletlens_price_check";
    private static final String BOOT_WORK = "walletlens_boot_check";

    /** Check prices every 30 minutes. */
    private static final long INTERVAL_MINUTES = 30;

    public static void schedule(@NonNull Context context) {
        schedulePeriodic(context);
        scheduleBootCheck(context);
    }

    private static void schedulePeriodic(@NonNull Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                PeriodicUpdateWorker.class,
                INTERVAL_MINUTES,
                TimeUnit.MINUTES)
                .setConstraints(constraints)
                .setInitialDelay(5, TimeUnit.MINUTES)
                .addTag(PERIODIC_WORK)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK,
                ExistingPeriodicWorkPolicy.KEEP,
                request);

        Log.d(TAG, "Price checks every " + INTERVAL_MINUTES + " min (silent unless >1% move)");
    }

    /** One-time check 5 min after install. */
    private static void scheduleBootCheck(@NonNull Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(
                PeriodicUpdateWorker.class)
                .setInitialDelay(5, TimeUnit.MINUTES)
                .addTag(BOOT_WORK)
                .build();

        WorkManager.getInstance(context).enqueueUniqueWork(
                BOOT_WORK,
                ExistingWorkPolicy.REPLACE,
                request);

        Log.d(TAG, "Boot price check in 5 minutes");
    }

    public static void cancel(@NonNull Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK);
        WorkManager.getInstance(context).cancelUniqueWork(BOOT_WORK);
        Log.d(TAG, "All price checks cancelled");
    }
}
