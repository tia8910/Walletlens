package live.walletlens.twa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

/**
 * Handles notification delegation from the TWA's web layer.
 *
 * <p>When the web app (PWA) calls {@code new Notification(...)}, Chrome
 * Custom Tab forwards it to this service. Instead of using Chrome's
 * notification channel, we create and post the notification using the
 * <b>app's own</b> notification channels ("WalletLens General" etc.)
 * so the notification is correctly attributed to WalletLens, not Chrome.
 *
 * <p>This is the recommended approach for TWA apps: all notifications
 * — whether from the web layer or from native background workers —
 * use the same app-branded channels.
 */
public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {

    private static final String TAG = "WalletLensDelegate";

    /** Fallback notification ID for web-originated notifications. */
    private static final int FALLBACK_NOTIFICATION_ID = 9999;

    @Override
    public void onCreate() {
        super.onCreate();

        // Ensure our app's notification channels exist, so web-delegated
        // notifications don't fall back to a generic/Chrome channel.
        new NotificationHelper(this).createChannels();

        Log.d(TAG, "DelegationService ready – web notifications will use WalletLens channels");
    }

    /**
     * Called by the TWA runtime when the web app fires a
     * {@code new Notification(title, { body, ... })}.
     *
     * <p>We build the Android notification ourselves using the app's
     * {@link NotificationHelper} and channel IDs, so that it appears
     * under "WalletLens" in the system notification settings, not under
     * Chrome or the browser.
     */
    @Override
    public void onNotify(@NonNull String title,
                         @NonNull String body,
                         @NonNull String url,
                         @NonNull Intent origin) {
        Log.d(TAG, "Received web notification: \"" + title + "\" → " + url);

        // Build an intent that opens the TWA at the notification's target URL
        Intent tapIntent = new Intent(this, LauncherActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        tapIntent.setData(Uri.parse(url));

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                tapIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Small icon
        int smallIcon = getResources()
                .getIdentifier("ic_notification_icon", "drawable", getPackageName());
        if (smallIcon == 0) {
            smallIcon = android.R.drawable.ic_dialog_info;
        }

        // Build the notification using the app's own "general" channel
        Notification notification = new NotificationCompat.Builder(
                this, NotificationHelper.CHANNEL_GENERAL_ID)
                .setSmallIcon(smallIcon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_EVENT)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build();

        NotificationManager manager =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        if (manager != null) {
            manager.notify(FALLBACK_NOTIFICATION_ID, notification);
            Log.d(TAG, "Native notification posted via WalletLens channel");
        } else {
            // Fall back to the parent's default handling
            Log.w(TAG, "NotificationManager unavailable – delegating to parent");
            super.onNotify(title, body, url, origin);
        }
    }
}
