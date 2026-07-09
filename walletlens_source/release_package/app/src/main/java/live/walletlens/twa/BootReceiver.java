package live.walletlens.twa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Re-schedules alarm-based notifications after device reboot.
 *
 * <p>AlarmManager alarms are cleared on reboot. This receiver ensures
 * the notification schedule is restored immediately.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "WalletLensBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "Device rebooted — re-scheduling alarm notifications");

            // Re-create notification channels
            new NotificationHelper(context).createChannels();

            // Schedule next alarm (fires after standard interval)
            NotificationScheduler.schedule(context);

            // Show a notification informing the user
            NotificationHelper helper = new NotificationHelper(context);
            helper.showAlertNotification(
                "\uD83D\uDD04 WalletLens Restored",
                "Smart notifications re-scheduled after reboot. You'll receive price alerts, tips and investment insights.",
                "https://walletlens.live/dashboard"
            );
        }
    }
}
