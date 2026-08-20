package live.walletlens.twa;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.WorkManager;

/**
 * Retires the app's timer-driven notifications.
 *
 * <p>This used to enqueue {@link PeriodicUpdateWorker} every 30 minutes, plus
 * one more run 5 seconds after every launch. That worker posts on <em>every</em>
 * run, cycling price → hack tip → academy tip → feature tip → price, with no
 * quiet hours and no daily cap. The content was canned and the prices came from
 * a hard-coded list of twelve coins, so a user was interrupted on a timer with
 * market data about assets they may not even hold.
 *
 * <p>Notifications now come from the push service (see {@code push-api/}), which
 * sends only when something has actually happened to something the user owns: a
 * price target they set, a holding past their own movement threshold, or a
 * breaking story naming an asset they hold. It also honours quiet hours on the
 * user's own clock and a shared daily budget. A second, uncoordinated source
 * firing canned content on a timer would defeat all three — a user cannot tell
 * two notification systems apart, so the Quiet Hours switch in Settings would
 * appear simply not to work.
 *
 * <p><b>Why this still runs on every entry point.</b> WorkManager persists
 * enqueued work across app updates, and the old registration used
 * {@code ExistingPeriodicWorkPolicy.KEEP}. Merely deleting the scheduling code
 * would leave every already-installed device running the 30-minute worker
 * forever. The cancel below is what actually stops it, so it has to execute on
 * upgrade — which is why {@code schedule()} keeps its name and its callers in
 * {@code WalletLensApp}, {@code LauncherActivity} and {@code BootReceiver}
 * rather than being removed.
 *
 * <p>{@link PeriodicUpdateWorker} is deliberately left in the source tree: it
 * is no longer enqueued, but any work already queued on a device must still
 * find the class while WorkManager drains it.
 */
public final class NotificationScheduler {

    private static final String TAG = "WalletLensScheduler";

    // Must keep matching the names the old build enqueued under, or the
    // cancellation misses the work it is meant to stop.
    private static final String PERIODIC_WORK = "walletlens_price_check";
    private static final String IMMEDIATE_WORK = "walletlens_immediate_check";

    /**
     * Stops the legacy timer-driven notifications. Schedules nothing.
     * Idempotent — cancelling work that is not enqueued is a no-op.
     */
    public static void schedule(@NonNull Context context) {
        cancel(context);
        Log.d(TAG, "Timer-driven notifications retired; push-api sends on events only");
    }

    /**
     * Formerly fired the worker 5 seconds after launch, which meant a canned
     * notification on every app open. Kept as a no-op so existing call sites
     * compile unchanged.
     */
    public static void scheduleImmediate(@NonNull Context context) {
        // Intentionally empty. Opening the app is not a reason to notify
        // someone — they are already looking at it.
    }

    public static void cancel(@NonNull Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK);
        WorkManager.getInstance(context).cancelUniqueWork(IMMEDIATE_WORK);
    }
}
