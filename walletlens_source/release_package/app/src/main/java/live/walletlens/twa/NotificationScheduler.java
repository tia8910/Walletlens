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
 * <p>Runs every 3 hours but only fires a notification if BTC or ETH
 * moved more than 1% since the last check. Otherwise stays completely
 * silent — no spam, no daily reminders.
 *
 * <p>WorkManager survives app close and device reboot.
 */
public final class NotificationScheduler {

    private static final String TAG = "WalletLensScheduler";
    private static final String PERIODIC_WORK = "walletlens_price_check";
    private static final String BOOT_WORK = "walletlens_boot_check";

    /** Check prices every 3 hours for timely alerts. */
    private static final long INTERVAL_HOURS = 3;

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
                INTERVAL_HOURS,
                TimeUnit.HOURS)
                .setConstraints(constraints)
                .setInitialDelay(30, TimeUnit.MINUTES)
                .addTag(PERIODIC_WORK)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK,
                ExistingPeriodicWorkPolicy.KEEP,
                request);

        Log.d(TAG, "Price checks every " + INTERVAL_HOURS + " hours (silent unless >1% move)");
    }

    /** One-time check 10 min after install. */
    private static void scheduleBootCheck(@NonNull Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(
                PeriodicUpdateWorker.class)
                .setInitialDelay(10, TimeUnit.MINUTES)
                .addTag(BOOT_WORK)
                .build();

        WorkManager.getInstance(context).enqueueUniqueWork(
                BOOT_WORK,
                ExistingWorkPolicy.REPLACE,
                request);

        Log.d(TAG, "Boot price check in 10 minutes");
    }

    public static void cancel(@NonNull Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK);
        WorkManager.getInstance(context).cancelUniqueWork(BOOT_WORK);
        Log.d(TAG, "All price checks cancelled");
    }
}
