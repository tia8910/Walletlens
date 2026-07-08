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

/**
 * WalletLens TWA LauncherActivity.
 *
 * <p>For Android 13+, this activity requests {@code POST_NOTIFICATIONS}
 * permission BEFORE opening the Trusted Web Activity, ensuring the system
 * dialog is clearly visible to the user. On older Android versions, or
 * once permission is granted, the TWA loads immediately.
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final String TAG = "WalletLensLauncher";
    private static final int REQUEST_CODE_POST_NOTIFICATIONS = 1001;

    /** Saved state for use after permission dialog is dismissed. */
    private Bundle pendingSavedInstanceState;
    /** Whether we're waiting for the user to respond to the permission dialog. */
    private boolean permissionRequestPending = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // ── Android 13+ permission gate ───────────────────────────────
        // Request POST_NOTIFICATIONS BEFORE super.onCreate() so the
        // system permission dialog appears on a blank activity, not
        // behind the Chrome Custom Tab. Without this, the dialog often
        // goes unnoticed by the user.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this,
                    Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {

                Log.d(TAG, "POST_NOTIFICATIONS not granted – requesting before TWA loads");

                // Save the state bundle so we can resume TWA setup after
                pendingSavedInstanceState = savedInstanceState;
                permissionRequestPending = true;

                // Request the permission. On API 33+, this shows a system
                // dialog. The activity's onRequestPermissionsResult() or
                // onResume() will be called next.
                requestPermissions(
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        REQUEST_CODE_POST_NOTIFICATIONS);

                // Do NOT call super.onCreate() yet – the TWA (Chrome Custom
                // Tab) will be opened after the user responds to the dialog.
                return;
            }
        }

        // Permission already granted or Android < 13 – proceed normally.
        initTwa(savedInstanceState);
    }

    /**
     * Initialise the TWA: call the parent's onCreate and do WalletLens setup.
     */
    private void initTwa(Bundle savedInstanceState) {
        // Must call super to set up the Trusted Web Activity
        super.onCreate(savedInstanceState);

        // Setting an orientation crashes the app due to the transparent
        // background on Android 8.0 Oreo and below. We only set the
        // orientation on Oreo and above. This only affects the splash
        // screen – Chrome will still respect the orientation.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }

        Log.d(TAG, "WalletLens TWA initialised");
    }

    @Override
    protected void onResume() {
        super.onResume();

        // If we were waiting for the permission dialog and the user
        // dismissed it (e.g. back button) without making a choice,
        // onRequestPermissionsResult may not be called.  We handle
        // that fallback here.
        if (permissionRequestPending) {
            permissionRequestPending = false;
            Log.d(TAG, "Permission dialog dismissed without explicit choice – proceeding");
            initTwa(pendingSavedInstanceState);
            pendingSavedInstanceState = null;
            return;
        }

        // Track the launch / deep-link URL for usage analytics (only
        // after the TWA is fully set up).
        Uri launchUri = getLaunchingUrl();
        if (launchUri != null) {
            String url = launchUri.toString();
            Log.d(TAG, "Launch URL: " + url);
            AnalyticsHelper.getInstance().trackAppLaunchUrl(url);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
                                           @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        // Must call super for the TWA library to handle its own permissions
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQUEST_CODE_POST_NOTIFICATIONS && permissionRequestPending) {
            permissionRequestPending = false;

            if (grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "POST_NOTIFICATIONS permission granted by user");
            } else {
                Log.w(TAG, "POST_NOTIFICATIONS permission denied by user");
                Toast.makeText(this,
                        "Notification permission is needed for price alerts " +
                        "and market updates.\nYou can enable it later in " +
                        "Settings > Apps > WalletLens > Notifications.",
                        Toast.LENGTH_LONG).show();
            }

            // Proceed with TWA setup now that the user has responded
            initTwa(pendingSavedInstanceState);
            pendingSavedInstanceState = null;
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        return super.getLaunchingUrl();
    }
}
