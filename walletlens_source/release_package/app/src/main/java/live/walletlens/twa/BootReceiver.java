package live.walletlens.twa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Restores the periodic notification schedule after device reboot.
 *
 * <p>WorkManager schedules survive reboots on their own, but re-enqueueing
 * with KEEP is cheap and covers devices whose vendors aggressively clear
 * background work.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "WalletLensBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "Device rebooted — restoring notification schedule");

            // Re-create notification channels
            new NotificationHelper(context).createChannels();

            // Restore the periodic schedule silently. Posting a "restored
            // after reboot" notification here would ping users on every boot
            // and reads as notification spam in Play review.
            NotificationScheduler.schedule(context);
        }
    }
}
