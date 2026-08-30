package live.walletlens.twa;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

/**
 * The app's launcher entry point, and the on-demand notification-permission
 * request.
 *
 * <p><b>It no longer asks on launch.</b> It used to request POST_NOTIFICATIONS
 * before forwarding to the TWA, which meant a system dialog in the first second
 * of a cold start, before the user had seen anything to have an opinion about.
 * Worse, it was only half the ask: the Android app permission and the web
 * origin's own Notification permission are separate, so granting this one
 * produced no push subscription and the switch in Settings still read Off. The
 * user was then asked a second time when they tapped it. Two dialogs, one
 * decision, and the first one bought nothing.
 *
 * <p>Now the ask happens where the intent is: the Settings toggle fires
 * {@code walletlens://notification-permission}, this activity requests the
 * permission with the app already on screen, and the web side subscribes
 * immediately afterwards. On a launcher start it does nothing but forward.
 *
 * <p>A dedicated activity is still used because the AndroidBrowserHelper
 * LauncherActivity finishes itself the moment it launches the browser, which
 * would dismiss any dialog requested there before the user could respond.
 *
 * Extends {@link ComponentActivity} so it can use the modern
 * {@code registerForActivityResult} permission API (more reliable than the old
 * onRequestPermissionsResult callback) without needing a Theme.AppCompat theme.
 *
 * The handoff launches {@link LauncherActivity} as a fresh task root
 * ({@code NEW_TASK | CLEAR_TASK}). This matters: if LauncherActivity is started
 * inside this gate's task it is NOT the task root, and the AndroidBrowserHelper
 * base class then relaunches/bails instead of opening the TWA — which showed up
 * as "granted the permission but the app didn't open".
 */
public class NotificationPermissionActivity extends ComponentActivity {

    private static final String TAG = "WalletLensPermGate";

    /** walletlens://notification-permission — the on-demand ask from Settings. */
    private static final String HOST_REQUEST = "notification-permission";

    /** Whether this instance was started to ask, rather than to launch. */
    private boolean askOnly = false;

    private final ActivityResultLauncher<String> requestPermission =
            registerForActivityResult(
                    new ActivityResultContracts.RequestPermission(),
                    granted -> {
                        Log.d(TAG, "POST_NOTIFICATIONS granted=" + granted);
                        // Asked on demand: the TWA is already on screen behind
                        // this activity, so finishing returns the user exactly
                        // where they were, mid-tap on the toggle. Forwarding
                        // instead would restart the app under them.
                        if (askOnly) finish();
                        else proceed();
                    });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Uri data = getIntent() != null ? getIntent().getData() : null;
        askOnly = data != null && HOST_REQUEST.equals(data.getHost());

        boolean needsRequest =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this,
                        Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED;

        // A launcher start never asks — see the class comment. Only the
        // on-demand path does, and only if the permission is actually missing.
        if (askOnly && needsRequest) {
            Log.d(TAG, "Requesting POST_NOTIFICATIONS on demand");
            try {
                requestPermission.launch(Manifest.permission.POST_NOTIFICATIONS);
            } catch (Exception e) {
                Log.w(TAG, "permission request failed: " + e.getMessage());
                finish();
            }
        } else if (askOnly) {
            // Already held. Nothing to show; the web side carries on.
            finish();
        } else {
            proceed();
        }
    }

    /**
     * Open the app, then finish.
     *
     * <p>This used to be the launcher's own handoff, with CLEAR_TASK to make
     * the TWA a clean task root — androidbrowserhelper insists on that, and
     * without it the TWA degraded to a Custom Tab with an address bar.
     *
     * <p>None of that applies now. The shell IS the launcher, so this activity
     * is only ever reached through walletlens://notification-permission, with
     * the app already running behind it. CLEAR_TASK would tear that down and
     * cold-start the app on top of a user who had just tapped a toggle.
     */
    private void proceed() {
        Intent source = getIntent();
        Uri data = source != null ? source.getData() : null;
        startActivity(data != null
                ? AppEntry.deepLink(this, data.toString())
                : AppEntry.home(this));
        finish();
    }
}
