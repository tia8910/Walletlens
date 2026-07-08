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
 * Schedules background notification checks for WalletLens.
 *
 * <p>Notifications are <b>event-driven, not timer-driven</b>:
 * <ul>
 *   <li><b>🔄 Portfolio changes</b> – detected by the web app when open,
 *       shown as native notifications via TWA delegation</li>
 *   <li><b>📡 FCM push</b> – instant server-sent alerts via Firebase
 *       Cloud Messaging (arrive even when app is closed)</li>
 *   <li><b>⏰ Once-daily market pulse</b> – a single daily check for
 *       significant BTC/ETH moves (only if >2% change, otherwise silent)</li>
 * </ul>
 *
 * <p>The once-daily check exists only as a privacy-first fallback for
 * users who haven't set up server-side push. All data stays on-device.
 */
public final class NotificationScheduler {

    private static final String TAG = "WalletLensScheduler";

    private static final String DAILY_WORK_NAME  = "walletlens_daily_pulse";
    private static final String BOOT_WORK_NAME   = "walletlens_boot_check";

    /**
     * Start background work. Safe to call multiple times.
     */
    public static void schedule(@NonNull Context context) {
        scheduleDailyPulse(context);
        scheduleBootCheck(context);
    }

    /**
     * A single daily check for significant market moves.
     * Runs every 24 hours but only shows a notification if
     * BTC/ETH moved >2%. Otherwise it stays completely silent.
     */
    private static void scheduleDailyPulse(@NonNull Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                PeriodicUpdateWorker.class,
                24, TimeUnit.HOURS)
                .setConstraints(constraints)
                .setInitialDelay(1, TimeUnit.HOURS)
                .addTag(DAILY_WORK_NAME)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                DAILY_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request);

        Log.d(TAG, "Daily market pulse scheduled (24h interval, only fires on >2% move)");
    }

    /**
     * A one-time check shortly after install so the user sees
     * their first notification quickly.
     */
    private static void scheduleBootCheck(@NonNull Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(
                PeriodicUpdateWorker.class)
                .setInitialDelay(10, TimeUnit.MINUTES)
                .addTag(BOOT_WORK_NAME)
                .build();

        WorkManager.getInstance(context).enqueueUniqueWork(
                BOOT_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request);

        Log.d(TAG, "Boot notification scheduled in 10 minutes");
    }

    /**
     * Cancel all background notification work.
     */
    public static void cancel(@NonNull Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(DAILY_WORK_NAME);
        WorkManager.getInstance(context).cancelUniqueWork(BOOT_WORK_NAME);
        Log.d(TAG, "All background notification work cancelled");
    }
}
