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
 * Handles cold-start biometric lock, notification permission requests,
 * and test notifications for first launches.
 *
 * <p>Notification permission is requested IMMEDIATELY on startup.
 * If biometric is needed, we defer it until AFTER permission is handled
 * so the permission dialog is never skipped.
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final String TAG = "WalletLensLauncher";
    private static final int REQUEST_CODE_POST_NOTIFICATIONS = 1001;
    private static final int TEST_NOTIF_MAX_LAUNCHES = 5;

    private boolean permissionAskedThisSession = false;
    private String savedLaunchUrl = null;
    private boolean biometricPending = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }

        // ── SAVE launch URL early (before any redirects) ────────────────
        Uri launchUri = getLaunchingUrl();
        if (launchUri != null) {
            savedLaunchUrl = launchUri.toString();
            Log.d(TAG, "Saved launch URL: " + savedLaunchUrl);
        }

        // ── Handle intent actions from the web app ─────────────────────
        handleWebAppIntent(getIntent());

        // ── NOTIFICATION PERMISSION — REQUEST FIRST ────────────────────
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this,
                    Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                // Request IMMEDIATELY — before any biometric check
                requestPermissions(
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        REQUEST_CODE_POST_NOTIFICATIONS);
                permissionAskedThisSession = true;
            }
        }

        // ── CHECK BIOMETRIC — but defer if permission still needed ──────
        checkBiometricAfterPermission();

        Log.d(TAG, "WalletLens TWA initialised");
    }

    /** Check biometric, but only after notification permission is resolved. */
    private void checkBiometricAfterPermission() {
        boolean needsPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED;

        if (needsPermission) {
            // Permission not granted yet — wait for onRequestPermissionsResult
            // and check biometric there (in onResume or after result)
            biometricPending = true;
            Log.d(TAG, "Biometric check deferred until permission resolved");
        } else {
            // Permission already granted or not needed — safe to check biometric now
            handleColdStartBiometric();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();

        // Track the launch URL
        if (savedLaunchUrl != null) {
            Log.d(TAG, "Launch URL: " + savedLaunchUrl);
            AnalyticsHelper.getInstance().trackAppLaunchUrl(savedLaunchUrl);
        }

        // If biometric was pending, check it now (permission is resolved)
        if (biometricPending) {
            biometricPending = false;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED) {
                handleColdStartBiometric();
            }
        }

        // Fire test notification
        fireTestNotificationIfNeeded();

        // Trigger background worker
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED) {
                NotificationScheduler.schedule(this);
                NotificationScheduler.scheduleImmediate(this);
            }
        }
    }

    // ── Intent handling from web app ─────────────────────────────────────

    private void handleWebAppIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;

        Uri data = intent.getData();
        String scheme = data.getScheme();
        String host = data.getHost();

        if (!"walletlens".equalsIgnoreCase(scheme)) return;

        Log.d(TAG, "Handling web app intent: " + data.toString());

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
                Intent bioIntent = new Intent(this, BiometricActivity.class);
                bioIntent.putExtra(BiometricActivity.EXTRA_REDIRECT_URL,
                        savedLaunchUrl != null ? savedLaunchUrl : "https://walletlens.live/dashboard");
                bioIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(bioIntent);
                break;
        }
    }

    // ── Cold-start biometric check ───────────────────────────────────────

    /**
     * If biometric lock is enabled and session expired, redirect to BiometricActivity.
     * This replaces the TWA content with a native biometric prompt.
     */
    private void handleColdStartBiometric() {
        if (!BiometricActivity.isEnabled(this)) return;
        if (BiometricActivity.isSessionValid(this)) return;

        Log.d(TAG, "Cold-start biometric required – redirecting to BiometricActivity");

        String redirectUrl = savedLaunchUrl != null ? savedLaunchUrl : "https://walletlens.live/dashboard";

        Intent bioIntent = new Intent(this, BiometricActivity.class);
        bioIntent.putExtra(BiometricActivity.EXTRA_REDIRECT_URL, redirectUrl);
        bioIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(bioIntent);
        finish();
    }

    // ── Test notifications ───────────────────────────────────────────────

    private void fireTestNotificationIfNeeded() {
        SharedPreferences prefs = getSharedPreferences("launch_count", Context.MODE_PRIVATE);
        int launches = prefs.getInt("launches", 0);

        if (launches < TEST_NOTIF_MAX_LAUNCHES) {
            prefs.edit().putInt("launches", launches + 1).apply();

            new NotificationHelper(this).createChannels();

            String[] testMessages = {
                    "📊 Track · Analyze · Grow — WalletLens notifications are active! You'll receive price alerts for crypto, stocks, gold, and silver right here.",
                    "👋 Welcome back! Price alerts, portfolio updates, and market insights delivered through this channel.",
                    "🔔 Notifications active! Stay informed with real-time market moves and smart feature tips."
            };

            String title = "📈 WalletLens Active";
            String body = testMessages[Math.min(launches, testMessages.length - 1)];

            NotificationHelper helper = new NotificationHelper(this);
            helper.showAlertNotification(title, body, "https://walletlens.live/dashboard");

            if (launches == 0) {
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    NotificationHelper h2 = new NotificationHelper(this);
                    h2.showAlertNotification(
                        "📈 Price Alerts Ready",
                        "Your portfolio is being monitored. You'll be notified when your assets move more than 1%.",
                        "https://walletlens.live/dashboard"
                    );
                }, 2000);
            }

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
                fireTestNotificationIfNeeded();
                NotificationScheduler.schedule(this);
                NotificationScheduler.scheduleImmediate(this);
            } else {
                Log.w(TAG, "POST_NOTIFICATIONS permission denied by user");
                Toast.makeText(this,
                        "⚠️ Notification permission required\n" +
                        "WalletLens needs notification access to send price alerts " +
                        "and market updates. Go to Settings > Apps > WalletLens > " +
                        "Notifications to enable.",
                        Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        return super.getLaunchingUrl();
    }
}
