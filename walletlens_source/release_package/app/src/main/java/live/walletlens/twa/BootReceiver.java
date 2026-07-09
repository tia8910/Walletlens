package live.walletlens.twa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Re-schedules background price checks and notifications after device reboot.
 * WorkManager tasks may be cleared on reboot on some devices.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "WalletLensBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "Device rebooted — re-scheduling notification workers");
            NotificationScheduler.schedule(context);
            NotificationHelper h = new NotificationHelper(context);
            h.showAlertNotification(
                "\uD83D\uDD04 WalletLens Restored",
                "Price alerts and notifications have been re-scheduled after reboot.",
                "https://walletlens.live/dashboard"
            );
        }
    }
}
