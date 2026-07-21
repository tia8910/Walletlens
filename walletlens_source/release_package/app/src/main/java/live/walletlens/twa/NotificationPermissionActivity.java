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
 * Pre-launch permission gate — the app's launcher entry point.
 *
 * Requests POST_NOTIFICATIONS and only then forwards to the TWA
 * {@link LauncherActivity}. A dedicated activity is used because the
 * AndroidBrowserHelper LauncherActivity finishes itself the moment it launches
 * the browser, which dismisses any permission dialog requested there before the
 * user can respond — that's why the app "never asked".
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

    private final ActivityResultLauncher<String> requestPermission =
            registerForActivityResult(
                    new ActivityResultContracts.RequestPermission(),
                    granted -> {
                        Log.d(TAG, "POST_NOTIFICATIONS granted=" + granted);
                        proceed();
                    });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        boolean needsRequest =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this,
                        Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED;

        if (needsRequest) {
            Log.d(TAG, "Requesting POST_NOTIFICATIONS before launching TWA");
            try {
                requestPermission.launch(Manifest.permission.POST_NOTIFICATIONS);
            } catch (Exception e) {
                Log.w(TAG, "permission request failed: " + e.getMessage());
                proceed();
            }
        } else {
            proceed();
        }
    }

    /** Hand off to the TWA launcher as a fresh task root, then finish. */
    private void proceed() {
        Intent i = new Intent(this, LauncherActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        // Carry through any deep-link data that landed on the gate.
        Intent source = getIntent();
        if (source != null && source.getData() != null) {
            Uri data = source.getData();
            i.setData(data);
        }
        startActivity(i);
        finish();
    }
}
