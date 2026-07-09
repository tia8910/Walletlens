package live.walletlens.twa;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Firebase Cloud Messaging service — receives push notifications.
 *
 * When a push arrives from FCM (sent by the app's own PeriodicUpdateWorker
 * via the FCM HTTP API), this service displays it as a native notification.
 *
 * Also stores the device FCM token so the worker can send self-push messages.
 */
public class WalletLensMessagingService extends FirebaseMessagingService {

    private static final String TAG = "WalletLensFCM";
    private static final String PREFS_NAME = "walletlens_fcm";
    private static final String KEY_TOKEN = "device_token";

    @Override
    public void onNewToken(@NonNull String token) {
        Log.d(TAG, "New FCM token: " + token.substring(0, Math.min(20, token.length())) + "...");
        // Save token so PeriodicUpdateWorker can use it for self-push
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TOKEN, token)
            .apply();
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Log.d(TAG, "FCM push received");

        // Extract notification payload
        String title = null;
        String body = null;
        String targetUrl = null;

        if (message.getNotification() != null) {
            title = message.getNotification().getTitle();
            body = message.getNotification().getBody();
        }

        // Data payload takes precedence
        if (message.getData() != null) {
            if (title == null) title = message.getData().get("title");
            if (body == null) body = message.getData().get("body");
            targetUrl = message.getData().get("targetUrl");
            if (targetUrl == null) targetUrl = message.getData().get("target_url");
        }

        if (title == null) title = "WalletLens";
        if (body == null) body = "You have a new update.";

        NotificationHelper helper = new NotificationHelper(this);
        helper.showAlertNotification(title, body, targetUrl);

        Log.d(TAG, "FCM notification: " + title);
    }

    /** Returns the stored FCM token, or null if not yet received. */
    public static String getToken(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_TOKEN, null);
    }
}
