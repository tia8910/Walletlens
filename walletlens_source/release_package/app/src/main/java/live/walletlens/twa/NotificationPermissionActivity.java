package live.walletlens.twa;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

/**
 * Pre-launch permission gate.
 *
 * This is the app's launcher entry point. It asks for POST_NOTIFICATIONS and
 * only then forwards to the TWA {@link LauncherActivity}.
 *
 * Why a dedicated activity? The AndroidBrowserHelper LauncherActivity finishes
 * itself the moment it launches the browser (Custom Tab), which dismisses any
 * permission dialog requested there before the user can respond — that's why
 * the app "never asked" for notification permission. This activity does nothing
 * but show the dialog, wait for the result, then start the TWA, so the dialog
 * is never torn down early. It also cannot crash the TWA launch.
 *
 * Uses a plain {@link Activity} (not AppCompat) so it can carry the app's
 * translucent theme without a Theme.AppCompat requirement.
 */
public class NotificationPermissionActivity extends Activity {

    private static final String TAG = "WalletLensPermGate";
    private static final int REQUEST_CODE_POST_NOTIFICATIONS = 4200;

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
                requestPermissions(
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        REQUEST_CODE_POST_NOTIFICATIONS);
            } catch (Exception e) {
                Log.w(TAG, "permission request failed: " + e.getMessage());
                proceed();
            }
        } else {
            proceed();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
                                           @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // Proceed regardless of grant/deny — the TWA must always launch.
        proceed();
    }

    /** Hand off to the TWA launcher and finish this gate. */
    private void proceed() {
        Intent i = new Intent(this, LauncherActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION);
        // Carry through any data/extras from a deep link that landed here.
        Intent source = getIntent();
        if (source != null && source.getData() != null) {
            i.setData(source.getData());
        }
        startActivity(i);
        finish();
    }
}
