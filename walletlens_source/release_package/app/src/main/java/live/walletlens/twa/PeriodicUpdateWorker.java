package live.walletlens.twa;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * A tombstone, not a worker.
 *
 * <p>This used to run every 30 minutes and post a notification on <em>every</em>
 * run, cycling price → hack tip → academy tip → feature tip → price, with no
 * quiet hours and no daily cap. The prices came from a hard-coded list of twelve
 * coins, so a user was interrupted on a timer with market data about assets they
 * may not even hold. It was retired in "Send every notification for a reason,
 * never on a timer"; notifications now come from the push service, which sends
 * only when something has actually happened to something the user owns, honours
 * quiet hours on the user's own clock, and shares one daily budget.
 *
 * <p><b>Why the class still exists.</b> WorkManager persists enqueued work
 * across app updates. A device that last ran a build from before the retirement
 * still has this work queued by name, and WorkManager must be able to load the
 * class to drain it — deleting the file outright makes those runs fail to
 * instantiate rather than complete, and the queue does not clear.
 * {@link NotificationScheduler#schedule} cancels the work on every entry point;
 * this class only has to survive long enough to be cancelled.
 *
 * <p>doWork() does nothing and reports success, which is what retires a queued
 * run cleanly. The API calls, the twelve-coin price list and the canned copy
 * are gone — dead code that still reads as a live feature is worse than no code
 * at all, and the notification_copy.xml string arrays it used went with it.
 *
 * <p>Safe to delete this file, and the cancel in NotificationScheduler, once no
 * meaningful number of installs predates the retirement. Until then, removing
 * either one strands those devices with a 30-minute worker and nothing left to
 * stop it.
 */
public class PeriodicUpdateWorker extends Worker {

    private static final String TAG = "WalletLensWorker";

    public PeriodicUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        // Reached only on a device whose queue predates the retirement, and
        // only until NotificationScheduler's cancel lands. Success, not retry:
        // a failed run stays in the queue.
        Log.d(TAG, "Retired worker ran; nothing to do");
        return Result.success();
    }
}
