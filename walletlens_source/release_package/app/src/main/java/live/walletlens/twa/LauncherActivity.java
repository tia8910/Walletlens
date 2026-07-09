package live.walletlens.twa;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
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
 * Notification permission is ALWAYS requested FIRST.
 * BiometricActivity is ONLY started AFTER the user either:
 *   - Grants notification permission, or
 *   - Denies it (we show rationale and STILL open the app without biometric redirect)
 *
 * This guarantees the permission dialog is NEVER hidden by biometric.
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final String TAG = "WalletLensLauncher";
    private static final int REQUEST_CODE_POST_NOTIFICATIONS = 1001;
    private static final int TEST_NOTIF_MAX_LAUNCHES = 5;

    private boolean permissionAskedThisSession = false;
    private String savedLaunchUrl = null;
    private boolean permissionResolved = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }

        // ── Save launch URL early ────────────────────────────────────────
        Uri launchUri = getLaunchingUrl();
        if (launchUri != null) {
            savedLaunchUrl = launchUri.toString();
            Log.d(TAG, "Saved launch URL: " + savedLaunchUrl);
        }

        // ── Handle intent actions from web app ──────────────────────────
        handleWebAppIntent(getIntent());

        // ── REQUEST NOTIFICATION PERMISSION FIRST (before ANY other work) ─
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this,
                    Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "Requesting POST_NOTIFICATIONS permission");
                requestPermissions(
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        REQUEST_CODE_POST_NOTIFICATIONS);
                permissionAskedThisSession = true;
                // permissionResolved stays false until onRequestPermissionsResult
            } else {
                permissionResolved = true;
            }
        } else {
            permissionResolved = true;
        }

        // ── On Android <13, or if permission already granted, check biometric ─
        if (permissionResolved) {
            handleColdStartBiometric();
        }
        // Otherwise: biometric is deferred. We handle it in
        // onRequestPermissionsResult() after the user responds.
    }

    @Override
    protected void onResume() {
        super.onResume();

        if (savedLaunchUrl != null) {
            AnalyticsHelper.getInstance().trackAppLaunchUrl(savedLaunchUrl);
        }

        // If permission was asked but user hasn't replied yet, DO NOTHING.
        // onRequestPermissionsResult will handle everything.
        if (!permissionResolved && permissionAskedThisSession) {
            Log.d(TAG, "Permission still pending - waiting for user response");
            return;
        }

        // Fire test notification if permission is granted
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || ContextCompat.checkSelfPermission(this,
                    Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            fireTestNotificationIfNeeded();
            NotificationScheduler.schedule(this);
            NotificationScheduler.scheduleImmediate(this);
        }
    }

    private void handleIntentActions() {
        handleWebAppIntent(getIntent());
    }

    // ── Intent handling ─────────────────────────────────────────────────

    private void handleWebAppIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;

        Uri data = intent.getData();
        String scheme = data.getScheme();
        String host = data.getHost();

        if (!"walletlens".equalsIgnoreCase(scheme)) return;

        switch (host != null ? host : "") {
            case "biometric":
            case "biometric-auth":
                handleBiometricIntent(data);
                break;
            default:
                Log.w(TAG, "Unknown intent host: " + host);
        }
    }

    private void handleBiometricIntent(Uri data) {
        String action = data.getQueryParameter("action");
        if (action == null) action = "unlock";
        switch (action) {
            case "enable":
                BiometricActivity.setEnabled(this, true);
                Toast.makeText(this, "Biometric lock enabled", Toast.LENGTH_SHORT).show();
                break;
            case "disable":
                BiometricActivity.setEnabled(this, false);
                Toast.makeText(this, "Biometric lock disabled", Toast.LENGTH_SHORT).show();
                break;
            case "unlock":
            default:
                if (!BiometricActivity.isEnabled(this)) return;
                Intent i = new Intent(this, BiometricActivity.class);
                i.putExtra(BiometricActivity.EXTRA_REDIRECT_URL,
                        savedLaunchUrl != null ? savedLaunchUrl : "https://walletlens.live/dashboard");
                i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(i);
                break;
        }
    }

    // ── Cold-start biometric ─────────────────────────────────────────────

    private void handleColdStartBiometric() {
        if (!BiometricActivity.isEnabled(this)) return;
        if (BiometricActivity.isSessionValid(this)) return;

        Log.d(TAG, "Cold-start biometric required");
        Intent i = new Intent(this, BiometricActivity.class);
        i.putExtra(BiometricActivity.EXTRA_REDIRECT_URL,
                savedLaunchUrl != null ? savedLaunchUrl : "https://walletlens.live/dashboard");
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(i);
        finish();
    }

    // ── Test notifications ───────────────────────────────────────────────

    private void fireTestNotificationIfNeeded() {
        SharedPreferences prefs = getSharedPreferences("launch_count", Context.MODE_PRIVATE);
        int launches = prefs.getInt("launches", 0);
        if (launches >= TEST_NOTIF_MAX_LAUNCHES) return;

        prefs.edit().putInt("launches", launches + 1).apply();
        new NotificationHelper(this).createChannels();

        String[] msgs = {
            "WalletLens notifications active! Price alerts, tips and insights coming.",
            "Welcome back! Market updates delivered through this channel.",
            "Notifications active! Stay informed with real-time market moves."
        };
        String body = msgs[Math.min(launches, msgs.length - 1)];
        NotificationHelper h = new NotificationHelper(this);
        h.showAlertNotification("📈 WalletLens Active", body, "https://walletlens.live/dashboard");

        if (launches == 0) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                NotificationHelper h2 = new NotificationHelper(this);
                h2.showAlertNotification("📈 Price Alerts Ready",
                    "Your portfolio is being monitored.",
                    "https://walletlens.live/dashboard");
            }, 2000);
        }
    }

    // ── Permission result ────────────────────────────────────────────────

    @Override
    public void onRequestPermissionsResult(int requestCode,
                                           @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != REQUEST_CODE_POST_NOTIFICATIONS) return;

        permissionResolved = true;
        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;

        if (granted) {
            Log.d(TAG, "Permission GRANTED - firing notifications + checking biometric");
            fireTestNotificationIfNeeded();
            NotificationScheduler.schedule(this);
            NotificationScheduler.scheduleImmediate(this);
            // Now safe to check biometric (permission is resolved)
            handleColdStartBiometric();
        } else {
            Log.w(TAG, "Permission DENIED");
            Toast.makeText(this,
                    "⚠️ Notification permission required for alerts.\n" +
                    "Enable in: Settings > Apps > WalletLens > Notifications",
                    Toast.LENGTH_LONG).show();
            // Permission denied - still open the app (no biometric redirect)
            // User can enable later in Settings
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        return super.getLaunchingUrl();
    }
}
