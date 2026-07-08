package live.walletlens.twa;

import android.util.Log;

/**
 * Handles notification delegation from the TWA's web layer.
 *
 * <p>When the web app (PWA) fires {@code new Notification(...)}, Chrome
 * Custom Tab forwards the request to this service. The parent
 * {@link com.google.androidbrowserhelper.trusted.DelegationService}
 * automatically publishes the notification using the <b>app's own context</b>
 * and resources, so the OS correctly attributes it to WalletLens (not Chrome).
 *
 * <p>We override {@code onCreate()} to ensure our custom notification
 * channels ({@link NotificationHelper.CHANNEL_GENERAL_ID}) are created
 * before the first web-originated notification arrives. This guarantees the
 * notification appears under "WalletLens" in system settings.
 */
public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {

    private static final String TAG = "WalletLensDelegate";

    @Override
    public void onCreate() {
        super.onCreate();

        // Create our branded notification channels so web-delegated
        // notifications use the app's channels, not a generic one.
        new NotificationHelper(this).createChannels();

        // The parent DelegationService will now use these channels
        // when posting notifications from the web layer.

        Log.d(TAG, "DelegationService ready – notifications use WalletLens channels");
    }
}
