package live.walletlens.twa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Locks the app immediately when the device screen turns off.
 * Registered programmatically in WalletLensApp.
 */
public class ScreenOffReceiver extends BroadcastReceiver {

    private static final String TAG = "WalletLensScreenOff";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
            Log.d(TAG, "Screen turned off — resetting biometric session");
            BiometricActivity.resetSession(context);
        }
    }
}
