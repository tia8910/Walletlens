package live.walletlens.twa;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

/**
 * WalletLens TWA LauncherActivity.
 *
 * <p>Shows a test notification on first 3 launches so you can verify
 * the app's notification channel works immediately.
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final String TAG = "WalletLensLauncher";
    private static final int REQUEST_CODE_POST_NOTIFICATIONS = 1001;
    private static final int TEST_NOTIF_MAX_LAUNCHES = 3;

    private boolean permissionAskedThisSession = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }

        // Request notification permission on Android 13+
        // Using a delayed handler so the dialog appears AFTER the TWA
        // splash screen, making it clearly visible to the user.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this,
                    Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    requestPermissions(
                            new String[]{Manifest.permission.POST_NOTIFICATIONS},
                            REQUEST_CODE_POST_NOTIFICATIONS);
                    permissionAskedThisSession = true;
                }, 800);
            }
        }

        Log.d(TAG, "WalletLens TWA initialised");
    }

    @Override
    protected void onResume() {
        super.onResume();

        // Track the launch URL
        Uri launchUri = getLaunchingUrl();
        if (launchUri != null) {
            String url = launchUri.toString();
            Log.d(TAG, "Launch URL: " + url);
            AnalyticsHelper.getInstance().trackAppLaunchUrl(url);
        }

        // Fire a test notification so you can verify immediately
        fireTestNotificationIfNeeded();
    }

    /**
     * Shows a test notification on the first few launches so you can
     * verify the app's notification channel works correctly without
     * waiting for the daily background worker.
     */
    private void fireTestNotificationIfNeeded() {
        SharedPreferences prefs = getSharedPreferences("launch_count", Context.MODE_PRIVATE);
        int launches = prefs.getInt("launches", 0);

        if (launches < TEST_NOTIF_MAX_LAUNCHES) {
            prefs.edit().putInt("launches", launches + 1).apply();

            // Ensure notification channels exist
            new NotificationHelper(this).createChannels();

            String[] testMessages = {
                    "✅ Notifications work! WalletLens will send you market alerts and feature tips here.",
                    "👋 Welcome back! You'll receive price alerts and portfolio updates through this channel.",
                    "🔔 Notifications are active! Check back daily for market insights and feature tips."
            };

            String title = "🚀 Track · Analyze · Grow";
            String body = testMessages[Math.min(launches, testMessages.length - 1)];

            NotificationHelper helper = new NotificationHelper(this);
            helper.showAlertNotification(title, body, "https://walletlens.live/dashboard");

            Log.d(TAG, "Test notification fired (launch #" + (launches + 1) + "/" + TEST_NOTIF_MAX_LAUNCHES + ")");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
                                           @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQUEST_CODE_POST_NOTIFICATIONS && permissionAskedThisSession) {
            permissionAskedThisSession = false;

            if (grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "POST_NOTIFICATIONS permission granted by user");
                // Fire the test notification immediately after grant
                fireTestNotificationIfNeeded();
            } else {
                Log.w(TAG, "POST_NOTIFICATIONS permission denied by user");
                Toast.makeText(this,
                        "Notification permission is needed for price alerts " +
                        "and market updates.\nYou can enable it later in " +
                        "Settings > Apps > WalletLens > Notifications.",
                        Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        return super.getLaunchingUrl();
    }
}
