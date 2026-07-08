package live.walletlens.twa;

import android.Manifest;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final String TAG = "WalletLensLauncher";
    private static final int REQUEST_CODE_POST_NOTIFICATIONS = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }

        // Native tracking: screen view for this activity is handled automatically
        // by the Application.ActivityLifecycleCallbacks registered in Application.java.
        // Here we additionally log the launch URL for deep-link tracking.
        Log.d(TAG, "LauncherActivity created");

        // Request POST_NOTIFICATIONS permission on Android 13+ at first launch.
        // Notifications are needed for local price alerts and feature announcements.
        requestNotificationPermission();
    }

    @Override
    protected void onResume() {
        super.onResume();

        // Track the launch/deep-link URL for usage analytics.
        Uri launchUri = getLaunchingUrl();
        if (launchUri != null) {
            String url = launchUri.toString();
            Log.d(TAG, "Launch URL: " + url);
            AnalyticsHelper.getInstance().trackAppLaunchUrl(url);
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();

        // Future: parse / transform the URI here if needed for tracking.

        return uri;
    }

    /**
     * Request {@code POST_NOTIFICATIONS} permission at runtime on Android 13+.
     * <p>
     * Android 13 requires apps to ask the user before posting any notifications
     * (including local notifications from {@link NotificationHelper}).
     * The permission is declared in {@code AndroidManifest.xml} but must be
     * requested at runtime for API 33+.
     */
    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Permission is not needed on Android 12 and below.
            return;
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            Log.d(TAG, "POST_NOTIFICATIONS permission already granted");
            return;
        }

        // Request the permission. The system dialog will show.
        requestPermissions(
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                REQUEST_CODE_POST_NOTIFICATIONS);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
                                           @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CODE_POST_NOTIFICATIONS) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "POST_NOTIFICATIONS permission granted by user");
            } else {
                Log.w(TAG, "POST_NOTIFICATIONS permission denied by user");
                // Show a rationale toast.
                Toast.makeText(this,
                        "Notification permission is needed for price alerts and app updates.\n" +
                        "You can enable it later in Settings > Apps > WalletLens > Notifications.",
                        Toast.LENGTH_LONG).show();
            }
        }
    }
}
