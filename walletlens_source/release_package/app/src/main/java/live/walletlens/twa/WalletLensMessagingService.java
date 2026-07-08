package live.walletlens.twa;

import android.app.PendingIntent;
import android.content.Intent;
import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Firebase Cloud Messaging service for instant push notifications.
 *
 * <p>When a push message arrives from the server (e.g. walletlens.live
 * backend or a future notification server), this service receives it and
 * displays a native Android notification via {@link NotificationHelper}.
 *
 * <p>The app also uses local background checks ({@link PeriodicUpdateWorker})
 * for privacy-first notifications that don't require any server. FCM is
 * used as an additional channel for time-sensitive alerts.
 */
public class WalletLensMessagingService extends FirebaseMessagingService {

    private static final String TAG = "WalletLensFCM";

    @Override
    public void onNewToken(@NonNull String token) {
        Log.d(TAG, "New FCM token: " + token);
        // In a production setup, send this token to your notification server
        // so it knows how to reach this device. For privacy-first operation,
        // we only log it here — the user can choose to register it later.
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Log.d(TAG, "FCM message received from: " + message.getFrom());

        // Extract notification payload
        RemoteMessage.Notification notification = message.getNotification();
        String title = null;
        String body = null;
        String targetUrl = null;

        if (notification != null) {
            title = notification.getTitle();
            body = notification.getBody();
        }

        // Data payload takes precedence (allows rich notifications)
        if (message.getData() != null) {
            if (title == null) title = message.getData().get("title");
            if (body == null) body = message.getData().get("body");
            targetUrl = message.getData().get("targetUrl");
            if (targetUrl == null) targetUrl = message.getData().get("target_url");
        }

        if (title == null) title = "WalletLens";
        if (body == null) body = "You have a new update.";

        // Show the notification
        NotificationHelper helper = new NotificationHelper(this);
        helper.showAlertNotification(title, body, targetUrl);

        Log.d(TAG, "FCM notification displayed: " + title);
    }
}
